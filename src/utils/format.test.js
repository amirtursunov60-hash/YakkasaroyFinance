import { describe, it, expect } from "vitest";
import { fmt, avatarColor } from "./format";

// Денежные суммы: две цифры после запятой, разделитель тысяч (ru-RU).
describe("fmt", () => {
  // разделитель тысяч в ru-RU — неразрывный пробел, нормализуем для сравнения
  const norm = (s) => s.replace(/\s/g, " ");

  it("две цифры после запятой", () => {
    expect(fmt(0)).toBe("0,00");
    expect(fmt(5)).toBe("5,00");
    expect(fmt(2.5)).toBe("2,50");
  });

  it("разделяет тысячи", () => {
    expect(norm(fmt(1234.5))).toBe("1 234,50");
    expect(norm(fmt(1000000))).toBe("1 000 000,00");
  });

  it("отрицательные суммы", () => {
    expect(fmt(-50)).toBe("-50,00");
  });
});

// Цвет аватара детерминирован по имени (один человек — один цвет).
describe("avatarColor", () => {
  it("детерминирован для одного имени", () => {
    expect(avatarColor("Иван")).toBe(avatarColor("Иван"));
  });

  it("возвращает цвет из палитры", () => {
    expect(avatarColor("Анна")).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("не падает на пустом имени", () => {
    expect(avatarColor("")).toMatch(/^#[0-9a-f]{6}$/i);
    expect(avatarColor()).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
