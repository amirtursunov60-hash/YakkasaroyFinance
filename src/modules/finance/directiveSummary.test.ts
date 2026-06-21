import { describe, it, expect } from "vitest";
import {
  approvedRequestsTotal, approvedBillsTotal, payableTotals,
  type PayableRequest, type PayableBill,
} from "./directiveSummary";

const requests: PayableRequest[] = [
  { status: "approved", approved_amount: 800, planned_amount: 1000 }, // берём 800
  { status: "approved", approved_amount: null, planned_amount: 500 }, // берём 500
  { status: "submitted", planned_amount: 999 },                       // не одобрена — пропуск
  { status: "paid", approved_amount: 200 },                           // оплачена — пропуск
  { status: "rejected", planned_amount: 300 },                        // отклонена — пропуск
  { status: "approved", approved_amount: "150.50" },                  // строка — парсится
];

const bills: PayableBill[] = [
  { status: "approved", amount: 1200 },
  { status: "approved", amount: "300.25" },
  { status: "submitted", amount: 400 }, // не одобрен — пропуск
  { status: "paid", amount: 700 },      // оплачен — пропуск
];

describe("approvedRequestsTotal", () => {
  it("суммирует одобренные, одобренная сумма приоритетнее запрошенной", () => {
    expect(approvedRequestsTotal(requests)).toBeCloseTo(800 + 500 + 150.5, 2);
  });
  it("пустой список — 0", () => {
    expect(approvedRequestsTotal([])).toBe(0);
  });
});

describe("approvedBillsTotal", () => {
  it("суммирует только одобренные счета", () => {
    expect(approvedBillsTotal(bills)).toBeCloseTo(1200 + 300.25, 2);
  });
});

describe("payableTotals", () => {
  it("раскладывает на заявки/счета и общий итог", () => {
    const t = payableTotals(requests, bills);
    expect(t.requests).toBeCloseTo(1450.5, 2);
    expect(t.bills).toBeCloseTo(1500.25, 2);
    expect(t.total).toBeCloseTo(2950.75, 2);
  });
  it("пустые входы — нули", () => {
    expect(payableTotals([], [])).toEqual({ requests: 0, bills: 0, total: 0 });
  });
});
