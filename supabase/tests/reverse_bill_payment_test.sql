-- ============================================================================
-- pgTAP · Отмена оплаты счёта поставщика (компенсирующая запись Реестра)
--
-- Запуск:  supabase test db   (на ветке/staging) либо pg_prove.
-- Структурные проверки — ничего не пишут, безопасно везде.
-- ============================================================================
begin;
select plan(2);

set search_path = extensions, public;

-- RPC отмены оплаты счёта на месте
select has_function(
  'public', 'fp_reverse_bill_payment', array['bigint'],
  'fp_reverse_bill_payment(bigint) есть'
);

-- связка отката оплаты со счётом (bill_id) — компенсирующая запись её наследует
select has_column('public', 'fp_register', 'bill_id', 'fp_register.bill_id есть');

select * from finish();
rollback;
