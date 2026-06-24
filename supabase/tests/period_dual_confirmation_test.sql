-- ============================================================================
-- pgTAP · Два флага подтверждения периода ФП (исполнительный + финкомитет/BAF)
--
-- Запуск:  supabase test db   (на ветке/staging) либо pg_prove.
-- Только структурные проверки. Инвариант (закрытие требует обоих подтверждений,
-- переоткрытие сбрасывает флаги, ролевой контроль) проверен на staging
-- функционально.
-- ============================================================================
begin;
select plan(7);

set search_path = extensions, public;

select has_column('public', 'fp_periods', 'is_executive_confirmed', 'fp_periods.is_executive_confirmed есть');
select has_column('public', 'fp_periods', 'is_baf_confirmed', 'fp_periods.is_baf_confirmed есть');
select col_type_is('public', 'fp_periods', 'is_executive_confirmed', 'boolean', 'is_executive_confirmed — boolean');
select col_type_is('public', 'fp_periods', 'is_baf_confirmed', 'boolean', 'is_baf_confirmed — boolean');

select has_function('public', 'fp_set_period_confirmation',
  ARRAY['uuid','text','boolean'],
  'fp_set_period_confirmation(p_period_id, p_kind, p_value) есть');
select is(
  (select prosecdef from pg_proc where oid = 'public.fp_set_period_confirmation'::regproc),
  true,
  'fp_set_period_confirmation — SECURITY DEFINER');

-- Закрытые периоды историчны → проставлены оба флага (бэкофилл миграции)
select ok(
  not exists (select 1 from fp_periods where status = 'closed' and not (is_executive_confirmed and is_baf_confirmed)),
  'у всех закрытых периодов оба подтверждения проставлены');

select * from finish();
rollback;
