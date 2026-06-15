-- ============================================================================
-- Доводка леджера до «9.5/10» (ТЗ v2 §4.1 — Реестр как источник истины).
-- Реализует оставшиеся пункты архитектурного разбора ядра ФП:
--   1. Жёсткий запрет UPDATE на fp_register (леджер неизменяем на уровне БД,
--      а не только по RLS-конвенции).
--   4. Функция сверки SUM(fp_register) = баланс фонда/счёта (контроль кэша).
--   5. Аудит reopen/close: триггеры trg_audit на fp_periods и directives
--      (reset уже логируется через DELETE-строки fp_register).
-- (Пункты 2–3 — FOR UPDATE + rowcount и частичный unique-индекс — внедрены
--  миграцией 20260615184000.)
--
-- Идемпотентно: create or replace + drop trigger if exists + create trigger.
-- ============================================================================

-- 1. Леджер неизменяем: править прошлые проводки нельзя — только встречной
--    записью (возврат) или удалением (reset). Балансовый триггер и так ведёт
--    только INSERT/DELETE, поэтому UPDATE мог бы рассинхронизировать кэш.
create or replace function public.trg_register_no_update()
 returns trigger
 language plpgsql
as $function$
begin
  raise exception 'Реестр fp_register неизменяем: коррекция — только встречной проводкой или сбросом (reset)';
end $function$
;

drop trigger if exists fp_register_no_update on public.fp_register;
create trigger fp_register_no_update
  before update on public.fp_register
  for each row execute function trg_register_no_update();

-- 4. Сверка балансов: возвращает фонды и счета ДС, у которых хранимый баланс
--    разошёлся с суммой проводок Реестра. В норме — пустой результат.
create or replace function public.fp_reconcile_balances()
 returns table (
   kind text,
   entity_id uuid,
   code text,
   ledger_sum numeric,
   stored_balance numeric,
   diff numeric
 )
 language plpgsql
 security definer
 set search_path = public
as $function$
begin
  if not is_fin_admin() then
    raise exception 'Сверку балансов может запускать только финдиректор или владелец';
  end if;

  return query
    select 'fund'::text, f.id, f.code,
           coalesce(l.s, 0)::numeric, f.balance::numeric, (f.balance - coalesce(l.s, 0))::numeric
    from funds f
    left join (
      select fund_id, sum(fund_amount) s from fp_register where fund_id is not null group by fund_id
    ) l on l.fund_id = f.id
    where f.balance <> coalesce(l.s, 0)
    union all
    select 'cash_account'::text, c.id, c.name,
           coalesce(l.s, 0)::numeric, c.balance::numeric, (c.balance - coalesce(l.s, 0))::numeric
    from cash_accounts c
    left join (
      select cash_account_id, sum(cash_amount) s from fp_register where cash_account_id is not null group by cash_account_id
    ) l on l.cash_account_id = c.id
    where c.balance <> coalesce(l.s, 0);
end $function$
;

revoke execute on function public.fp_reconcile_balances() from public, anon;
grant execute on function public.fp_reconcile_balances() to authenticated, service_role;

-- 5. Аудит переоткрытия/закрытия периода и протокола Директивы. Раньше эти
--    таблицы не аудировались, поэтому reopen/close в журнал не попадали.
drop trigger if exists audit_fp_periods on public.fp_periods;
create trigger audit_fp_periods
  after insert or update or delete on public.fp_periods
  for each row execute function trg_audit();

drop trigger if exists audit_directives on public.directives;
create trigger audit_directives
  after insert or update or delete on public.directives
  for each row execute function trg_audit();
