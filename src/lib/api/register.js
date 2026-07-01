import { supabase } from "../supabase";

// ---- ОСВ (оборотно-сальдовая ведомость, Реестр §9) ------------------------
// Read-only выборка из Реестра: по фондам и счетам ДС за период — вход/приход/
// расход/исход. { funds: [{id,opening,inflow,outflow,closing}], cash: [...] }.
export async function fetchTurnoverSheet(periodId) {
  if (!periodId) return { funds: [], cash: [] };
  const { data, error } = await supabase.rpc("fp_turnover_sheet", { p_period_id: periodId });
  if (error) throw error;
  const out = { funds: [], cash: [] };
  for (const r of data || []) {
    const row = { id: r.entity_id, opening: Number(r.opening || 0), inflow: Number(r.inflow || 0), outflow: Number(r.outflow || 0), closing: Number(r.closing || 0) };
    if (r.kind === "fund") out.funds.push(row); else if (r.kind === "cash") out.cash.push(row);
  }
  return out;
}

// ---- План счетов (справочник chart_accounts, Реестр §12) -------------------
// CRUD под RLS ca_* = is_fin_admin().
export async function fetchChartAccounts({ includeArchived = false } = {}) {
  let q = supabase.from("chart_accounts").select("id, code, name, account_type, is_archived");
  if (!includeArchived) q = q.eq("is_archived", false);
  const { data, error } = await q.order("code");
  if (error) throw error;
  return data;
}

export async function createChartAccount({ code, name, accountType }) {
  const { data, error } = await supabase
    .from("chart_accounts").insert({ code: code.trim(), name: name.trim(), account_type: accountType }).select().single();
  if (error) throw error;
  return data;
}

export async function updateChartAccount(id, patch) {
  const { error } = await supabase.from("chart_accounts").update(patch).eq("id", id);
  if (error) throw error;
}

export async function setChartAccountArchived(id, archived) {
  const { error } = await supabase.from("chart_accounts").update({ is_archived: archived }).eq("id", id);
  if (error) throw error;
}

// ---- Проводки двойной записи (Реестр §13) ----------------------------------
// Журнал — детерминированная проекция Реестра по правилам posting_rules;
// ничего не хранится и не пишется, Реестр остаётся источником истины.
export async function fetchPostings(periodId) {
  if (!periodId) return [];
  const { data, error } = await supabase.rpc("fp_postings", { p_period_id: periodId });
  if (error) throw error;
  return (data || []).map((r) => ({ ...r, amount: Number(r.amount || 0) }));
}

// ОСВ по плану счетов: сальдо на начало / обороты Дт/Кт / сальдо на конец.
export async function fetchChartTurnover(periodId) {
  if (!periodId) return [];
  const { data, error } = await supabase.rpc("fp_chart_turnover", { p_period_id: periodId });
  if (error) throw error;
  return (data || []).map((r) => ({
    ...r,
    opening: Number(r.opening || 0),
    debit_turnover: Number(r.debit_turnover || 0),
    credit_turnover: Number(r.credit_turnover || 0),
    closing: Number(r.closing || 0),
  }));
}

// Правила проводок: (тип операции, компонента cash|fund) → Дт/Кт.
// Запись — только фин-админ (RLS pr_write).
export async function fetchPostingRules() {
  const { data, error } = await supabase
    .from("posting_rules")
    .select("id, op_type, component, debit_code, credit_code")
    .order("op_type").order("component");
  if (error) throw error;
  return data;
}

export async function updatePostingRule(id, { debitCode, creditCode }) {
  if (debitCode.trim() === creditCode.trim()) throw new Error("Дебет и кредит не могут быть одним счётом");
  // .select() — чтобы отличить успех от строки, отфильтрованной RLS
  // (без него update «мимо прав» молча возвращает 0 строк без ошибки)
  const { data, error } = await supabase
    .from("posting_rules")
    .update({ debit_code: debitCode.trim(), credit_code: creditCode.trim() })
    .eq("id", id)
    .select();
  if (error) throw error;
  if (!data?.length) throw new Error("Нет прав на изменение правил проводок");
}

// ---------------------------------------------------------------- Реестр операций
// Единая лента всех операций ФП (ТЗ §4.1.9) с фильтрами
// Постранично: limit + offset (range). Вторичная сортировка по id —
// чтобы записи с одинаковым created_at не «прыгали» между страницами.
export async function fetchRegister({ periodId, opType, fundId, cashAccountId, counterpartyId, paymentTypeId, limit = 100, offset = 0 } = {}) {
  let q = supabase
    .from("fp_register")
    .select(`id, op_type, fund_amount, cash_amount, comment, created_at, period_id, reverses_id,
      fund:funds(code, name),
      cash_account:cash_accounts(name),
      counterparty:counterparties(name),
      payment_type:payment_types(name),
      creator:profiles!fp_register_created_by_fkey(full_name)`)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);
  if (periodId) q = q.eq("period_id", periodId);
  if (opType) q = q.eq("op_type", opType);
  if (fundId) q = q.eq("fund_id", fundId);
  if (cashAccountId) q = q.eq("cash_account_id", cashAccountId);
  if (counterpartyId) q = q.eq("counterparty_id", counterpartyId);
  if (paymentTypeId) q = q.eq("payment_type_id", paymentTypeId);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

// Журнал аудита — кто/что/когда менял (таблица audit_log, заполняется
// триггерами БД). Чтение — только финадмины (RLS audit_read). Связь автора —
// audit_log_user_id_fkey → profiles.
export async function fetchAuditLog({ limit = 200 } = {}) {
  const { data, error } = await supabase
    .from("audit_log")
    .select(`id, action, table_name, record_id, created_at,
      author:profiles!audit_log_user_id_fkey(full_name)`)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}
