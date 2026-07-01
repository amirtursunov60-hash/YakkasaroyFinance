import { supabase } from "../supabase";

// ---- Способы оплаты (справочник payment_types, Фонды §8) -------------------
// CRUD под RLS-политикой ptypes_write = is_fin_admin() (см. baseline-схему).
export async function fetchPaymentTypes({ includeArchived = false } = {}) {
  let query = supabase.from("payment_types").select("id, name, is_archived");
  if (!includeArchived) query = query.eq("is_archived", false);
  const { data, error } = await query.order("name");
  if (error) throw error;
  return data;
}

export async function createPaymentType(name) {
  const { data, error } = await supabase
    .from("payment_types").insert({ name }).select().single();
  if (error) throw error;
  return data;
}

export async function updatePaymentType(id, patch) {
  const { error } = await supabase.from("payment_types").update(patch).eq("id", id);
  if (error) throw error;
}

export async function setPaymentTypeArchived(id, archived) {
  const { error } = await supabase.from("payment_types").update({ is_archived: archived }).eq("id", id);
  if (error) throw error;
}

// ---- Валюты (справочник currencies, Фонды §3) -----------------------------
// CRUD под RLS currencies_insert/update = is_fin_admin(). Удаление не даём
// (валюта ссылается из счетов/фондов/операций). Базовая — через RPC ниже.
export async function fetchCurrencies() {
  const { data, error } = await supabase.from("currencies").select("id, code, name, is_base").order("code");
  if (error) throw error;
  return data;
}

export async function createCurrency({ code, name }) {
  const { data, error } = await supabase
    .from("currencies").insert({ code: code.trim(), name: name.trim() }).select().single();
  if (error) throw error;
  return data;
}

export async function updateCurrency(id, patch) {
  const { error } = await supabase.from("currencies").update(patch).eq("id", id);
  if (error) throw error;
}

// Атомарная смена базовой валюты (ровно одна is_base) — RPC fp_set_base_currency.
export async function setBaseCurrency(id) {
  const { error } = await supabase.rpc("fp_set_base_currency", { p_id: id });
  if (error) throw error;
}

// ---- Курсы обмена (справочник exchange_rates, Фонды §4) --------------------
// CRUD под RLS rates_insert/update/delete. Курс хранится парой (from→to) на дату.
export async function fetchExchangeRates() {
  const { data, error } = await supabase
    .from("exchange_rates")
    .select(`id, from_cur_id, to_cur_id, rate, valid_from,
      from_cur:currencies!exchange_rates_from_cur_id_fkey(code),
      to_cur:currencies!exchange_rates_to_cur_id_fkey(code)`)
    .order("valid_from", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createExchangeRate({ fromCurId, toCurId, rate, validFrom }) {
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  const { data, error } = await supabase
    .from("exchange_rates")
    .insert({ from_cur_id: fromCurId, to_cur_id: toCurId, rate, valid_from: validFrom, created_by: uid })
    .select().single();
  if (error) throw error;
  return data;
}

export async function updateExchangeRate(id, patch) {
  const { error } = await supabase.from("exchange_rates").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteExchangeRate(id) {
  const { error } = await supabase.from("exchange_rates").delete().eq("id", id);
  if (error) throw error;
}
