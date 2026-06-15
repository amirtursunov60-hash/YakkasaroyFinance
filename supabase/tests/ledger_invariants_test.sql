-- ============================================================================
-- pgTAP · Инварианты леджера ФП (Реестр fp_register как источник истины)
--
-- Запуск:  supabase test db        (на локальной БД / ветке / staging)
--   либо:  pg_prove -d <conn> supabase/tests/ledger_invariants_test.sql
--
-- Структурная часть (1–13) и read-only поведенческая (14–15) безопасны на любой
-- среде, включая прод (ничего не пишут). Поведенческие тесты с фикстурами
-- (овердрафт / двойная оплата / блокировка периода) требуют тестовых данных и
-- синтетического пользователя — их место на ветке/staging, см. секцию TODO ниже.
-- ============================================================================
begin;
select plan(15);

set search_path = extensions, public;

-- --- Структура ядра -------------------------------------------------------
select has_table('public', 'fp_register', 'Реестр fp_register существует');
select has_column('public', 'funds', 'balance', 'funds.balance (баланс-кэш) есть');
select has_function('public', 'fp_pay_request', 'функция оплаты заявки есть');
select has_function('public', 'fp_distribute_stage', 'функция этапа распределения есть');
select has_function('public', 'fp_reconcile_balances', 'функция сверки балансов есть');

-- --- Инварианты-триггеры и индексы ----------------------------------------
select ok((select count(*) = 1 from pg_trigger where tgname = 'fp_register_no_update'),
  'триггер неизменяемости Реестра включён');
select ok((select count(*) = 1 from pg_trigger where tgname = 'fp_register_overdraft'),
  'триггер запрета овердрафта включён');
select ok((select count(*) = 1 from pg_trigger where tgname = 'fp_register_period_lock'),
  'триггер блокировки закрытого периода включён');
select ok((select count(*) = 1 from pg_indexes where indexname = 'fp_register_request_payment_uniq'),
  'unique-индекс против двойной оплаты есть');
select ok((select count(*) = 0 from pg_policies where tablename = 'fp_register' and cmd = 'UPDATE'),
  'на fp_register нет UPDATE-политики (RLS не даёт править)');
select ok((select count(*) = 1 from pg_trigger where tgname = 'audit_fp_periods'),
  'аудит fp_periods (reopen/close) включён');
select ok((select count(*) = 1 from pg_trigger where tgname = 'audit_directives'),
  'аудит directives включён');
select ok((select bool_or(action_timing = 'BEFORE' and event_manipulation = 'UPDATE')
           from information_schema.triggers where trigger_name = 'fp_register_no_update'),
  'неизменяемость — это BEFORE UPDATE');

-- --- Read-only поведенческие (сверка состояния леджера) --------------------
select is_empty($rec$
  select 'fund' k, f.code from funds f
  left join (select fund_id, sum(fund_amount) s from fp_register where fund_id is not null group by fund_id) l on l.fund_id = f.id
  where f.balance <> coalesce(l.s, 0)
  union all
  select 'cash', c.name from cash_accounts c
  left join (select cash_account_id, sum(cash_amount) s from fp_register where cash_account_id is not null group by cash_account_id) l on l.cash_account_id = c.id
  where c.balance <> coalesce(l.s, 0)
$rec$, 'балансы сходятся с леджером (SUM(fp_register) = balance)');

select is_empty($dup$
  select request_id from fp_register
  where op_type = 'request_payment' and request_id is not null
  group by request_id having count(*) > 1
$dup$, 'нет дублей оплат одной заявки');

select * from finish();
rollback;

-- ============================================================================
-- TODO · поведенческие тесты с фикстурами (запускать на ветке/staging)
-- Требуют синтетического пользователя (auth.users + profiles) и тестовых
-- справочников (currency base, location, fund, cash_account, период), затем:
--   * throws_ok($$ insert into fp_register(...,fund_amount=-БОЛЬШЕ_ОСТАТКА...) $$)
--       — овердрафт отклоняется (P0001);
--   * throws_ok($$ update fp_register set comment=... where id=<row> $$, 'P0001')
--       — Реестр неизменяем;
--   * throws_ok($$ insert into fp_register(... op_type='request_payment',
--       request_id=<тот же>) $$) — частичный unique-индекс не даёт задвоить оплату;
--   * throws_ok($$ insert into fp_register(period_id=<закрытый>) $$)
--       — операции в закрытом периоде запрещены;
--   * select fp_pay_request(<заявка>, ...) дважды — второй вызов даёт
--       «Заявка уже оплачена» (FOR UPDATE + rowcount).
-- ============================================================================
