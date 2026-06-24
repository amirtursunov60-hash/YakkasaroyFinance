-- ============================================================================
-- pgTAP · Частичные оплаты заявок ЗРС
--
-- Запуск:  supabase test db   (на ветке/staging) либо pg_prove.
-- Только структурные проверки — ничего не пишут, безопасно везде.
-- Инвариант (накопление paid_amount, статус paid только при полной оплате,
-- уменьшение при реверсе) проверяется на staging функционально; здесь —
-- наличие колонки и сигнатур функций.
-- ============================================================================
begin;
select plan(5);

set search_path = extensions, public;

-- Накопленная оплата на заявке
select has_column('public', 'payment_requests', 'paid_amount', 'payment_requests.paid_amount (накопленная оплата) есть');
select col_type_is('public', 'payment_requests', 'paid_amount', 'numeric', 'paid_amount — numeric');

-- Оплата с необязательной суммой частичной оплаты (4-й аргумент p_amount)
select has_function('public', 'fp_pay_request',
  ARRAY['uuid','uuid','uuid','numeric'],
  'fp_pay_request(p_request_id, p_cash_account_id, p_period_id, p_amount) есть');

-- Старая 3-аргументная перегрузка удалена (во избежание неоднозначности PostgREST)
select hasnt_function('public', 'fp_pay_request',
  ARRAY['uuid','uuid','uuid'],
  'старая 3-аргументная fp_pay_request удалена');

-- Реверс оплаты заявки (уменьшает paid_amount)
select has_function('public', 'fp_reverse_request_payment',
  ARRAY['bigint'],
  'fp_reverse_request_payment(p_id) есть');

select * from finish();
rollback;
