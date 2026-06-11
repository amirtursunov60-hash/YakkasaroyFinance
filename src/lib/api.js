import { supabase } from "./supabase";

// ============================================================================
//  API-слой поверх Supabase. Постепенно заменяет моки из src/data/.
//  Имена колонок — по фактической схеме БД (см. supabase/README.md).
// ============================================================================

// Дата → 'YYYY-MM-DD' в локальном времени (не UTC, чтобы не съехал день)
export const isoDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ---------------------------------------------------------------- Периоды ФП
// Границы финансовой недели чт–ср, содержащей дату d (ТЗ v2 §4.1.1)
export function weekBounds(d = new Date()) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const offset = (date.getDay() - 4 + 7) % 7; // getDay(): 0=вс…6=сб; 4 = четверг
  const start = new Date(date);
  start.setDate(date.getDate() - offset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

// Период, содержащий дату. create=true — создать, если нет (нужны права
// финдиректора/владельца; без прав вернёт null).
export async function getPeriodFor(date, { create = false } = {}) {
  const { start, end } = weekBounds(date);
  const startIso = isoDate(start);
  const { data, error } = await supabase
    .from("fp_periods").select("*").eq("starts_on", startIso).maybeSingle();
  if (error) throw error;
  if (data || !create) return data;

  const ins = await supabase
    .from("fp_periods")
    .insert({ starts_on: startIso, ends_on: isoDate(end) })
    .select().single();
  if (!ins.error) return ins.data;
  if (ins.error.code === "42501") return null; // нет прав на создание периода
  if (ins.error.code === "23505") {            // параллельно создал кто-то другой
    const again = await supabase
      .from("fp_periods").select("*").eq("starts_on", startIso).maybeSingle();
    if (again.error) throw again.error;
    return again.data;
  }
  throw ins.error;
}

// Период предыдущей недели относительно даты
export async function getPrevPeriodFor(date) {
  const prev = new Date(date);
  prev.setDate(prev.getDate() - 7);
  return getPeriodFor(prev);
}

// ---------------------------------------------------------------- Доходы
export async function fetchIncomeTypes() {
  const { data, error } = await supabase
    .from("income_types")
    .select("id, code, name, parent_id, location_id")
    .eq("is_archived", false);
  if (error) throw error;
  return data;
}

// Суммы доходов по видам за указанные периоды:
// { [income_type_id]: { [period_id]: сумма в базовой валюте } }
export async function fetchIncomeSums(periodIds) {
  const ids = periodIds.filter(Boolean);
  if (!ids.length) return {};
  const { data, error } = await supabase
    .from("incomes")
    .select("income_type_id, period_id, amount_base, is_return")
    .in("period_id", ids);
  if (error) throw error;
  const sums = {};
  for (const r of data) {
    const byPeriod = (sums[r.income_type_id] ??= {});
    byPeriod[r.period_id] = (byPeriod[r.period_id] || 0) + (r.is_return ? -r.amount_base : r.amount_base);
  }
  return sums;
}

// Справочники для формы ввода дохода
export async function fetchIncomeRefs() {
  const [accounts, payTypes, currencies, locations] = await Promise.all([
    supabase.from("cash_accounts").select("id, name, currency_id, location_id").eq("is_archived", false).order("name"),
    supabase.from("payment_types").select("id, name").eq("is_archived", false).order("name"),
    supabase.from("currencies").select("id, code, name, is_base").order("code"),
    supabase.from("locations").select("id, name, city").eq("is_archived", false).order("name"),
  ]);
  for (const r of [accounts, payTypes, currencies, locations]) if (r.error) throw r.error;
  return {
    accounts: accounts.data,
    payTypes: payTypes.data,
    currencies: currencies.data,
    locations: locations.data,
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
