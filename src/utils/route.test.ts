import { describe, it, expect } from "vitest";
import { parseHash, buildHash } from "./route";

const NAV = {
  finance: [{ key: "directive" }, { key: "register" }],
  crm: [{ key: "c_funnel" }],
};

describe("parseHash", () => {
  it("разбирает модуль и раздел", () => {
    expect(parseHash("#/finance/register", NAV)).toEqual({ module: "finance", section: "register" });
  });

  it("терпит хвостовой слэш", () => {
    expect(parseHash("#/finance/register/", NAV)).toEqual({ module: "finance", section: "register" });
  });

  it("модуль без раздела → section: null (дефолт решает вызывающий)", () => {
    expect(parseHash("#/finance", NAV)).toEqual({ module: "finance", section: null });
  });

  it("неизвестный раздел модуля → section: null", () => {
    expect(parseHash("#/finance/nope", NAV)).toEqual({ module: "finance", section: null });
  });

  it("неизвестный модуль → null", () => {
    expect(parseHash("#/warehouse/x", NAV)).toBeNull();
  });

  it("пустой или чужой hash → null", () => {
    expect(parseHash("", NAV)).toBeNull();
    expect(parseHash("#", NAV)).toBeNull();
    expect(parseHash("#section-anchor", NAV)).toBeNull();
  });
});

describe("buildHash", () => {
  it("собирает hash, который parseHash разбирает обратно", () => {
    const h = buildHash("crm", "c_funnel");
    expect(h).toBe("#/crm/c_funnel");
    expect(parseHash(h, NAV)).toEqual({ module: "crm", section: "c_funnel" });
  });
});
