-- ============================================================================
-- pgTAP · Заявки §7: статус «отозвана» (withdrawn) и RPC fp_withdraw_request
--
-- Запуск:  supabase test db   (на ветке/staging) либо pg_prove.
-- Проверки структурные — ничего не пишут, безопасно везде.
-- ============================================================================
begin;
select plan(6);

set search_path = extensions, public;

-- значение enum добавлено (миграция 20260625000000)
select is(
  (select bool_or(enumlabel = 'withdrawn')
     from pg_enum where enumtypid = 'public.request_status'::regtype),
  true,
  '''withdrawn'' есть в enum request_status'
);

-- «отклонена» (rejected) по-прежнему отдельный статус — отзыв ≠ отказ
select is(
  (select bool_or(enumlabel = 'rejected')
     from pg_enum where enumtypid = 'public.request_status'::regtype),
  true,
  'rejected сохранён отдельно от withdrawn'
);

-- RPC отзыва на месте
select has_function(
  'public', 'fp_withdraw_request', array['uuid'],
  'fp_withdraw_request(uuid) есть'
);

-- функция SECURITY DEFINER (выполняет перевод в обход RLS, со своими проверками).
-- Сигнатуру пиним через regprocedure — иначе одноимённая перегрузка/функция в
-- другой схеме вернула бы >1 строки и тест бы упал.
select is(
  (select p.prosecdef from pg_proc p where p.oid = 'public.fp_withdraw_request(uuid)'::regprocedure),
  true,
  'fp_withdraw_request — SECURITY DEFINER'
);

-- права: authenticated может выполнять
select is(
  has_function_privilege('authenticated', 'public.fp_withdraw_request(uuid)', 'execute'),
  true,
  'authenticated может выполнять fp_withdraw_request'
);

-- права: anon выполнять не может
select is(
  has_function_privilege('anon', 'public.fp_withdraw_request(uuid)', 'execute'),
  false,
  'anon НЕ может выполнять fp_withdraw_request'
);

select * from finish();
rollback;
