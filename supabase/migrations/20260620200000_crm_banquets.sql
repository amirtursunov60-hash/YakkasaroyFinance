-- CRM банкетов (ТЗ v2 §4 · CRM, этап 3): воронка заявок, база клиентов, залы и
-- брони. Перевод модуля crm с моков (src/data/crm.js) на реальные данные.
-- Брони залов — производная от заявок (зал + дата + этап), отдельной таблицы нет.
-- Новые таблицы с RLS на родных функциях прав; справочник залов — стартовые данные.

-- Этапы воронки банкетов (src/data/crm.js · CRM_STAGES)
do $$ begin
  if not exists (select 1 from pg_type where typname = 'crm_lead_stage') then
    create type crm_lead_stage as enum ('new', 'show', 'offer', 'contract', 'won', 'lost');
  end if;
end $$;

-- ---------------------------------------------------------------- Залы
create table if not exists public.crm_halls (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location_id uuid references locations(id),
  capacity int,                       -- вместимость, гостей (nullable)
  sort int not null default 0,
  outer_id uuid,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
alter table public.crm_halls enable row level security;

-- ---------------------------------------------------------------- База клиентов
create table if not exists public.crm_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  tag text,                           -- VIP / Повторный / Новый (свободная метка)
  location_id uuid references locations(id),
  note text,
  outer_id uuid,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
alter table public.crm_clients enable row level security;

-- ---------------------------------------------------------------- Воронка заявок
create table if not exists public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,                 -- отображаемое имя заявки/клиента
  client_id uuid references crm_clients(id),
  phone text,
  event_type text,                    -- Свадьба / Туй / Оши нахор / Юбилей / Корпоратив
  hall_id uuid references crm_halls(id),
  location_id uuid references locations(id),
  event_date date,
  guests int not null default 0,
  budget numeric(14,2) not null default 0,
  stage crm_lead_stage not null default 'new',
  source text,                        -- источник: Instagram / Звонок / Рекомендация…
  note text,
  outer_id uuid,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
alter table public.crm_leads enable row level security;

-- ---------------------------------------------------------------- RLS
-- Чтение: финадмин, сетевые записи (location_id is null) или своя точка.
-- Запись: финадмин или доступ к точке записи (менеджеры продаж точки).
do $$ begin
  -- crm_halls
  if not exists (select 1 from pg_policies where tablename = 'crm_halls' and policyname = 'crm_halls_read') then
    create policy "crm_halls_read" on public.crm_halls for select
      using ( (select is_fin_admin()) or location_id is null or has_location_access(location_id) );
  end if;
  if not exists (select 1 from pg_policies where tablename = 'crm_halls' and policyname = 'crm_halls_insert') then
    create policy "crm_halls_insert" on public.crm_halls for insert
      with check ( (select is_fin_admin()) or location_id is null or has_location_access(location_id) );
  end if;
  if not exists (select 1 from pg_policies where tablename = 'crm_halls' and policyname = 'crm_halls_update') then
    create policy "crm_halls_update" on public.crm_halls for update
      using ( (select is_fin_admin()) or location_id is null or has_location_access(location_id) );
  end if;
  -- crm_clients
  if not exists (select 1 from pg_policies where tablename = 'crm_clients' and policyname = 'crm_clients_read') then
    create policy "crm_clients_read" on public.crm_clients for select
      using ( (select is_fin_admin()) or location_id is null or has_location_access(location_id) );
  end if;
  if not exists (select 1 from pg_policies where tablename = 'crm_clients' and policyname = 'crm_clients_insert') then
    create policy "crm_clients_insert" on public.crm_clients for insert
      with check ( (select is_fin_admin()) or location_id is null or has_location_access(location_id) );
  end if;
  if not exists (select 1 from pg_policies where tablename = 'crm_clients' and policyname = 'crm_clients_update') then
    create policy "crm_clients_update" on public.crm_clients for update
      using ( (select is_fin_admin()) or location_id is null or has_location_access(location_id) );
  end if;
  -- crm_leads
  if not exists (select 1 from pg_policies where tablename = 'crm_leads' and policyname = 'crm_leads_read') then
    create policy "crm_leads_read" on public.crm_leads for select
      using ( (select is_fin_admin()) or location_id is null or has_location_access(location_id) );
  end if;
  if not exists (select 1 from pg_policies where tablename = 'crm_leads' and policyname = 'crm_leads_insert') then
    create policy "crm_leads_insert" on public.crm_leads for insert
      with check ( (select is_fin_admin()) or location_id is null or has_location_access(location_id) );
  end if;
  if not exists (select 1 from pg_policies where tablename = 'crm_leads' and policyname = 'crm_leads_update') then
    create policy "crm_leads_update" on public.crm_leads for update
      using ( (select is_fin_admin()) or location_id is null or has_location_access(location_id) );
  end if;
end $$;

-- ---------------------------------------------------------------- Индексы по FK
create index if not exists crm_halls_location_idx on public.crm_halls(location_id);
create index if not exists crm_clients_location_idx on public.crm_clients(location_id);
create index if not exists crm_leads_location_idx on public.crm_leads(location_id);
create index if not exists crm_leads_hall_idx on public.crm_leads(hall_id);
create index if not exists crm_leads_client_idx on public.crm_leads(client_id);
create index if not exists crm_leads_stage_idx on public.crm_leads(stage);
create index if not exists crm_leads_event_date_idx on public.crm_leads(event_date);

-- ---------------------------------------------------------------- Стартовые залы
-- Справочник залов прототипа (src/data/crm.js · HALLS). Сетевые (location_id null),
-- привязку к точке настроить позже. Идемпотентно — по совпадению имени.
insert into public.crm_halls (name, sort)
select v.name, v.sort from (values
  ('ВИП зал', 1), ('ЛЮКС зал', 2), ('Grand Hall Марказ', 3),
  ('Fly Garden', 4), ('Фемали 1', 5), ('Фемали 2', 6)
) as v(name, sort)
where not exists (select 1 from public.crm_halls h where h.name = v.name);
