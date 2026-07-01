import { supabase } from "../supabase";

// Перемещение между счетами ДС — инкассация (fp_cash_transfer)
export async function cashTransfer(fromId, toId, amount, periodId, comment) {
  const { error } = await supabase.rpc("fp_cash_transfer", {
    p_from: fromId, p_to: toId, p_amount: amount, p_period_id: periodId, p_comment: comment || null,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------- Контроль средств
export async function fetchCashAccounts() {
  const { data, error } = await supabase
    .from("cash_accounts")
    .select("id, name, type, balance, location_id, currency:currencies(code, is_base), location:locations(name)")
    .eq("is_archived", false)
    .order("name");
  if (error) throw error;
  return data;
}

export async function createCashAccount({ name, type, locationId, currencyId }) {
  const { data, error } = await supabase
    .from("cash_accounts")
    .insert({ name, type, location_id: locationId || null, currency_id: currencyId })
    .select().single();
  if (error) throw error;
  return data;
}

// Сверки выбранного периода: { [cash_account_id]: строка сверки }
export async function fetchReconciliations(periodId) {
  if (!periodId) return {};
  const { data, error } = await supabase
    .from("reconciliations")
    .select("cash_account_id, actual_balance, system_balance, difference, comment, created_at")
    .eq("period_id", periodId);
  if (error) throw error;
  return Object.fromEntries(data.map((r) => [r.cash_account_id, r]));
}

// Сохранение сверки (повторная сверка той же недели перезаписывает снимок)
export async function saveReconciliations(rows) {
  const { error } = await supabase
    .from("reconciliations")
    .upsert(rows, { onConflict: "cash_account_id,period_id" });
  if (error) throw error;
}

// Выписка по счёту ДС из Реестра (панель «Подробно», ТЗ v2 §4.1.8)
export async function fetchAccountStatement(accountId, periodId) {
  let q = supabase
    .from("fp_register")
    .select("id, op_type, cash_amount, comment, created_at, counterparty:counterparties(name)")
    .eq("cash_account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (periodId) q = q.eq("period_id", periodId);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}
