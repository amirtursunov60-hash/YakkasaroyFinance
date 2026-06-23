-- ============================================================================
-- pgTAP · Отмена оплаты заявки (компенсирующая запись Реестра)
--
-- Запуск:  supabase test db   (на ветке/staging) либо pg_prove.
-- Структурные проверки — ничего не пишут, безопасно везде.
-- ============================================================================
begin;
select plan(3);

set search_path = extensions, public;

-- RPC отмены оплаты на месте
select has_function(
  'public', 'fp_reverse_request_payment', array['bigint'],
  'fp_reverse_request_payment(bigint) есть'
);

-- колонка-связка отката (reverses_id) — на неё опирается запрет повторной отмены
select has_column('public', 'fp_register', 'reverses_id', 'fp_register.reverses_id есть');

-- жёсткий UNIQUE «одна оплата на заявку» снят (мешал отмене и повторной оплате);
-- защита от двойной оплаты осталась в fp_pay_request (FOR UPDATE + rowcount)
select hasnt_index('public', 'fp_register', 'fp_register_request_payment_uniq',
  'уникальный индекс fp_register_request_payment_uniq снят');

select * from finish();
rollback;
