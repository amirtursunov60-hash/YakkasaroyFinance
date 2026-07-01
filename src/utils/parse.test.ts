import { describe, it, expect } from "vitest";
import { parseNum } from "./parse";

describe("parseNum — парсинг пользовательского ввода чисел", () => {
  it("парсит целые и дробные с точкой", () => {
    expect(parseNum("12")).toBe(12);
    expect(parseNum("12.5")).toBe(12.5);
  });

  it("понимает запятую как десятичный разделитель", () => {
    expect(parseNum("12,5")).toBe(12.5);
    expect(parseNum("0,07")).toBe(0.07);
  });

  it("пусто / null / undefined / мусор → 0", () => {
    expect(parseNum("")).toBe(0);
    expect(parseNum(null)).toBe(0);
    expect(parseNum(undefined)).toBe(0);
    expect(parseNum("abc")).toBe(0);
  });

  it("число на входе проходит как есть", () => {
    expect(parseNum(7)).toBe(7);
    expect(parseNum(7.25)).toBe(7.25);
  });

  it("отрицательные значения сохраняют знак", () => {
    expect(parseNum("-3,5")).toBe(-3.5);
  });

  it("хвост после числа отбрасывается (поведение parseFloat)", () => {
    expect(parseNum("100 сомони")).toBe(100);
  });
});
