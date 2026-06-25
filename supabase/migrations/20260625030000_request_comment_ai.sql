-- ИИ-рецензент в треде заявки (request_comments): комментарии от ИИ не имеют
-- живого автора. author_id делаем необязательным; добавляем флаг is_ai.
--
-- ИИ-комментарии пишет Edge Function request-ai-review под сервис-ролью (в обход
-- RLS), поэтому политики не меняем: req_comments_insert (author_id = auth.uid())
-- остаётся для людей, а req_comments_read (доступ к заявке) уже позволяет видеть
-- и ИИ-комментарии в треде.

alter table public.request_comments alter column author_id drop not null;
alter table public.request_comments add column if not exists is_ai boolean not null default false;
comment on column public.request_comments.is_ai is 'Комментарий от ИИ-рецензента ЗРС (author_id = null), пишется Edge Function request-ai-review';
