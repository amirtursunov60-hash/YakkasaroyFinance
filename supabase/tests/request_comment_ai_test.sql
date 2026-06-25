-- ============================================================================
-- pgTAP · ИИ-рецензент: request_comments.is_ai + author_id nullable
--
-- Запуск:  supabase test db   (на ветке/staging) либо pg_prove.
-- Проверки структурные — ничего не пишут, безопасно везде.
-- ============================================================================
begin;
select plan(3);

set search_path = extensions, public;

-- колонка-флаг добавлена
select has_column('public', 'request_comments', 'is_ai', 'request_comments.is_ai есть');

-- тип boolean
select col_type_is('public', 'request_comments', 'is_ai', 'boolean', 'is_ai — boolean');

-- author_id стал необязательным (ИИ-комментарий без живого автора)
select col_is_null('public', 'request_comments', 'author_id', 'author_id допускает NULL (ИИ-комментарий)');

select * from finish();
rollback;
