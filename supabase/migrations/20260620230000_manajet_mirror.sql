-- ============================================================================
--  Зеркало ManaJet (mj_*) — read-only копии боевых данных ManaJet для обкатки
--  (2–3 недели до запуска своей платформы). НЕ трогает операционный финконтур
--  и его триггеры-инварианты: заявки/счета/фонды/статистики ManaJet складываются
--  в отдельные таблицы и показываются на экране «ManaJet (зеркало)».
--
--  Наполняет Edge Function `manajet-sync` (сервис-роль, обходит RLS); читают
--  только финадмины (owner/fin_director). Ключ синхронизации — id записи ManaJet
--  (mj_id). Кроме плоских колонок для фильтров/таблиц храним сырой объект (data).
--  См. docs/manajet-анализ-и-интеграция.md (часть D) и docs/manajet-api-recon.md.
-- ============================================================================

-- ---------------------------------------------------------------- Фонды
create table if not exists public.mj_funds (
  id          bigint generated always as identity primary key,
  mj_id       integer not null unique,
  number      text,
  name        text,
  in_archive  boolean default false,
  data        jsonb not null,
  synced_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------- Периоды ФП
create table if not exists public.mj_periods (
  id                      bigint generated always as identity primary key,
  mj_id                   integer not null unique,
  date_from               timestamptz,
  date_to                 timestamptz,
  is_executive_confirmed  boolean,
  is_baf_confirmed        boolean,
  data                    jsonb not null,
  synced_at               timestamptz not null default now()
);

-- ---------------------------------------------------- Заявки (ЗРС / PurchaseOrder)
create table if not exists public.mj_purchase_orders (
  id               bigint generated always as identity primary key,
  mj_id            integer not null unique,
  name             text,
  status           integer,
  fund_name        text,
  expense_name     text,
  position_name    text,
  planned_value    numeric,
  confirmed_value  numeric,
  payed_amount     numeric,
  csw_data         text,
  csw_situation    text,
  csw_solution     text,
  data             jsonb not null,
  synced_at        timestamptz not null default now()
);

-- ---------------------------------------------------- Счета поставщиков (Bill)
create table if not exists public.mj_bills (
  id               bigint generated always as identity primary key,
  mj_id            integer not null unique,
  seria            text,
  number           text,
  doc_date         timestamptz,
  company_name     text,
  expense_name     text,
  total_amount     numeric,
  payed_amount     numeric,
  remaining_amount numeric,
  marked_payed     boolean,
  planned_date     timestamptz,
  data             jsonb not null,
  synced_at        timestamptz not null default now()
);

-- ---------------------------------------------------- Счета клиентам (Invoice)
create table if not exists public.mj_invoices (
  id               bigint generated always as identity primary key,
  mj_id            integer not null unique,
  seria            text,
  number           text,
  doc_date         timestamptz,
  company_name     text,
  total_amount     numeric,
  payed_amount     numeric,
  remaining_amount numeric,
  data             jsonb not null,
  synced_at        timestamptz not null default now()
);

-- ---------------------------------------------------- Операции дохода (FpIncome)
create table if not exists public.mj_incomes (
  id                bigint generated always as identity primary key,
  mj_id             integer not null unique,
  date_operation    timestamptz,
  amount            numeric,
  income_type_name  text,
  company_name      text,
  payment_type_name text,
  period_mj_id      integer,
  data              jsonb not null,
  synced_at         timestamptz not null default now()
);

-- ---------------------------------------------------- Статистики (Stat)
create table if not exists public.mj_stats (
  id             bigint generated always as identity primary key,
  mj_id          integer not null unique,
  name           text,
  unit           text,
  stat_type      integer,
  min_val        numeric,
  max_val        numeric,
  sign           boolean,
  period         integer,
  position_name  text,
  data           jsonb not null,
  synced_at      timestamptz not null default now()
);

-- ---------------------------------------- Значения статистик (StatValue, без id)
create table if not exists public.mj_stat_values (
  id            bigint generated always as identity primary key,
  stat_mj_id    integer not null,
  period_begin  timestamptz not null,
  period_end    timestamptz not null,
  is_quota      boolean not null default false,
  amount        numeric,
  description   text,
  data          jsonb not null,
  synced_at     timestamptz not null default now(),
  unique (stat_mj_id, period_begin, period_end, is_quota)
);

-- ---------------------------------------------------- Посты оргсхемы (OrgBoardPosition)
create table if not exists public.mj_positions (
  id           bigint generated always as identity primary key,
  mj_id        integer not null unique,
  full_number  text,
  name         text,
  person_name  text,
  functional   text,
  in_archive   boolean default false,
  data         jsonb not null,
  synced_at    timestamptz not null default now()
);

-- ---------------------------------------------------- Контрагенты (Company)
create table if not exists public.mj_companies (
  id                 bigint generated always as identity primary key,
  mj_id              integer not null unique,
  name               text,
  is_customer        boolean,
  is_vendor          boolean,
  is_private_person  boolean,
  data               jsonb not null,
  synced_at          timestamptz not null default now()
);

-- ---------------------------------------------------- Журнал синхронизаций
create table if not exists public.mj_sync_log (
  id          bigint generated always as identity primary key,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  ok          boolean,
  trigger     text,                 -- 'manual' | 'cron'
  entities    jsonb,                -- {fund: {fetched, upserted}, ...}
  error       text
);

-- Индексы под типичные сортировки/фильтры экрана зеркала
create index if not exists mj_purchase_orders_status_idx on public.mj_purchase_orders (status);
create index if not exists mj_bills_doc_date_idx on public.mj_bills (doc_date desc);
create index if not exists mj_invoices_doc_date_idx on public.mj_invoices (doc_date desc);
create index if not exists mj_incomes_date_idx on public.mj_incomes (date_operation desc);
create index if not exists mj_stat_values_stat_idx on public.mj_stat_values (stat_mj_id, period_begin desc);

-- ---------------------------------------------------------------- RLS
-- Чтение — только финадмины (owner/fin_director). Запись делает Edge Function
-- под сервис-ролью (обходит RLS), поэтому INSERT/UPDATE/DELETE-политик нет.
do $$
declare t text;
begin
  foreach t in array array[
    'mj_funds','mj_periods','mj_purchase_orders','mj_bills','mj_invoices',
    'mj_incomes','mj_stats','mj_stat_values','mj_positions','mj_companies','mj_sync_log'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t||'_read', t);
    execute format(
      'create policy %I on public.%I for select using (public.is_fin_admin());',
      t||'_read', t);
  end loop;
end $$;
