-- ============================================================================
-- pgTAP · Доход §7: документ-основание операции дохода (incomes.basis_document)
--
-- Запуск:  supabase test db   (на ветке/staging) либо pg_prove.
-- Проверки структурные — ничего не пишут, безопасно везде.
-- ============================================================================
begin;
select plan(3);

set search_path = extensions, public;

-- колонка добавлена
select has_column('public', 'incomes', 'basis_document', 'incomes.basis_document есть');

-- тип text
select col_type_is('public', 'incomes', 'basis_document', 'text', 'basis_document — text');

-- nullable (справочное поле, не обязательно)
select col_is_null('public', 'incomes', 'basis_document', 'basis_document допускает NULL');

select * from finish();
rollback;
