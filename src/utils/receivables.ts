// Дебиторка по счетам клиентов (банкеты). Просрочка — производная от дат,
// как в ManaJet (status + search_date_type), без отдельной колонки.
//
// Доменные решения (осознанные):
// - Просрочен только ВЫСТАВЛЕННЫЙ счёт (issued) с незакрытым долгом, чьё
//   мероприятие уже прошло. Бронь (planned) без единой предоплаты с прошедшей
//   датой — это брошенная бронь, а не долг клиента: её надо отменять, а не
//   взыскивать, поэтому в дебиторку она не входит.
// - «Оплата за N дней ДО мероприятия» этой моделью невыразима: счёт становится
//   просроченным только назавтра после даты мероприятия. Если понадобится
//   ранний контроль предоплат — вводить отдельный срок (due_date) миграцией.
//
// Даты — ISO-строки 'ГГГГ-ММ-ДД' (сравнение строк корректно для формата).

export interface InvoiceForOverdue {
  status: string;
  event_on: string | null;
  amount: number | string;
}

export type InvoiceFilterKey = "all" | "overdue" | "planned" | "issued" | "paid" | "cancelled";

// Долг по счёту: выставлено минус получено, не меньше нуля
// (переплата долга не создаёт).
export function invoiceDebt(amount: number, paid: number): number {
  return Math.max(0, amount - paid);
}

// Просрочен ли счёт на дату today (ISO 'ГГГГ-ММ-ДД').
export function isInvoiceOverdue(inv: InvoiceForOverdue, paid: number, today: string): boolean {
  return inv.status === "issued"
    && !!inv.event_on && inv.event_on < today
    && invoiceDebt(Number(inv.amount), paid) > 0;
}

// Сколько дней прошло с даты мероприятия (для метки «просрочен · N дн.»).
export function overdueDays(eventOn: string, today: string): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.round((Date.parse(today) - Date.parse(eventOn)) / MS_PER_DAY));
}

// Попадает ли счёт под фильтр вкладки (образец — billFilters.ts у поставщиков):
// «overdue» — категория производная, остальные — по статусу.
export function invoiceMatchesFilter(
  inv: InvoiceForOverdue,
  filter: InvoiceFilterKey,
  paid: number,
  today: string,
): boolean {
  if (filter === "all") return true;
  if (filter === "overdue") return isInvoiceOverdue(inv, paid, today);
  return inv.status === filter;
}

// Счётчики для чипов фильтров одним проходом.
export function invoiceFilterCounts(
  invoices: InvoiceForOverdue[],
  paidOf: (inv: InvoiceForOverdue) => number,
  today: string,
): Record<InvoiceFilterKey, number> {
  const counts: Record<InvoiceFilterKey, number> = { all: 0, overdue: 0, planned: 0, issued: 0, paid: 0, cancelled: 0 };
  for (const inv of invoices) {
    counts.all += 1;
    if (isInvoiceOverdue(inv, paidOf(inv), today)) counts.overdue += 1;
    if (inv.status in counts) counts[inv.status as InvoiceFilterKey] += 1;
  }
  return counts;
}
