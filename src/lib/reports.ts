// Чистая агрегация управленческих отчётов (ДДС / P&L / по точкам / сводка
// собственника). Логика вынесена из modules/finance/Reports.jsx, чтобы её
// переиспользовал и дашборд собственника, и покрыть unit-тестами.
//
// Конвенция (ТЗ v2 §4.1.12): суммы в базовой валюте (TJS). Расход — оплаты
// заявок/счетов/ЗП/вне ФП: в Реестре это отрицательная запись fund_amount,
// поэтому expenseAmount возвращает положительную величину оттока.

export interface IncomeRow {
  period_id: string;
  location_id: string | null;
  amount_base: number | string;
  is_return?: boolean | null;
}

export interface ExpenseRow {
  period_id: string;
  op_type: string;
  fund_amount?: number | string | null;
  cash_amount?: number | string | null;
  request?: { location_id: string | null } | null;
  bill?: { location_id: string | null } | null;
}

export interface PeriodLite { id: string; starts_on?: string }
export interface LocationLite { id: string; name: string }

// Сумма дохода с учётом возврата (возврат уменьшает выручку).
export const incomeAmount = (i: IncomeRow): number =>
  i.is_return ? -Number(i.amount_base) : Number(i.amount_base);

// Величина расхода (положительная): запись Реестра по оплате отрицательна.
export const expenseAmount = (r: ExpenseRow): number =>
  -(Number(r.fund_amount ?? r.cash_amount) || 0);

// Точка расхода — из заявки или счёта (общесетевые ЗП/вне ФП могут быть без точки).
export const expenseLocation = (r: ExpenseRow): string | null =>
  r.request?.location_id || r.bill?.location_id || null;

export const marginPct = (inc: number, exp: number): number =>
  inc > 0 ? ((inc - exp) / inc) * 100 : 0;

export const filterIncomesByLocation = (incomes: IncomeRow[], locationId: string | null): IncomeRow[] =>
  locationId ? incomes.filter((i) => i.location_id === locationId) : incomes;

export const filterExpensesByLocation = (expenses: ExpenseRow[], locationId: string | null): ExpenseRow[] =>
  locationId ? expenses.filter((e) => expenseLocation(e) === locationId) : expenses;

export interface WeekRow { period: PeriodLite; inc: number; exp: number; net: number }

// Поступления/выплаты/чистый поток по каждой неделе диапазона.
export function aggregateByWeek(periods: PeriodLite[], incomes: IncomeRow[], expenses: ExpenseRow[]): WeekRow[] {
  return periods.map((p) => {
    const inc = incomes.filter((i) => i.period_id === p.id).reduce((a, i) => a + incomeAmount(i), 0);
    const exp = expenses.filter((e) => e.period_id === p.id).reduce((a, e) => a + expenseAmount(e), 0);
    return { period: p, inc, exp, net: inc - exp };
  });
}

export function sumTotals(weeks: WeekRow[]): { inc: number; exp: number } {
  return weeks.reduce((t, w) => ({ inc: t.inc + w.inc, exp: t.exp + w.exp }), { inc: 0, exp: 0 });
}

// Выплаты по типу операции: { request_payment, bill_payment, payroll_payment, off_plan }
export function expensesByType(expenses: ExpenseRow[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const e of expenses) m[e.op_type] = (m[e.op_type] || 0) + expenseAmount(e);
  return m;
}

export interface LocationRow { loc: LocationLite; inc: number; exp: number; profit: number; margin: number }

// Сравнение точек: выручка/расход/прибыль/маржа. Точки без операций отброшены,
// сортировка по прибыли (убыв.).
export function aggregateByLocation(locations: LocationLite[], incomes: IncomeRow[], expenses: ExpenseRow[]): LocationRow[] {
  return locations
    .map((l) => {
      const inc = incomes.filter((i) => i.location_id === l.id).reduce((a, i) => a + incomeAmount(i), 0);
      const exp = expenses.filter((e) => expenseLocation(e) === l.id).reduce((a, e) => a + expenseAmount(e), 0);
      return { loc: l, inc, exp, profit: inc - exp, margin: marginPct(inc, exp) };
    })
    .filter((x) => x.inc > 0 || x.exp > 0)
    .sort((a, b) => b.profit - a.profit);
}

export interface PeriodSummary { inc: number; exp: number; profit: number; fot: number; margin: number }

// Сводка по одной неделе (для дашборда собственника): доход, расход, прибыль,
// ФОТ (зарплата) и маржа. incomes/expenses — уже отфильтрованные по точке при нужде.
export function summarizePeriod(periodId: string | null, incomes: IncomeRow[], expenses: ExpenseRow[]): PeriodSummary {
  if (!periodId) return { inc: 0, exp: 0, profit: 0, fot: 0, margin: 0 };
  const inc = incomes.filter((i) => i.period_id === periodId).reduce((a, i) => a + incomeAmount(i), 0);
  const pExp = expenses.filter((e) => e.period_id === periodId);
  const exp = pExp.reduce((a, e) => a + expenseAmount(e), 0);
  const fot = pExp.filter((e) => e.op_type === "payroll_payment").reduce((a, e) => a + expenseAmount(e), 0);
  return { inc, exp, profit: inc - exp, fot, margin: marginPct(inc, exp) };
}
