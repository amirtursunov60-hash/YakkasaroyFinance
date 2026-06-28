// Edge Function: manajet-import-refs
// Импорт СПРАВОЧНИКОВ ManaJet прямо в ОПЕРАЦИОННЫЕ таблицы по outer_id:
//   FPFund → funds, IncomeCategory → income_types, ExpenseCategory → expense_types,
//   Stat → statistics (+ коридор min_val/max_val/stat_type/sign).
// Транзакции (заявки/счета) и движение денег НЕ затрагиваются (см.
// docs/manajet-анализ-и-интеграция.md). Данные малы — один проход.
//
// Авторизация и ключ ManaJet — как в manajet-sync (Vault + RPC mj_secret).
// Пишет под сервис-ролью (обходит RLS). Идемпотентно: upsert onConflict outer_id.

import { createClient } from "jsr:@supabase/supabase-js@2";

const MJ_BASE = "https://api.manajet.org/api";
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

  // -------- авторизация (cron-секрет ИЛИ JWT финадмина)
  let authorized = false; let trigger = "manual";
  const cronHeader = req.headers.get("x-mj-cron");
  if (cronHeader) {
    const { data: cronSecret } = await admin.rpc("mj_secret", { p_name: "mj_cron_secret" });
    if (cronSecret && cronHeader === cronSecret) { authorized = true; trigger = "import-refs-cron"; }
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
  if (!authorized) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });

  const { data: mjAuth, error: secErr } = await admin.rpc("mj_secret", { p_name: "manajet_auth" });
  if (secErr || !mjAuth) return new Response(JSON.stringify({ error: "manajet_auth secret missing" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });

  // базовая валюта (для funds.currency_id NOT NULL)
  const { data: baseCur } = await admin.from("currencies").select("id").eq("is_base", true).limit(1).maybeSingle();
  const baseCurrencyId = baseCur?.id ?? null;

  async function mjGet(path: string): Promise<Record<string, unknown>[]> {
    const url = new URL(`${MJ_BASE}/${path}`);
    url.searchParams.set("filter.take", "500");
    url.searchParams.set("filter.skip", "0");
    const r = await fetch(url, { headers: { Authorization: mjAuth } });
    if (!r.ok) throw new Error(`${path} → HTTP ${r.status}`);
    const j = await r.json();
    return Array.isArray(j) ? j : [];
  }

  // batch-upsert; при ошибке (напр. коллизия UNIQUE code) — построчно, пропуская сбойные
  async function upsertRefs(table: string, rows: Record<string, unknown>[]): Promise<{ ok: number; skipped: number }> {
    if (!rows.length) return { ok: 0, skipped: 0 };
    const batch = await admin.from(table).upsert(rows, { onConflict: "outer_id" });
    if (!batch.error) return { ok: rows.length, skipped: 0 };
    let ok = 0; let skipped = 0;
    for (const row of rows) {
      const r = await admin.from(table).upsert(row, { onConflict: "outer_id" });
      if (r.error) skipped++; else ok++;
    }
    return { ok, skipped };
  }

  // Импорт ТОЛЬКО архивирует (is_archived=true для архивных в ManaJet) и НИКОГДА
  // не разархивирует — локальные удаления/архивы переживают импорт. is_archived
  // намеренно НЕ входит в upsert: существующие значения сохраняются, новые
  // записи получают дефолт БД (false).
  async function archiveFromMj(table: string, rows: Record<string, unknown>[]) {
    const ids = rows.filter((x) => !!x.in_archive).map((x) => String(x.id));
    if (!ids.length) return;
    await admin.from(table).update({ is_archived: true }).in("outer_id", ids);
  }

  const result: Record<string, unknown> = {};
  let okAll = true; let errText: string | null = null;
  const startedAt = new Date().toISOString();

  try {
    // ---- Фонды (FPFund → funds). balance НЕ трогаем, stage=NULL, location=NULL.
    if (baseCurrencyId) {
      const funds = await mjGet("FPFund");
      result.funds = await upsertRefs("funds", funds.map((x) => ({
        outer_id: String(x.id), code: x.number, name: x.name,
        currency_id: baseCurrencyId,
      })));
      await archiveFromMj("funds", funds);
    } else {
      result.funds = "skip: нет базовой валюты";
    }

    // ---- Виды дохода (IncomeCategory → income_types). parent — плоско (NULL).
    const inc = await mjGet("IncomeCategory");
    result.income_types = await upsertRefs("income_types", inc.map((x) => ({
      outer_id: String(x.id), code: x.number, name: x.name,
    })));
    await archiveFromMj("income_types", inc);

    // ---- Статьи расхода (ExpenseCategory → expense_types). parent — плоско (NULL).
    const exp = await mjGet("ExpenseCategory");
    result.expense_types = await upsertRefs("expense_types", exp.map((x) => ({
      outer_id: String(x.id), code: x.number, name: x.name,
    })));
    await archiveFromMj("expense_types", exp);

    // ---- Статистики (Stat → statistics) + коридор состояний.
    const stats = await mjGet("Stat");
    result.statistics = await upsertRefs("statistics", stats.map((x) => ({
      outer_id: String(x.id), name: x.name, unit: x.unit,
      min_val: num(x.min_val), max_val: num(x.max_val),
      stat_type: x.stat_type ?? null, sign: x.sign ?? null,
      source: "manajet",
    })));
  } catch (e) {
    okAll = false; errText = e instanceof Error ? e.message : String(e);
  }

  await admin.from("mj_sync_log").insert({
    started_at: startedAt, finished_at: new Date().toISOString(),
    ok: okAll, trigger, entities: result, error: errText,
  });

  return new Response(JSON.stringify({ ok: okAll, trigger, entities: result, error: errText }), {
    status: okAll ? 200 : 500, headers: { ...cors, "Content-Type": "application/json" },
  });
});
