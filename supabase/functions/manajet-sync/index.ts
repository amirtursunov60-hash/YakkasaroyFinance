// Edge Function: manajet-sync
// Тянет боевые данные ManaJet (api.manajet.org) и складывает их в зеркало mj_*
// (см. supabase/migrations/20260620230000_manajet_mirror.sql). Ключ ManaJet и
// cron-секрет хранятся в Supabase Vault и читаются сервис-ролью через RPC
// public.mj_secret. Запись в mj_* идёт под сервис-ролью (обходит RLS).
//
// Доступ:
//  • из приложения — кнопкой «Обновить из ManaJet» (JWT финадмина: owner/fin_director);
//  • из pg_cron — заголовок x-mj-cron = секрет mj_cron_secret.
//
// Тело запроса (необязательно): { "entities": ["funds","bills",...] }.
// Без тела синхронизируются все сущности. Фронт вызывает по группам — для
// прогресса и чтобы не упереться в лимит времени одного вызова.

import { createClient } from "jsr:@supabase/supabase-js@2";

const MJ_BASE = "https://api.manajet.org/api"; // напрямую — adminsolution.org даёт 301 и теряет авторизацию

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const num = (v: unknown) => (v == null || v === "" ? null : Number(v));

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

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // одна страница с ретраями на 5xx (ManaJet/IIS отдаёт 504 на больших страницах)
  async function mjPage(path: string, take: number, skip: number, extra: Record<string, string>): Promise<any[]> {
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
      await sleep(1500 * (attempt + 1));
    }
    throw new Error(`${path} → HTTP ${lastStatus}`);
  }

  async function mjAll(path: string, take = 150, extra: Record<string, string> = {}): Promise<any[]> {
    let skip = 0; const all: any[] = [];
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const page = await mjPage(path, take, skip, extra);
      if (!Array.isArray(page) || page.length === 0) break;
      all.push(...page);
      if (page.length < take) break;
      skip += take;
      await sleep(150); // вежливая пауза между страницами
      if (skip > 60000) break; // предохранитель
    }
    return all;
  }

  async function upsert(table: string, rows: any[], onConflict: string) {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await admin.from(table).upsert(rows.slice(i, i + 500), { onConflict });
      if (error) throw new Error(`${table}: ${error.message}`);
    }
  }

  // дата N дней назад → YYYY-MM-DD (для ограничения истории доходов)
  const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

  const ENTITIES: Record<string, () => Promise<number>> = {
    funds: async () => {
      const d = await mjAll("FPFund", 500);
      await upsert("mj_funds", d.map((x) => ({ mj_id: x.id, number: x.number, name: x.name, in_archive: x.in_archive, data: x })), "mj_id");
      return d.length;
    },
    periods: async () => {
      const d = await mjAll("FpPlan", 500);
      await upsert("mj_periods", d.map((x) => ({ mj_id: x.id, date_from: x.date_from, date_to: x.date_to, is_executive_confirmed: x.is_executive_confirmed, is_baf_confirmed: x.is_baf_confirmed, data: x })), "mj_id");
      return d.length;
    },
    stats: async () => {
      const d = await mjAll("Stat", 500);
      await upsert("mj_stats", d.map((x) => ({ mj_id: x.id, name: x.name, unit: x.unit, stat_type: x.stat_type, min_val: num(x.min_val), max_val: num(x.max_val), sign: x.sign, period: x.period, position_name: x.orgboard_position?.name ?? null, data: x })), "mj_id");
      return d.length;
    },
    positions: async () => {
      const d = await mjAll("OrgBoardPosition", 500);
      await upsert("mj_positions", d.map((x) => ({ mj_id: x.id, full_number: x.full_number, name: x.name, person_name: x.person?.name ?? null, functional: x.functional, in_archive: x.in_archive, data: x })), "mj_id");
      return d.length;
    },
    companies: async () => {
      const d = await mjAll("Company", 100);
      await upsert("mj_companies", d.map((x) => ({ mj_id: x.id, name: x.name, is_customer: x.is_customer, is_vendor: x.is_vendor, is_private_person: x.is_private_person, data: x })), "mj_id");
      return d.length;
    },
    purchase_orders: async () => {
      const d = await mjAll("PurchaseOrder", 150);
      await upsert("mj_purchase_orders", d.map((x) => ({ mj_id: x.id, name: x.name, status: x.status, fund_name: x.fp_fund?.name ?? null, expense_name: x.fp_expense?.name ?? null, position_name: x.orgboard_position?.name ?? null, planned_value: num(x.planned_value), confirmed_value: num(x.confirmed_value), payed_amount: num(x.payed_amount), csw_data: x.csw_data, csw_situation: x.csw_situation, csw_solution: x.csw_solution, data: x })), "mj_id");
      return d.length;
    },
    bills: async () => {
      const d = await mjAll("Bill", 150);
      await upsert("mj_bills", d.map((x) => ({ mj_id: x.id, seria: x.seria, number: x.number, doc_date: x.date, company_name: x.company?.name ?? null, expense_name: x.fp_expense?.name ?? null, total_amount: num(x.total_amount), payed_amount: num(x.payed_amount), remaining_amount: num(x.remaining_amount), marked_payed: x.marked_payed, planned_date: x.planned_date, data: x })), "mj_id");
      return d.length;
    },
    invoices: async () => {
      const d = await mjAll("Invoice", 150);
      await upsert("mj_invoices", d.map((x) => ({ mj_id: x.id, seria: x.seria, number: x.number, doc_date: x.date, company_name: x.company?.name ?? null, total_amount: num(x.total_amount), payed_amount: num(x.payed_amount), remaining_amount: num(x.remaining_amount), data: x })), "mj_id");
      return d.length;
    },
    incomes: async () => {
      const d = await mjAll("FpIncome", 150, { "filter.date_from": daysAgo(180) });
      await upsert("mj_incomes", d.map((x) => ({ mj_id: x.id, date_operation: x.date_operation, amount: num(x.amount), income_type_name: x.income_type?.name ?? null, company_name: x.company?.name ?? null, payment_type_name: x.fp_payment_type?.name ?? null, period_mj_id: x.fp_plan?.id ?? null, data: x })), "mj_id");
      return d.length;
    },
    stat_values: async () => {
      const d = await mjAll("StatValue", 300);
      // ключ составной (id у StatValue нет) — дедуп внутри пакета
      const seen = new Set<string>();
      const rows = [];
      for (const x of d) {
        const k = `${x.stat_id}|${x.period_begin}|${x.period_end}|${!!x.is_quota}`;
        if (seen.has(k)) continue; seen.add(k);
        rows.push({ stat_mj_id: x.stat_id, period_begin: x.period_begin, period_end: x.period_end, is_quota: !!x.is_quota, amount: num(x.amount), description: x.description, data: x });
      }
      await upsert("mj_stat_values", rows, "stat_mj_id,period_begin,period_end,is_quota");
      return rows.length;
    },
  };

  // -------------------------------------------------------- запуск
  let body: any = {};
  try { body = await req.json(); } catch { /* пустое тело — синкаем всё */ }
  const requested: string[] = Array.isArray(body?.entities) && body.entities.length
    ? body.entities.filter((e: string) => e in ENTITIES)
    : Object.keys(ENTITIES);

  const startedAt = new Date().toISOString();
  const result: Record<string, number | string> = {};
  let ok = true; let errText: string | null = null;
  for (const name of requested) {
    try {
      result[name] = await ENTITIES[name]();
    } catch (e) {
      ok = false; errText = `${name}: ${e instanceof Error ? e.message : String(e)}`;
      result[name] = "error";
      break;
    }
  }

  await admin.from("mj_sync_log").insert({ started_at: startedAt, finished_at: new Date().toISOString(), ok, trigger, entities: result, error: errText });

  return new Response(JSON.stringify({ ok, trigger, entities: result, error: errText }), {
    status: ok ? 200 : 500,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
