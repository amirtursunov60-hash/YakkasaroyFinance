-- Богатые задачи (gap-map Задачи §3, §6): описание задачи + тред комментариев.
-- Образец треда — request_comments (заявки ЗРС). Описание — аддитивная nullable
-- колонка; комментарии — отдельная таблица с RLS «видно тому, кто видит задачу».

-- §3 — описание задачи
alter table public.tasks add column if not exists description text;

-- §6 — комментарии к задаче
create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid references public.profiles(id),   -- nullable: задел под системные/ИИ-комментарии
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists task_comments_task_idx on public.task_comments(task_id, created_at);

alter table public.task_comments enable row level security;

-- читать комментарии может тот, кому видна сама задача (через её RLS)
drop policy if exists task_comments_read on public.task_comments;
create policy task_comments_read on public.task_comments as permissive for select to public
  using (exists (select 1 from public.tasks t where t.id = task_comments.task_id));

-- писать — только от своего имени
drop policy if exists task_comments_insert on public.task_comments;
create policy task_comments_insert on public.task_comments as permissive for insert to public
  with check (author_id = (select auth.uid()));

grant select, insert on public.task_comments to authenticated;
