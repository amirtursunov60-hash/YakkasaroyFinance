-- ============================================================================
-- pgTAP · Богатые задачи (tasks.description + task_comments)
--
-- Запуск:  supabase test db   (на ветке/staging) либо pg_prove.
-- Проверки структурные — ничего не пишут, безопасно везде.
-- ============================================================================
begin;
select plan(7);

set search_path = extensions, public;

-- §3 — описание задачи
select has_column('public', 'tasks', 'description', 'tasks.description есть');

-- §6 — таблица комментариев и её колонки
select has_table('public', 'task_comments', 'таблица task_comments есть');
select has_column('public', 'task_comments', 'task_id', 'task_comments.task_id есть');
select has_column('public', 'task_comments', 'author_id', 'task_comments.author_id есть');
select has_column('public', 'task_comments', 'body', 'task_comments.body есть');

-- RLS включён и политики на месте
select is(
  (select relrowsecurity from pg_class where oid = 'public.task_comments'::regclass),
  true, 'RLS включён на task_comments'
);
select policies_are('public', 'task_comments',
  array['task_comments_read', 'task_comments_insert'],
  'политики чтения и вставки на task_comments');

select * from finish();
rollback;
