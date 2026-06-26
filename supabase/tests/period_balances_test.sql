-- ============================================================================
-- pgTAP · Остатки фондов/счетов на конец периода (fp_period_balances)
--
-- Запуск:  supabase test db   (на ветке/staging) либо pg_prove.
-- Структурная + лёгкая поведенческая проверка (на пустом периоде сумма = 0/нет строк).
-- ============================================================================
begin;
select plan(3);

set search_path = extensions, public;

-- функция существует с нужной сигнатурой
select has_function('public', 'fp_period_balances', array['uuid'], 'fp_period_balances(uuid) есть');

-- read-only (volatility = stable, не volatile)
select is(
  (select provolatile from pg_proc where oid = 'public.fp_period_balances(uuid)'::regprocedure),
  's', 'fp_period_balances помечена STABLE (read-only)'
);

-- на несуществующем периоде возвращает пусто, не падает
select is(
  (select count(*)::int from public.fp_period_balances('00000000-0000-0000-0000-000000000000'::uuid)),
  0, 'на несуществующем периоде — нет строк'
);

select * from finish();
rollback;
