-- ============================================================================
-- pgTAP · Коридор состояний у статистик (миграция 20260620240000)
--
-- Запуск:  supabase test db   (на ветке/staging) либо pg_prove.
-- Только структурные проверки — ничего не пишут, безопасно везде.
-- ============================================================================
begin;
select plan(5);

set search_path = extensions, public;

select has_column('public', 'statistics', 'min_val',   'statistics.min_val (нижняя граница коридора) есть');
select has_column('public', 'statistics', 'max_val',   'statistics.max_val (верхняя граница коридора) есть');
select has_column('public', 'statistics', 'stat_type', 'statistics.stat_type (тип ManaJet) есть');
select has_column('public', 'statistics', 'sign',      'statistics.sign (направление роста) есть');
select has_column('public', 'statistics', 'source',    'statistics.source (источник записи) есть');

select * from finish();
rollback;
