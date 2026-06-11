-- ============================================================================
-- 003 · Финансовый контур: фонды, виды дохода/расхода, правила распределения,
--       операции дохода, Реестр (леджер)
-- Принципы ТЗ v2 §2.3: Реестр — источник истины; доход сразу указывает
-- счёт ДС и способ оплаты; этап распределения — свойство правила, не фонда.
-- ============================================================================

-- ---------------------------------------------------------------- Фонды (ФД)
create table if not exists public.funds (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,       -- 'FD1', 'FD9/1' (нормализация — utils/funds.js)
  name          text not null,
  kind          text not null default 'working' check (kind in ('working','reserve')), -- рабочий / накопительный
  is_restricted boolean not null default false,  -- закрытые фонды: ФД5, ФД6, ФД7 (ТЗ v2 §4.1.4)
  location_id   uuid references public.locations (id),
  sort          int not null default 0,
  in_archive    boolean not null default false,
  outer_id      text,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------- Виды дохода (D-коды)
create table if not exists public.income_types (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,         -- 'D1', 'D1/3', 'D1.1' — коды прототипа
  name        text not null,
  parent_id   uuid references public.income_types (id),
  location_id uuid references public.locations (id),
  color       text,
  sort        int not null default 0,
  in_archive  boolean not null default false,
  outer_id    text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- Статьи расхода (РД)
create table if not exists public.expense_types (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,         -- 'РД1', 'РД9/5'
  name        text not null,
  parent_id   uuid references public.expense_types (id),
  location_id uuid references public.locations (id),
  color       text,
  sort        int not null default 0,
  in_archive  boolean not null default false,
  outer_id    text,
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------- Правила распределения
-- Этап — свойство правила (ФД6 пополняется с двух этапов).
-- income_type_id is null — схема по умолчанию для всех видов дохода.
create table if not exists public.distribution_rules (
  id             uuid primary key default gen_random_uuid(),
  income_type_id uuid references public.income_types (id),
  fund_id        uuid not null references public.funds (id),
  stage          text not null check (stage in ('revenue','margin','adjusted')),
  percent        numeric(6,3),
  fixed_amount   numeric(14,2),
  priority       int not null default 0,
  in_archive     boolean not null default false,
  unique nulls not distinct (income_type_id, fund_id, stage),
  check (percent is not null or fixed_amount is not null)
);

-- ---------------------------------------------------------------- Операции дохода
create table if not exists public.incomes (
  id              uuid primary key default gen_random_uuid(),
  income_type_id  uuid not null references public.income_types (id),
  fp_period_id    uuid not null references public.fp_periods (id),
  location_id     uuid references public.locations (id),
  cash_account_id uuid not null references public.cash_accounts (id),  -- куда физически пришли деньги
  payment_type_id uuid not null references public.payment_types (id),
  currency_code   text not null references public.currencies (code) default 'TJS',
  amount          numeric(14,2) not null check (amount >= 0),
  is_return       boolean not null default false,   -- возврат клиенту уменьшает доход
  happened_on     date not null default current_date,
  doc_ref         text,                              -- документ-основание
  counterparty    text,                              -- контрагент (этап 2: ссылка на counterparties)
  note            text,
  created_by      uuid references public.profiles (id) default auth.uid(),
  outer_id        text,                              -- для iiko/импорта
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------- Реестр (леджер)
-- Единая лента всех операций ФП. Балансы фондов и счетов ДС — суммы по реестру.
-- amount: положительное — приход, отрицательное — расход.
create table if not exists public.fp_register (
  id              uuid primary key default gen_random_uuid(),
  op_type         text not null check (op_type in
    ('income','request_payment','bill_payment','transfer','loan','loan_return',
     'exchange','adjustment','out_of_fp')),
  amount          numeric(14,2) not null,
  currency_code   text not null references public.currencies (code) default 'TJS',
  fund_id         uuid references public.funds (id),
  cash_account_id uuid references public.cash_accounts (id),
  income_id       uuid references public.incomes (id) on delete cascade,
  fp_period_id    uuid not null references public.fp_periods (id),
  location_id     uuid references public.locations (id),
  note            text,
  created_by      uuid references public.profiles (id) default auth.uid(),
  created_at      timestamptz not null default now()
);
create index if not exists fp_register_fund_idx    on public.fp_register (fund_id);
create index if not exists fp_register_account_idx on public.fp_register (cash_account_id);
create index if not exists fp_register_period_idx  on public.fp_register (fp_period_id);

-- ------------------------------------------------- Операции в закрытом периоде запрещены
create or replace function public.assert_period_open()
returns trigger
language plpgsql
set search_path = public
as $$
declare pid uuid := coalesce(new.fp_period_id, old.fp_period_id);
begin
  if exists (select 1 from public.fp_periods where id = pid and status = 'closed') then
    raise exception 'Период ФП закрыт — операции запрещены';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_incomes_period_open on public.incomes;
create trigger trg_incomes_period_open
  before insert or update or delete on public.incomes
  for each row execute function public.assert_period_open();

-- ------------------------------------------------- Доход → запись в реестре
-- Контроль средств — производная от привязок дохода (принцип №1 ТЗ v2 §2.3).
create or replace function public.sync_income_register()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.fp_register
      (op_type, amount, currency_code, cash_account_id, income_id, fp_period_id, location_id, note, created_by)
    values
      ('income', case when new.is_return then -new.amount else new.amount end,
       new.currency_code, new.cash_account_id, new.id, new.fp_period_id, new.location_id, new.note, new.created_by);
  else
    update public.fp_register set
      amount          = case when new.is_return then -new.amount else new.amount end,
      currency_code   = new.currency_code,
      cash_account_id = new.cash_account_id,
      fp_period_id    = new.fp_period_id,
      location_id     = new.location_id
    where income_id = new.id and op_type = 'income';
  end if;
  return new;
end $$;

drop trigger if exists trg_income_register on public.incomes;
create trigger trg_income_register
  after insert or update on public.incomes
  for each row execute function public.sync_income_register();

-- ---------------------------------------------------------------- RLS
alter table public.funds              enable row level security;
alter table public.income_types      enable row level security;
alter table public.expense_types     enable row level security;
alter table public.distribution_rules enable row level security;
alter table public.incomes           enable row level security;
alter table public.fp_register       enable row level security;

-- Справочники: чтение всем вошедшим (закрытые фонды — только финролям), запись — финролям
do $$
declare t text;
begin
  foreach t in array array['income_types','expense_types','distribution_rules'] loop
    execute format('drop policy if exists %I_read  on public.%I', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format('create policy %I_read  on public.%I for select to authenticated using (true)', t, t);
    execute format('create policy %I_write on public.%I for all    to authenticated using (public.is_fin()) with check (public.is_fin())', t, t);
  end loop;
end $$;

drop policy if exists funds_read  on public.funds;
drop policy if exists funds_write on public.funds;
create policy funds_read on public.funds
  for select to authenticated
  using (not is_restricted or public.is_fin());
create policy funds_write on public.funds
  for all to authenticated using (public.is_fin()) with check (public.is_fin());

-- Доходы: видят все вошедшие; вводят управляющие/бухгалтер/финроли; правят финроли
drop policy if exists incomes_read   on public.incomes;
drop policy if exists incomes_insert on public.incomes;
drop policy if exists incomes_write  on public.incomes;
create policy incomes_read on public.incomes
  for select to authenticated using (true);
create policy incomes_insert on public.incomes
  for insert to authenticated
  with check (public.app_role() in ('owner','fin_director','location_manager','accountant'));
create policy incomes_write on public.incomes
  for update to authenticated using (public.is_fin()) with check (public.is_fin());
drop policy if exists incomes_delete on public.incomes;
create policy incomes_delete on public.incomes
  for delete to authenticated using (public.is_fin());

-- Реестр: чтение всем вошедшим; прямая запись — финролям (доходы пишутся триггером)
drop policy if exists fp_register_read  on public.fp_register;
drop policy if exists fp_register_write on public.fp_register;
create policy fp_register_read on public.fp_register
  for select to authenticated using (true);
create policy fp_register_write on public.fp_register
  for all to authenticated using (public.is_fin()) with check (public.is_fin());
