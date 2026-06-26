-- ============================================================================
-- pgTAP · Периодичность статистик + датированные значения
--
-- Запуск:  supabase test db   (на ветке/staging) либо pg_prove.
-- Проверки структурные — ничего не пишут, безопасно везде.
-- ============================================================================
begin;
select plan(8);

set search_path = extensions, public;

-- периодичность на statistics
select has_column('public', 'statistics', 'frequency', 'statistics.frequency есть');

-- таблица датированных значений и колонки
select has_table('public', 'statistic_dated_values', 'таблица statistic_dated_values есть');
select has_column('public', 'statistic_dated_values', 'value_date', 'value_date есть');
select has_column('public', 'statistic_dated_values', 'is_quota', 'is_quota есть');

-- RLS включён + полный набор политик
select is(
  (select relrowsecurity from pg_class where oid = 'public.statistic_dated_values'::regclass),
  true, 'RLS включён на statistic_dated_values'
);
select policies_are('public', 'statistic_dated_values',
  array['statdated_read', 'statdated_insert', 'statdated_update', 'statdated_delete'],
  'политики read/insert/update/delete на statistic_dated_values');

-- дефолт periodicity week (обратная совместимость) — все существующие статистики week
select is(
  (select count(*)::int from public.statistics where frequency is null),
  0, 'frequency заполнен у всех статистик (NOT NULL + default)'
);

-- допустимые значения — CHECK
select has_check('public', 'statistics', 'на statistics есть CHECK (frequency)');

select * from finish();
rollback;
