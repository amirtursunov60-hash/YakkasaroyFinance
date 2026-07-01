import { supabase } from "../supabase";
import { fetchIncomeTypesManage } from "./income";
import { fetchPaymentTypes } from "./refs";
import { fetchCounterpartiesFull } from "./counterparties";

// ============================================================================
//  Архив: чтение архивных финансовых сущностей + восстановление (снять флаг).
//  Восстановление справочников/счетов/заявок Реестр НЕ трогает — деньги в
//  леджере остаются. Заявки «архивны» через статус (отозвана/отклонена) →
//  восстановление возвращает их в работу (submitted).
// ============================================================================
export async function fetchArchivedFunds() {
  const { data, error } = await supabase.from("funds")
    .select("id, code, name, balance").eq("is_archived", true).order("code");
  if (error) throw error;
  return data;
}
export async function unarchiveFund(id) {
  const { error } = await supabase.from("funds").update({ is_archived: false }).eq("id", id);
  if (error) throw error;
}
export async function fetchArchivedFundFolders() {
  const { data, error } = await supabase.from("fund_folders")
    .select("id, name, color").eq("is_archived", true).order("name");
  if (error) throw error;
  return data;
}
export async function unarchiveFundFolder(id) {
  const { error } = await supabase.from("fund_folders").update({ is_archived: false }).eq("id", id);
  if (error) throw error;
}
export async function fetchArchivedExpenseTypes() {
  const { data, error } = await supabase.from("expense_types")
    .select("id, code, name").eq("is_archived", true).order("code");
  if (error) throw error;
  return data;
}
export async function unarchiveExpenseType(id) {
  const { error } = await supabase.from("expense_types").update({ is_archived: false }).eq("id", id);
  if (error) throw error;
}
export async function fetchArchivedIncomeTypes() {
  const all = await fetchIncomeTypesManage({ includeArchived: true });
  return all.filter((t) => t.is_archived);
}
export async function fetchArchivedPaymentTypes() {
  const all = await fetchPaymentTypes({ includeArchived: true });
  return all.filter((t) => t.is_archived);
}
export async function fetchArchivedCounterparties() {
  const all = await fetchCounterpartiesFull({ includeArchived: true });
  return all.filter((c) => c.is_archived);
}
export async function fetchArchivedBills() {
  const { data, error } = await supabase.from("supplier_bills")
    .select("id, number, kind, amount, status, counterparty:counterparties(name)")
    .eq("is_archived", true).order("created_at", { ascending: false }).limit(300);
  if (error) throw error;
  return data;
}
export async function unarchiveBill(id) {
  const { error } = await supabase.from("supplier_bills").update({ is_archived: false }).eq("id", id);
  if (error) throw error;
}
export async function fetchArchivedRequests() {
  const { data, error } = await supabase.from("payment_requests")
    .select("id, number, status, planned_amount, csw_solution")
    .in("status", ["withdrawn", "rejected"]).order("created_at", { ascending: false }).limit(300);
  if (error) throw error;
  return data;
}
export async function restoreRequest(id) {
  const { error } = await supabase.from("payment_requests")
    .update({ status: "submitted", decided_by: null, decided_at: null, rejection_reason: null }).eq("id", id);
  if (error) throw error;
}
