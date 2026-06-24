-- ============================================================================
-- pgTAP · Workflow/Kanban CRM: настраиваемые колонки + карточка + чек-лист
--
-- Запуск:  supabase test db   (на ветке/staging) либо pg_prove.
-- Структурные проверки + сид стартовых колонок (won/lost).
-- ============================================================================
begin;
select plan(9);

set search_path = extensions, public;

-- Колонки воронки
select has_table('public', 'crm_stages', 'crm_stages есть');
select ok((select relrowsecurity from pg_class where oid = 'public.crm_stages'::regclass), 'RLS на crm_stages');
select ok((select count(*) from crm_stages) >= 6, 'засеяны стартовые колонки (≥6)');
select ok((select count(*) from crm_stages where is_won) >= 1, 'есть колонка-победа (is_won)');
select ok((select count(*) from crm_stages where is_lost) >= 1, 'есть колонка-проигрыш (is_lost)');

-- Обогащение лида
select has_column('public', 'crm_leads', 'stage_id', 'crm_leads.stage_id есть');
select has_column('public', 'crm_leads', 'responsible_id', 'crm_leads.responsible_id есть');
select has_column('public', 'crm_leads', 'due_date', 'crm_leads.due_date есть');

-- Чек-лист
select has_table('public', 'crm_lead_checklist', 'crm_lead_checklist есть');

select * from finish();
rollback;
