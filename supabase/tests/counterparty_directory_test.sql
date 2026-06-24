-- ============================================================================
-- pgTAP · Справочник контрагентов: категории + контакты
--
-- Запуск:  supabase test db   (на ветке/staging) либо pg_prove.
-- Только структурные проверки (таблицы, колонки, FK, RLS включён).
-- ============================================================================
begin;
select plan(8);

set search_path = extensions, public;

-- Категории
select has_table('public', 'counterparty_categories', 'counterparty_categories есть');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.counterparty_categories'::regclass),
  'RLS включён на counterparty_categories');

-- Категория у контрагента
select has_column('public', 'counterparties', 'category_id', 'counterparties.category_id есть');
select col_is_fk('public', 'counterparties', 'category_id', 'category_id — внешний ключ');

-- Контакты
select has_table('public', 'counterparty_contacts', 'counterparty_contacts есть');
select has_column('public', 'counterparty_contacts', 'counterparty_id', 'counterparty_contacts.counterparty_id есть');
select col_is_fk('public', 'counterparty_contacts', 'counterparty_id', 'counterparty_id — внешний ключ');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.counterparty_contacts'::regclass),
  'RLS включён на counterparty_contacts');

select * from finish();
rollback;
