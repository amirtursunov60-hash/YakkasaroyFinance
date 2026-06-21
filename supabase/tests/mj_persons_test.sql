-- ============================================================================
-- pgTAP · Зеркало сотрудников ManaJet (миграция 20260620250000)
-- Только структурные проверки — ничего не пишут, безопасно везде.
-- ============================================================================
begin;
select plan(4);

set search_path = extensions, public;

select has_table('public', 'mj_persons', 'таблица mj_persons есть');
select has_column('public', 'mj_persons', 'mj_id', 'mj_persons.mj_id (ключ ManaJet) есть');
select col_is_unique('public', 'mj_persons', 'mj_id', 'mj_persons.mj_id уникален');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.mj_persons'::regclass),
  'RLS включён на mj_persons');

select * from finish();
rollback;
