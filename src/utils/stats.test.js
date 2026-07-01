import { describe, it, expect } from "vitest";
import { calcState, weekLabels, quotaAchievement, effectivePoints } from "./stats";

// Состояния ХМС по тренду последних 4 недель (Власть/Изобилие/Норма/ЧП/Опасность).
// Несуществование — когда данных меньше 4 недель.
describe("calcState", () => {
  it("несуществование при недостатке данных", () => {
    expect(calcState([], false)).toBe("nonexistence");
    expect(calcState([1, 2, 3], false)).toBe("nonexistence");
    expect(calcState(null, false)).toBe("nonexistence");
  });

  it("власть — сильный рост и рекорд", () => {
    expect(calcState([100, 110, 120, 140], false)).toBe("power");
  });

  it("изобилие — рост без рекорда", () => {
    // последняя точка ниже исторического максимума (200) → не власть
    expect(calcState([200, 100, 105, 110, 115], false)).toBe("affluence");
  });

  it("норма — слабый положительный тренд", () => {
    expect(calcState([100, 101, 102, 103], false)).toBe("normal");
  });

  it("чрезвычайное положение — около нуля / лёгкий спад", () => {
    expect(calcState([100, 100, 100, 100], false)).toBe("emergency");
  });

  it("опасность — выраженный спад", () => {
    expect(calcState([140, 120, 110, 100], false)).toBe("danger");
  });

  it("invert: для обратных статистик спад трактуется как рост", () => {
    // расходы падают — для invert-статистики это власть
    expect(calcState([140, 120, 110, 100], true)).toBe("power");
  });
});

describe("quotaAchievement", () => {
  it("null, если нет факта, плана или план = 0", () => {
    expect(quotaAchievement(null, 100)).toBeNull();
    expect(quotaAchievement(100, null)).toBeNull();
    expect(quotaAchievement(100, 0)).toBeNull();
  });

  it("обычная статистика: план выполнен, когда факт ≥ плана", () => {
    expect(quotaAchievement(120, 100, false)).toEqual({ pct: 120, met: true });
    expect(quotaAchievement(90, 100, false)).toEqual({ pct: 90, met: false });
    expect(quotaAchievement(100, 100, false)).toEqual({ pct: 100, met: true });
  });

  it("invert-статистика: план выполнен, когда факт ≤ плана", () => {
    // расходы/жалобы: меньше плана — хорошо
    expect(quotaAchievement(80, 100, true)).toEqual({ pct: 80, met: true });
    expect(quotaAchievement(130, 100, true)).toEqual({ pct: 130, met: false });
  });
});

describe("weekLabels", () => {
  it("возвращает n меток в формате ДД.ММ", () => {
    const labels = weekLabels(4);
    expect(labels).toHaveLength(4);
    labels.forEach((l) => expect(l).toMatch(/^\d{2}\.\d{2}$/));
  });

  it("метки идут с шагом в неделю по возрастанию даты", () => {
    const labels = weekLabels(3);
    // последняя метка — самая поздняя (конец периода)
    expect(labels[labels.length - 1]).toBe("10.06");
  });
});

// Эффективные баллы для ЗП по результату: баллы × коэффициент состояния ХМС
describe("effectivePoints", () => {
  it("умножает баллы на коэффициент состояния", () => {
    expect(effectivePoints(100, "power")).toBeCloseTo(130);
    expect(effectivePoints(100, "danger")).toBeCloseTo(70);
    expect(effectivePoints(100, "normal")).toBe(100);
  });

  it("неизвестное состояние — коэффициент 1", () => {
    expect(effectivePoints(50, "")).toBe(50);
    expect(effectivePoints(50, "unknown")).toBe(50);
  });

  it("ноль баллов — ноль эффективных", () => {
    expect(effectivePoints(0, "power")).toBe(0);
  });
});
