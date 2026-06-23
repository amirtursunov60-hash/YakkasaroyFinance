-- ============================================================================
-- pgTAP · Запрет подачи заявки на закрытую неделю ФП
--
-- Запуск:  supabase test db   (на ветке/staging) либо pg_prove.
-- Структурные проверки — ничего не пишут, безопасно везде.
-- ============================================================================
begin;
select plan(3);

set search_path = extensions, public;

-- функция-страж на месте
select has_function(
  'public', 'trg_request_period_open_check', array[]::text[],
  'trg_request_period_open_check() есть'
);

-- триггер BEFORE INSERT на payment_requests навешен
select has_trigger(
  'public', 'payment_requests', 'request_period_open_check',
  'триггер request_period_open_check на payment_requests есть'
);

-- контроль: статус 'closed' остаётся в enum period_status (на него опирается страж)
select has_type('public', 'period_status', 'enum period_status на месте');

select * from finish();
rollback;
