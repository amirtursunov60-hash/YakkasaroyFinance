-- ============================================================================
-- pgTAP · Отмена оплаты заявки (компенсирующая запись Реестра)
--
-- Запуск:  supabase test db   (на ветке/staging) либо pg_prove.
-- Структурные проверки — ничего не пишут, безопасно везде.
-- ============================================================================
begin;
select plan(2);

set search_path = extensions, public;

-- RPC отмены оплаты на месте
select has_function(
  'public', 'fp_reverse_request_payment', array['bigint'],
  'fp_reverse_request_payment(bigint) есть'
);

-- колонка-связка отката (reverses_id) — на неё опирается запрет повторной отмены
select has_column('public', 'fp_register', 'reverses_id', 'fp_register.reverses_id есть');

select * from finish();
rollback;
