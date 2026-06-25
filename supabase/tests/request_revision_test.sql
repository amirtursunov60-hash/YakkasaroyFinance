-- ============================================================================
-- pgTAP · Заявки §8: статус «на доработке» (revision) + RLS правки автором
--
-- Запуск:  supabase test db   (на ветке/staging) либо pg_prove.
-- Проверки структурные — ничего не пишут, безопасно везде.
-- ============================================================================
begin;
select plan(3);

set search_path = extensions, public;

-- значение enum добавлено (миграция 20260625020000)
select is(
  (select bool_or(enumlabel = 'revision')
     from pg_enum where enumtypid = 'public.request_status'::regtype),
  true,
  '''revision'' есть в enum request_status'
);

-- «отклонена» (rejected) сохранена отдельно — возврат на доработку ≠ отказ
select is(
  (select bool_or(enumlabel = 'rejected')
     from pg_enum where enumtypid = 'public.request_status'::regtype),
  true,
  'rejected сохранён отдельно от revision'
);

-- политика requests_update расширена: автор может править свою заявку в статусе
-- revision (USING ссылается на значение 'revision') — миграция 20260625020100
select is(
  (select pg_get_expr(polqual, polrelid) ~ 'revision'
     from pg_policy
    where polname = 'requests_update'
      and polrelid = 'public.payment_requests'::regclass),
  true,
  'requests_update USING допускает revision (правка/переподача автором)'
);

select * from finish();
rollback;
