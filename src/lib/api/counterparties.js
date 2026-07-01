import { supabase } from "../supabase";

export async function fetchCounterparties() {
  const { data, error } = await supabase
    .from("counterparties").select("id, name").eq("is_archived", false).order("name");
  if (error) throw error;
  return data;
}

// Быстрое добавление поставщика из формы счёта
export async function createCounterparty(name, { isSupplier = true } = {}) {
  const { data, error } = await supabase
    .from("counterparties")
    .insert({ name, is_supplier: isSupplier })
    .select().single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------- Справочник контрагентов
// Категории (CompanyCategory) + контакты (CompanyContact) + полный экран-справочник.
export async function fetchCounterpartyCategories() {
  const { data, error } = await supabase
    .from("counterparty_categories")
    .select("id, name, color")
    .eq("is_archived", false).order("name");
  if (error) throw error;
  return data;
}

export async function createCounterpartyCategory(name, { color } = {}) {
  const { data, error } = await supabase
    .from("counterparty_categories")
    .insert({ name, color: color || null })
    .select().single();
  if (error) throw error;
  return data;
}

// Полный список для справочника (с категорией и контактами). Фильтры —
// role: 'supplier'|'client'|null; categoryId; includeArchived; q (поиск по имени/ИНН).
export async function fetchCounterpartiesFull({ q = "", role = null, categoryId = null, includeArchived = false } = {}) {
  let query = supabase
    .from("counterparties")
    .select(`id, name, is_supplier, is_client, phone, inn, comment, is_archived, category_id,
      entity_type, address, bank_name, bank_account, bank_mfo, contact_person,
      category:counterparty_categories(id, name, color),
      contacts:counterparty_contacts(id, kind, value, label, is_primary)`)
    .order("name");
  if (!includeArchived) query = query.eq("is_archived", false);
  if (role === "supplier") query = query.eq("is_supplier", true);
  if (role === "client") query = query.eq("is_client", true);
  if (categoryId) query = query.eq("category_id", categoryId);
  if (q.trim()) query = query.or(`name.ilike.%${q.trim()}%,inn.ilike.%${q.trim()}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function createCounterpartyFull({
  name, isSupplier, isClient, phone, inn, categoryId, comment,
  entityType, address, bankName, bankAccount, bankMfo, contactPerson,
}) {
  const { data, error } = await supabase
    .from("counterparties")
    .insert({
      name, is_supplier: !!isSupplier, is_client: !!isClient,
      phone: phone || null, inn: inn || null, category_id: categoryId || null, comment: comment || null,
      entity_type: entityType || null, address: address || null,
      bank_name: bankName || null, bank_account: bankAccount || null,
      bank_mfo: bankMfo || null, contact_person: contactPerson || null,
    })
    .select().single();
  if (error) throw error;
  return data;
}

export async function updateCounterparty(id, patch) {
  const { error } = await supabase.from("counterparties").update(patch).eq("id", id);
  if (error) throw error;
}

export async function setCounterpartyArchived(id, archived) {
  const { error } = await supabase.from("counterparties").update({ is_archived: archived }).eq("id", id);
  if (error) throw error;
}

export async function addCounterpartyContact(counterpartyId, { kind, value, label, isPrimary }) {
  const { data, error } = await supabase
    .from("counterparty_contacts")
    .insert({ counterparty_id: counterpartyId, kind: kind || "phone", value, label: label || null, is_primary: !!isPrimary })
    .select().single();
  if (error) throw error;
  return data;
}

export async function deleteCounterpartyContact(id) {
  const { error } = await supabase.from("counterparty_contacts").delete().eq("id", id);
  if (error) throw error;
}
