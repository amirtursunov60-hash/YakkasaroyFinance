// Контрольная сумма ФП (вкладка «Контроль средств», образец — ManaJet).
// Чистая логика поверх компонент RPC fp_control_sum: раскладка фондов на
// «доступно» и обязательства, итог и разница. Уравнение:
//
//   деньги на счетах ДС = нераспределённые доходы
//                       + фонды доступно
//                       + невыплаченные заявки
//                       + невыплаченные счета поставщиков
//
// Обязательства уже «лежат» в фондах, поэтому Итог = нераспределённые + фонды
// целиком, а Разница не зависит от обязательств — она ловит именно движения
// мимо распределения: внеплановые траты (off_plan), корректировки, ручные
// приходы/возвраты фондов.

export type ControlSumData = {
  cashTotal: number;            // Σ денег на счетах ДС на конец недели
  fundsTotal: number;           // Σ балансов фондов на конец недели
  incomesUndistributed: number; // доходы − распределения (нераспределённый остаток)
  requestsUnpaid: number;       // одобренные заявки: остаток к оплате (текущее состояние)
  billsUnpaid: number;          // одобренные счета поставщиков: остаток к оплате
};

export type ControlSumView = ControlSumData & {
  fundsAvailable: number; // фонды минус невыплаченные обязательства
  total: number;          // сумма компонент («должно быть на счетах»)
  difference: number;     // деньги на счетах − итог
  matches: boolean;       // |difference| < 0.01 — уравнение сходится
};

export function buildControlSum(d: ControlSumData): ControlSumView {
  const fundsAvailable = round2(d.fundsTotal - d.requestsUnpaid - d.billsUnpaid);
  const total = round2(d.incomesUndistributed + fundsAvailable + d.requestsUnpaid + d.billsUnpaid);
  const difference = round2(d.cashTotal - total);
  return { ...d, fundsAvailable, total, difference, matches: Math.abs(difference) < 0.01 };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
