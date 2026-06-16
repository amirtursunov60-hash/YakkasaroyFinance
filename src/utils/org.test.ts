import { describe, it, expect } from "vitest";
import { orgCounts, nextHatStatus, type OrgDivision } from "./org";

const div = (id: string, positions: OrgDivision["positions"]): OrgDivision => ({ id, positions });
const pos = (id: string, holders: { hatStatus: "none" | "learning" | "done" }[] = []) => ({
  id,
  holders: holders.map((h, i) => ({ id: `${id}-h${i}`, hatStatus: h.hatStatus })),
});

describe("orgCounts", () => {
  it("пустая схема — нули, без деления на ноль", () => {
    expect(orgCounts([])).toEqual({ total: 0, filled: 0, vacant: 0, hatPct: 0 });
  });

  it("считает посты, занятость и вакансии по всем отделениям", () => {
    const data = [
      div("d1", [pos("p1", [{ hatStatus: "done" }]), pos("p2")]),
      div("d2", [pos("p3", [{ hatStatus: "learning" }])]),
    ];
    const c = orgCounts(data);
    expect(c.total).toBe(3);
    expect(c.filled).toBe(2);
    expect(c.vacant).toBe(1);
  });

  it("hatPct — доля постов с изученной шляпой от общего числа", () => {
    const data = [div("d1", [
      pos("p1", [{ hatStatus: "done" }]),
      pos("p2", [{ hatStatus: "learning" }]),
      pos("p3"),
      pos("p4", [{ hatStatus: "done" }]),
    ])];
    expect(orgCounts(data).hatPct).toBe(50); // 2 из 4
  });

  it("пост засчитан как «изучена», если хотя бы один держатель done", () => {
    const data = [div("d1", [pos("p1", [{ hatStatus: "learning" }, { hatStatus: "done" }])])];
    expect(orgCounts(data).hatPct).toBe(100);
  });
});

describe("nextHatStatus", () => {
  it("крутит статус по кругу", () => {
    expect(nextHatStatus("none")).toBe("learning");
    expect(nextHatStatus("learning")).toBe("done");
    expect(nextHatStatus("done")).toBe("none");
  });
});
