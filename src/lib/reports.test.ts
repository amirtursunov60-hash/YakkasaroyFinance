import { describe, it, expect } from "vitest";
import {
  incomeAmount, expenseAmount, expenseLocation, marginPct,
  filterIncomesByLocation, filterExpensesByLocation,
  aggregateByWeek, sumTotals, expensesByType, aggregateByLocation, summarizePeriod,
  type IncomeRow, type ExpenseRow,
} from "./reports";

// Точки и недели
const L1 = "loc-1", L2 = "loc-2";
const P1 = "per-1", P2 = "per-2";

const incomes: IncomeRow[] = [
  { period_id: P1, location_id: L1, amount_base: 1000, is_return: false },
  { period_id: P1, location_id: L1, amount_base: 200, is_return: true },   // возврат → −200
  { period_id: P1, location_id: L2, amount_base: 500 },
  { period_id: P2, location_id: L1, amount_base: 800 },
];

// Реестр: оплаты — отрицательный fund_amount; expenseAmount → положительный отток
const expenses: ExpenseRow[] = [
  { period_id: P1, op_type: "request_payment", fund_amount: -300, request: { location_id: L1 }, bill: null },
  { period_id: P1, op_type: "bill_payment", fund_amount: -150, request: null, bill: { location_id: L2 } },
  { period_id: P1, op_type: "payroll_payment", fund_amount: -400, request: null, bill: null }, // общесетевой
  { period_id: P2, op_type: "off_plan", cash_amount: -100, request: null, bill: null },
];

describe("базовые суммы", () => {
  it("incomeAmount учитывает возврат", () => {
    expect(incomeAmount({ period_id: P1, location_id: L1, amount_base: 1000 })).toBe(1000);
    expect(incomeAmount({ period_id: P1, location_id: L1, amount_base: 200, is_return: true })).toBe(-200);
  });
  it("expenseAmount возвращает положительный отток из fund_amount/cash_amount", () => {
    expect(expenseAmount({ period_id: P1, op_type: "request_payment", fund_amount: -300 })).toBe(300);
    expect(expenseAmount({ period_id: P2, op_type: "off_plan", cash_amount: -100 })).toBe(100);
  });
  it("expenseLocation берёт точку из заявки, затем из счёта, иначе null", () => {
    expect(expenseLocation(expenses[0])).toBe(L1);
    expect(expenseLocation(expenses[1])).toBe(L2);
    expect(expenseLocation(expenses[2])).toBeNull();
  });
  it("marginPct безопасна при нулевой выручке", () => {
    expect(marginPct(0, 100)).toBe(0);
    expect(marginPct(1000, 250)).toBeCloseTo(75);
  });
});

describe("фильтры по точке", () => {
  it("null → без фильтра", () => {
    expect(filterIncomesByLocation(incomes, null)).toHaveLength(4);
    expect(filterExpensesByLocation(expenses, null)).toHaveLength(4);
  });
  it("по точке отбирает только её записи", () => {
    expect(filterIncomesByLocation(incomes, L2)).toHaveLength(1);
    expect(filterExpensesByLocation(expenses, L1)).toHaveLength(1);
  });
});

describe("агрегация по неделям", () => {
  const periods = [{ id: P1 }, { id: P2 }];
  const weeks = aggregateByWeek(periods, incomes, expenses);
  it("считает доход/расход/чистый поток по неделям", () => {
    // P1: доход 1000 − 200 + 500 = 1300; расход 300 + 150 + 400 = 850
    expect(weeks[0]).toMatchObject({ inc: 1300, exp: 850, net: 450 });
    // P2: доход 800; расход 100
    expect(weeks[1]).toMatchObject({ inc: 800, exp: 100, net: 700 });
  });
  it("sumTotals суммирует диапазон", () => {
    expect(sumTotals(weeks)).toEqual({ inc: 2100, exp: 950 });
  });
});

describe("выплаты по типу", () => {
  it("группирует по op_type", () => {
    expect(expensesByType(expenses)).toEqual({
      request_payment: 300, bill_payment: 150, payroll_payment: 400, off_plan: 100,
    });
  });
});

describe("по точкам", () => {
  const locations = [{ id: L1, name: "Душанбе" }, { id: L2, name: "Худжанд" }];
  const rows = aggregateByLocation(locations, incomes, expenses);
  it("считает прибыль и маржу, сортирует по прибыли", () => {
    // L1: доход 1000−200+800=1600, расход 300 → прибыль 1300
    // L2: доход 500, расход 150 → прибыль 350
    expect(rows[0].loc.id).toBe(L1);
    expect(rows[0]).toMatchObject({ inc: 1600, exp: 300, profit: 1300 });
    expect(rows[1]).toMatchObject({ inc: 500, exp: 150, profit: 350 });
    expect(rows[0].margin).toBeCloseTo((1300 / 1600) * 100);
  });
  it("общесетевой ФОТ без точки не попадает ни в одну точку", () => {
    const totalLocExp = rows.reduce((a, r) => a + r.exp, 0);
    expect(totalLocExp).toBe(450); // 300 + 150, без 400 ФОТ и без 100 вне ФП
  });
});

describe("сводка недели (дашборд собственника)", () => {
  it("доход/расход/прибыль/ФОТ/маржа за период", () => {
    const s = summarizePeriod(P1, incomes, expenses);
    expect(s).toMatchObject({ inc: 1300, exp: 850, profit: 450, fot: 400 });
    expect(s.margin).toBeCloseTo((450 / 1300) * 100);
  });
  it("без периода — нули", () => {
    expect(summarizePeriod(null, incomes, expenses)).toEqual({ inc: 0, exp: 0, profit: 0, fot: 0, margin: 0 });
  });
});
