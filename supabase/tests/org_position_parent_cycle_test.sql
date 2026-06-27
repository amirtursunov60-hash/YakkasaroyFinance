-- ============================================================================
-- pgTAP · Иерархия постов: защита от циклов parent_id
--
-- Запуск:  supabase test db   (на ветке/staging) либо pg_prove.
-- Поведенческий тест откатывается (rollback) — безопасно.
-- ============================================================================
begin;
select plan(3);

set search_path = extensions, public;

-- функция и триггер защиты от циклов
select has_function('public', 'trg_org_position_no_cycle', array[]::text[], 'trg_org_position_no_cycle() есть');
select has_trigger('public', 'org_positions', 'org_position_no_cycle', 'триггер org_position_no_cycle есть');

-- поведенческий: пост не может стать сам себе руководителем (P0001 от RAISE)
select throws_ok(
  $$ update public.org_positions
       set parent_id = id
     where id = (select id from public.org_positions where is_archived = false limit 1) $$,
  'P0001', null,
  'самоподчинение поста отвергается'
);

select * from finish();
rollback;
