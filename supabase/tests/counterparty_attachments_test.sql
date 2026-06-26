-- ============================================================================
-- pgTAP · Вложения к контрагенту (counterparty_attachments)
--
-- Запуск:  supabase test db   (на ветке/staging) либо pg_prove.
-- Проверки структурные — ничего не пишут, безопасно везде.
-- ============================================================================
begin;
select plan(6);

set search_path = extensions, public;

select has_table('public', 'counterparty_attachments', 'таблица counterparty_attachments есть');
select has_column('public', 'counterparty_attachments', 'counterparty_id', 'counterparty_id есть');
select has_column('public', 'counterparty_attachments', 'file_path', 'file_path есть');

select is(
  (select relrowsecurity from pg_class where oid = 'public.counterparty_attachments'::regclass),
  true, 'RLS включён на counterparty_attachments'
);
select policies_are('public', 'counterparty_attachments',
  array['catt_read', 'catt_insert', 'catt_delete'],
  'политики read/insert/delete на counterparty_attachments');

-- FK с каскадом: удаление контрагента чистит его вложения (структурно — наличие FK)
select col_is_fk('public', 'counterparty_attachments', 'counterparty_id', 'counterparty_id — внешний ключ');

select * from finish();
rollback;
