// Сводка «На оплату» для итогового блока Директивы — сколько уже ОДОБРЕНО к
// выплате и ждёт оплаты на этой неделе: заявки-ЗРС + счета поставщиков.
// По образцу ManaJet (строка «На оплату счетов» в итоге ФП), но у нас два
// источника расхода — заявки и счета, поэтому считаем оба и общий итог.
//
// Чистая логика — вынесено из Directive.jsx и покрыто Vitest (DoD: touch→
// extract→type→test). Суммы — в базовой валюте (TJS); счёт/заявка в другой
// валюте здесь не конвертируется (как и в остальной сводке Директивы).

// Заявка-ЗРС: одобренная сумма приоритетнее запрошенной.
export interface PayableRequest {
  status: string;
  approved_amount?: number | string | null;
  planned_amount?: number | string | null;
}

// Счёт поставщика/обязательство.
export interface PayableBill {
  status: string;
  amount: number | string;
}

const num = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Сумма одобренных, но ещё не оплаченных заявок (статус «approved»).
// Берём одобренную сумму, если задана, иначе запрошенную.
export function approvedRequestsTotal(requests: PayableRequest[]): number {
  return requests
    .filter((r) => r.status === "approved")
    .reduce((acc, r) => acc + num(r.approved_amount ?? r.planned_amount), 0);
}

// Сумма одобренных, но ещё не оплаченных счетов (статус «approved»).
export function approvedBillsTotal(bills: PayableBill[]): number {
  return bills
    .filter((b) => b.status === "approved")
    .reduce((acc, b) => acc + num(b.amount), 0);
}

// Итог «На оплату»: заявки + счета + общий.
export function payableTotals(
  requests: PayableRequest[],
  bills: PayableBill[],
): { requests: number; bills: number; total: number } {
  const reqs = approvedRequestsTotal(requests);
  const bls = approvedBillsTotal(bills);
  return { requests: reqs, bills: bls, total: reqs + bls };
}
