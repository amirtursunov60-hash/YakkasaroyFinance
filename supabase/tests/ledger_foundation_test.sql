-- ============================================================================
-- pgTAP · Бухгалтерский фундамент: ОСВ (fp_turnover_sheet) + План счетов
--
-- Запуск:  supabase test db   (на ветке/staging) либо pg_prove.
-- Проверки структурные — ничего не пишут, безопасно везде.
-- ============================================================================
begin;
select plan(12);

set search_path = extensions, public;

-- 1) Функция ОСВ существует и read-only (STABLE)
select has_function('public', 'fp_turnover_sheet', array['uuid'], 'функция fp_turnover_sheet(uuid) есть');
select is(
  (select provolatile from pg_proc where oid = 'public.fp_turnover_sheet(uuid)'::regprocedure),
  's', 'fp_turnover_sheet STABLE (read-only)'
);
-- Возвращает строки и не падает на NULL-периоде (нет такого периода → пусто)
select is(
  (select count(*)::int from public.fp_turnover_sheet(null)),
  0, 'fp_turnover_sheet(null) возвращает 0 строк, не падает'
);

-- 2) Таблица «План счетов» и колонки
select has_table('public', 'chart_accounts', 'таблица chart_accounts есть');
select has_column('public', 'chart_accounts', 'code', 'chart_accounts.code есть');
select has_column('public', 'chart_accounts', 'name', 'chart_accounts.name есть');
select has_column('public', 'chart_accounts', 'account_type', 'chart_accounts.account_type есть');
select has_column('public', 'chart_accounts', 'is_archived', 'chart_accounts.is_archived есть');

-- 3) CHECK на тип счёта
select has_check('public', 'chart_accounts', 'на chart_accounts есть CHECK (account_type)');

-- 4) RLS включён + набор политик
select is(
  (select relrowsecurity from pg_class where oid = 'public.chart_accounts'::regclass),
  true, 'RLS включён на chart_accounts'
);
select policies_are('public', 'chart_accounts',
  array['ca_read', 'ca_insert', 'ca_update'],
  'политики read/insert/update на chart_accounts');

-- 5) Уникальность кода среди неархивных
select has_index('public', 'chart_accounts', 'chart_accounts_code_uidx', 'уникальный индекс по коду есть');

select * from finish();
rollback;
