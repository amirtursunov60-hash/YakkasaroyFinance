import { describe, it, expect } from "vitest";
import {
  isOverdueBill, billMatchesFilter, billFilterCounts, BILL_FILTERS,
  type BillLike,
} from "./billFilters";

const TODAY = "2026-06-21";

// Набор счетов под разные ветки логики.
const bills: BillLike[] = [
  { status: "submitted", due_on: "2026-06-10" }, // просрочен (срок прошёл, в работе)
  { status: "approved",  due_on: "2026-06-01" }, // просрочен
  { status: "approved",  due_on: "2026-06-30" }, // в срок
  { status: "submitted", due_on: null },          // без срока — не просрочен
  { status: "paid",      due_on: "2026-06-01" }, // оплачен — не считается просроченным
  { status: "rejected",  due_on: "2026-06-01" }, // отклонён — не считается просроченным
  { status: "paid",      due_on: "2026-06-30" },
];

describe("isOverdueBill", () => {
  it("просрочен, если срок прошёл и счёт в работе", () => {
    expect(isOverdueBill({ status: "submitted", due_on: "2026-06-10" }, TODAY)).toBe(true);
    expect(isOverdueBill({ status: "approved", due_on: "2026-06-01" }, TODAY)).toBe(true);
  });
  it("не просрочен без срока, в срок, либо оплачен/отклонён", () => {
    expect(isOverdueBill({ status: "submitted", due_on: null }, TODAY)).toBe(false);
    expect(isOverdueBill({ status: "approved", due_on: "2026-06-30" }, TODAY)).toBe(false);
    expect(isOverdueBill({ status: "paid", due_on: "2026-06-01" }, TODAY)).toBe(false);
    expect(isOverdueBill({ status: "rejected", due_on: "2026-06-01" }, TODAY)).toBe(false);
  });
  it("срок ровно сегодня — ещё не просрочен (строгое <)", () => {
    expect(isOverdueBill({ status: "approved", due_on: TODAY }, TODAY)).toBe(false);
  });
});

describe("billMatchesFilter", () => {
  it("'all' пропускает любой счёт", () => {
    expect(bills.every((b) => billMatchesFilter(b, "all", TODAY))).toBe(true);
  });
  it("'overdue' = только просроченные", () => {
    expect(bills.filter((b) => billMatchesFilter(b, "overdue", TODAY))).toHaveLength(2);
  });
  it("статусный фильтр сверяется по полю status", () => {
    expect(bills.filter((b) => billMatchesFilter(b, "approved", TODAY))).toHaveLength(2);
    expect(bills.filter((b) => billMatchesFilter(b, "paid", TODAY))).toHaveLength(2);
    expect(bills.filter((b) => billMatchesFilter(b, "submitted", TODAY))).toHaveLength(2);
  });
});

describe("billFilterCounts", () => {
  it("считает по всем ключам, включая производный overdue", () => {
    const c = billFilterCounts(bills, TODAY);
    expect(c.all).toBe(7);
    expect(c.overdue).toBe(2);
    expect(c.approved).toBe(2);
    expect(c.paid).toBe(2);
    expect(c.submitted).toBe(2);
    expect(c.rejected).toBe(1);
  });
  it("сумма счётчиков фильтра совпадает с отфильтрованными списками", () => {
    const c = billFilterCounts(bills, TODAY);
    for (const { key } of BILL_FILTERS) {
      const n = bills.filter((b) => billMatchesFilter(b, key, TODAY)).length;
      expect(c[key]).toBe(n);
    }
  });
  it("пустой список — нули", () => {
    const c = billFilterCounts([], TODAY);
    expect(c.all).toBe(0);
    expect(c.overdue).toBe(0);
  });
});
