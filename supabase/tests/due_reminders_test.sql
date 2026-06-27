-- ============================================================================
-- pgTAP · Напоминания по срокам (fp_generate_due_reminders)
--
-- Запуск:  supabase test db   (на ветке/staging) либо pg_prove.
-- Структурные проверки — ничего не пишут, безопасно везде.
-- ============================================================================
begin;
select plan(3);

set search_path = extensions, public;

-- RPC существует
select has_function('public', 'fp_generate_due_reminders', array[]::text[], 'fp_generate_due_reminders() есть');

-- SECURITY DEFINER (вставляет в notifications в обход клиентских политик)
select is(
  (select prosecdef from pg_proc where oid = 'public.fp_generate_due_reminders'::regprocedure),
  true, 'fp_generate_due_reminders — SECURITY DEFINER'
);

-- возвращает integer (число созданных напоминаний)
select is(
  (select t.typname from pg_proc p join pg_type t on t.oid = p.prorettype
   where p.oid = 'public.fp_generate_due_reminders'::regprocedure),
  'int4', 'возвращает integer'
);

select * from finish();
rollback;
