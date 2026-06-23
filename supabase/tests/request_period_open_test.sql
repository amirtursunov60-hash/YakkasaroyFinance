-- ============================================================================
-- pgTAP · Запрет подачи заявки на закрытую неделю ФП
--
-- Запуск:  supabase test db   (на ветке/staging) либо pg_prove.
-- Структурные проверки — ничего не пишут, безопасно везде.
-- ============================================================================
begin;
select plan(4);

set search_path = extensions, public;

-- функция-страж на месте
select has_function(
  'public', 'trg_request_period_open_check', array[]::text[],
  'trg_request_period_open_check() есть'
);

-- триггер на payment_requests навешен (BEFORE INSERT OR UPDATE — подача и перенос)
select has_trigger(
  'public', 'payment_requests', 'request_period_open_check',
  'триггер request_period_open_check на payment_requests есть'
);

-- страж покрывает и INSERT, и UPDATE (миграция 20260623130000)
select is(
  (select string_agg(lower(t.event), ',' order by lower(t.event))
     from information_schema.triggers t
    where t.trigger_schema = 'public'
      and t.event_object_table = 'payment_requests'
      and t.trigger_name = 'request_period_open_check'),
  'insert,update',
  'страж срабатывает на INSERT и UPDATE'
);

-- контроль: статус 'closed' остаётся в enum period_status (на него опирается страж)
select has_type('public', 'period_status', 'enum period_status на месте');

select * from finish();
rollback;
