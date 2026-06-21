import { describe, it, expect } from "vitest";
import { requestPrefill, type CopyableRequest, type PositionLike } from "./requestCopy";

const positions: PositionLike[] = [{ id: "pos-1" }, { id: "pos-2" }];

const full: CopyableRequest = {
  expense_type_id: "et-9",
  fund: { id: "fund-3" },
  purpose: "Заправка транспорта",
  planned_amount: 4000,
  csw_data: "счёт на 4000",
  csw_situation: "нужно заправить",
  csw_solution: "оплатить поставщику",
  tags: ["срочно", "транспорт"],
};

describe("requestPrefill", () => {
  it("копирует поля заявки в состояние формы ЗРС", () => {
    expect(requestPrefill(full, positions)).toEqual({
      positionId: "pos-1",            // свой первый пост, не оригинал
      typeId: "et-9",
      purpose: "Заправка транспорта",
      amount: "4000",                 // число → строка
      fundId: "fund-3",
      cswData: "счёт на 4000",
      cswSituation: "нужно заправить",
      cswSolution: "оплатить поставщику",
      tags: "срочно, транспорт",      // массив → строка через запятую
    });
  });

  it("берёт typeId из expense_type.id, если нет expense_type_id", () => {
    const r: CopyableRequest = { expense_type: { id: "et-5" } };
    expect(requestPrefill(r, positions).typeId).toBe("et-5");
  });

  it("пустые/отсутствующие поля → пустые строки, нет позиций → пустой пост", () => {
    const p = requestPrefill({}, []);
    expect(p).toEqual({
      positionId: "", typeId: "", purpose: "", amount: "", fundId: "",
      cswData: "", cswSituation: "", cswSolution: "", tags: "",
    });
  });

  it("сумма-строка сохраняется, нулевая сумма копируется", () => {
    expect(requestPrefill({ planned_amount: "1500.50" }, positions).amount).toBe("1500.50");
    expect(requestPrefill({ planned_amount: 0 }, positions).amount).toBe("0");
  });
});
