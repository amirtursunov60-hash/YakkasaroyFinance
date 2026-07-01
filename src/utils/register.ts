// Общие метки операций Реестра fp_register (ХМС-термины не переводим).
// Единый словарь для журнала проводок и правил проводок; экраны со своими
// вариантами (Реестр/Фонды/Контроль) переводить сюда по мере касания.

export const OP_LABELS: Record<string, string> = {
  income: "Доход",
  income_return: "Возврат дохода",
  distribution: "Распределение в фонд",
  request_payment: "Оплата заявки",
  bill_payment: "Оплата счёта",
  payroll_payment: "Выплата ЗП",
  cash_transfer: "Перевод между счетами",
  fx_exchange: "Обмен валюты",
  off_plan: "Вне ФП",
  adjustment: "Корректировка",
  fund_income: "Приход фонда",
  fund_return: "Изъятие из фонда",
  fund_transfer: "Перемещение фондов",
  fund_loan: "Заём фонда",
  fund_loan_return: "Возврат займа",
};

export const opLabel = (op: string): string => OP_LABELS[op] ?? op;

// Комбинации (тип операции × компонента), которые Реестр сейчас НЕ пишет:
// например, distribution несёт только fund_amount, а income — только
// cash_amount. Правила для них существуют (полнота проекции на будущее),
// но в журнале не встречаются — UI помечает их как «пока не встречается».
export const UNUSED_RULE_COMBOS = new Set([
  "income:fund",
  "income_return:fund",
  "distribution:cash",
  "fund_income:cash",
  "fund_return:cash",
  "fund_transfer:cash",
  "fund_loan:cash",
  "fund_loan_return:cash",
]);
