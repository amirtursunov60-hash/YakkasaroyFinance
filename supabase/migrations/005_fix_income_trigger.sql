-- ============================================================================
-- 005 · Исправление триггера доход → Реестр
-- В trg_income_to_register() выражение CASE с типом операции получало тип
-- text, а колонка fp_register.op_type — enum register_op_type. Из-за этого
-- любая вставка в incomes падала с ошибкой:
--   column "op_type" is of type register_op_type but expression is of type text
-- Исправление: явное приведение ::register_op_type. Остальное без изменений.
-- ============================================================================

create or replace function public.trg_income_to_register()
returns trigger
language plpgsql
security definer
as $function$
begin
  insert into fp_register (op_type, period_id, cash_account_id, cash_amount,
    income_id, counterparty_id, payment_type_id, currency_id, created_by)
  values (
    (case when new.is_return then 'income_return' else 'income' end)::register_op_type,
    new.period_id, new.cash_account_id,
    case when new.is_return then -new.amount_base else new.amount_base end,
    new.id, new.counterparty_id, new.payment_type_id, new.currency_id, new.created_by
  );
  return new;
end $function$;
