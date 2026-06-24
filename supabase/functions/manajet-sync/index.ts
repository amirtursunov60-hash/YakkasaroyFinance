// Edge Function: manajet-sync
// Тянет боевые данные ManaJet (api.manajet.org) и складывает их в зеркало mj_*
// (см. supabase/migrations/20260620230000_manajet_mirror.sql). Ключ ManaJet и
// cron-секрет — в Supabase Vault (RPC public.mj_secret). Запись под сервис-ролью.
//
// ManaJet отвечает медленно (~6–15 с/страница), а у Edge Function жёсткий лимит
// ~150 с. Поэтому: пишем КАЖДУЮ страницу сразу (инкрементально) и держим бюджет
// времени — при его исчерпании отдаём 200 с partial=true и курсором для докачки.
// ManaJet сортирует записи свежими вперёд, так что при обрыве остаются самые
// новые данные. Фронт догружает по курсору; ночной cron — по группам.

import { createClient } from "jsr:@supabase/supabase-js@2";

const MJ_BASE = "https://api.manajet.org/api"; // напрямую — adminsolution.org 301 теряет авторизацию

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const num = (v: unknown) => (v == null || v === "" ? null : Number(v));

// ManaJet отдаёт слабо типизированный JSON без узкой схемы; описываем запись
// как объект с произвольными полями (значения могут быть вложенными записями).
// Снимает no-explicit-any, не вводя any.
type MjValue = string | number | boolean | null | undefined | MjRecord | MjValue[];
interface MjRecord { [key: string]: MjValue }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // -------------------------------------------------------- авторизация
  let authorized = false;
  let trigger = "manual";
  const cronHeader = req.headers.get("x-mj-cron");
  if (cronHeader) {
    const { data: cronSecret } = await admin.rpc("mj_secret", { p_name: "mj_cron_secret" });
    if (cronSecret && cronHeader === cronSecret) { authorized = true; trigger = "cron"; }
  }
  if (!authorized) {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await userClient.auth.getUser();
    if (u?.user) {
      const { data: prof } = await admin.from("profiles").select("role").eq("id", u.user.id).single();
      if (prof && ["owner", "fin_director"].includes(prof.role)) authorized = true;
    }
  }
  if (!authorized) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
  }

  // -------------------------------------------------------- ключ ManaJet
  const { data: mjAuth, error: secErr } = await admin.rpc("mj_secret", { p_name: "manajet_auth" });
  if (secErr || !mjAuth) {
    return new Response(JSON.stringify({ error: "manajet_auth secret missing" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const deadline = Date.now() + 130000; // запас до жёсткого лимита ~150 с
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // одна страница с ретраями на 5xx (IIS отдаёт 504 на больших страницах)
  async function mjPage(path: string, take: number, skip: number, extra: Record<string, string>): Promise<MjRecord[]> {
    const url = new URL(`${MJ_BASE}/${path}`);
    url.searchParams.set("filter.take", String(take));
    url.searchParams.set("filter.skip", String(skip));
    for (const k in extra) url.searchParams.set(k, extra[k]);
    let lastStatus = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await fetch(url, { headers: { Authorization: mjAuth } });
      if (r.ok) return await r.json();
      lastStatus = r.status;
      if (r.status < 500) break;
      await sleep(1200 * (attempt + 1));
    }
    throw new Error(`${path} → HTTP ${lastStatus}`);
  }

  async function upsert(table: string, rows: MjRecord[], onConflict: string) {
    if (!rows.length) return;
    const { error } = await admin.from(table).upsert(rows, { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }

  // Потоковая выгрузка: страница → маппинг → запись сразу. Если бюджет времени
  // исчерпан до конца — done=false и nextSkip для докачки по курсору.
  async function stream(
    path: string, take: number, table: string, onConflict: string,
    map: (x: MjRecord) => MjRecord, startSkip: number, extra: Record<string, string> = {},
  ): Promise<{ count: number; done: boolean; nextSkip: number }> {
    let skip = startSkip; let count = 0;
    while (Date.now() < deadline) {
      const page = await mjPage(path, take, skip, extra);
      if (!Array.isArray(page) || page.length === 0) return { count, done: true, nextSkip: skip };
      const seen = new Set<string>();
      const rows = [];
      for (const x of page) {
        const r = map(x);
        const key = JSON.stringify(onConflict.split(",").map((c) => r[c.trim()]));
        if (seen.has(key)) continue; seen.add(key);
        rows.push(r);
      }
      await upsert(table, rows, onConflict);
      count += page.length;
      if (page.length < take) return { count, done: true, nextSkip: skip + take };
      skip += take;
      await sleep(40);
    }
    return { count, done: false, nextSkip: skip };
  }

  const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

  const ENTITIES: Record<string, (skip: number) => Promise<{ count: number; done: boolean; nextSkip: number }>> = {
    funds: (s) => stream("FPFund", 500, "mj_funds", "mj_id", (x) => ({ mj_id: x.id, number: x.number, name: x.name, in_archive: x.in_archive, data: x }), s),
    periods: (s) => stream("FpPlan", 500, "mj_periods", "mj_id", (x) => ({ mj_id: x.id, date_from: x.date_from, date_to: x.date_to, is_executive_confirmed: x.is_executive_confirmed, is_baf_confirmed: x.is_baf_confirmed, data: x }), s),
    stats: (s) => stream("Stat", 500, "mj_stats", "mj_id", (x) => ({ mj_id: x.id, name: x.name, unit: x.unit, stat_type: x.stat_type, min_val: num(x.min_val), max_val: num(x.max_val), sign: x.sign, period: x.period, position_name: x.orgboard_position?.name ?? null, data: x }), s),
    positions: (s) => stream("OrgBoardPosition", 300, "mj_positions", "mj_id", (x) => ({ mj_id: x.id, full_number: x.full_number, name: x.name, person_name: x.person?.name ?? null, functional: x.functional, in_archive: x.in_archive, data: x }), s),
    persons: (s) => stream("Person", 300, "mj_persons", "mj_id", (x) => ({ mj_id: x.id, name: x.name, first_name: x.first_name, last_name: x.last_name, is_disabled: x.is_disabled, data: x }), s),
    companies: (s) => stream("Company", 150, "mj_companies", "mj_id", (x) => ({ mj_id: x.id, name: x.name, is_customer: x.is_customer, is_vendor: x.is_vendor, is_private_person: x.is_private_person, data: x }), s),
    purchase_orders: (s) => stream("PurchaseOrder", 150, "mj_purchase_orders", "mj_id", (x) => ({ mj_id: x.id, name: x.name, status: x.status, fund_name: x.fp_fund?.name ?? null, expense_name: x.fp_expense?.name ?? null, position_name: x.orgboard_position?.name ?? null, planned_value: num(x.planned_value), confirmed_value: num(x.confirmed_value), payed_amount: num(x.payed_amount), csw_data: x.csw_data, csw_situation: x.csw_situation, csw_solution: x.csw_solution, data: x }), s),
    bills: (s) => stream("Bill", 150, "mj_bills", "mj_id", (x) => ({ mj_id: x.id, seria: x.seria, number: x.number, doc_date: x.date, company_name: x.company?.name ?? null, expense_name: x.fp_expense?.name ?? null, total_amount: num(x.total_amount), payed_amount: num(x.payed_amount), remaining_amount: num(x.remaining_amount), marked_payed: x.marked_payed, planned_date: x.planned_date, data: x }), s),
    invoices: (s) => stream("Invoice", 150, "mj_invoices", "mj_id", (x) => ({ mj_id: x.id, seria: x.seria, number: x.number, doc_date: x.date, company_name: x.company?.name ?? null, total_amount: num(x.total_amount), payed_amount: num(x.payed_amount), remaining_amount: num(x.remaining_amount), data: x }), s),
    incomes: (s) => stream("FpIncome", 200, "mj_incomes", "mj_id", (x) => ({ mj_id: x.id, date_operation: x.date_operation, amount: num(x.amount), income_type_name: x.income_type?.name ?? null, company_name: x.company?.name ?? null, payment_type_name: x.fp_payment_type?.name ?? null, period_mj_id: x.fp_plan?.id ?? null, data: x }), s, { "filter.date_from": daysAgo(180) }),
    stat_values: (s) => stream("StatValue", 400, "mj_stat_values", "stat_mj_id,period_begin,period_end,is_quota", (x) => ({ stat_mj_id: x.stat_id, period_begin: x.period_begin, period_end: x.period_end, is_quota: !!x.is_quota, amount: num(x.amount), description: x.description, data: x }), s),
  };

  // -------------------------------------------------------- запуск
  let body: { entities?: unknown; cursor?: { entity: string; skip: number } } = {};
  try { body = await req.json(); } catch { /* пустое тело — все сущности */ }
  const requested: string[] = Array.isArray(body?.entities) && body.entities.length
    ? body.entities.filter((e: string) => e in ENTITIES)
    : Object.keys(ENTITIES);
  const cursor = body?.cursor && (body.cursor.entity in ENTITIES) ? body.cursor : null;

  const startedAt = new Date().toISOString();
  const result: Record<string, number | string> = {};
  let ok = true; let errText: string | null = null;
  let nextCursor: { entity: string; skip: number } | null = null;

  const order = cursor ? requested.slice(Math.max(0, requested.indexOf(cursor.entity))) : requested;
  for (let i = 0; i < order.length; i++) {
    const name = order[i];
    const startSkip = (cursor && i === 0) ? cursor.skip : 0;
    try {
      const r = await ENTITIES[name](startSkip);
      result[name] = (Number(result[name]) || 0) + r.count;
      if (!r.done) { nextCursor = { entity: name, skip: r.nextSkip }; break; }
    } catch (e) {
      ok = false; errText = `${name}: ${e instanceof Error ? e.message : String(e)}`;
      result[name] = "error";
      break;
    }
  }

  await admin.from("mj_sync_log").insert({ started_at: startedAt, finished_at: new Date().toISOString(), ok, trigger, entities: result, error: errText });

  return new Response(JSON.stringify({ ok, trigger, entities: result, error: errText, done: !nextCursor && ok, cursor: nextCursor }), {
    status: ok ? 200 : 500,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
