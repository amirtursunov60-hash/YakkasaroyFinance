-- ============================================================================
-- pgTAP · Отмена операции дохода через сторно
--
-- Запуск:  supabase test db   (на ветке/staging) либо pg_prove.
-- Только структурные проверки. Инвариант (сторно доходом-возвратом, уменьшение
-- счёта ДС, запрет повторной отмены и отмены возврата, пересчёт статуса счёта
-- клиента) проверен на staging функционально.
-- ============================================================================
begin;
select plan(3);

set search_path = extensions, public;

select has_function('public', 'fp_reverse_income',
  ARRAY['uuid'],
  'fp_reverse_income(p_income_id) есть');
select is(
  (select prosecdef from pg_proc where oid = 'public.fp_reverse_income'::regproc),
  true,
  'fp_reverse_income — SECURITY DEFINER');

-- Ссылка сторно на исходную операцию (колонка добавлена ранее)
select has_column('public', 'incomes', 'reverses_income_id', 'incomes.reverses_income_id есть');

select * from finish();
rollback;
