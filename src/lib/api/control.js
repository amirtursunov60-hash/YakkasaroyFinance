import { supabase } from "../supabase";

// Перемещение между счетами ДС — инкассация (fp_cash_transfer)
export async function cashTransfer(fromId, toId, amount, periodId, comment) {
  const { error } = await supabase.rpc("fp_cash_transfer", {
    p_from: fromId, p_to: toId, p_amount: amount, p_period_id: periodId, p_comment: comment || null,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------- Контроль средств
export async function fetchCashAccounts({ withArchived = false } = {}) {
  let q = supabase
    .from("cash_accounts")
    .select("id, name, type, flow_role, balance, is_archived, location_id, currency:currencies(code, is_base), location:locations(name)")
    .order("name");
  if (!withArchived) q = q.eq("is_archived", false);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function createCashAccount({ name, type, locationId, currencyId, flowRole }) {
  const { data, error } = await supabase
    .from("cash_accounts")
    .insert({ name, type, location_id: locationId || null, currency_id: currencyId, flow_role: flowRole || null })
    .select().single();
  if (error) throw error;
  return data;
}

// Редактирование счёта ДС (название/тип/точка/классификация). Валюту после
// операций не меняем — записи Реестра уже сделаны в старой; balance не трогаем
// (его ведут триггеры Реестра).
export async function updateCashAccount(id, { name, type, locationId, flowRole }) {
  const patch = {};
  if (name !== undefined) patch.name = name;
  if (type !== undefined) patch.type = type;
  if (locationId !== undefined) patch.location_id = locationId || null;
  if (flowRole !== undefined) patch.flow_role = flowRole || null;
  const { data, error } = await supabase.from("cash_accounts").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

// Архив вместо удаления (соглашение схемы is_archived) — история Реестра остаётся.
export async function setCashAccountArchived(id, archived) {
  const { error } = await supabase.from("cash_accounts").update({ is_archived: archived }).eq("id", id);
  if (error) throw error;
}

// «Контрольная сумма» ФП (образец — ManaJet): деньги на счетах ДС на конец
// выбранной недели ↔ нераспределённые доходы + фонды (доступно + одобренные
// невыплаченные заявки/счета). Read-only RPC поверх Реестра; разница ≠ 0 —
// сигнал (внеплановые траты, корректировки, ручные операции фондов).
export async function fetchControlSum(periodId) {
  if (!periodId) return null;
  const { data, error } = await supabase.rpc("fp_control_sum", { p_period_id: periodId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    cashTotal: Number(row.cash_total || 0),
    fundsTotal: Number(row.funds_total || 0),
    incomesUndistributed: Number(row.incomes_undistributed || 0),
    requestsUnpaid: Number(row.requests_unpaid || 0),
    billsUnpaid: Number(row.bills_unpaid || 0),
  };
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
