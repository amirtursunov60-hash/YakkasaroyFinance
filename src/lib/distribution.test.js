import { describe, it, expect } from "vitest";
import { cascadeTypeStageBase, calcTypeRulesAmount, STAGE_KEYS } from "./distribution";

// Каскад «матрёшка»: каждый этап берёт % от остатка вида после предыдущих этапов.
describe("cascadeTypeStageBase", () => {
  it("пример Флай Гарден: 50% → 80% → 100% от остатков", () => {
    const income = { fly: 10000 };
    const rules = {
      fundA: [{ stage: "revenue", income_type: { id: "fly" }, percent: 50 }],
      fundB: [{ stage: "margin", income_type: { id: "fly" }, percent: 80 }],
      fundC: [{ stage: "adjusted", income_type: { id: "fly" }, percent: 100 }],
    };
    const base = cascadeTypeStageBase(income, rules);
    expect(base.revenue.fly).toBe(10000); // на входе выручки — весь доход
    expect(base.margin.fly).toBe(5000); // остаток после выручки (−50%)
    expect(base.adjusted.fly).toBe(1000); // остаток после маржи (−80% от 5000)
    // суммы, которые реально удержит калькулятор на каждом этапе
    expect(calcTypeRulesAmount(rules.fundA, base.revenue)).toBe(5000);
    expect(calcTypeRulesAmount(rules.fundB, base.margin)).toBe(4000);
    expect(calcTypeRulesAmount(rules.fundC, base.adjusted)).toBe(1000);
  });

  it("виды дохода каскадируются независимо", () => {
    const income = { a: 1000, b: 2000 };
    const rules = {
      f1: [{ stage: "revenue", income_type: { id: "a" }, percent: 10 }],
      f2: [{ stage: "revenue", income_type: { id: "b" }, percent: 25 }],
    };
    const base = cascadeTypeStageBase(income, rules);
    expect(base.margin.a).toBe(900); // 1000 − 10%
    expect(base.margin.b).toBe(1500); // 2000 − 25%
  });

  it("остаток вида не уходит в минус", () => {
    const income = { a: 100 };
    const rules = { f1: [{ stage: "revenue", income_type: { id: "a" }, percent: 150 }] };
    const base = cascadeTypeStageBase(income, rules);
    expect(base.margin.a).toBe(0);
  });

  it("без правил доход вида одинаков на всех этапах", () => {
    const base = cascadeTypeStageBase({ a: 500 }, {});
    for (const stage of STAGE_KEYS) expect(base[stage].a).toBe(500);
  });

  it("проценты строкой из БД корректно приводятся", () => {
    const base = cascadeTypeStageBase(
      { a: 1000 },
      { f1: [{ stage: "revenue", income_type: { id: "a" }, percent: "30" }] },
    );
    expect(base.margin.a).toBe(700);
  });
});

describe("calcTypeRulesAmount", () => {
  it("суммирует процент по нескольким видам", () => {
    const fact = { a: 1000, b: 500 };
    const rules = [
      { stage: "revenue", income_type: { id: "a" }, percent: 10 },
      { stage: "revenue", income_type: { id: "b" }, percent: 20 },
    ];
    expect(calcTypeRulesAmount(rules, fact)).toBe(200); // 100 + 100
  });

  it("поддерживает фиксированную сумму", () => {
    const rules = [{ stage: "revenue", income_type: { id: "a" }, fixed_amount: 750 }];
    expect(calcTypeRulesAmount(rules, { a: 1000 })).toBe(750);
  });

  it("округляет до копеек", () => {
    const rules = [{ stage: "revenue", income_type: { id: "a" }, percent: 33.333 }];
    expect(calcTypeRulesAmount(rules, { a: 100 })).toBe(33.33);
  });

  it("нет факта по виду — ноль", () => {
    const rules = [{ stage: "revenue", income_type: { id: "x" }, percent: 50 }];
    expect(calcTypeRulesAmount(rules, {})).toBe(0);
  });
});
