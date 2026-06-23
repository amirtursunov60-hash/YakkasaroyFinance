import { fmt } from "../../utils/format";

// Правила закрытия недели ФП (Директива). Возвращает причину запрета закрытия
// (строка для показа) или null, если закрывать можно. Чистая логика — покрыта
// тестами; UI только показывает причину и блокирует кнопку.
//
// Неделя НЕ закрывается, если:
//  1) предыдущая неделя ещё открыта;
//  2) есть заявки недели на рассмотрении (не одобрены и не отклонены);
//  3) доход распределён не полностью (остаток ≠ 0) или распределено больше дохода;
//  4) баланс какого-либо фонда ушёл в минус.

const REVIEW_STATUSES = ["submitted", "planning"];

export interface CloseGuardFund {
  code?: string | null;
  name?: string | null;
  balance?: number | string | null;
}
export interface CloseGuardInput {
  prevPeriod: { status?: string | null } | null | undefined;
  weekReqs: { status?: string | null }[];
  remainder: number;
  funds: CloseGuardFund[];
}

// Допуск округления до половины дирама (0.005 TJS) — чтобы копеечные хвосты
// округления не блокировали закрытие.
const EPS = 0.005;

export function weekCloseBlockReason(input: CloseGuardInput): string | null {
  const { prevPeriod, weekReqs, remainder, funds } = input;

  // 1) предыдущая неделя открыта
  if (prevPeriod && prevPeriod.status && prevPeriod.status !== "closed") {
    return "Сначала закройте предыдущую неделю — она ещё открыта.";
  }

  // 2) заявки на рассмотрении
  const pending = weekReqs.filter((r) => REVIEW_STATUSES.includes(r.status || "")).length;
  if (pending > 0) {
    return `Есть заявки на рассмотрении (${pending}). Одобрите или отклоните все заявки недели.`;
  }

  // 3) доход распределён не полностью / распределено больше дохода
  if (remainder > EPS) {
    return `Доход распределён не полностью — нераспределённый остаток ${fmt(remainder)} TJS. Распределите его по фондам или перенесите остаток.`;
  }
  if (remainder < -EPS) {
    return `Распределено больше дохода — перерасход ${fmt(-remainder)} TJS. Исправьте распределение.`;
  }

  // 4) фонд в минусе
  const neg = funds.find((f) => Number(f.balance || 0) < -EPS);
  if (neg) {
    return `Фонд ${neg.code || ""} «${neg.name || ""}» в минусе (${fmt(Number(neg.balance || 0))} TJS). Исправьте распределение.`;
  }

  return null;
}
