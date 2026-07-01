import { supabase } from "../supabase";
import { chunkIds } from "./shared";

// ---------------------------------------------------------------- Счета поставщиков
// Счёт живёт в двух периодах (одобрения и оплаты, ТЗ §4.1.6): показываем
// поданные (ещё без периода) + одобренные/оплаченные в выбранном периоде.
// kind: 'supply' — поставщики (продукты/хозтовары), 'obligation' —
// обязательства (оборудование, услуги, ремонт); без kind — все.
// Счета и обязательства показываем ВСЕГДА, независимо от выбранной недели
// (заказчик): счёт живёт в двух периодах (одобрения и оплаты) и не должен
// пропадать при переключении недели. Периоды фиксируются на самом счёте.
export async function fetchBills(_periodId, kind, locationId) {
  let q = supabase
    .from("supplier_bills")
    .select(`id, number, status, kind, amount, paid_amount, issued_on, due_on, is_recurring, comment,
      rejection_reason, created_at, created_by, expense_type_id, counterparty_id, location_id,
      period_approved_id, period_paid_id,
      counterparty:counterparties(id, name),
      expense_type:expense_types(code, name),
      fund:funds(id, code, name),
      location:locations(id, name),
      currency:currencies(id, code, is_base),
      approved_period:fp_periods!supplier_bills_period_approved_id_fkey(starts_on, ends_on),
      paid_period:fp_periods!supplier_bills_period_paid_id_fkey(starts_on, ends_on),
      attachments:bill_attachments(id, file_path, file_name)`)
    .eq("is_archived", false)
    .order("created_at", { ascending: false });
  if (kind) q = q.eq("kind", kind);
  if (locationId) q = q.eq("location_id", locationId);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function insertBill(row) {
  const { data, error } = await supabase.from("supplier_bills").insert(row).select().single();
  if (error) throw error;
  return data;
}

// Правка счёта автором, пока он «подан» (или финадмином). RLS разрешает UPDATE
// только своего submitted-счёта / любого — финадмину. Статус/created_by не трогаем.
export async function updateBill(id, patch) {
  const { error } = await supabase.from("supplier_bills").update(patch).eq("id", id);
  if (error) throw error;
}

// Оплаты счетов из Реестра (op_type='bill_payment') — лента «Операции со счетами».
// periodId — только оплаты выбранной недели (период оплаты). kind/точка — фильтр
// по самому счёту (на клиенте, у fp_register их отдельных колонок нет).
export async function fetchBillPayments(kind, locationId, { periodId, limit = 100 } = {}) {
  let q = supabase
    .from("fp_register")
    .select(`id, op_type, fund_amount, cash_amount, comment, created_at, period_id, reverses_id,
      fund:funds(code, name),
      cash_account:cash_accounts(name),
      period:fp_periods(status),
      creator:profiles!fp_register_created_by_fkey(full_name),
      bill:supplier_bills(number, kind, location_id, counterparty:counterparties(name), expense_type:expense_types(code, name))`)
    .eq("op_type", "bill_payment")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (periodId) q = q.eq("period_id", periodId);
  const { data, error } = await q;
  if (error) throw error;
  let rows = data || [];
  if (kind) rows = rows.filter((r) => r.bill?.kind === kind);
  if (locationId) rows = rows.filter((r) => r.bill?.location_id === locationId);
  return rows;
}

// Отмена оплаты счёта — компенсирующая запись Реестра + возврат счёта в
// 'approved' (RPC fp_reverse_bill_payment). Строку оплаты Реестр не удаляет.
export async function reverseBillPayment(registerId) {
  const { error } = await supabase.rpc("fp_reverse_bill_payment", { p_id: registerId });
  if (error) throw error;
}

// Одобрение (фонд + период одобрения = выбранная неделя) / отклонение
export async function decideBill(id, patch) {
  const upd = { ...patch };
  if (patch.status === "approved" || patch.status === "rejected") {
    upd.decided_by = (await supabase.auth.getUser()).data.user?.id;
    upd.decided_at = new Date().toISOString();
  }
  const { error } = await supabase.from("supplier_bills").update(upd).eq("id", id);
  if (error) throw error;
}

// Оплата одобренного счёта (серверная функция fp_pay_bill)
// amount — сумма частичной оплаты (в валюте счёта); null/undefined = весь остаток.
export async function payBill(billId, cashAccountId, periodId, amount = null) {
  const { error } = await supabase.rpc("fp_pay_bill", {
    p_bill_id: billId, p_cash_account_id: cashAccountId, p_period_id: periodId, p_amount: amount,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------- Счета клиентов (банкеты)
// Постранично (gap-map Счета §7): limit/offset — как в Реестре. Внимание:
// дефолт limit = 100 (раньше функция без опций возвращала до 200 строк).
// overdueBefore (ISO-дата) — только кандидаты в просрочку (gap-map Счета §12):
// выставленные счета, мероприятие которых прошло; долг досчитывается по
// оплатам. Сортировка у кандидатов — от самых старых мероприятий, чтобы при
// упоре в limit терялись новейшие, а не самые давние долги.
export async function fetchInvoices(locationId, { limit = 100, offset = 0, overdueBefore = null } = {}) {
  let q = supabase
    .from("client_invoices")
    .select(`id, number, status, amount, event_name, hall, event_on, comment, created_at,
      counterparty:counterparties(id, name, entity_type, inn, address, phone, contact_person, bank_name, bank_account, bank_mfo),
      location:locations(id, name, city),
      income_type:income_types(code, name),
      currency:currencies(id, code, is_base)`)
    .eq("is_archived", false)
    .range(offset, offset + limit - 1);
  if (overdueBefore) {
    q = q.eq("status", "issued").lt("event_on", overdueBefore).order("event_on", { ascending: true });
  } else {
    q = q.order("created_at", { ascending: false });
  }
  if (locationId) q = q.eq("location_id", locationId);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

// Оплаты по счетам — операции дохода с invoice_id: { [invoice_id]: [{...}] }
export async function fetchInvoicePayments(invoiceIds) {
  if (!invoiceIds.length) return {};
  const chunks = await Promise.all(chunkIds(invoiceIds).map(async (ids) => {
    const { data, error } = await supabase
      .from("incomes")
      .select("id, invoice_id, amount, is_return, reverses_income_id, received_on, payment_type:payment_types(name), cash_account:cash_accounts(name)")
      .in("invoice_id", ids)
      .order("received_on", { ascending: false });
    if (error) throw error;
    return data;
  }));
  const m = {};
  for (const r of chunks.flat()) (m[r.invoice_id] ??= []).push(r);
  return m;
}

export async function insertInvoice(row) {
  const { data, error } = await supabase.from("client_invoices").insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function cancelInvoice(id) {
  const { error } = await supabase.from("client_invoices").update({ status: "cancelled" }).eq("id", id);
  if (error) throw error;
}

// Приём оплаты: серверная функция создаёт операцию дохода (триггер сам
// проводит её в Реестр) и обновляет статус счёта
export async function payInvoice({ invoiceId, amount, cashAccountId, paymentTypeId, periodId, receivedOn }) {
  const { error } = await supabase.rpc("fp_pay_invoice", {
    p_invoice_id: invoiceId, p_amount: amount, p_cash_account_id: cashAccountId,
    p_payment_type_id: paymentTypeId, p_period_id: periodId, p_received_on: receivedOn,
  });
  if (error) throw error;
}

// Откат отдельной оплаты счёта клиента: сторно через операцию дохода-возврата
// (income_return проводит триггер; счёт ДС уменьшается, статус счёта пересчитан)
export async function reverseInvoicePayment(incomeId) {
  const { error } = await supabase.rpc("fp_reverse_invoice_payment", { p_income_id: incomeId });
  if (error) throw error;
}
