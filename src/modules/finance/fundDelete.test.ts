import { describe, it, expect } from "vitest";
import { fundDeletePlan } from "./fundDelete";

describe("fundDeletePlan", () => {
  it("пустой фонд (0/0/0) — удаляем без переноса", () => {
    expect(fundDeletePlan({ balance: 0, debt: 0, commitments: 0 }))
      .toEqual({ deletable: true, needsTransfer: false, blockers: [] });
  });

  it("есть остаток — удаляем, но нужен фонд-приёмник", () => {
    const r = fundDeletePlan({ balance: 1000, debt: 0, commitments: 0 });
    expect(r.deletable).toBe(true);
    expect(r.needsTransfer).toBe(true);
    expect(r.blockers).toEqual([]);
  });

  it("есть незакрытый займ — удалять нельзя", () => {
    const r = fundDeletePlan({ balance: 0, debt: 500, commitments: 0 });
    expect(r.deletable).toBe(false);
    expect(r.needsTransfer).toBe(false);
    expect(r.blockers[0]).toMatch(/займы/i);
  });

  it("отрицательное сальдо займа (фонду должны) — тоже блокирует", () => {
    const r = fundDeletePlan({ balance: 0, debt: -500, commitments: 0 });
    expect(r.deletable).toBe(false);
    expect(r.blockers[0]).toMatch(/займы/i);
  });

  it("есть одобренные обязательства — удалять нельзя", () => {
    const r = fundDeletePlan({ balance: 0, debt: 0, commitments: 300 });
    expect(r.deletable).toBe(false);
    expect(r.blockers[0]).toMatch(/заявки\/счета/i);
  });

  it("остаток + долг — оба блокера, удалять нельзя", () => {
    const r = fundDeletePlan({ balance: 1000, debt: 500, commitments: 200 });
    expect(r.deletable).toBe(false);
    expect(r.needsTransfer).toBe(false);
    expect(r.blockers).toHaveLength(2);
  });

  it("копеечные хвосты округления не мешают", () => {
    expect(fundDeletePlan({ balance: 0.004, debt: 0.004, commitments: 0.004 }))
      .toEqual({ deletable: true, needsTransfer: false, blockers: [] });
  });
});
