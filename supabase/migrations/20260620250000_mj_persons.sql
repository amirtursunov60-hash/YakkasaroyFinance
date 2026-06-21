-- ============================================================================
--  Зеркало сотрудников ManaJet (Person) — read-only справочник.
--  В operational `profiles` людей ManaJet вставить нельзя: profiles.id — FK на
--  auth.users (авторизованные пользователи). Поэтому отдельная таблица mj_*,
--  как для прочих сущностей ManaJet (см. 20260620230000_manajet_mirror.sql).
--  Наполняет Edge Function `manajet-sync` (сущность `persons`) под сервис-ролью.
-- ============================================================================
create table if not exists public.mj_persons (
  id          bigint generated always as identity primary key,
  mj_id       integer not null unique,
  name        text,
  first_name  text,
  last_name   text,
  is_disabled boolean,
  data        jsonb not null,
  synced_at   timestamptz not null default now()
);

alter table public.mj_persons enable row level security;
drop policy if exists mj_persons_read on public.mj_persons;
create policy mj_persons_read on public.mj_persons for select using (public.is_fin_admin());
