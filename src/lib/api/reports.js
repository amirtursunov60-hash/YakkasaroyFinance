import { supabase } from "../supabase";

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
