-- Справочник контрагентов: категории + контакты (gap-map Стат/Контр §16–18).
-- Раньше контрагент имел только name/phone/inn и создавался «на лету».
-- Добавляем категории (CompanyCategory) и множественные контакты
-- (CompanyContact: телефоны/почта). Архив (§23) уже есть — is_archived.

-- ── 1. Категории контрагентов ──────────────────────────────────────────────
create table if not exists public.counterparty_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text,
  outer_id text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.counterparty_categories enable row level security;

drop policy if exists cpcat_read on public.counterparty_categories;
create policy cpcat_read on public.counterparty_categories for select using (true);

drop policy if exists cpcat_insert on public.counterparty_categories;
create policy cpcat_insert on public.counterparty_categories for insert
  with check (my_role() = any (array['owner','fin_director','accountant','location_manager','ops_director']::app_role[]));

drop policy if exists cpcat_update on public.counterparty_categories;
create policy cpcat_update on public.counterparty_categories for update
  using (is_fin_admin() or my_role() = 'accountant'::app_role);

-- Категория у контрагента
alter table public.counterparties add column if not exists category_id uuid references public.counterparty_categories(id);
create index if not exists counterparties_category_id_idx on public.counterparties(category_id);

-- ── 2. Контакты контрагента (несколько телефонов/почт) ─────────────────────
create table if not exists public.counterparty_contacts (
  id uuid primary key default gen_random_uuid(),
  counterparty_id uuid not null references public.counterparties(id) on delete cascade,
  kind text not null default 'phone',          -- phone | email | other
  value text not null,
  label text,                                   -- «директор», «бухгалтерия»…
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists counterparty_contacts_cp_id_idx on public.counterparty_contacts(counterparty_id);
alter table public.counterparty_contacts enable row level security;

drop policy if exists cpcon_read on public.counterparty_contacts;
create policy cpcon_read on public.counterparty_contacts for select using (true);

drop policy if exists cpcon_insert on public.counterparty_contacts;
create policy cpcon_insert on public.counterparty_contacts for insert
  with check (my_role() = any (array['owner','fin_director','accountant','location_manager','ops_director']::app_role[]));

drop policy if exists cpcon_update on public.counterparty_contacts;
create policy cpcon_update on public.counterparty_contacts for update
  using (is_fin_admin() or my_role() = 'accountant'::app_role);

drop policy if exists cpcon_delete on public.counterparty_contacts;
create policy cpcon_delete on public.counterparty_contacts for delete
  using (is_fin_admin() or my_role() = 'accountant'::app_role);
