import { describe, it, expect } from "vitest";
import { buildControlSum } from "./controlSum";

describe("buildControlSum — контрольная сумма ФП", () => {
  it("сходится: деньги = нераспределённые + фонды (обязательства внутри фондов)", () => {
    // Доход 1000 на счёт, 800 распределено в фонды, заявка на 300 одобрена (не оплачена)
    const v = buildControlSum({
      cashTotal: 1000,
      fundsTotal: 800,
      incomesUndistributed: 200,
      requestsUnpaid: 300,
      billsUnpaid: 0,
    });
    expect(v.fundsAvailable).toBe(500);       // 800 − 300
    expect(v.total).toBe(1000);               // 200 + 500 + 300 + 0
    expect(v.difference).toBe(0);
    expect(v.matches).toBe(true);
  });

  it("ловит расхождение: внеплановая трата ушла со счёта мимо фондов", () => {
    // Как выше, но со счёта внепланово потратили 150 (off_plan: cash −150, фонды не тронуты)
    const v = buildControlSum({
      cashTotal: 850,
      fundsTotal: 800,
      incomesUndistributed: 200,
      requestsUnpaid: 300,
      billsUnpaid: 0,
    });
    expect(v.total).toBe(1000);
    expect(v.difference).toBe(-150);
    expect(v.matches).toBe(false);
  });

  it("ловит ручной приход фонда без денег на счёте (fund_income)", () => {
    const v = buildControlSum({
      cashTotal: 1000,
      fundsTotal: 900,   // +100 ручным приходом фонда, на счета деньги не заводили
      incomesUndistributed: 200,
      requestsUnpaid: 0,
      billsUnpaid: 0,
    });
    expect(v.difference).toBe(-100);
    expect(v.matches).toBe(false);
  });

  it("доступно в фондах может быть отрицательным (обязательств больше денег)", () => {
    const v = buildControlSum({
      cashTotal: 500,
      fundsTotal: 300,
      incomesUndistributed: 200,
      requestsUnpaid: 250,
      billsUnpaid: 100,
    });
    expect(v.fundsAvailable).toBe(-50);
    expect(v.total).toBe(500);                // 200 + (−50) + 250 + 100
    expect(v.matches).toBe(true);
  });

  it("копейки: округление до 2 знаков, допуск 0.01", () => {
    const v = buildControlSum({
      cashTotal: 100.005,
      fundsTotal: 50.001,
      incomesUndistributed: 50.002,
      requestsUnpaid: 0,
      billsUnpaid: 0,
    });
    expect(v.matches).toBe(true);
  });

  it("пустая база — все нули, сходится", () => {
    const v = buildControlSum({ cashTotal: 0, fundsTotal: 0, incomesUndistributed: 0, requestsUnpaid: 0, billsUnpaid: 0 });
    expect(v.total).toBe(0);
    expect(v.matches).toBe(true);
  });
});
