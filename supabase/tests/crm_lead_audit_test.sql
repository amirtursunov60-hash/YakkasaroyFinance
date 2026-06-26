-- ============================================================================
-- pgTAP · Таймлайн лида (аудит crm_leads + точечная политика чтения)
--
-- Запуск:  supabase test db   (на ветке/staging) либо pg_prove.
-- Проверки структурные — ничего не пишут, безопасно везде.
-- ============================================================================
begin;
select plan(3);

set search_path = extensions, public;

-- триггер аудита навешен на crm_leads
select has_trigger('public', 'crm_leads', 'audit_crm_leads', 'триггер audit_crm_leads есть');

-- точечная политика чтения истории лида на audit_log
select policy_cmd_is('public', 'audit_log', 'audit_read_crm_leads', 'SELECT',
  'audit_read_crm_leads — SELECT-политика');

-- общая закрывающая политика финадмина по-прежнему на месте (не сломали)
select policy_cmd_is('public', 'audit_log', 'audit_read', 'SELECT',
  'audit_read (финадмин) сохранена');

select * from finish();
rollback;
