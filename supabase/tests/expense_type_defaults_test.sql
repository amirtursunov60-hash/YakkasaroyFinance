-- ============================================================================
-- pgTAP · Значения по умолчанию вида расхода (форма ЗРС)
--
-- Запуск:  supabase test db   (на ветке/staging) либо pg_prove.
-- Только структурные проверки — ничего не пишут, безопасно везде.
-- ============================================================================
begin;
select plan(3);

set search_path = extensions, public;

select has_column('public', 'expense_types', 'default_fund_id', 'expense_types.default_fund_id (источник по умолчанию) есть');
select has_column('public', 'expense_types', 'default_purpose', 'expense_types.default_purpose (цель по умолчанию) есть');
select col_type_is('public', 'expense_types', 'default_fund_id', 'uuid', 'default_fund_id — uuid (FK на funds)');

select * from finish();
rollback;
