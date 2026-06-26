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

// ---- Виды дохода (справочник income_types, Доход §8) -----------------------
// CRUD под RLS-политикой itypes_write = is_fin_admin() (см. baseline-схему).
// Дерево: папки (parent_id IS NULL, с привязкой к точке) → листья (parent_id).
export async function fetchIncomeTypesManage({ includeArchived = false } = {}) {
  let query = supabase
    .from("income_types")
    .select("id, code, name, parent_id, location_id, is_archived, location:locations(name)");
  if (!includeArchived) query = query.eq("is_archived", false);
  const { data, error } = await query.order("code");
  if (error) throw error;
  return data;
}

export async function createIncomeType({ code, name, parentId = null }) {
  const { data, error } = await supabase
    .from("income_types")
    .insert({ code: code || null, name, parent_id: parentId || null })
    .select().single();
  if (error) throw error;
  return data;
}

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

// ---------------------------------------------------------------- Расходы / Заявки (ЗРС)
export async function fetchExpenseTypes() {
  const { data, error } = await supabase
    .from("expense_types")
    .select("id, code, name, parent_id, location_id, default_fund_id, default_purpose")
    .eq("is_archived", false);
  if (error) throw error;
  return data;
}

// Привязка статьи РД к фонду/цели по умолчанию (для авто-подстановки в форме ЗРС)
export async function updateExpenseType(id, patch) {
  const { error } = await supabase.from("expense_types").update(patch).eq("id", id);
  if (error) throw error;
}

// Факт расходов по статьям за периоды (оплаты заявок и счетов из Реестра):
// { [expense_type_id]: { [period_id]: сумма в базовой валюте } }
export async function fetchExpenseSums(periodIds, locationId) {
  const ids = periodIds.filter(Boolean);
  if (!ids.length) return {};
  const { data, error } = await supabase
    .from("fp_register")
    .select("period_id, op_type, fund_amount, cash_amount, request:payment_requests(expense_type_id, location_id), bill:supplier_bills(expense_type_id, location_id)")
    .in("op_type", ["request_payment", "bill_payment"])
    .in("period_id", ids);
  if (error) throw error;
  const sums = {};
  for (const r of data) {
    const tid = r.request?.expense_type_id || r.bill?.expense_type_id;
    if (!tid) continue;
    if (locationId && (r.request?.location_id || r.bill?.location_id) !== locationId) continue;
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

// ---------------------------------------------------------------- Оргсхема (ТЗ v2 §4.3–4.4)
// Полная организующая схема: отделения → посты (с секциями, ЦКП, шляпами) с
// держателями постов и статусом шляпы. Балансы прав — RLS (читают все; пишут
// финадмин/опердиректор; отделения — только финадмин).
export async function fetchOrgChart() {
  const [divs, poss] = await Promise.all([
    supabase.from("org_divisions").select("id, code, name, color, ckp, sort").order("sort"),
    supabase
      .from("org_positions")
      .select(`id, code, name, division_id, location_id, section, ckp, statistic, duties, is_executive, sort,
        location:locations(name),
        assignments:position_assignments!position_assignments_position_id_fkey(
          is_main, hat_status, person:profiles!position_assignments_person_id_fkey(id, full_name))`)
      .eq("is_archived", false)
      .order("sort"),
  ]);
  if (divs.error) throw divs.error;
  if (poss.error) throw poss.error;

  const byDiv = {};
  for (const p of poss.data) {
    const holders = (p.assignments || [])
      .map((a) => ({ id: a.person?.id, name: a.person?.full_name, hatStatus: a.hat_status, isMain: a.is_main }))
      .filter((h) => h.id)
      .sort((a, b) => Number(b.isMain) - Number(a.isMain));
    const pos = {
      id: p.id, code: p.code, name: p.name, divisionId: p.division_id,
      locationId: p.location_id, locationName: p.location?.name || null,
      section: p.section || "Без секции", ckp: p.ckp, statistic: p.statistic,
      duties: Array.isArray(p.duties) ? p.duties : [],
      isExecutive: p.is_executive, sort: p.sort, holders,
    };
    (byDiv[p.division_id] ??= []).push(pos);
  }
  return divs.data.map((d) => ({
    id: d.id, code: d.code, name: d.name, color: d.color, ckp: d.ckp, sort: d.sort,
    positions: byDiv[d.id] || [],
  }));
}

// Активные сотрудники для назначения на пост (лёгкий список)
export async function fetchPeopleBrief() {
  const { data, error } = await supabase
    .from("profiles").select("id, full_name").eq("is_active", true).order("full_name");
  if (error) throw error;
  return data;
}

// Краткий список постов оргсхемы (для адресации задач/БП посту)
export async function fetchPositionsBrief() {
  const { data, error } = await supabase
    .from("org_positions")
    .select("id, code, name, division:org_divisions(code, name)")
    .eq("is_archived", false)
    .order("code");
  if (error) throw error;
  return data;
}

export async function createDivision({ code, name, color, ckp }) {
  const { data, error } = await supabase
    .from("org_divisions")
    .insert({ code, name, color: color || null, ckp: ckp || null })
    .select().single();
  if (error) throw error;
  return data;
}

export async function updateDivision(id, patch) {
  const { error } = await supabase.from("org_divisions").update(patch).eq("id", id);
  if (error) throw error;
}

// Удаление отделения; БД не даст удалить, если на нём висят посты (FK)
export async function deleteDivision(id) {
  const { error } = await supabase.from("org_divisions").delete().eq("id", id);
  if (error) throw error;
}

export async function createPosition(row) {
  const { data, error } = await supabase.from("org_positions").insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function updatePosition(id, patch) {
  const { error } = await supabase.from("org_positions").update(patch).eq("id", id);
  if (error) throw error;
}

// Пост не удаляем, а архивируем (соглашение схемы — is_archived)
export async function archivePosition(id) {
  const { error } = await supabase.from("org_positions").update({ is_archived: true }).eq("id", id);
  if (error) throw error;
}

// Статус шляпы держателя поста: none → learning → done (ТЗ §4.4 «изучил»)
export async function setHatStatus(personId, positionId, status) {
  const { error } = await supabase
    .from("position_assignments")
    .update({ hat_status: status })
    .eq("person_id", personId).eq("position_id", positionId);
  if (error) throw error;
}

export async function fetchCounterparties() {
  const { data, error } = await supabase
    .from("counterparties").select("id, name").eq("is_archived", false).order("name");
  if (error) throw error;
  return data;
}

// Заявки-ЗРС.
// • Вкладка «Заявки» (журнал) — показываем ВСЕГДА, независимо от выбранной недели:
//   заявка может быть подана в одной неделе, а одобрена/оплачена в другой — она не
//   должна пропадать при переключении периода (период фиксируется на самой заявке).
// • Директива (рассмотрение) — только заявки выбранной недели: byPeriod: true
//   фильтрует по period_id (правило Директивы «поданные на эту неделю»).
export async function fetchRequests(periodId, locationId, { byPeriod = false } = {}) {
  let q = supabase
    .from("payment_requests")
    .select(`id, number, status, planned_amount, approved_amount, paid_amount, comment, csw_data, csw_situation, csw_solution,
      purpose, tags, rejection_reason, created_at, decided_at, period_id, period_paid_id, expense_type_id, requester_id, position_id, fund_id,
      position:org_positions(code, name, division:org_divisions(id, code, name)),
      requester:profiles!payment_requests_requester_id_fkey(full_name, avatar_url),
      expense_type:expense_types(code, name),
      fund:funds(id, code, name),
      location:locations(id, name),
      currency:currencies(id, code, is_base),
      counterparty:counterparties(name),
      payment_type:payment_types(name),
      period:fp_periods!payment_requests_period_id_fkey(id, starts_on, ends_on),
      period_paid:fp_periods!payment_requests_period_paid_id_fkey(id, starts_on, ends_on),
      attachments:request_attachments(id, file_path, file_name)`)
    .order("created_at", { ascending: false });
  if (byPeriod && periodId) q = q.eq("period_id", periodId);
  if (locationId) q = q.eq("location_id", locationId);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function insertRequest(row) {
  const { data, error } = await supabase.from("payment_requests").insert(row).select().single();
  if (error) throw error;
  return data;
}

// Правка заявки автором, пока она на рассмотрении (или финадмином). RLS разрешает
// UPDATE только своей submitted-заявки / любой — финадмину. Меняем неделю и поля
// ЗРС; статус/заявителя не трогаем. Перенос в закрытую неделю блокирует триггер БД.
export async function updateRequest(id, patch) {
  const { error } = await supabase.from("payment_requests").update(patch).eq("id", id);
  if (error) throw error;
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

// Отзыв собственной заявки заявителем (Заявки §7). Серверная функция
// fp_withdraw_request проверяет, что отзывает владелец и только пока заявка
// «подана» (submitted); переводит статус в 'withdrawn' (≠ rejected).
export async function withdrawRequest(requestId) {
  const { error } = await supabase.rpc("fp_withdraw_request", { p_request_id: requestId });
  if (error) throw error;
}

// Оплата одобренной заявки (серверная функция, миграция fp_pay_request)
// amount — сумма частичной оплаты (в валюте заявки); null/undefined = весь остаток.
export async function payRequest(requestId, cashAccountId, periodId, amount = null) {
  const { error } = await supabase.rpc("fp_pay_request", {
    p_request_id: requestId, p_cash_account_id: cashAccountId, p_period_id: periodId,
    p_amount: amount,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------- Сотрудники
export async function fetchEmployees() {
  const { data, error } = await supabase
    .from("profiles")
    .select(`id, full_name, phone, role, is_active, created_at, avatar_url,
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

// Загрузка/замена аватара сотрудника. Файл кладётся в свою папку (uid) бакета
// avatars; путь уникален по времени (обход кэша CDN). Возвращает публичный URL,
// который проставляется в profiles.avatar_url (self-update разрешён политикой).
export async function uploadAvatar(userId, file) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${userId}/avatar_${Date.now()}.${ext}`;
  const up = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
  if (up.error) throw up.error;
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  const url = data.publicUrl;
  const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", userId);
  if (error) throw error;
  return url;
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

// ---------------------------------------------------------------- Счета клиентов (банкеты)
export async function fetchInvoices(locationId) {
  let q = supabase
    .from("client_invoices")
    .select(`id, number, status, amount, event_name, hall, event_on, comment, created_at,
      counterparty:counterparties(id, name, entity_type, inn, address, phone, contact_person, bank_name, bank_account, bank_mfo),
      location:locations(id, name, city),
      income_type:income_types(code, name),
      currency:currencies(id, code, is_base)`)
    .eq("is_archived", false)
    .order("created_at", { ascending: false })
    .limit(200);
  if (locationId) q = q.eq("location_id", locationId);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

// Оплаты по счетам — операции дохода с invoice_id: { [invoice_id]: [{...}] }
export async function fetchInvoicePayments(invoiceIds) {
  if (!invoiceIds.length) return {};
  const { data, error } = await supabase
    .from("incomes")
    .select("id, invoice_id, amount, is_return, reverses_income_id, received_on, payment_type:payment_types(name), cash_account:cash_accounts(name)")
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

// Откат отдельной оплаты счёта клиента: сторно через операцию дохода-возврата
// (income_return проводит триггер; счёт ДС уменьшается, статус счёта пересчитан)
export async function reverseInvoicePayment(incomeId) {
  const { error } = await supabase.rpc("fp_reverse_invoice_payment", { p_income_id: incomeId });
  if (error) throw error;
}

// Перемещение между счетами ДС — инкассация (fp_cash_transfer)
export async function cashTransfer(fromId, toId, amount, periodId, comment) {
  const { error } = await supabase.rpc("fp_cash_transfer", {
    p_from: fromId, p_to: toId, p_amount: amount, p_period_id: periodId, p_comment: comment || null,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------- Вложения
// kind: 'request' | 'bill' | 'invoice'; файл кладём в Storage, ссылку — в таблицу
const ATT_TABLE = { request: "request_attachments", bill: "bill_attachments", invoice: "invoice_attachments", counterparty: "counterparty_attachments" };
const ATT_FK = { request: "request_id", bill: "bill_id", invoice: "invoice_id", counterparty: "counterparty_id" };
// Префикс пути в Storage (по умолчанию `${kind}s`, но для counterparty — правильное мн. число)
const ATT_PREFIX = { request: "requests", bill: "bills", invoice: "invoices", counterparty: "counterparties" };

export async function uploadAttachment(kind, parentId, file, uploadedBy) {
  const safe = file.name.replace(/[^\wа-яА-ЯёЁ.-]+/gu, "_").slice(-80);
  const path = `${ATT_PREFIX[kind] || `${kind}s`}/${parentId}/${Date.now()}_${safe}`;
  const up = await supabase.storage.from("attachments").upload(path, file);
  if (up.error) throw up.error;
  const { error } = await supabase.from(ATT_TABLE[kind])
    .insert({ [ATT_FK[kind]]: parentId, file_path: path, file_name: file.name, uploaded_by: uploadedBy });
  if (error) throw error;
}

// Удаление вложения: сначала строку из таблицы (RLS: автор или финадмин),
// затем файл из Storage (owner/финадмин по политике attachments)
export async function deleteAttachment(kind, id, filePath) {
  const { error } = await supabase.from(ATT_TABLE[kind]).delete().eq("id", id);
  if (error) throw error;
  await supabase.storage.from("attachments").remove([filePath]);
}

// Вложения по списку счетов клиентов: { [invoice_id]: [{...}] }
export async function fetchInvoiceAttachments(invoiceIds) {
  if (!invoiceIds.length) return {};
  const { data, error } = await supabase
    .from("invoice_attachments")
    .select("id, invoice_id, file_path, file_name, uploaded_by, created_at")
    .in("invoice_id", invoiceIds)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const m = {};
  for (const r of data) (m[r.invoice_id] ??= []).push(r);
  return m;
}

// Вложения по списку контрагентов: { [counterparty_id]: [{...}] }
export async function fetchCounterpartyAttachments(counterpartyIds) {
  if (!counterpartyIds.length) return {};
  const { data, error } = await supabase
    .from("counterparty_attachments")
    .select("id, counterparty_id, file_path, file_name, uploaded_by, created_at")
    .in("counterparty_id", counterpartyIds)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const m = {};
  for (const r of data) (m[r.counterparty_id] ??= []).push(r);
  return m;
}

export async function attachmentUrl(path) {
  const { data, error } = await supabase.storage.from("attachments").createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

// ---------------------------------------------------------------- Схемы по видам дохода (ManaJet)
// Правила «вид дохода → фонд, этап, %»: своя схема на каждый вид дохода
// (ТЗ §4.1.3). Сгруппированы по фонду для калькулятора в Директиве.
export async function fetchIncomeTypeRules() {
  const { data, error } = await supabase
    .from("distribution_rules")
    .select("id, fund_id, stage, percent, fixed_amount, priority, income_type:income_types(id, code, name)")
    .not("income_type_id", "is", null)
    .eq("is_archived", false)
    .order("priority");
  if (error) throw error;
  const byFund = {};
  for (const r of data) (byFund[r.fund_id] ??= []).push(r);
  return byFund;
}

// Правила, сгруппированные по виду дохода (для настройки схемы в «Доходах»):
// { [income_type_id]: [{ id, fund_id, stage, percent, fund:{code,name} }] }
export async function fetchRulesByIncomeType() {
  const { data, error } = await supabase
    .from("distribution_rules")
    .select("id, fund_id, income_type_id, stage, percent, fixed_amount, fund:funds(code, name)")
    .not("income_type_id", "is", null)
    .eq("is_archived", false);
  if (error) throw error;
  const m = {};
  for (const r of data) (m[r.income_type_id] ??= []).push(r);
  return m;
}

export async function addDistributionRule({ fundId, incomeTypeId, stage, percent }) {
  const { error } = await supabase
    .from("distribution_rules")
    .insert({ fund_id: fundId, income_type_id: incomeTypeId, stage, percent });
  if (error) throw error;
}

export async function deleteDistributionRule(id) {
  const { error } = await supabase
    .from("distribution_rules")
    .update({ is_archived: true })
    .eq("id", id);
  if (error) throw error;
}

// Доход недели по видам дохода: { [income_type_id]: сумма } (факт для калькулятора)
export async function fetchIncomeByType(periodId) {
  if (!periodId) return {};
  const { data, error } = await supabase
    .from("incomes")
    .select("income_type_id, amount_base, is_return")
    .eq("period_id", periodId);
  if (error) throw error;
  const m = {};
  for (const r of data)
    m[r.income_type_id] = (m[r.income_type_id] || 0) + (r.is_return ? -r.amount_base : Number(r.amount_base));
  return m;
}

// ---------------------------------------------------------------- Папки фондов
export async function fetchFundFolders() {
  const { data, error } = await supabase
    .from("fund_folders").select("id, name, parent_id, color, description")
    .eq("is_archived", false).order("name");
  if (error) throw error;
  return data;
}

export async function createFundFolder(name, { color, description } = {}) {
  const { data, error } = await supabase
    .from("fund_folders").insert({ name, color: color || null, description: description || null })
    .select().single();
  if (error) throw error;
  return data;
}

// Редактирование папки (docs/funds-spec.md §9): название, цвет, описание.
export async function updateFundFolder(id, { name, color, description }) {
  const patch = {};
  if (name !== undefined) patch.name = name;
  if (color !== undefined) patch.color = color || null;
  if (description !== undefined) patch.description = description || null;
  const { data, error } = await supabase.from("fund_folders").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

// Архив папки: фонды внутри остаются (folder_id → null), сама папка в архив.
export async function archiveFundFolder(id) {
  const r1 = await supabase.from("funds").update({ folder_id: null }).eq("folder_id", id);
  if (r1.error) throw r1.error;
  const r2 = await supabase.from("fund_folders").update({ is_archived: true }).eq("id", id);
  if (r2.error) throw r2.error;
}

// Сводная выписка по всем фондам папки (Реестр), для кнопки «Подробно» папки.
export async function fetchFolderStatement(folderId, periodId) {
  const { data: fs, error: e1 } = await supabase
    .from("funds").select("id").eq("folder_id", folderId).eq("is_archived", false);
  if (e1) throw e1;
  const ids = (fs || []).map((f) => f.id);
  if (!ids.length) return [];
  let q = supabase
    .from("fp_register")
    .select("id, op_type, fund_amount, comment, created_at, fund:funds(code)")
    .in("fund_id", ids)
    .order("created_at", { ascending: false })
    .limit(200);
  if (periodId) q = q.eq("period_id", periodId);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------- Скорректированная схема недели
// Правки процентов в Директиве сохраняются на период (ТЗ §4.1.3)
export async function fetchPeriodOverrides(periodId) {
  if (!periodId) return {};
  const { data, error } = await supabase
    .from("period_distribution_overrides")
    .select("rule_id, percent")
    .eq("period_id", periodId);
  if (error) throw error;
  return Object.fromEntries(data.map((r) => [r.rule_id, Number(r.percent)]));
}

export async function savePeriodOverrides(periodId, entries) {
  if (!entries.length) return;
  const { error } = await supabase
    .from("period_distribution_overrides")
    .upsert(entries.map(({ ruleId, percent }) => ({ period_id: periodId, rule_id: ruleId, percent })),
      { onConflict: "period_id,rule_id" });
  if (error) throw error;
}

// ---------------------------------------------------------------- Глобальный поиск
// Ищет по контрагентам, заявкам, счетам, банкетам, фондам, сотрудникам
export async function globalSearch(qstr) {
  const like = `%${qstr}%`;
  const [cp, req, bill, inv, fund, ppl] = await Promise.all([
    supabase.from("counterparties").select("id, name").ilike("name", like).eq("is_archived", false).limit(5),
    supabase.from("payment_requests").select("id, number, csw_solution, status").or(`csw_data.ilike.${like},csw_situation.ilike.${like},csw_solution.ilike.${like}`).limit(5),
    supabase.from("supplier_bills").select("id, number, kind, status, counterparty:counterparties(name)").ilike("number", like).limit(5),
    supabase.from("client_invoices").select("id, number, event_name, status").ilike("event_name", like).limit(5),
    supabase.from("funds").select("id, code, name").or(`name.ilike.${like},code.ilike.${like}`).eq("is_archived", false).limit(5),
    supabase.from("profiles").select("id, full_name, role").ilike("full_name", like).limit(5),
  ]);
  const res = [];
  (cp.data || []).forEach((x) => res.push({ type: "Контрагент", label: x.name, module: "finance", section: "suppliers" }));
  (req.data || []).forEach((x) => res.push({ type: "Заявка", label: `№${x.number} · ${x.csw_solution?.slice(0, 40) || ""}`, module: "finance", section: "requests" }));
  (bill.data || []).forEach((x) => res.push({ type: x.kind === "obligation" ? "Обязательство" : "Счёт поставщика", label: `№${x.number} · ${x.counterparty?.name || ""}`, module: "finance", section: "suppliers" }));
  (inv.data || []).forEach((x) => res.push({ type: "Банкет", label: `№${x.number} · ${x.event_name}`, module: "finance", section: "clients" }));
  (fund.data || []).forEach((x) => res.push({ type: "Фонд", label: `${x.code} · ${x.name}`, module: "finance", section: "funds" }));
  (ppl.data || []).forEach((x) => res.push({ type: "Сотрудник", label: x.full_name, module: "staff", section: "st_people" }));
  return res.slice(0, 14);
}

// ---------------------------------------------------------------- Реестр операций
// Единая лента всех операций ФП (ТЗ §4.1.9) с фильтрами
export async function fetchRegister({ periodId, opType, fundId, cashAccountId, counterpartyId, paymentTypeId, limit = 200 } = {}) {
  let q = supabase
    .from("fp_register")
    .select(`id, op_type, fund_amount, cash_amount, comment, created_at, period_id, reverses_id,
      fund:funds(code, name),
      cash_account:cash_accounts(name),
      counterparty:counterparties(name),
      payment_type:payment_types(name),
      creator:profiles!fp_register_created_by_fkey(full_name)`)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (periodId) q = q.eq("period_id", periodId);
  if (opType) q = q.eq("op_type", opType);
  if (fundId) q = q.eq("fund_id", fundId);
  if (cashAccountId) q = q.eq("cash_account_id", cashAccountId);
  if (counterpartyId) q = q.eq("counterparty_id", counterpartyId);
  if (paymentTypeId) q = q.eq("payment_type_id", paymentTypeId);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

// Журнал аудита — кто/что/когда менял (таблица audit_log, заполняется
// триггерами БД). Чтение — только финадмины (RLS audit_read). Связь автора —
// audit_log_user_id_fkey → profiles.
export async function fetchAuditLog({ limit = 200 } = {}) {
  const { data, error } = await supabase
    .from("audit_log")
    .select(`id, action, table_name, record_id, created_at,
      author:profiles!audit_log_user_id_fkey(full_name)`)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

// История изменений одного лида (gap-map CRM §16). Видна благодаря точечной
// политике audit_read_crm_leads. С old_data/new_data для расшифровки изменений.
export async function fetchLeadHistory(leadId) {
  const { data, error } = await supabase
    .from("audit_log")
    .select(`id, action, record_id, old_data, new_data, created_at,
      author:profiles!audit_log_user_id_fkey(full_name)`)
    .eq("table_name", "crm_leads")
    .eq("record_id", leadId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

// Комментарии/переписка по заявке (ЗРС-тред, таблица request_comments).
// Автор — request_comments_author_id_fkey → profiles. RLS: чтение и вставка.
export async function fetchRequestComments(requestId) {
  const { data, error } = await supabase
    .from("request_comments")
    .select(`id, body, created_at, is_ai, author_id, author:profiles!request_comments_author_id_fkey(full_name, avatar_url)`)
    .eq("request_id", requestId)
    .order("created_at");
  if (error) throw error;
  return data;
}

export async function addRequestComment(requestId, body) {
  const authorId = (await supabase.auth.getUser()).data.user?.id ?? null;
  const { data, error } = await supabase
    .from("request_comments")
    .insert({ request_id: requestId, author_id: authorId, body })
    .select(`id, body, created_at, is_ai, author:profiles!request_comments_author_id_fkey(full_name)`)
    .single();
  if (error) throw error;
  return data;
}

// ИИ-рецензент ЗРС: дёргаем Edge Function request-ai-review (она читает заявку,
// зовёт Claude и при неполноте пишет комментарий в тред). Fire-and-forget —
// не блокируем подачу и не роняем UX, если ИИ недоступен или ключ не настроен.
export async function requestAiReview(requestId) {
  try {
    await supabase.functions.invoke("request-ai-review", { body: { request_id: requestId } });
  } catch {
    /* ИИ-проверка необязательна — молча игнорируем сбой */
  }
}

// --- In-app уведомления (наполняются триггерами БД; RLS — только свои) ---
export async function fetchNotifications({ limit = 20 } = {}) {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, kind, title, body, module, view_key, request_id, is_read, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

// Пометить прочитанными: ids — массив id, либо null = все непрочитанные.
export async function markNotificationsRead(ids = null) {
  let q = supabase.from("notifications").update({ is_read: true }).eq("is_read", false);
  if (ids && ids.length) q = q.in("id", ids);
  const { error } = await q;
  if (error) throw error;
}

// Оплаты заявок из Реестра (op_type='request_payment') — лента «Операции с
// заявками» внизу вкладки «Заявки». Заявка попадает в Реестр только при оплате.
// periodId — показываем оплаты только выбранной недели (период оплаты в Реестре).
// Точка у fp_register отдельной колонкой не хранится — фильтруем по точке заявки
// на клиенте (как и список заявок во вкладке).
export async function fetchRequestPayments(locationId, { periodId, limit = 100 } = {}) {
  let q = supabase
    .from("fp_register")
    .select(`id, op_type, fund_amount, cash_amount, comment, created_at, period_id, reverses_id,
      fund:funds(code, name),
      cash_account:cash_accounts(name),
      period:fp_periods(status),
      creator:profiles!fp_register_created_by_fkey(full_name),
      request:payment_requests(number, location_id, expense_type:expense_types(code, name), position:org_positions(code, name))`)
    .eq("op_type", "request_payment")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (periodId) q = q.eq("period_id", periodId);
  const { data, error } = await q;
  if (error) throw error;
  const rows = data || [];
  return locationId ? rows.filter((r) => r.request?.location_id === locationId) : rows;
}

// Отмена оплаты заявки — компенсирующая запись Реестра + возврат заявки в
// 'approved' (RPC fp_reverse_request_payment). Реестр строку оплаты не удаляет.
export async function reverseRequestPayment(registerId) {
  const { error } = await supabase.rpc("fp_reverse_request_payment", { p_id: registerId });
  if (error) throw error;
}

// ---------------------------------------------------------------- Отчёты
// Сырьё для ДДС/P&L/сравнения точек: доходы и выплаты по периодам.
// Точка расхода берётся из заявки или счёта; ЗП и вне ФП — без точки.
export async function fetchReportData(periodIds) {
  const ids = periodIds.filter(Boolean);
  if (!ids.length) return { incomes: [], expenses: [] };
  const [inc, exp] = await Promise.all([
    supabase
      .from("incomes")
      .select("period_id, location_id, amount_base, is_return")
      .in("period_id", ids),
    supabase
      .from("fp_register")
      .select("period_id, op_type, fund_amount, cash_amount, request:payment_requests(location_id), bill:supplier_bills(location_id)")
      .in("op_type", ["request_payment", "bill_payment", "payroll_payment", "off_plan"])
      .in("period_id", ids),
  ]);
  if (inc.error) throw inc.error;
  if (exp.error) throw exp.error;
  return { incomes: inc.data, expenses: exp.data };
}

// ДДС по фондам за период: { [fund_id]: { in, out } }
export async function fetchFundFlows(periodId) {
  if (!periodId) return {};
  const { data, error } = await supabase
    .from("fp_register")
    .select("fund_id, fund_amount")
    .eq("period_id", periodId)
    .not("fund_id", "is", null);
  if (error) throw error;
  const m = {};
  for (const r of data) {
    const f = (m[r.fund_id] ??= { in: 0, out: 0 });
    const v = Number(r.fund_amount) || 0;
    if (v >= 0) f.in += v; else f.out += -v;
  }
  return m;
}

// ---------------------------------------------------------------- Расчёт зарплаты
// Ведомость выбранной недели (одна на период в MVP) со строками
export async function fetchPayrollSheet(periodId) {
  if (!periodId) return null;
  const { data, error } = await supabase
    .from("payroll_sheets")
    .select(`id, number, status, fot_amount, fund_id, comment, created_at,
      lines:payroll_lines(id, person_id, points, state, coefficient, accrued, advance, deduction,
        person:profiles(id, full_name, role))`)
    .eq("period_id", periodId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createPayrollSheet({ periodId, fundId, createdBy, personIds }) {
  const sheet = await supabase
    .from("payroll_sheets")
    .insert({ period_id: periodId, fund_id: fundId || null, created_by: createdBy })
    .select().single();
  if (sheet.error) throw sheet.error;
  if (personIds.length) {
    const { error } = await supabase
      .from("payroll_lines")
      .insert(personIds.map((person_id) => ({ sheet_id: sheet.data.id, person_id })));
    if (error) throw error;
  }
  return sheet.data;
}

export async function updatePayrollSheet(id, patch) {
  const { error } = await supabase.from("payroll_sheets").update(patch).eq("id", id);
  if (error) throw error;
}

// Сохранение строк ведомости (фиксирует коэффициенты и начисления)
export async function upsertPayrollLines(rows) {
  const { error } = await supabase
    .from("payroll_lines")
    .upsert(rows, { onConflict: "sheet_id,person_id" });
  if (error) throw error;
}

export async function addPayrollLine(sheetId, personId) {
  const { error } = await supabase
    .from("payroll_lines").insert({ sheet_id: sheetId, person_id: personId });
  if (error) throw error;
}

export async function deletePayrollLine(id) {
  const { error } = await supabase.from("payroll_lines").delete().eq("id", id);
  if (error) throw error;
}

// Выплата утверждённой ведомости (серверная функция fp_pay_payroll)
export async function payPayroll(sheetId, cashAccountId, periodId) {
  const { error } = await supabase.rpc("fp_pay_payroll", {
    p_sheet_id: sheetId, p_cash_account_id: cashAccountId, p_period_id: periodId,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------- Фонды
export async function createFund({ code, name, kind, locationId, currencyId, folderId,
  description, color, stage, noTransfer, isPrivate }) {
  const { data, error } = await supabase
    .from("funds")
    .insert({ code, name, kind, location_id: locationId || null,
      currency_id: currencyId, folder_id: folderId || null,
      description: description || null, color: color || null, stage: stage || null,
      no_transfer: !!noTransfer, is_private: !!isPrivate })
    .select().single();
  if (error) throw error;
  // синхронизируем этап с Директивой (создаём дефолтное правило распределения)
  if (stage) await setFundStage(data.id, stage);
  return data;
}

// Редактирование фонда (docs/funds-spec.md §8). Передаём только изменяемые поля.
// Этап (stage) синхронизируется с Директивой через fp_set_fund_stage отдельно.
export async function updateFund(id, { code, name, kind, locationId, folderId,
  description, color, stage, noTransfer, isPrivate }) {
  const patch = {};
  if (code !== undefined) patch.code = code;
  if (name !== undefined) patch.name = name;
  if (kind !== undefined) patch.kind = kind;
  if (locationId !== undefined) patch.location_id = locationId || null;
  if (folderId !== undefined) patch.folder_id = folderId || null;
  if (description !== undefined) patch.description = description || null;
  if (color !== undefined) patch.color = color || null;
  if (noTransfer !== undefined) patch.no_transfer = !!noTransfer;
  if (isPrivate !== undefined) patch.is_private = !!isPrivate;
  let data = null;
  if (Object.keys(patch).length) {
    const res = await supabase.from("funds").update(patch).eq("id", id).select().single();
    if (res.error) throw res.error;
    data = res.data;
  }
  // этап меняем через RPC — он переносит/сворачивает дефолтное правило Директивы
  if (stage !== undefined) await setFundStage(id, stage || null);
  return data;
}

// Этап фонда + перенос его дефолтного правила распределения в Директиве.
export async function setFundStage(fundId, stage) {
  const { error } = await supabase.rpc("fp_set_fund_stage", { p_fund: fundId, p_stage: stage });
  if (error) throw error;
}

// Архивирование фонда (вместо удаления — is_archived, ТЗ-конвенция).
export async function archiveFund(id) {
  const { error } = await supabase.from("funds").update({ is_archived: true }).eq("id", id);
  if (error) throw error;
}

// Ручной приход средств в фонд (Приход) и изъятие (Возврат) — RPC, строки Реестра.
export async function fundIncome(fundId, amount, periodId, comment) {
  const { error } = await supabase.rpc("fp_fund_income", {
    p_fund: fundId, p_amount: amount, p_period_id: periodId, p_comment: comment || null,
  });
  if (error) throw error;
}

export async function fundReturn(fundId, amount, periodId, comment) {
  const { error } = await supabase.rpc("fp_fund_return", {
    p_fund: fundId, p_amount: amount, p_period_id: periodId, p_comment: comment || null,
  });
  if (error) throw error;
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

// Журнал всех операций по фондам (docs/funds-spec.md §7) — единая лента.
// Парные операции (перемещение/заём/возврат, pair_id) собираются в ОДНУ запись
// (источник → получатель). Назначение (статья РД) — из заявки/счёта.
// reversible — можно ли откатить (перемещение/приход/возврат, ещё не откачены).
export async function fetchFundJournal(limit = 400) {
  const { data, error } = await supabase
    .from("fp_register")
    .select(`id, op_type, fund_id, fund_amount, comment, created_at, period_id, pair_id, reverses_id, loan_parent_id,
      period:fp_periods(status),
      fund:funds(code, name),
      counterparty:counterparties(name),
      payment_type:payment_types(name),
      request:payment_requests(number, expense_type:expense_types(code, name)),
      bill:supplier_bills(number, expense_type:expense_types(code, name))`)
    .not("fund_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const reversedLegIds = new Set(data.filter((r) => r.reverses_id).map((r) => r.reverses_id));
  // возвращено по каждому займу (родитель = отрицательная нога), чтобы не давать
  // откат уже погашенного займа
  const returnedByLoan = {};
  for (const r of data) {
    if (r.op_type === "fund_loan_return" && r.loan_parent_id && Number(r.fund_amount) > 0)
      returnedByLoan[r.loan_parent_id] = (returnedByLoan[r.loan_parent_id] || 0) + Number(r.fund_amount);
  }
  // откат разрешён только в открытой неделе (в закрытом периоде — нельзя)
  const periodOpen = (r) => r.period?.status && r.period.status !== "closed";
  const info = (r) => ({
    expenseType: r.request?.expense_type || r.bill?.expense_type || null,
    counterparty: r.counterparty?.name || null,
    paymentType: r.payment_type?.name || null,
    docNumber: r.request?.number || r.bill?.number || null,
    comment: r.comment || null,
    isReversal: !!r.reverses_id,
  });
  const seenPair = new Set();
  const ops = [];
  for (const r of data) {
    if (r.pair_id) {
      if (seenPair.has(r.pair_id)) continue;
      seenPair.add(r.pair_id);
      const legs = data.filter((x) => x.pair_id === r.pair_id);
      const neg = legs.find((x) => Number(x.fund_amount) < 0) || legs[0];
      const pos = legs.find((x) => Number(x.fund_amount) > 0) || legs[legs.length - 1];
      const reversed = legs.some((x) => reversedLegIds.has(x.id));
      // заём откатывается, пока не погашен полностью
      const loanOutstanding = r.op_type === "fund_loan"
        ? -Number(neg.fund_amount) - (returnedByLoan[neg.id] || 0) : 0;
      ops.push({
        id: neg.id, opType: r.op_type, createdAt: r.created_at, periodId: r.period_id,
        fromFund: neg?.fund || null, toFund: pos?.fund || null, fund: null,
        amount: Math.abs(Number(pos?.fund_amount || neg?.fund_amount || 0)), signed: false,
        ...info(r), reversed,
        reversible: periodOpen(r) && !reversed && !r.reverses_id && (
          r.op_type === "fund_transfer" || (r.op_type === "fund_loan" && loanOutstanding > 0.009)
        ),
      });
    } else {
      const reversed = reversedLegIds.has(r.id);
      ops.push({
        id: r.id, opType: r.op_type, createdAt: r.created_at, periodId: r.period_id,
        fromFund: null, toFund: null, fund: r.fund || null,
        amount: Number(r.fund_amount) || 0, signed: true,
        ...info(r), reversed,
        reversible: periodOpen(r) && ["fund_income", "fund_return"].includes(r.op_type) && !reversed && !r.reverses_id,
      });
    }
  }
  // Откаченные операции и сами записи-откаты прячем из журнала вкладки «Фонды»
  // (в главном Реестре они остаются). docs/funds-spec.md §7.
  return ops.filter((o) => !o.isReversal && !o.reversed);
}

// Откат операции фонда (компенсирующая запись возвращает деньги в исходный фонд).
export async function reverseFundOp(id) {
  const { error } = await supabase.rpc("fp_reverse_fund_op", { p_id: id });
  if (error) throw error;
}

// Займы, в которых участвует фонд (для клика по «Долгу»): как кредитор и как
// заёмщик, с остатком к возврату. docs/funds-spec.md §8.
export async function fetchFundLoans(fundId) {
  const all = await fetchFundOps();
  return all
    .filter((o) => o.opType === "fund_loan" && (o.fromFundId === fundId || o.toFundId === fundId))
    .map((o) => ({
      ...o,
      role: o.fromFundId === fundId ? "lender" : "borrower",
      outstanding: o.amount - (o.returned || 0),
    }));
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
    .select("id, code, name, kind, is_restricted, is_private, no_transfer, stage, color, description, balance, folder_id, location_id")
    .eq("is_archived", false);
  if (error) throw error;
  return data;
}

// Остаток фондов и счетов ДС на конец выбранного периода (gap-map Фонды §2/§9):
// накопленная сумма движений Реестра до конца недели N включительно. Считается
// в БД (RPC fp_period_balances, read-only). Возвращает { funds: {id: bal}, cash: {id: bal} }.
export async function fetchPeriodBalances(periodId) {
  if (!periodId) return { funds: {}, cash: {} };
  const { data, error } = await supabase.rpc("fp_period_balances", { p_period_id: periodId });
  if (error) throw error;
  const out = { funds: {}, cash: {} };
  for (const r of data || []) {
    if (r.kind === "fund") out.funds[r.entity_id] = Number(r.balance || 0);
    else if (r.kind === "cash") out.cash[r.entity_id] = Number(r.balance || 0);
  }
  return out;
}

// Остаток (одобренное-неоплаченное) по фондам: { [fund_id]: сумма }.
// Производная (docs/funds-spec.md §11): одобренные, но НЕ оплаченные заявки +
// одобренные, но не оплаченные счета/обязательства поставщиков. Леджер не трогаем.
export async function fetchFundCommitments() {
  const [reqRes, billRes] = await Promise.all([
    supabase.from("payment_requests")
      .select("fund_id, planned_amount, approved_amount").eq("status", "approved").not("fund_id", "is", null),
    supabase.from("supplier_bills")
      .select("fund_id, amount").eq("status", "approved").eq("is_archived", false).not("fund_id", "is", null),
  ]);
  if (reqRes.error) throw reqRes.error;
  if (billRes.error) throw billRes.error;
  const m = {};
  for (const r of reqRes.data) m[r.fund_id] = (m[r.fund_id] || 0) + Number(r.approved_amount ?? r.planned_amount ?? 0);
  for (const b of billRes.data) m[b.fund_id] = (m[b.fund_id] || 0) + Number(b.amount || 0);
  return m;
}

// Долг по фондам: { [fund_id]: сальдо }. Сумма fund_amount по займам и возвратам:
// − фонду должны (кредитор), + фонд должен (заёмщик). docs/funds-spec.md §4/§11.
export async function fetchFundDebts() {
  const { data, error } = await supabase
    .from("fp_register")
    .select("fund_id, fund_amount")
    .in("op_type", ["fund_loan", "fund_loan_return"])
    .not("fund_id", "is", null);
  if (error) throw error;
  const m = {};
  for (const r of data) m[r.fund_id] = (m[r.fund_id] || 0) + Number(r.fund_amount || 0);
  return m;
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

// Подтверждение недели ФП: kind 'executive' (исполнительный контур) | 'baf'
// (финкомитет). Закрытие Директивой требует обоих (миграция 20260624190000).
export async function setPeriodConfirmation(periodId, kind, value) {
  const { error } = await supabase.rpc("fp_set_period_confirmation", {
    p_period_id: periodId, p_kind: kind, p_value: value,
  });
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

// ---------------------------------------------------------------- Статистики (ИЦО)
// Статистика принадлежит посту оргсхемы (через него — отделению) и/или точке.
// Значения хранятся понедельно (statistic_values.period_id → fp_periods), флаг
// is_quota отделяет квоту от факта. Состояние считается по тренду факта
// (src/utils/stats.ts · calcState). RLS — из baseline (родные функции прав).

export async function fetchStatistics() {
  const { data, error } = await supabase
    .from("statistics")
    .select(`id, name, unit, invert, is_auto, source, location_id, owner_id, position_id, min_val, max_val, stat_type, frequency,
      owner:profiles(full_name),
      position:org_positions(code, name, division:org_divisions(code, name))`)
    .eq("is_archived", false)
    .order("name");
  if (error) throw error;
  return data;
}

// Датированные значения статистики (день/месяц) за диапазон дат:
// { [value_date]: { value, quota, description } }. Для frequency='day'/'month'
// (для месяца value_date — 1-е число месяца). Недельные значения — fetchStatisticValues.
export async function fetchStatisticDatedValues(statisticId, fromDate, toDate) {
  if (!statisticId) return {};
  let q = supabase
    .from("statistic_dated_values")
    .select("value_date, value, is_quota, description")
    .eq("statistic_id", statisticId)
    .order("value_date");
  if (fromDate) q = q.gte("value_date", fromDate);
  if (toDate) q = q.lte("value_date", toDate);
  const { data, error } = await q;
  if (error) throw error;
  const m = {};
  for (const r of data) {
    const cell = (m[r.value_date] ??= { value: null, quota: null, description: null });
    if (r.is_quota) cell.quota = Number(r.value);
    else { cell.value = Number(r.value); cell.description = r.description || null; }
  }
  return m;
}

// Апсерт датированного значения (день/месяц). description — только к факту.
export async function upsertStatisticDatedValue(statisticId, valueDate, value, isQuota = false, description = null) {
  if (!valueDate) throw new Error("Не указана дата значения");
  const enteredBy = (await supabase.auth.getUser()).data.user?.id ?? null;
  const note = isQuota ? null : (description || null);
  const found = await supabase
    .from("statistic_dated_values").select("id")
    .eq("statistic_id", statisticId).eq("value_date", valueDate).eq("is_quota", isQuota)
    .maybeSingle();
  if (found.error) throw found.error;
  if (found.data) {
    const { error } = await supabase
      .from("statistic_dated_values").update({ value, entered_by: enteredBy, description: note }).eq("id", found.data.id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from("statistic_dated_values")
    .insert({ statistic_id: statisticId, value_date: valueDate, value, is_quota: isQuota, entered_by: enteredBy, description: note });
  if (error) throw error;
}

// Значения за указанные периоды:
// { [statistic_id]: { [period_id]: { value, quota, description } } }
// description — заметка к ФАКТУ (is_quota=false): почему значение такое.
export async function fetchStatisticValues(periodIds) {
  const ids = (periodIds || []).filter(Boolean);
  if (!ids.length) return {};
  const { data, error } = await supabase
    .from("statistic_values")
    .select("statistic_id, period_id, value, is_quota, description")
    .in("period_id", ids);
  if (error) throw error;
  const m = {};
  for (const r of data) {
    const byPeriod = (m[r.statistic_id] ??= {});
    const cell = (byPeriod[r.period_id] ??= { value: null, quota: null, description: null });
    if (r.is_quota) cell.quota = Number(r.value);
    else { cell.value = Number(r.value); cell.description = r.description || null; }
  }
  return m;
}

export async function createStatistic({ name, unit, invert = false, positionId, ownerId, locationId, source, minVal = null, maxVal = null, statType = null, frequency = "week" }) {
  const { data, error } = await supabase
    .from("statistics")
    .insert({
      name, unit: unit || null, invert,
      position_id: positionId || null, owner_id: ownerId || null,
      location_id: locationId || null, source: source || null,
      min_val: minVal, max_val: maxVal, stat_type: statType, frequency: frequency || "week",
    })
    .select().single();
  if (error) throw error;
  return data;
}

export async function updateStatistic(id, patch) {
  const { error } = await supabase.from("statistics").update(patch).eq("id", id);
  if (error) throw error;
}

export async function archiveStatistic(id) {
  const { error } = await supabase.from("statistics").update({ is_archived: true }).eq("id", id);
  if (error) throw error;
}

// Внести/обновить значение статистики за неделю (факт или квота). Уникальна
// тройка (statistic_id, period_id, is_quota) — апсертим вручную select→update/insert.
// description — заметка к факту (is_quota=false); для квоты игнорируется (всегда null).
export async function upsertStatisticValue(statisticId, periodId, value, isQuota = false, description = null) {
  if (!periodId) throw new Error("Не выбрана неделя ФП");
  // Кто внёс значение — для аудита (колонка entered_by ранее не заполнялась).
  const enteredBy = (await supabase.auth.getUser()).data.user?.id ?? null;
  const note = isQuota ? null : (description || null);
  const found = await supabase
    .from("statistic_values").select("id")
    .eq("statistic_id", statisticId).eq("period_id", periodId).eq("is_quota", isQuota)
    .maybeSingle();
  if (found.error) throw found.error;
  if (found.data) {
    const { error } = await supabase
      .from("statistic_values").update({ value, entered_by: enteredBy, description: note }).eq("id", found.data.id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from("statistic_values")
    .insert({ statistic_id: statisticId, period_id: periodId, value, is_quota: isQuota, entered_by: enteredBy, description: note });
  if (error) throw error;
}

// ---------------------------------------------------------------- CRM банкетов
// Воронка заявок, база клиентов, залы (миграция 20260620200000_crm_banquets).
// Брони залов — производная от заявок (зал + дата + этап), отдельной таблицы нет.

export async function fetchCrmHalls() {
  const { data, error } = await supabase
    .from("crm_halls")
    .select("id, name, location_id, capacity, sort")
    .eq("is_archived", false).order("sort");
  if (error) throw error;
  return data;
}

export async function fetchCrmLeads() {
  const { data, error } = await supabase
    .from("crm_leads")
    .select(`id, name, phone, event_type, event_date, guests, budget, stage, stage_id, source, note,
      due_date, responsible_id, sort,
      hall_id, location_id, client_id, hall:crm_halls(name),
      responsible:profiles(full_name, avatar_url)`)
    .eq("is_archived", false)
    .order("sort").order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createCrmLead(row) {
  const { data, error } = await supabase.from("crm_leads").insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function updateCrmLead(id, patch) {
  const { error } = await supabase.from("crm_leads").update(patch).eq("id", id);
  if (error) throw error;
}

export async function setCrmLeadStage(id, stage) {
  const { error } = await supabase.from("crm_leads").update({ stage }).eq("id", id);
  if (error) throw error;
}

// Перемещение карточки в колонку Kanban (stage_id) + позиция в колонке
export async function moveCrmLead(id, stageId, sort = 0) {
  const { error } = await supabase.from("crm_leads").update({ stage_id: stageId, sort }).eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------- Колонки воронки (Kanban)
export async function fetchCrmStages() {
  const { data, error } = await supabase
    .from("crm_stages")
    .select("id, code, name, color, sort, is_won, is_lost")
    .eq("is_archived", false).order("sort");
  if (error) throw error;
  return data;
}

export async function createCrmStage({ name, color, sort = 0 }) {
  const { data, error } = await supabase
    .from("crm_stages").insert({ name, color: color || null, sort }).select().single();
  if (error) throw error;
  return data;
}

export async function updateCrmStage(id, patch) {
  const { error } = await supabase.from("crm_stages").update(patch).eq("id", id);
  if (error) throw error;
}

export async function archiveCrmStage(id) {
  const { error } = await supabase.from("crm_stages").update({ is_archived: true }).eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------- Чек-лист карточки лида
export async function fetchCrmChecklist(leadIds) {
  if (!leadIds.length) return {};
  const { data, error } = await supabase
    .from("crm_lead_checklist")
    .select("id, lead_id, text, done, sort")
    .in("lead_id", leadIds).order("sort").order("created_at");
  if (error) throw error;
  const m = {};
  for (const r of data) (m[r.lead_id] ??= []).push(r);
  return m;
}

export async function addCrmChecklistItem(leadId, text) {
  const { data, error } = await supabase
    .from("crm_lead_checklist").insert({ lead_id: leadId, text }).select().single();
  if (error) throw error;
  return data;
}

export async function setCrmChecklistDone(id, done) {
  const { error } = await supabase.from("crm_lead_checklist").update({ done }).eq("id", id);
  if (error) throw error;
}

export async function deleteCrmChecklistItem(id) {
  const { error } = await supabase.from("crm_lead_checklist").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchCrmClients() {
  const { data, error } = await supabase
    .from("crm_clients")
    .select("id, name, phone, tag, location_id, note")
    .eq("is_archived", false).order("name");
  if (error) throw error;
  return data;
}

export async function createCrmClient(row) {
  const { data, error } = await supabase.from("crm_clients").insert(row).select().single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------- Задачи и боевое планирование
// Личный кабинет (миграция 20260620210000_dashboard_tasks_bp). Задача — поручение
// от пользователя исполнителю; боевое планирование — личный список действий.

export async function fetchTasks() {
  const { data, error } = await supabase
    .from("tasks")
    .select(`id, title, description, due_date, status, priority, from_id, to_id, position_id,
      from:profiles!tasks_from_id_fkey(full_name),
      assignee:profiles!tasks_to_id_fkey(full_name),
      position:org_positions(code, name)`)
    .eq("is_archived", false)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createTask({ title, description, toId, positionId, dueDate, priority }) {
  const { data, error } = await supabase
    .from("tasks")
    .insert({ title, description: description || null, to_id: toId || null, position_id: positionId || null, due_date: dueDate || null, priority: priority || "mid" })
    .select().single();
  if (error) throw error;
  return data;
}

export async function setTaskStatus(id, status) {
  const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
  if (error) throw error;
}

// Тред комментариев задачи (gap-map Задачи §6; образец — request_comments).
export async function fetchTaskComments(taskId) {
  const { data, error } = await supabase
    .from("task_comments")
    .select(`id, body, created_at, author_id,
      author:profiles!task_comments_author_id_fkey(full_name, avatar_url)`)
    .eq("task_id", taskId)
    .order("created_at");
  if (error) throw error;
  return data;
}

export async function addTaskComment(taskId, body) {
  const authorId = (await supabase.auth.getUser()).data.user?.id ?? null;
  const { data, error } = await supabase
    .from("task_comments")
    .insert({ task_id: taskId, author_id: authorId, body })
    .select(`id, body, created_at, author_id,
      author:profiles!task_comments_author_id_fkey(full_name, avatar_url)`)
    .single();
  if (error) throw error;
  return data;
}

export async function fetchBattlePlan() {
  const { data, error } = await supabase
    .from("battle_plan_items")
    .select(`id, text, target, done, sort, created_at, statistic_id, position_id, is_stats_visible,
      statistic:statistics(id, name, unit),
      position:org_positions(code, name)`)
    .eq("is_archived", false)
    .order("sort").order("created_at");
  if (error) throw error;
  return data;
}

export async function createBattleItem({ text, target, statisticId, positionId, isStatsVisible }) {
  const { data, error } = await supabase
    .from("battle_plan_items")
    .insert({
      text, target: target || "Личный план",
      statistic_id: statisticId || null, position_id: positionId || null,
      is_stats_visible: !!isStatsVisible,
    })
    .select().single();
  if (error) throw error;
  return data;
}

export async function setBattleDone(id, done) {
  const { error } = await supabase.from("battle_plan_items").update({ done }).eq("id", id);
  if (error) throw error;
}

// Мои заявки (ЗРС) для личного кабинета — read-only; создание в модуле «Заявки».
export async function fetchMyRequests(userId) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from("payment_requests")
    .select("id, purpose, planned_amount, approved_amount, status, created_at")
    .eq("requester_id", userId)
    .order("created_at", { ascending: false }).limit(10);
  if (error) throw error;
  return data;
}

// ============================================================================
//  ManaJet — зеркало mj_* (read-only). Наполняет Edge Function `manajet-sync`
//  (см. supabase/functions/manajet-sync). Читают только финадмины (RLS).
//  Документация интеграции — docs/manajet-анализ-и-интеграция.md.
// ============================================================================

// Запустить синхронизацию из ManaJet. entities — массив сущностей или null (все).
// Вызывает Edge Function под JWT текущего пользователя (проверка роли — в функции).
export async function triggerMjSync(entities = null, cursor = null) {
  const body = {};
  if (entities) body.entities = entities;
  if (cursor) body.cursor = cursor;
  const { data, error } = await supabase.functions.invoke("manajet-sync", { body });
  if (error) throw error;
  return data; // { ok, entities:{name:count}, error, done, cursor }
}

// Импорт справочников ManaJet (фонды, виды дохода, статьи, статистики) прямо в
// операционные таблицы по outer_id. Edge Function manajet-import-refs (финадмин).
export async function triggerMjImportRefs() {
  const { data, error } = await supabase.functions.invoke("manajet-import-refs", { body: {} });
  if (error) throw error;
  return data; // { ok, entities:{funds,income_types,expense_types,statistics}, error }
}

// Лёгкий журнал последних синхронизаций (для шапки встроенной ManaJet-панели).
export async function fetchMjSyncLog(limit = 5) {
  const { data, error } = await supabase
    .from("mj_sync_log").select("*").order("id", { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
}

// Сводка зеркала: число записей по сущностям + последняя синхронизация.
export async function fetchMjOverview() {
  const tables = [
    "mj_funds", "mj_periods", "mj_purchase_orders", "mj_bills", "mj_invoices",
    "mj_incomes", "mj_stats", "mj_stat_values", "mj_positions", "mj_companies",
  ];
  const counts = {};
  await Promise.all(tables.map(async (t) => {
    const { count } = await supabase.from(t).select("*", { count: "exact", head: true });
    counts[t] = count ?? 0;
  }));
  const { data: log } = await supabase
    .from("mj_sync_log").select("*").order("id", { ascending: false }).limit(5);
  return { counts, log: log || [] };
}

// Заявки (ЗРС) ManaJet. status — число (-1/0/2/3) или null.
export async function fetchMjPurchaseOrders({ status = null, q = "", limit = 200 } = {}) {
  let qb = supabase.from("mj_purchase_orders")
    .select("mj_id, name, status, fund_name, expense_name, position_name, planned_value, confirmed_value, payed_amount, csw_data, csw_situation, csw_solution")
    .order("mj_id", { ascending: false }).limit(limit);
  if (status !== null) qb = qb.eq("status", status);
  if (q) qb = qb.or(`name.ilike.%${q}%,fund_name.ilike.%${q}%,expense_name.ilike.%${q}%`);
  const { data, error } = await qb;
  if (error) throw error;
  return data;
}

// Счета поставщиков ManaJet. unpaidOnly — только с остатком.
export async function fetchMjBills({ q = "", unpaidOnly = false, limit = 200 } = {}) {
  let qb = supabase.from("mj_bills")
    .select("mj_id, seria, number, doc_date, company_name, expense_name, total_amount, payed_amount, remaining_amount, marked_payed, planned_date")
    .order("doc_date", { ascending: false }).limit(limit);
  if (unpaidOnly) qb = qb.gt("remaining_amount", 0);
  if (q) qb = qb.or(`company_name.ilike.%${q}%,number.ilike.%${q}%,expense_name.ilike.%${q}%`);
  const { data, error } = await qb;
  if (error) throw error;
  return data;
}

// Счета клиентам (Invoice) ManaJet.
export async function fetchMjInvoices({ q = "", unpaidOnly = false, limit = 200 } = {}) {
  let qb = supabase.from("mj_invoices")
    .select("mj_id, seria, number, doc_date, company_name, total_amount, payed_amount, remaining_amount")
    .order("doc_date", { ascending: false }).limit(limit);
  if (unpaidOnly) qb = qb.gt("remaining_amount", 0);
  if (q) qb = qb.or(`company_name.ilike.%${q}%,number.ilike.%${q}%`);
  const { data, error } = await qb;
  if (error) throw error;
  return data;
}

// Фонды ManaJet (по умолчанию только активные).
export async function fetchMjFunds({ withArchived = false } = {}) {
  let qb = supabase.from("mj_funds").select("mj_id, number, name, in_archive").order("number");
  if (!withArchived) qb = qb.eq("in_archive", false);
  const { data, error } = await qb;
  if (error) throw error;
  return data;
}

// Статистики ManaJet + их значения за последние N периодов (для спарклайнов/состояний).
export async function fetchMjStats() {
  const { data, error } = await supabase.from("mj_stats")
    .select("mj_id, name, unit, stat_type, min_val, max_val, sign, period, position_name")
    .order("name");
  if (error) throw error;
  return data;
}

// Посты оргсхемы ManaJet (read-only зеркало) — сортировка по full_number.
export async function fetchMjPositions() {
  const { data, error } = await supabase.from("mj_positions")
    .select("mj_id, full_number, name, person_name, functional, in_archive")
    .order("full_number");
  if (error) throw error;
  return data;
}

// Сотрудники ManaJet (read-only зеркало mj_persons).
export async function fetchMjPersons() {
  const { data, error } = await supabase.from("mj_persons")
    .select("mj_id, name, first_name, last_name, is_disabled")
    .order("name");
  if (error) throw error;
  return data;
}

export async function fetchMjStatValues(statIds = [], limit = 600) {
  let qb = supabase.from("mj_stat_values")
    .select("stat_mj_id, period_begin, period_end, is_quota, amount")
    .order("period_begin", { ascending: false }).limit(limit);
  if (statIds.length) qb = qb.in("stat_mj_id", statIds);
  const { data, error } = await qb;
  if (error) throw error;
  return data;
}
