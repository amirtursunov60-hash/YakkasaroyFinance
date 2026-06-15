import { describe, it, expect } from "vitest";
import { fundKeyFromSource, fundKey } from "./funds.js";

// Нормализация кодов фондов «ФД4» → «FD4» — основа привязки доходов к фондам.
describe("fundKeyFromSource", () => {
  it("извлекает код из названия с описанием", () => {
    expect(fundKeyFromSource("ФД4 — Налог Яккасарой")).toBe("FD4");
  });

  it("сохраняет подкод через дробь", () => {
    expect(fundKeyFromSource("ФД9/1")).toBe("FD9/1");
  });

  it("терпит пробелы между Ф и Д", () => {
    expect(fundKeyFromSource("Ф Д 4")).toBe("FD4");
    expect(fundKeyFromSource("ФД 4 — Резервы")).toBe("FD4");
  });

  it("возвращает исходную строку, если цифры фонда нет", () => {
    expect(fundKeyFromSource("Резервы")).toBe("Резервы");
  });

  it("берёт первый номер из строки", () => {
    expect(fundKeyFromSource("ФД1")).toBe("FD1");
    expect(fundKeyFromSource("ФД12")).toBe("FD12");
  });
});

describe("fundKey", () => {
  it("убирает все пробелы из кода", () => {
    expect(fundKey("FD9/1")).toBe("FD9/1");
    expect(fundKey("FD 9 / 1")).toBe("FD9/1");
    expect(fundKey("FD4")).toBe("FD4");
  });
});
