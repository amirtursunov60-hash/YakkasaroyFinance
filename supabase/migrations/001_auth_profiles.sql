-- ============================================================================
-- 001 · Профили и роли
-- Таблица profiles уже создавалась вручную через Supabase Dashboard.
-- Файл идемпотентен: фиксирует её структуру в git и добавляет RLS-политики.
-- Запускать безопасно даже на действующей базе.
-- ============================================================================

create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null default '',
  role       text not null default 'employee'
             check (role in ('owner','fin_director','ops_director','location_manager','accountant','employee')),
  phone      text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'Профили пользователей с ролью (ТЗ v2 §3)';

alter table public.profiles enable row level security;

-- Роль текущего пользователя. security definer — чтобы политики ниже могли
-- читать profiles без рекурсии RLS.
create or replace function public.app_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

-- Финансовые роли (полный доступ к блоку ФП)
create or replace function public.is_fin()
returns boolean
language sql stable
as $$
  select public.app_role() in ('owner','fin_director')
$$;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_fin());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select p.role from public.profiles p where p.id = auth.uid()));
-- роль себе менять нельзя; назначение ролей — владелец через Dashboard (пока)
