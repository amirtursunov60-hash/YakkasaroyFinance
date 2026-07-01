import { supabase } from "../supabase";

// ---------------------------------------------------------------- Доходы
export async function fetchIncomeTypes() {
  const { data, error } = await supabase
    .from("income_types")
    .select("id, code, name, parent_id, location_id")
    .eq("is_archived", false);
  if (error) throw error;
  return data;
}

// ---- Виды дохода (справочник income_types, Доход §8) -----------------------
// CRUD + переключение архива под RLS-политикой itypes_write = is_fin_admin()
// (см. baseline-схему). Дерево: папки-направления (parent_id IS NULL,
// с привязкой к точке) → листья-виды дохода (parent_id). Используется вкладкой
// «Доходы» (создание/правка прямо в дереве) и модулем «Архив» (восстановление).
export async function fetchIncomeTypesManage({ includeArchived = false } = {}) {
  let query = supabase
    .from("income_types")
    .select("id, code, name, parent_id, location_id, is_archived, location:locations(name)");
  if (!includeArchived) query = query.eq("is_archived", false);
  const { data, error } = await query.order("code");
  if (error) throw error;
  return data;
}

// Создать вид дохода (parentId задан) или папку-направление (parentId = null,
// locationId — точка папки; null = вся сеть).
export async function createIncomeType({ code, name, parentId = null, locationId = null }) {
  const { data, error } = await supabase
    .from("income_types")
    .insert({ code: code || null, name, parent_id: parentId || null, location_id: locationId || null })
    .select().single();
  if (error) throw error;
  return data;
}

// Частичное обновление (code/name/parent_id/location_id).
export async function updateIncomeType(id, patch) {
  const { error } = await supabase.from("income_types").update(patch).eq("id", id);
  if (error) throw error;
}

export async function setIncomeTypeArchived(id, archived) {
  const { error } = await supabase.from("income_types").update({ is_archived: archived }).eq("id", id);
  if (error) throw error;
}

// Суммы доходов по видам за указанные периоды:
// { [income_type_id]: { [period_id]: сумма в базовой валюте } }
export async function fetchIncomeSums(periodIds, locationId) {
  const ids = periodIds.filter(Boolean);
  if (!ids.length) return {};
  let q = supabase
    .from("incomes")
    .select("income_type_id, period_id, amount_base, is_return")
    .in("period_id", ids);
  if (locationId) q = q.eq("location_id", locationId);
  const { data, error } = await q;
  if (error) throw error;
  const sums = {};
  for (const r of data) {
    const byPeriod = (sums[r.income_type_id] ??= {});
    byPeriod[r.period_id] = (byPeriod[r.period_id] || 0) + (r.is_return ? -r.amount_base : r.amount_base);
  }
  return sums;
}

export async function fetchLocations() {
  const { data, error } = await supabase
    .from("locations").select("id, name, city").eq("is_archived", false).order("name");
  if (error) throw error;
  return data;
}

// Справочники для формы ввода дохода
export async function fetchIncomeRefs() {
  const [accounts, payTypes, currencies, locations, counterparties] = await Promise.all([
    supabase.from("cash_accounts").select("id, name, currency_id, location_id").eq("is_archived", false).order("name"),
    supabase.from("payment_types").select("id, name").eq("is_archived", false).order("name"),
    supabase.from("currencies").select("id, code, name, is_base").order("code"),
    supabase.from("locations").select("id, name, city").eq("is_archived", false).order("name"),
    supabase.from("counterparties").select("id, name").eq("is_archived", false).order("name"),
  ]);
  for (const r of [accounts, payTypes, currencies, locations, counterparties]) if (r.error) throw r.error;
  return {
    accounts: accounts.data,
    payTypes: payTypes.data,
    currencies: currencies.data,
    locations: locations.data,
    counterparties: counterparties.data,
  };
}

// Последний курс валюты на дату (для amount_base). null — курса нет.
export async function findRate(fromCurId, toCurId, onDateIso) {
  const { data, error } = await supabase
    .from("exchange_rates")
    .select("rate, valid_from")
    .eq("from_cur_id", fromCurId).eq("to_cur_id", toCurId)
    .lte("valid_from", onDateIso)
    .order("valid_from", { ascending: false })
    .limit(1).maybeSingle();
  if (error) throw error;
  return data?.rate ?? null;
}

// Операция дохода. Запись в Реестр создаёт триггер БД (income_to_register).
export async function insertIncome(row) {
  const { data, error } = await supabase.from("incomes").insert(row).select().single();
  if (error) throw error;
  return data;
}

// Лента отдельных операций дохода недели (ManaJet FpIncome): не свод по видам,
// а каждая операция. Включает сторно (is_return + reverses_income_id).
export async function fetchIncomeOperations({ periodId, locationId } = {}) {
  if (!periodId) return [];
  let q = supabase
    .from("incomes")
    .select(`id, amount, amount_base, received_on, is_return, reverses_income_id, source, comment, basis_document, created_at,
      income_type_id, currency_id, cash_account_id, payment_type_id, counterparty_id, location_id,
      income_type:income_types(code, name),
      currency:currencies(code, is_base),
      cash_account:cash_accounts(name),
      payment_type:payment_types(name),
      counterparty:counterparties(name),
      location:locations(name)`)
    .eq("period_id", periodId)
    .order("received_on", { ascending: false }).order("created_at", { ascending: false });
  if (locationId) q = q.eq("location_id", locationId);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

// Отмена операции дохода через сторно (доход-возврат; миграция 20260624230000).
export async function reverseIncome(incomeId) {
  const { error } = await supabase.rpc("fp_reverse_income", { p_income_id: incomeId });
  if (error) throw error;
}
