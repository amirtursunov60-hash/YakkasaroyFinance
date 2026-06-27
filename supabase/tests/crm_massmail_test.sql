-- ============================================================================
-- pgTAP · Рассылки клиентам (massmail_campaigns + massmail_recipients)
--
-- Запуск:  supabase test db   (на ветке/staging) либо pg_prove.
-- Проверки структурные — ничего не пишут, безопасно везде.
-- ============================================================================
begin;
select plan(8);

set search_path = extensions, public;

select has_table('public', 'massmail_campaigns', 'таблица massmail_campaigns есть');
select has_table('public', 'massmail_recipients', 'таблица massmail_recipients есть');
select has_column('public', 'massmail_recipients', 'recipient_phone', 'recipient_phone есть');
select has_column('public', 'massmail_recipients', 'is_sent', 'is_sent есть');

select is((select relrowsecurity from pg_class where oid = 'public.massmail_campaigns'::regclass), true, 'RLS на campaigns');
select is((select relrowsecurity from pg_class where oid = 'public.massmail_recipients'::regclass), true, 'RLS на recipients');

select policies_are('public', 'massmail_campaigns',
  array['mmcamp_read', 'mmcamp_insert', 'mmcamp_update'], 'политики campaigns');
select policies_are('public', 'massmail_recipients',
  array['mmrecip_read', 'mmrecip_insert', 'mmrecip_update'], 'политики recipients');

select * from finish();
rollback;
