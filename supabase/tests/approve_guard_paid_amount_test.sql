-- ============================================================================
-- pgTAP · Фикс триггеров одобрения (вычет paid_amount) + защита архива счёта ДС
-- (миграция 20260702170000_approve_guard_paid_amount_and_archive_guard.sql)
--
-- Запуск:  supabase test db   (на ветке/staging) либо pg_prove.
-- Только структурные/read-only проверки — ничего не пишут, безопасно везде.
-- ============================================================================
begin;
select plan(8);

set search_path = extensions, public;

-- --- Триггеры одобрения учитывают частичные оплаты ---------------------------
select ok(position('paid_amount' in pg_get_functiondef('public.trg_request_approve_funds_check'::regproc)) > 0,
  'trg_request_approve_funds_check вычитает paid_amount (остаток к оплате, не полная сумма)');
select ok(position('paid_amount' in pg_get_functiondef('public.trg_bill_approve_funds_check'::regproc)) > 0,
  'trg_bill_approve_funds_check вычитает paid_amount');
select ok(position('greatest' in pg_get_functiondef('public.trg_request_approve_funds_check'::regproc)) > 0,
  'остаток к оплате заявки не уходит в минус (greatest 0)');
select ok((select count(*) = 1 from pg_trigger where tgname = 'request_approve_funds_check'),
  'триггер одобрения заявок включён');
select ok((select count(*) = 1 from pg_trigger where tgname = 'bill_approve_funds_check'),
  'триггер одобрения счетов включён');

-- --- Защита архива счёта ДС --------------------------------------------------
select has_function('public', 'trg_cash_account_archive_guard', 'функция защиты архива счёта есть');
select ok((select count(*) = 1 from pg_trigger where tgname = 'cash_account_archive_guard'),
  'триггер запрета архива счёта с остатком включён');

-- --- fp_control_sum после переписывания в один проход ------------------------
select ok(
  (select cash_total = 0 and funds_total = 0 and incomes_undistributed = 0
     and requests_unpaid >= 0 and bills_unpaid >= 0
   from fp_control_sum('00000000-0000-0000-0000-000000000000'::uuid)),
  'однопроходный fp_control_sum: несуществующий период — Реестр-компоненты нулевые, обязательства неотрицательны');

select * from finish();
rollback;
