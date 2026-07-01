import { describe, it, expect } from "vitest";
import { invoiceDebt, isInvoiceOverdue, overdueDays, invoiceMatchesFilter, invoiceFilterCounts } from "./receivables";

describe("invoiceDebt — долг по счёту", () => {
  it("выставлено минус получено", () => {
    expect(invoiceDebt(10000, 4000)).toBe(6000);
  });
  it("полная оплата и переплата → 0", () => {
    expect(invoiceDebt(10000, 10000)).toBe(0);
    expect(invoiceDebt(10000, 12000)).toBe(0);
  });
});

describe("isInvoiceOverdue — просрочка счёта клиента", () => {
  const today = "2026-07-01";

  it("выставлен, мероприятие прошло, долг остался → просрочен", () => {
    expect(isInvoiceOverdue({ status: "issued", event_on: "2026-06-20", amount: 10000 }, 4000, today)).toBe(true);
  });

  it("бронь (planned) с прошедшей датой — брошенная бронь, НЕ дебиторка", () => {
    expect(isInvoiceOverdue({ status: "planned", event_on: "2026-06-20", amount: 5000 }, 0, today)).toBe(false);
  });

  it("мероприятие в будущем или сегодня → не просрочен", () => {
    expect(isInvoiceOverdue({ status: "issued", event_on: "2026-07-10", amount: 10000 }, 0, today)).toBe(false);
    expect(isInvoiceOverdue({ status: "issued", event_on: "2026-07-01", amount: 10000 }, 0, today)).toBe(false);
  });

  it("долг закрыт → не просрочен", () => {
    expect(isInvoiceOverdue({ status: "issued", event_on: "2026-06-20", amount: 10000 }, 10000, today)).toBe(false);
  });

  it("оплаченные и отменённые счета не просрочены", () => {
    expect(isInvoiceOverdue({ status: "paid", event_on: "2026-06-20", amount: 10000 }, 10000, today)).toBe(false);
    expect(isInvoiceOverdue({ status: "cancelled", event_on: "2026-06-20", amount: 10000 }, 0, today)).toBe(false);
  });

  it("без даты мероприятия просрочки нет", () => {
    expect(isInvoiceOverdue({ status: "issued", event_on: null, amount: 10000 }, 0, today)).toBe(false);
  });

  it("amount строкой (как из БД) — работает", () => {
    expect(isInvoiceOverdue({ status: "issued", event_on: "2026-06-20", amount: "10000" }, 4000, today)).toBe(true);
  });
});

describe("overdueDays — дней просрочки", () => {
  it("считает календарные дни", () => {
    expect(overdueDays("2026-06-20", "2026-07-01")).toBe(11);
    expect(overdueDays("2026-06-30", "2026-07-01")).toBe(1);
  });
  it("не уходит в минус", () => {
    expect(overdueDays("2026-07-05", "2026-07-01")).toBe(0);
  });
});

describe("invoiceMatchesFilter и invoiceFilterCounts", () => {
  const today = "2026-07-01";
  const invs: import("./receivables").InvoiceForOverdue[] = [
    { status: "issued", event_on: "2026-06-20", amount: 10000 },  // просрочен (долг 6000)
    { status: "issued", event_on: "2026-07-10", amount: 5000 },   // в работе, не просрочен
    { status: "planned", event_on: "2026-06-01", amount: 3000 },  // брошенная бронь
    { status: "paid", event_on: "2026-06-15", amount: 8000 },     // оплачен
    { status: "cancelled", event_on: null, amount: 1000 },        // отменён
  ];
  const paidByIdx = [4000, 0, 0, 8000, 0];
  const paidOf = (inv: import("./receivables").InvoiceForOverdue) => paidByIdx[invs.indexOf(inv)];

  it("матчинг по производной категории и по статусу", () => {
    expect(invoiceMatchesFilter(invs[0], "overdue", 4000, today)).toBe(true);
    expect(invoiceMatchesFilter(invs[2], "overdue", 0, today)).toBe(false);
    expect(invoiceMatchesFilter(invs[2], "planned", 0, today)).toBe(true);
    expect(invoiceMatchesFilter(invs[4], "all", 0, today)).toBe(true);
  });

  it("счётчики одним проходом", () => {
    const c = invoiceFilterCounts(invs, paidOf, today);
    expect(c).toEqual({ all: 5, overdue: 1, planned: 1, issued: 2, paid: 1, cancelled: 1 });
  });
});
