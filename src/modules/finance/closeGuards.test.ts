import { describe, it, expect } from "vitest";
import { weekCloseBlockReasons } from "./closeGuards";

const ok = {
  prevPeriod: { status: "closed" },
  weekReqs: [{ status: "approved" }, { status: "rejected" }],
  remainder: 0,
  funds: [{ code: "FD1", name: "Фонд", balance: 100 }],
};

describe("weekCloseBlockReasons", () => {
  it("пустой список, когда все условия выполнены", () => {
    expect(weekCloseBlockReasons(ok)).toEqual([]);
  });

  it("блокирует, если предыдущая неделя открыта", () => {
    const r = weekCloseBlockReasons({ ...ok, prevPeriod: { status: "open" } });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatch(/предыдущая неделя/i);
  });

  it("не блокирует по пред. неделе, если её нет (первая неделя)", () => {
    expect(weekCloseBlockReasons({ ...ok, prevPeriod: null })).toEqual([]);
  });

  it("блокирует, если есть заявки на рассмотрении", () => {
    const r = weekCloseBlockReasons({ ...ok, weekReqs: [{ status: "submitted" }, { status: "approved" }] });
    expect(r[0]).toMatch(/на рассмотрении \(1\)/i);
  });

  it("статус planning тоже считается «на рассмотрении»", () => {
    expect(weekCloseBlockReasons({ ...ok, weekReqs: [{ status: "planning" }] })[0]).toMatch(/на рассмотрении/i);
  });

  it("блокирует при нераспределённом остатке (> 0)", () => {
    expect(weekCloseBlockReasons({ ...ok, remainder: 500 })[0]).toMatch(/не полностью/i);
  });

  it("блокирует при перерасходе (остаток < 0)", () => {
    expect(weekCloseBlockReasons({ ...ok, remainder: -500 })[0]).toMatch(/перерасход/i);
  });

  it("игнорирует копеечный хвост округления остатка", () => {
    expect(weekCloseBlockReasons({ ...ok, remainder: 0.004 })).toEqual([]);
    expect(weekCloseBlockReasons({ ...ok, remainder: -0.004 })).toEqual([]);
  });

  it("блокирует, если фонд в минусе", () => {
    expect(weekCloseBlockReasons({ ...ok, funds: [{ code: "FD2", name: "Резерв", balance: -10 }] })[0]).toMatch(/в минусе/i);
  });

  it("возвращает ВСЕ нарушенные правила сразу", () => {
    const r = weekCloseBlockReasons({
      prevPeriod: { status: "open" },
      weekReqs: [{ status: "submitted" }],
      remainder: 999,
      funds: [{ code: "FD1", name: "Ф", balance: -50 }],
    });
    expect(r).toHaveLength(4);
    expect(r[0]).toMatch(/предыдущая неделя/i);
    expect(r[1]).toMatch(/на рассмотрении/i);
    expect(r[2]).toMatch(/не полностью/i);
    expect(r[3]).toMatch(/в минусе/i);
  });

  it("порядок сохраняется и при части нарушений", () => {
    const r = weekCloseBlockReasons({ ...ok, weekReqs: [{ status: "submitted" }], remainder: 100 });
    expect(r).toHaveLength(2);
    expect(r[0]).toMatch(/на рассмотрении/i);
    expect(r[1]).toMatch(/не полностью/i);
  });

  it("без объекта period подтверждения не проверяются (обратная совместимость)", () => {
    expect(weekCloseBlockReasons(ok)).toEqual([]);
  });

  it("блокирует без исполнительного подтверждения и без BAF", () => {
    const r = weekCloseBlockReasons({ ...ok, period: { is_executive_confirmed: false, is_baf_confirmed: false } });
    expect(r).toHaveLength(2);
    expect(r[0]).toMatch(/исполнительного подтверждения/i);
    expect(r[1]).toMatch(/финкомитета \(BAF\)/i);
  });

  it("оба подтверждения проставлены — препятствий нет", () => {
    expect(weekCloseBlockReasons({ ...ok, period: { is_executive_confirmed: true, is_baf_confirmed: true } })).toEqual([]);
  });
});
