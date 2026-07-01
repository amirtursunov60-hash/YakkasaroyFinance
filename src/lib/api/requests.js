import { supabase } from "../supabase";

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
