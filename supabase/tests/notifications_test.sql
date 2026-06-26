-- ============================================================================
-- pgTAP · In-app уведомления (notifications + триггеры)
--
-- Запуск:  supabase test db   (на ветке/staging) либо pg_prove.
-- Проверки структурные — ничего не пишут, безопасно везде.
-- ============================================================================
begin;
select plan(7);

set search_path = extensions, public;

-- таблица и ключевые колонки
select has_table('public', 'notifications', 'таблица notifications есть');
select has_column('public', 'notifications', 'user_id', 'notifications.user_id есть');
select has_column('public', 'notifications', 'is_read', 'notifications.is_read есть');

-- RLS включён
select is(
  (select relrowsecurity from pg_class where oid = 'public.notifications'::regclass),
  true, 'RLS включён на notifications'
);

-- триггер-функции наполнения
select has_function('public', 'trg_notify_request_comment', array[]::text[], 'trg_notify_request_comment() есть');
select has_function('public', 'trg_notify_request_decision', array[]::text[], 'trg_notify_request_decision() есть');

-- триггер на request_comments навешен
select has_trigger('public', 'request_comments', 'notify_request_comment', 'триггер notify_request_comment есть');

select * from finish();
rollback;
