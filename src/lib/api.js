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

// Факт расходов по статьям за периоды (оплаты заявок из Реестра):
// { [expense_type_id]: { [period_id]: сумма в базовой валюте } }
export async function fetchExpenseSums(periodIds) {
  const ids = periodIds.filter(Boolean);
  if (!ids.length) return {};
  const { data, error } = await supabase
    .from("fp_register")
    .select("period_id, fund_amount, cash_amount, request:payment_requests(expense_type_id)")
    .eq("op_type", "request_payment")
    .in("period_id", ids);
  if (error) throw error;
  const sums = {};
  for (const r of data) {
    const tid = r.request?.expense_type_id;
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
      position:org_positions(code, name),
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
