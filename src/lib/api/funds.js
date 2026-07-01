import { supabase } from "../supabase";

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

export async function fetchFunds() {
  const { data, error } = await supabase
    .from("funds")
    .select("id, code, name, kind, is_restricted, is_private, no_transfer, stage, color, description, balance, folder_id, location_id, currency:currencies(code, is_base)")
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
