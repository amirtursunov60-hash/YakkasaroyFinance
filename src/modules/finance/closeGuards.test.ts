import { describe, it, expect } from "vitest";
import { weekCloseBlockReason } from "./closeGuards";

const ok = {
  prevPeriod: { status: "closed" },
  weekReqs: [{ status: "approved" }, { status: "rejected" }],
  remainder: 0,
  funds: [{ code: "FD1", name: "Фонд", balance: 100 }],
};

describe("weekCloseBlockReason", () => {
  it("разрешает закрытие, когда все условия выполнены", () => {
    expect(weekCloseBlockReason(ok)).toBeNull();
  });

  it("блокирует, если предыдущая неделя открыта", () => {
    const r = weekCloseBlockReason({ ...ok, prevPeriod: { status: "open" } });
    expect(r).toMatch(/предыдущую неделю/i);
  });

  it("не блокирует по пред. неделе, если её нет (первая неделя)", () => {
    expect(weekCloseBlockReason({ ...ok, prevPeriod: null })).toBeNull();
  });

  it("блокирует, если есть заявки на рассмотрении", () => {
    const r = weekCloseBlockReason({ ...ok, weekReqs: [{ status: "submitted" }, { status: "approved" }] });
    expect(r).toMatch(/на рассмотрении \(1\)/i);
  });

  it("статус planning тоже считается «на рассмотрении»", () => {
    const r = weekCloseBlockReason({ ...ok, weekReqs: [{ status: "planning" }] });
    expect(r).toMatch(/на рассмотрении/i);
  });

  it("блокирует при нераспределённом остатке (> 0)", () => {
    expect(weekCloseBlockReason({ ...ok, remainder: 500 })).toMatch(/не полностью/i);
  });

  it("блокирует при перерасходе (остаток < 0)", () => {
    expect(weekCloseBlockReason({ ...ok, remainder: -500 })).toMatch(/перерасход/i);
  });

  it("игнорирует копеечный хвост округления остатка", () => {
    expect(weekCloseBlockReason({ ...ok, remainder: 0.004 })).toBeNull();
    expect(weekCloseBlockReason({ ...ok, remainder: -0.004 })).toBeNull();
  });

  it("блокирует, если фонд в минусе", () => {
    const r = weekCloseBlockReason({ ...ok, funds: [{ code: "FD2", name: "Резерв", balance: -10 }] });
    expect(r).toMatch(/в минусе/i);
  });

  it("приоритет: пред. неделя важнее остальных причин", () => {
    const r = weekCloseBlockReason({
      prevPeriod: { status: "open" },
      weekReqs: [{ status: "submitted" }],
      remainder: 999,
      funds: [{ code: "FD1", name: "Ф", balance: -50 }],
    });
    expect(r).toMatch(/предыдущую неделю/i);
  });
});
