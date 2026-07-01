import { describe, it, expect } from "vitest";
import { invoiceDebt, isInvoiceOverdue, overdueDays } from "./receivables";

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

  it("мероприятие прошло, долг остался → просрочен", () => {
    expect(isInvoiceOverdue({ status: "issued", event_on: "2026-06-20", amount: 10000 }, 4000, today)).toBe(true);
    expect(isInvoiceOverdue({ status: "planned", event_on: "2026-06-30", amount: 5000 }, 0, today)).toBe(true);
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
