-- ============================================================================
-- pgTAP · Вкладка «Контроль средств»: flow_role счетов + RPC fp_control_sum
-- (миграция 20260702150000_control_tab_flow_role_and_control_sum.sql)
--
-- Запуск:  supabase test db   (на ветке/staging) либо pg_prove.
-- Только структурные/read-only проверки — ничего не пишут, безопасно везде.
-- ============================================================================
begin;
select plan(10);

set search_path = extensions, public;

-- --- Классификация счетов «Приходной/Расходной» -----------------------------
select has_column('public', 'cash_accounts', 'flow_role', 'cash_accounts.flow_role есть');
select col_is_null('public', 'cash_accounts', 'flow_role', 'flow_role необязателен (NULL — без классификации)');
select ok(
  (select count(*) = 1 from pg_constraint
    where conname = 'cash_accounts_flow_role_chk' and conrelid = 'public.cash_accounts'::regclass),
  'check-констрейнт flow_role (incoming/outgoing) включён');

-- --- RPC контрольной суммы ---------------------------------------------------
select has_function('public', 'fp_control_sum', array['uuid'], 'RPC fp_control_sum(uuid) есть');
-- Гарантия против случайного SECURITY DEFINER (RLS должна применяться к вызывающему):
select ok(
  (select not p.prosecdef from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fp_control_sum'),
  'fp_control_sum не SECURITY DEFINER');

select ok(
  (select p.provolatile = 's' from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fp_control_sum'),
  'fp_control_sum — STABLE (read-only)');

-- Форма результата: 5 числовых компонент
select ok(
  (select pg_get_function_result('public.fp_control_sum'::regproc)
     like '%cash_total%funds_total%incomes_undistributed%requests_unpaid%bills_unpaid%'),
  'fp_control_sum возвращает 5 компонент контрольной суммы');

-- Несуществующий период → нули (а не ошибка/NULL)
select results_eq(
  $q$ select cash_total, funds_total, incomes_undistributed, requests_unpaid, bills_unpaid
      from fp_control_sum('00000000-0000-0000-0000-000000000000'::uuid) $q$,
  $q$ values (0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric) $q$,
  'несуществующий период даёт нулевые компоненты');

-- Инвариант формулы: недоплаченные обязательства неотрицательны
select ok(
  (select requests_unpaid >= 0 and bills_unpaid >= 0
     from fp_control_sum((select id from fp_periods order by starts_on desc limit 1))),
  'остатки к оплате (заявки/счета) неотрицательны');

-- Формула нераспределённого: Σ доходов − Σ распределений (сверка с Реестром напрямую)
select ok(
  (with t as (select ends_on from fp_periods order by starts_on desc limit 1),
   eff as (
     select fr.op_type, fr.cash_amount, fr.fund_amount,
       coalesce(p.ends_on, (fr.created_at at time zone 'Asia/Dushanbe')::date) as ed
     from fp_register fr left join fp_periods p on p.id = fr.period_id
   ),
   manual as (
     select coalesce(sum(case
       when e.op_type in ('income','income_return') then coalesce(e.cash_amount, 0)
       when e.op_type = 'distribution' then -coalesce(e.fund_amount, 0)
       else 0 end), 0) as v
     from eff e cross join t where e.ed <= t.ends_on
   )
   select abs(m.v - cs.incomes_undistributed) < 0.01
   from manual m, fp_control_sum((select id from fp_periods order by starts_on desc limit 1)) cs),
  'incomes_undistributed совпадает с прямой суммой по Реестру');

select * from finish();
rollback;
