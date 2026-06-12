-- ============================================================================
-- 002 · Ядро: точки, валюты, способы оплаты, периоды ФП, счета ДС
-- (ТЗ v2 §4.1.1, §4.1.8, §5 — мультиточечность)
-- ============================================================================

-- ---------------------------------------------------------------- Точки сети
create table if not exists public.locations (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name       text not null,
  city       text,
  kind       text not null default 'restaurant' check (kind in ('tuyhona','restaurant','cafe')),
  status     text not null default 'active' check (status in ('active','construction','repair','closed')),
  manager_id uuid references public.profiles (id),
  in_archive boolean not null default false,
  outer_id   text,
  created_at timestamptz not null default now()
);
comment on table public.locations is 'Точка/филиал — первоклассная сущность (ТЗ v2 §5)';

-- ---------------------------------------------------------------- Валюты
create table if not exists public.currencies (
  code    text primary key,          -- 'TJS', 'USD', 'RUB'
  name    text not null,
  is_base boolean not null default false
);

-- ---------------------------------------------------------------- Способы оплаты
create table if not exists public.payment_types (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  in_archive boolean not null default false
);

-- ---------------------------------------------------------------- Периоды ФП
-- Финансовая неделя чт–ср (ТЗ v2 §4.1.1)
create table if not exists public.fp_periods (
  id         uuid primary key default gen_random_uuid(),
  date_start date not null unique,
  date_end   date not null,
  status     text not null default 'open' check (status in ('open','planning','closed')),
  created_at timestamptz not null default now()
);

-- Возвращает (создавая при необходимости) период чт–ср, содержащий дату d —
-- аналог autocreate у FpPlan в ManaJet.
create or replace function public.ensure_fp_period(d date)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  ps  date := d - ((extract(isodow from d)::int + 3) % 7);  -- четверг недели, содержащей d
  pid uuid;
begin
  insert into public.fp_periods (date_start, date_end)
  values (ps, ps + 6)
  on conflict (date_start) do nothing;
  select id into pid from public.fp_periods where date_start = ps;
  return pid;
end $$;

-- ---------------------------------------------------------------- Счета ДС
-- Кассы точек, банковские счета, карты, эквайринг (FpAsset в ManaJet).
-- Расчётный остаток счёта — производная реестра (fp_register), не хранится.
create table if not exists public.cash_accounts (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  currency_code text not null references public.currencies (code) default 'TJS',
  location_id   uuid references public.locations (id),
  kind          text not null default 'cash' check (kind in ('cash','bank','card','acquiring')),
  in_archive    boolean not null default false,
  outer_id      text,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------- RLS
alter table public.locations     enable row level security;
alter table public.currencies    enable row level security;
alter table public.payment_types enable row level security;
alter table public.fp_periods    enable row level security;
alter table public.cash_accounts enable row level security;

-- Чтение справочников — всем вошедшим; запись — финансовым ролям.
do $$
declare t text;
begin
  foreach t in array array['locations','currencies','payment_types','fp_periods','cash_accounts'] loop
    execute format('drop policy if exists %I_read  on public.%I', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format('create policy %I_read  on public.%I for select to authenticated using (true)', t, t);
    execute format('create policy %I_write on public.%I for all    to authenticated using (public.is_fin()) with check (public.is_fin())', t, t);
  end loop;
end $$;
