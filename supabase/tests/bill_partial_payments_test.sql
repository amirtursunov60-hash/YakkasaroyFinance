-- ============================================================================
-- pgTAP · Частичные оплаты счетов поставщиков
--
-- Запуск:  supabase test db   (на ветке/staging) либо pg_prove.
-- Только структурные проверки. Инвариант (накопление paid_amount, статус paid
-- только при полной оплате, уменьшение при реверсе) проверен на staging
-- функционально.
-- ============================================================================
begin;
select plan(5);

set search_path = extensions, public;

select has_column('public', 'supplier_bills', 'paid_amount', 'supplier_bills.paid_amount есть');
select col_type_is('public', 'supplier_bills', 'paid_amount', 'numeric', 'paid_amount — numeric');

select has_function('public', 'fp_pay_bill',
  ARRAY['uuid','uuid','uuid','numeric'],
  'fp_pay_bill(p_bill_id, p_cash_account_id, p_period_id, p_amount) есть');

select hasnt_function('public', 'fp_pay_bill',
  ARRAY['uuid','uuid','uuid'],
  'старая 3-аргументная fp_pay_bill удалена');

select has_function('public', 'fp_reverse_bill_payment',
  ARRAY['bigint'],
  'fp_reverse_bill_payment(p_id) есть');

select * from finish();
rollback;
