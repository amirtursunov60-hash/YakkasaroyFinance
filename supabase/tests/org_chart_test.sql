-- ============================================================================
-- pgTAP · Структура оргсхемы (ТЗ v2 §4.3–4.4)
--
-- Запуск:  supabase test db        (на локальной БД / ветке / staging)
--   либо:  pg_prove -d <conn> supabase/tests/org_chart_test.sql
--
-- Только структурные/справочные проверки — ничего не пишут, безопасно везде.
-- ============================================================================
begin;
select plan(11);

set search_path = extensions, public;

-- --- Новые колонки отделений и постов -------------------------------------
select has_column('public', 'org_divisions', 'color', 'org_divisions.color есть');
select has_column('public', 'org_divisions', 'ckp', 'org_divisions.ckp (ЦКП отделения) есть');
select has_column('public', 'org_positions', 'section', 'org_positions.section (секция) есть');
select has_column('public', 'org_positions', 'ckp', 'org_positions.ckp (ЦКП поста) есть');
select has_column('public', 'org_positions', 'duties', 'org_positions.duties (обязанности) есть');
select has_column('public', 'org_positions', 'is_executive', 'org_positions.is_executive (руководящий пост) есть');

-- --- Статус шляпы у назначения --------------------------------------------
select has_column('public', 'position_assignments', 'hat_status', 'position_assignments.hat_status есть');
select has_type('public', 'hat_status', 'enum hat_status существует');
select ok((select array_agg(e.enumlabel::text order by e.enumsortorder)
             from pg_enum e join pg_type t on t.oid = e.enumtypid
             where t.typname = 'hat_status') = array['none','learning','done'],
  'hat_status = (none, learning, done)');

-- --- Стартовый справочник (сидинг прототипа = реальные данные, ТЗ п.7) -----
select ok((select count(*) >= 7 from org_divisions), 'засеяно ≥ 7 отделений');
select ok((select count(*) = 7 from org_positions where is_executive),
  'ровно 7 руководящих постов (по одному на отделение)');

select * from finish();
rollback;
