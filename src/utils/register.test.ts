import { describe, it, expect } from "vitest";
import { OP_LABELS, opLabel, UNUSED_RULE_COMBOS } from "./register";

describe("OP_LABELS — метки операций Реестра", () => {
  it("покрывает все 15 типов операций", () => {
    expect(Object.keys(OP_LABELS)).toHaveLength(15);
  });

  it("opLabel возвращает метку, а для неизвестного — сам код", () => {
    expect(opLabel("income")).toBe("Доход");
    expect(opLabel("unknown_op")).toBe("unknown_op");
  });

  it("мёртвые комбинации ссылаются на существующие типы операций", () => {
    for (const combo of UNUSED_RULE_COMBOS) {
      const [op, component] = combo.split(":");
      expect(OP_LABELS[op], combo).toBeDefined();
      expect(["cash", "fund"]).toContain(component);
    }
  });
});
