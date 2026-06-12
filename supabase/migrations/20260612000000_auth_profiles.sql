-- ============================================================================
-- Yakkasaroy Management System — схема авторизации (Supabase)
-- Применяется автоматически: npm run db:push (Supabase CLI, см. README).
-- ============================================================================

-- Роли из ТЗ §2 (значения совпадают с ROLE_LABELS в src/components/AppShell.jsx)
create type public.user_role as enum (
  'owner',            -- Владелец (Учредитель)
  'fin_director',     -- Финансовый директор
  'ops_director',     -- Операционный директор / Куратор
  'location_manager', -- Управляющий точкой
  'accountant',       -- Бухгалтер
  'employee'          -- Сотрудник
);

-- Профили пользователей: 1-к-1 с auth.users
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null default '',
  role       public.user_role not null default 'employee',
  phone      text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Профили сотрудников с ролью (ТЗ §2)';

-- Автосоздание профиля при регистрации пользователя.
-- Самый первый пользователь автоматически становится владельцем —
-- ручной SQL для назначения администратора не нужен.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when exists (select 1 from public.profiles)
         then 'employee'::public.user_role
         else 'owner'::public.user_role end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Профили для пользователей, созданных до применения этой миграции:
-- самый ранний из них становится владельцем.
insert into public.profiles (id, full_name, role)
select u.id,
       coalesce(u.raw_user_meta_data ->> 'full_name', ''),
       case when u.id = (select id from auth.users order by created_at limit 1)
            then 'owner'::public.user_role
            else 'employee'::public.user_role end
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- Поддержка updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ============================================================================
-- RLS: пользователь видит свой профиль; владелец и финдиректор — все.
-- Менять роль/активность может только владелец или финдиректор.
-- ============================================================================
alter table public.profiles enable row level security;

-- Явный доступ для вошедших пользователей (новые проекты Supabase
-- не выдают GRANT автоматически); строки фильтрует RLS ниже.
grant select, update on table public.profiles to authenticated;

-- Проверка «является ли текущий пользователь админом» без рекурсии RLS
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('owner', 'fin_director')
      and is_active
  );
$$;

create policy "profiles: свой профиль виден"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles: админ видит всех"
  on public.profiles for select
  using (public.is_admin());

create policy "profiles: свой профиль можно обновлять"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "profiles: админ обновляет всех"
  on public.profiles for update
  using (public.is_admin())
  with check (public.is_admin());

-- Роль и активность может менять только админ (RLS не ограничивает колонки)
create or replace function public.guard_profile_fields()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if (new.role is distinct from old.role
      or new.is_active is distinct from old.is_active)
     and not public.is_admin() then
    raise exception 'Менять роль и активность может только владелец или финдиректор';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_fields
  before update on public.profiles
  for each row execute function public.guard_profile_fields();

-- ============================================================================
-- Роли остальных сотрудников владелец/финдиректор меняют без SQL:
-- Supabase Studio → Table Editor → profiles → колонка role.
-- ============================================================================
