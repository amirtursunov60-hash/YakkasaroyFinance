// Фильтры счетов поставщиков/обязательств по статусам — чистая логика для
// чипов-фильтров со счётчиками (раздел «Счета поставщиков» / «Обязательства»).
// Вынесено из BillsScreen, чтобы покрыть тестами (DoD: touch→extract→type→test).
//
// Сверх статусов БД добавлена производная категория «Просрочено» (по образцу
// ManaJet «Просроченые»): срок оплаты прошёл, а счёт ещё активен — это самая
// действенная категория для управляющего (портятся отношения с поставщиками).

// Статусы счёта в БД (см. ST_META в BillsScreen).
export type BillStatus = "submitted" | "planning" | "approved" | "rejected" | "paid";

// Ключи чипов-фильтров: статусы БД + «all» + производная «overdue».
export type BillFilterKey = "all" | "overdue" | "submitted" | "approved" | "paid" | "rejected";

// Минимум полей счёта, нужный для фильтрации.
export interface BillLike {
  status: string;
  due_on?: string | null;
}

// «Просрочен»: срок оплаты (due_on, ISO yyyy-mm-dd) строго раньше сегодняшней
// даты, и счёт ещё в работе — не оплачен и не отклонён. today — тоже ISO-дата
// (срез до дня), чтобы сравнение строк было корректным.
export function isOverdueBill(bill: BillLike, today: string): boolean {
  return (
    !!bill.due_on &&
    bill.due_on < today &&
    bill.status !== "paid" &&
    bill.status !== "rejected"
  );
}

// Подходит ли счёт под выбранный чип-фильтр.
export function billMatchesFilter(bill: BillLike, filter: BillFilterKey, today: string): boolean {
  if (filter === "all") return true;
  if (filter === "overdue") return isOverdueBill(bill, today);
  return bill.status === filter;
}

// Счётчики по всем ключам фильтров — для подписи чипов «Метка · N».
export function billFilterCounts(bills: BillLike[], today: string): Record<BillFilterKey, number> {
  const counts: Record<BillFilterKey, number> = {
    all: bills.length, overdue: 0, submitted: 0, approved: 0, paid: 0, rejected: 0,
  };
  for (const b of bills) {
    if (b.status in counts) counts[b.status as BillFilterKey] += 1;
    if (isOverdueBill(b, today)) counts.overdue += 1;
  }
  return counts;
}

// Порядок и подписи чипов. «Просрочено» сразу после «Все» — на виду.
export const BILL_FILTERS: { key: BillFilterKey; label: string }[] = [
  { key: "all",       label: "Все" },
  { key: "overdue",   label: "Просрочено" },
  { key: "submitted", label: "Поданы" },
  { key: "approved",  label: "Одобрены" },
  { key: "paid",      label: "Оплачены" },
  { key: "rejected",  label: "Отклонены" },
];
