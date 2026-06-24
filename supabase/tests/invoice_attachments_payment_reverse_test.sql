-- ============================================================================
-- pgTAP · Вложения у счёта клиента + откат оплаты клиента
--
-- Запуск:  supabase test db   (на ветке/staging) либо pg_prove.
-- Только структурные проверки. Инвариант (сторно дохода-возвратом, пересчёт
-- статуса счёта, запрет повторной отмены и отмены возврата, возврат денег со
-- счёта ДС) проверен на staging функционально.
-- ============================================================================
begin;
select plan(8);

set search_path = extensions, public;

-- Таблица вложений счёта клиента
select has_table('public', 'invoice_attachments', 'invoice_attachments есть');
select has_column('public', 'invoice_attachments', 'invoice_id', 'invoice_attachments.invoice_id есть');
select col_is_fk('public', 'invoice_attachments', 'invoice_id', 'invoice_id — внешний ключ');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.invoice_attachments'::regclass),
  'RLS включён на invoice_attachments');

-- Ссылка отмены оплаты
select has_column('public', 'incomes', 'reverses_income_id', 'incomes.reverses_income_id есть');
select col_type_is('public', 'incomes', 'reverses_income_id', 'uuid', 'reverses_income_id — uuid');

-- RPC отката оплаты счёта клиента
select has_function('public', 'fp_reverse_invoice_payment',
  ARRAY['uuid'],
  'fp_reverse_invoice_payment(p_income_id) есть');
select is(
  (select prosecdef from pg_proc where oid = 'public.fp_reverse_invoice_payment'::regproc),
  true,
  'fp_reverse_invoice_payment — SECURITY DEFINER');

select * from finish();
rollback;
