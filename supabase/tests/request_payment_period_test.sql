-- ============================================================================
-- pgTAP · Период оплаты ≠ период планирования у заявки ЗРС
--
-- Запуск:  supabase test db   (на ветке/staging) либо pg_prove.
-- Только структурные проверки. Инвариант (фиксация недели оплаты в
-- period_paid_id, снятие при полном откате, оплата в неделе ≠ планирования)
-- проверен на staging функционально.
-- ============================================================================
begin;
select plan(4);

set search_path = extensions, public;

select has_column('public', 'payment_requests', 'period_paid_id', 'payment_requests.period_paid_id (неделя оплаты) есть');
select col_is_fk('public', 'payment_requests', 'period_paid_id', 'period_paid_id — внешний ключ на fp_periods');

select has_function('public', 'fp_pay_request',
  ARRAY['uuid','uuid','uuid','numeric'],
  'fp_pay_request(p_request_id, p_cash_account_id, p_period_id, p_amount) есть');

select has_function('public', 'fp_reverse_request_payment',
  ARRAY['bigint'],
  'fp_reverse_request_payment(p_id) есть');

select * from finish();
rollback;
