// Канонические коды ролей и статусов. Единый источник — enum-типы схемы БД
// (database.types.ts, генерируется `supabase gen types` — руками не править),
// здесь — их runtime-значения, типы и русские подписи. В новом коде роли и
// статусы брать отсюда, а не строковыми литералами: опечатка в литерале —
// это молчаливый баг прав доступа, опечатка в константе — ошибка компиляции.

import { Constants, type Database } from "./database.types";

type Enums = Database["public"]["Enums"];

export type Role = Enums["app_role"];
export type RequestStatus = Enums["request_status"];
export type PeriodStatus = Enums["period_status"];
export type ClientInvoiceStatus = Enums["client_invoice_status"];

// Runtime-массивы значений (для списков, валидации, счётчиков)
export const ROLES = Constants.public.Enums.app_role;
export const REQUEST_STATUSES = Constants.public.Enums.request_status;
export const PERIOD_STATUSES = Constants.public.Enums.period_status;

// Классификация счетов ДС в системе расчётных счетов ФП (папки М1/Д1 у ManaJet).
// Значение колонки cash_accounts.flow_role; null — счёт без классификации.
export type CashFlowRole = "incoming" | "outgoing";
export const CASH_FLOW_ROLES: readonly CashFlowRole[] = ["incoming", "outgoing"] as const;
export const CASH_FLOW_ROLE_LABELS: Record<CashFlowRole, string> = {
  incoming: "Приходной",
  outgoing: "Расходной",
};

// Русские подписи ролей (канон; раньше жили инлайн в AppShell.jsx)
export const ROLE_LABELS: Record<Role, string> = {
  owner: "Владелец",
  fin_director: "Финансовый директор",
  ops_director: "Операционный директор",
  location_manager: "Управляющий точкой",
  accountant: "Бухгалтер",
  employee: "Сотрудник",
};
