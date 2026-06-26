-- ============================================================================
-- pgTAP · Комментарий к значению статистики + UPDATE-политика
--
-- Запуск:  supabase test db   (на ветке/staging) либо pg_prove.
-- Проверки структурные — ничего не пишут, безопасно везде.
-- ============================================================================
begin;
select plan(4);

set search_path = extensions, public;

-- §8 — заметка к значению
select has_column('public', 'statistic_values', 'description', 'statistic_values.description есть');

-- RLS включён
select is(
  (select relrowsecurity from pg_class where oid = 'public.statistic_values'::regclass),
  true, 'RLS включён на statistic_values'
);

-- набор политик включает UPDATE (раньше его не было — правка значений не сохранялась)
select policies_are('public', 'statistic_values',
  array['statval_read', 'statval_insert', 'statval_update'],
  'политики read/insert/update на statistic_values');

-- именно UPDATE-политика на месте
select is(
  (select count(*)::int from pg_policy where polrelid = 'public.statistic_values'::regclass and polcmd = 'w'),
  1, 'есть UPDATE-политика statval_update');

select * from finish();
rollback;
