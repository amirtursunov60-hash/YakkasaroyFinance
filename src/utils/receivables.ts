// Дебиторка по счетам клиентов (банкеты). Просрочка — производная от дат,
// как в ManaJet (status + search_date_type), без отдельной колонки:
// счёт просрочен, если мероприятие уже прошло, счёт активен (planned/issued)
// и долг по нему не закрыт. Даты — ISO-строки 'ГГГГ-ММ-ДД' (сравнение строк
// корректно для этого формата).

export interface InvoiceForOverdue {
  status: string;
  event_on: string | null;
  amount: number | string;
}

// Долг по счёту: выставлено минус получено, не меньше нуля
// (переплата долга не создаёт).
export function invoiceDebt(amount: number, paid: number): number {
  return Math.max(0, amount - paid);
}

// Просрочен ли счёт на дату today (ISO 'ГГГГ-ММ-ДД').
export function isInvoiceOverdue(inv: InvoiceForOverdue, paid: number, today: string): boolean {
  return (inv.status === "planned" || inv.status === "issued")
    && !!inv.event_on && inv.event_on < today
    && invoiceDebt(Number(inv.amount), paid) > 0;
}

// Сколько дней прошло с даты мероприятия (для метки «просрочен · N дн.»).
export function overdueDays(eventOn: string, today: string): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.round((Date.parse(today) - Date.parse(eventOn)) / MS_PER_DAY));
}
