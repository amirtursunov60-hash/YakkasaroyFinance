-- ============================================================================
-- pgTAP · Задача на пост оргсхемы + связь БП со статистикой/постом
--
-- Запуск:  supabase test db   (на ветке/staging) либо pg_prove.
-- Только структурные проверки. Доступ держателя поста к адресованной задаче
-- (RLS holds_position) проверяется на staging.
-- ============================================================================
begin;
select plan(7);

set search_path = extensions, public;

-- Задача может адресоваться посту
select has_column('public', 'tasks', 'position_id', 'tasks.position_id есть');
select col_is_fk('public', 'tasks', 'position_id', 'tasks.position_id — внешний ключ');

-- БП связан со статистикой/постом + флаг видимости в контексте статистики
select has_column('public', 'battle_plan_items', 'statistic_id', 'battle_plan_items.statistic_id есть');
select has_column('public', 'battle_plan_items', 'position_id', 'battle_plan_items.position_id есть');
select has_column('public', 'battle_plan_items', 'is_stats_visible', 'battle_plan_items.is_stats_visible есть');
select col_type_is('public', 'battle_plan_items', 'is_stats_visible', 'boolean', 'is_stats_visible — boolean');

-- RLS задач учитывает держателя поста (через holds_position в выражении политики)
select ok(
  (select pg_get_expr(polqual, polrelid) from pg_policy where polrelid = 'public.tasks'::regclass and polname = 'tasks_read')
    like '%holds_position%',
  'tasks_read учитывает держателя поста (holds_position)');

select * from finish();
rollback;
