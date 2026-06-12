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

// ---------------------------------------------------------------- Расходы / Заявки (ЗРС)
export async function fetchExpenseTypes() {
  const { data, error } = await supabase
    .from("expense_types")
    .select("id, code, name, parent_id, location_id")
    .eq("is_archived", false);
  if (error) throw error;
  return data;
}

// Факт расходов по статьям за периоды (оплаты заявок и счетов из Реестра):
// { [expense_type_id]: { [period_id]: сумма в базовой валюте } }
export async function fetchExpenseSums(periodIds) {
  const ids = periodIds.filter(Boolean);
  if (!ids.length) return {};
  const { data, error } = await supabase
    .from("fp_register")
    .select("period_id, op_type, fund_amount, cash_amount, request:payment_requests(expense_type_id), bill:supplier_bills(expense_type_id)")
    .in("op_type", ["request_payment", "bill_payment"])
    .in("period_id", ids);
  if (error) throw error;
  const sums = {};
  for (const r of data) {
    const tid = r.request?.expense_type_id || r.bill?.expense_type_id;
    if (!tid) continue;
    const amt = -(Number(r.fund_amount ?? r.cash_amount) || 0);
    const byPeriod = (sums[tid] ??= {});
    byPeriod[r.period_id] = (byPeriod[r.period_id] || 0) + amt;
  }
  return sums;
}

// Посты текущего пользователя (заявка подаётся от поста — ТЗ v2 §4.1.5)
export async function fetchMyPositions(personId) {
  const { data, error } = await supabase
    .from("position_assignments")
    .select("position:org_positions(id, code, name)")
    .eq("person_id", personId);
  if (error) throw error;
  return data.map((r) => r.position).filter(Boolean);
}

export async function fetchOrgDivisions() {
  const { data, error } = await supabase
    .from("org_divisions").select("id, code, name").order("sort");
  if (error) throw error;
  return data;
}

// Создание поста с назначением себя (для старта, пока оргсхема не заполнена)
export async function createPositionAndAssign(personId, { code, name, divisionId }) {
  const pos = await supabase
    .from("org_positions")
    .insert({ code, name, division_id: divisionId || null })
    .select().single();
  if (pos.error) throw pos.error;
  const asg = await supabase
    .from("position_assignments")
    .insert({ person_id: personId, position_id: pos.data.id, is_main: true });
  if (asg.error) throw asg.error;
  return pos.data;
}

export async function fetchCounterparties() {
  const { data, error } = await supabase
    .from("counterparties").select("id, name").eq("is_archived", false).order("name");
  if (error) throw error;
  return data;
}

// Заявки: выбранного периода + все поданные (ещё без периода — период
// проставляется при одобрении, ТЗ: период одобрения)
export async function fetchRequests(periodId) {
  let q = supabase
    .from("payment_requests")
    .select(`id, number, status, planned_amount, csw_data, csw_situation, csw_solution,
      rejection_reason, created_at, decided_at, period_id, expense_type_id,
      position:org_positions(code, name, division:org_divisions(id, code, name)),
      requester:profiles!payment_requests_requester_id_fkey(full_name),
      expense_type:expense_types(code, name),
      fund:funds(id, code, name),
      location:locations(id, name),
      currency:currencies(id, code, is_base),
      counterparty:counterparties(name),
      payment_type:payment_types(name)`)
    .order("created_at", { ascending: false });
  q = periodId ? q.or(`period_id.eq.${periodId},status.eq.submitted`) : q.eq("status", "submitted");
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function insertRequest(row) {
  const { data, error } = await supabase.from("payment_requests").insert(row).select().single();
  if (error) throw error;
  return data;
}

// Решение финкомитета: approved (с фондом и периодом одобрения) | rejected | planning
export async function decideRequest(id, patch) {
  const upd = { ...patch };
  if (patch.status === "approved" || patch.status === "rejected") {
    upd.decided_by = (await supabase.auth.getUser()).data.user?.id;
    upd.decided_at = new Date().toISOString();
  }
  const { error } = await supabase.from("payment_requests").update(upd).eq("id", id);
  if (error) throw error;
}

// Оплата одобренной заявки (серверная функция, миграция fp_pay_request)
export async function payRequest(requestId, cashAccountId, periodId) {
  const { error } = await supabase.rpc("fp_pay_request", {
    p_request_id: requestId, p_cash_account_id: cashAccountId, p_period_id: periodId,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------- Сотрудники
export async function fetchEmployees() {
  const { data, error } = await supabase
    .from("profiles")
    .select(`id, full_name, phone, role, is_active, created_at,
      assignments:position_assignments!position_assignments_person_id_fkey(position:org_positions(id, code, name)),
      location_access:user_location_access!user_location_access_user_id_fkey(location_id)`)
    .order("full_name");
  if (error) throw error;
  return data;
}

export async function updateProfile(id, patch) {
  const { error } = await supabase.from("profiles").update(patch).eq("id", id);
  if (error) throw error;
}

export async function fetchAllPositions() {
  const { data, error } = await supabase
    .from("org_positions")
    .select("id, code, name, division:org_divisions(code, name)")
    .eq("is_archived", false)
    .order("code");
  if (error) throw error;
  return data;
}

export async function assignPosition(personId, positionId) {
  const { error } = await supabase
    .from("position_assignments")
    .insert({ person_id: personId, position_id: positionId, is_main: false });
  if (error) throw error;
}

export async function unassignPosition(personId, positionId) {
  const { error } = await supabase
    .from("position_assignments")
    .delete().eq("person_id", personId).eq("position_id", positionId);
  if (error) throw error;
}

export async function setLocationAccess(personId, locationId, grant) {
  const q = grant
    ? supabase.from("user_location_access").insert({ user_id: personId, location_id: locationId })
    : supabase.from("user_location_access").delete().eq("user_id", personId).eq("location_id", locationId);
  const { error } = await q;
  if (error) throw error;
}

// ---------------------------------------------------------------- Приглашения
export async function fetchInvites() {
  const { data, error } = await supabase
    .from("invites")
    .select(`id, token, role, expires_at, used_at,
      location:locations(name),
      position:org_positions(code, name),
      used_profile:profiles!invites_used_by_fkey(full_name)`)
    .order("expires_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createInvite({ role, locationId, positionId, createdBy }) {
  const { data, error } = await supabase
    .from("invites")
    .insert({ role, location_id: locationId || null, position_id: positionId || null, created_by: createdBy })
    .select().single();
  if (error) throw error;
  return data;
}

export async function deleteInvite(id) {
  const { error } = await supabase.from("invites").delete().eq("id", id);
  if (error) throw error;
}

// Приём приглашения после входа (серверная функция redeem_invite)
export async function redeemInvite(token, fullName) {
  const { error } = await supabase.rpc("redeem_invite", {
    p_token: token, p_full_name: fullName || null,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------- Счета поставщиков
// Счёт живёт в двух периодах (одобрения и оплаты, ТЗ §4.1.6): показываем
// поданные (ещё без периода) + одобренные/оплаченные в выбранном периоде
export async function fetchBills(periodId) {
  let q = supabase
    .from("supplier_bills")
    .select(`id, number, status, amount, issued_on, due_on, is_recurring, comment,
      rejection_reason, created_at, expense_type_id, counterparty_id, location_id,
      period_approved_id, period_paid_id,
      counterparty:counterparties(id, name),
      expense_type:expense_types(code, name),
      fund:funds(id, code, name),
      location:locations(id, name),
      currency:currencies(id, code, is_base),
      approved_period:fp_periods!supplier_bills_period_approved_id_fkey(starts_on, ends_on),
      paid_period:fp_periods!supplier_bills_period_paid_id_fkey(starts_on, ends_on)`)
    .eq("is_archived", false)
    .order("created_at", { ascending: false });
  q = periodId
    ? q.or(`status.eq.submitted,period_approved_id.eq.${periodId},period_paid_id.eq.${periodId}`)
    : q.eq("status", "submitted");
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function insertBill(row) {
  const { data, error } = await supabase.from("supplier_bills").insert(row).select().single();
  if (error) throw error;
  return data;
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
export async function payBill(billId, cashAccountId, periodId) {
  const { error } = await supabase.rpc("fp_pay_bill", {
    p_bill_id: billId, p_cash_account_id: cashAccountId, p_period_id: periodId,
  });
  if (error) throw error;
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

// ---------------------------------------------------------------- Счета клиентов (банкеты)
export async function fetchInvoices() {
  const { data, error } = await supabase
    .from("client_invoices")
    .select(`id, number, status, amount, event_name, hall, event_on, comment, created_at,
      counterparty:counterparties(id, name),
      location:locations(id, name),
      income_type:income_types(code, name),
      currency:currencies(id, code, is_base)`)
    .eq("is_archived", false)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data;
}

// Оплаты по счетам — операции дохода с invoice_id: { [invoice_id]: [{...}] }
export async function fetchInvoicePayments(invoiceIds) {
  if (!invoiceIds.length) return {};
  const { data, error } = await supabase
    .from("incomes")
    .select("id, invoice_id, amount, is_return, received_on, payment_type:payment_types(name), cash_account:cash_accounts(name)")
    .in("invoice_id", invoiceIds)
    .order("received_on", { ascending: false });
  if (error) throw error;
  const m = {};
  for (const r of data) (m[r.invoice_id] ??= []).push(r);
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

// ---------------------------------------------------------------- Фонды
export async function createFund({ code, name, kind, isRestricted, locationId, currencyId }) {
  const { data, error } = await supabase
    .from("funds")
    .insert({ code, name, kind, is_restricted: isRestricted, location_id: locationId || null, currency_id: currencyId })
    .select().single();
  if (error) throw error;
  return data;
}

// История операций между фондами: перемещения, займы, возвраты.
// Пара строк Реестра (−из/+в) с общим pair_id собирается в одну запись.
export async function fetchFundOps() {
  const { data, error } = await supabase
    .from("fp_register")
    .select("id, op_type, fund_id, fund_amount, pair_id, loan_parent_id, comment, created_at")
    .in("op_type", ["fund_transfer", "fund_loan", "fund_loan_return"])
    .order("created_at", { ascending: false })
    .limit(400);
  if (error) throw error;

  const byPair = {};
  for (const r of data) (byPair[r.pair_id] ??= []).push(r);
  // Сколько возвращено по каждому займу (родительская запись — отрицательная строка займа)
  const returnedByLoan = {};
  for (const r of data) {
    if (r.op_type === "fund_loan_return" && r.loan_parent_id && Number(r.fund_amount) > 0)
      returnedByLoan[r.loan_parent_id] = (returnedByLoan[r.loan_parent_id] || 0) + Number(r.fund_amount);
  }
  const ops = [];
  for (const rows of Object.values(byPair)) {
    const neg = rows.find((r) => Number(r.fund_amount) < 0);
    const pos = rows.find((r) => Number(r.fund_amount) > 0);
    if (!neg || !pos) continue;
    ops.push({
      id: neg.id, opType: neg.op_type, fromFundId: neg.fund_id, toFundId: pos.fund_id,
      amount: Number(pos.fund_amount), comment: neg.comment, createdAt: neg.created_at,
      loanParentId: neg.loan_parent_id,
      returned: neg.op_type === "fund_loan" ? (returnedByLoan[neg.id] || 0) : null,
    });
  }
  ops.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return ops;
}

export async function fundTransfer(fromId, toId, amount, periodId, comment) {
  const { error } = await supabase.rpc("fp_fund_transfer", {
    p_from: fromId, p_to: toId, p_amount: amount, p_period_id: periodId, p_comment: comment || null,
  });
  if (error) throw error;
}

export async function fundLoan(fromId, toId, amount, periodId, comment) {
  const { error } = await supabase.rpc("fp_fund_loan", {
    p_from: fromId, p_to: toId, p_amount: amount, p_period_id: periodId, p_comment: comment || null,
  });
  if (error) throw error;
}

export async function fundLoanReturn(loanId, amount, periodId, comment) {
  const { error } = await supabase.rpc("fp_fund_loan_return", {
    p_loan_id: loanId, p_amount: amount, p_period_id: periodId, p_comment: comment || null,
  });
  if (error) throw error;
}

// Выписка по фонду из Реестра
export async function fetchFundStatement(fundId, periodId) {
  let q = supabase
    .from("fp_register")
    .select("id, op_type, fund_amount, comment, created_at")
    .eq("fund_id", fundId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (periodId) q = q.eq("period_id", periodId);
  const { data, error } = await q;
  if (error) throw error;
  return data;
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

// ---------------------------------------------------------------- Директива
// Последние периоды ФП (для выбора недели)
export async function fetchPeriods(limit = 12) {
  const { data, error } = await supabase
    .from("fp_periods").select("*")
    .order("starts_on", { ascending: false }).limit(limit);
  if (error) throw error;
  return data;
}

export async function fetchFunds() {
  const { data, error } = await supabase
    .from("funds")
    .select("id, code, name, kind, is_restricted, balance")
    .eq("is_archived", false);
  if (error) throw error;
  return data;
}

// Правила схемы распределения по умолчанию (income_type_id is null)
export async function fetchDefaultRules() {
  const { data, error } = await supabase
    .from("distribution_rules")
    .select("id, fund_id, stage, percent, fixed_amount, priority")
    .is("income_type_id", null)
    .eq("is_archived", false)
    .order("priority");
  if (error) throw error;
  return data;
}

// Доход периода в базовой валюте (возвраты вычитаются)
export async function fetchPeriodIncome(periodId) {
  if (!periodId) return 0;
  const { data, error } = await supabase
    .from("incomes").select("amount_base, is_return").eq("period_id", periodId);
  if (error) throw error;
  return data.reduce((s, r) => s + (r.is_return ? -r.amount_base : r.amount_base), 0);
}

// Проведённое распределение периода: [{ fund_id, amount, stage|null }]
// Этап хранится в comment Реестра как 'stage:revenue' (см. миграцию 007);
// stage = null — строки, проведённые до поэтапной модели.
export async function fetchPeriodDistribution(periodId) {
  if (!periodId) return [];
  const { data, error } = await supabase
    .from("fp_register")
    .select("fund_id, fund_amount, comment")
    .eq("period_id", periodId).eq("op_type", "distribution");
  if (error) throw error;
  return data.map((r) => ({
    fund_id: r.fund_id,
    amount: Number(r.fund_amount),
    stage: r.comment?.startsWith("stage:") ? r.comment.slice(6) : null,
  }));
}

// Одобрение этапа распределения (серверная функция, миграция 007)
export async function distributeStage(periodId, stage, allocations) {
  const { error } = await supabase.rpc("fp_distribute_stage", {
    p_period_id: periodId, p_stage: stage, p_allocations: allocations,
  });
  if (error) throw error;
}

// Создать период с заданными границами (кнопка «Добавить неделю»)
export async function createPeriod(startsIso, endsIso) {
  const ins = await supabase
    .from("fp_periods")
    .insert({ starts_on: startsIso, ends_on: endsIso })
    .select().single();
  if (!ins.error) return ins.data;
  if (ins.error.code === "42501") return null; // нет прав
  if (ins.error.code === "23505") {            // такая неделя уже есть
    const again = await supabase
      .from("fp_periods").select("*").eq("starts_on", startsIso).maybeSingle();
    if (again.error) throw again.error;
    return again.data;
  }
  throw ins.error;
}

// Есть ли в периоде операции (доходы, Реестр, заявки, протокол Директивы)
export async function periodHasData(periodId) {
  const cnt = (table) => supabase
    .from(table).select("*", { count: "exact", head: true }).eq("period_id", periodId);
  const rs = await Promise.all([cnt("incomes"), cnt("fp_register"), cnt("payment_requests"), cnt("directives")]);
  for (const r of rs) if (r.error) throw r.error;
  return rs.some((r) => (r.count || 0) > 0);
}

// Удаление пустой недели (FK в БД не дадут удалить неделю с операциями)
export async function deletePeriod(periodId) {
  const { error } = await supabase.from("fp_periods").delete().eq("id", periodId);
  if (error) throw error;
}

// Статус периода: open ↔ planning (запрет подачи заявок на время финкомитета)
export async function setPeriodStatus(periodId, status) {
  const { error } = await supabase.from("fp_periods").update({ status }).eq("id", periodId);
  if (error) throw error;
}

// Протокол Директивы + закрытие периода (серверная функция, миграция 006)
export async function closePeriod(periodId, protocol) {
  const { error } = await supabase.rpc("fp_close_period", {
    p_period_id: periodId, p_protocol: protocol,
  });
  if (error) throw error;
}

// Переоткрытие закрытого периода (серверная функция, миграция 008)
export async function reopenPeriod(periodId) {
  const { error } = await supabase.rpc("fp_reopen_period", { p_period_id: periodId });
  if (error) throw error;
}

// Сброс одобренного распределения этапа ('all' — всего периода; миграция 009)
export async function resetDistribution(periodId, stage) {
  const { error } = await supabase.rpc("fp_reset_distribution", {
    p_period_id: periodId, p_stage: stage,
  });
  if (error) throw error;
}
