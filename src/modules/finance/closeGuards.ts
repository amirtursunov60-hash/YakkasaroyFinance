import { fmt } from "../../utils/format";

// Правила закрытия недели ФП (Директива). Возвращает СПИСОК всех нарушенных
// правил (пустой — закрывать можно). Кнопка закрытия остаётся доступной; при
// нажатии показываются все причины сразу. Чистая логика — покрыта тестами.
//
// Неделя НЕ закрывается, если:
//  1) предыдущая неделя ещё открыта;
//  2) есть заявки недели в работе: на рассмотрении или возвращённые на доработку
//     (не одобрены, не отклонены, не отозваны);
//  3) доход распределён не полностью (остаток ≠ 0) или распределено больше дохода;
//  4) баланс какого-либо фонда ушёл в минус;
//  5) нет исполнительного подтверждения недели;
//  6) нет подтверждения финкомитета (BAF).

// «В работе» = ждут действия (подана/на планировании/возвращена автору на
// доработку). withdrawn/rejected/approved/paid — завершённые, закрытию не мешают.
const REVIEW_STATUSES = ["submitted", "planning", "revision"];

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
  period?: { is_executive_confirmed?: boolean | null; is_baf_confirmed?: boolean | null } | null;
}

// Допуск округления до половины дирама (0.005 TJS) — чтобы копеечные хвосты
// округления не блокировали закрытие.
const EPS = 0.005;

// Все нарушенные правила сразу (для показа списком при нажатии «Закрыть»).
export function weekCloseBlockReasons(input: CloseGuardInput): string[] {
  const { prevPeriod, weekReqs, remainder, funds, period } = input;
  const reasons: string[] = [];

  // 1) предыдущая неделя открыта
  if (prevPeriod && prevPeriod.status && prevPeriod.status !== "closed") {
    reasons.push("Предыдущая неделя ещё открыта — сначала закройте её.");
  }

  // 2) заявки на рассмотрении
  const pending = weekReqs.filter((r) => REVIEW_STATUSES.includes(r.status || "")).length;
  if (pending > 0) {
    reasons.push(`Есть заявки на рассмотрении (${pending}). Одобрите или отклоните все заявки недели.`);
  }

  // 3) доход распределён не полностью / распределено больше дохода
  if (remainder > EPS) {
    reasons.push(`Доход распределён не полностью — нераспределённый остаток ${fmt(remainder)} TJS. Распределите его по фондам или перенесите остаток.`);
  } else if (remainder < -EPS) {
    reasons.push(`Распределено больше дохода — перерасход ${fmt(-remainder)} TJS. Исправьте распределение.`);
  }

  // 4) фонд в минусе
  const neg = funds.find((f) => Number(f.balance || 0) < -EPS);
  if (neg) {
    reasons.push(`Фонд ${neg.code || ""} «${neg.name || ""}» в минусе (${fmt(Number(neg.balance || 0))} TJS). Исправьте распределение.`);
  }

  // 5–6) подтверждения недели (исполнительное + финкомитет/BAF)
  if (period && !period.is_executive_confirmed) {
    reasons.push("Нет исполнительного подтверждения недели.");
  }
  if (period && !period.is_baf_confirmed) {
    reasons.push("Нет подтверждения финкомитета (BAF).");
  }

  return reasons;
}
