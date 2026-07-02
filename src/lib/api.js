// ============================================================================
//  API-слой поверх Supabase — точка входа. Постепенно заменяет моки из src/data/.
//  Имена колонок — по фактической схеме БД (см. supabase/README.md).
//
//  Реализация разнесена по доменным модулям в src/lib/api/ (механическое
//  разбиение без изменения логики); этот файл — баррель, чтобы существующие
//  импорты `from "../lib/api"` продолжали работать без правок.
// ============================================================================

export * from "./api/periods";
export * from "./api/income";
export * from "./api/requests";
export * from "./api/org";
export * from "./api/staff";
export * from "./api/counterparties";
export * from "./api/refs";
export * from "./api/register";
export * from "./api/bills";
export * from "./api/control";
export * from "./api/attachments";
export * from "./api/directive";
export * from "./api/funds";
export * from "./api/archive";
export * from "./api/payroll";
export * from "./api/reports";
export * from "./api/errors";
export * from "./api/stats";
export * from "./api/crm";
export * from "./api/dashboard";
export * from "./api/notifications";
export * from "./api/misc";
