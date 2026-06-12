-- Baseline-снимок схемы базы YakkasaroyFinance по состоянию на 2026-06-12.
-- Схема изначально создавалась вручную через SQL-редактор Supabase;
-- этот файл фиксирует её целиком, чтобы dev-ветки и развёртывание с нуля
-- воспроизводили базу. На продакшене НЕ выполнялся (объекты уже существуют) —
-- зарегистрирован в supabase_migrations.schema_migrations как применённый.

set check_function_bodies = off;

-- ============================================================
-- Расширения
-- ============================================================
create extension if not exists pg_stat_statements with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault with schema vault;

-- ============================================================
-- Типы (enum)
-- ============================================================
create type public.app_role as enum ('owner', 'fin_director', 'ops_director', 'location_manager', 'accountant', 'employee');
create type public.cash_account_type as enum ('cash', 'bank', 'card', 'acquiring');
create type public.distribution_stage as enum ('revenue', 'margin', 'adjusted');
create type public.fund_kind as enum ('working', 'accumulative');
create type public.location_status as enum ('active', 'construction', 'renovation', 'closed');
create type public.location_type as enum ('tuyhona', 'restaurant', 'cafe');
create type public.period_status as enum ('open', 'planning', 'closed');
create type public.register_op_type as enum ('income', 'income_return', 'distribution', 'request_payment', 'fund_transfer', 'fund_loan', 'fund_loan_return', 'fx_exchange', 'cash_transfer', 'off_plan', 'adjustment');
create type public.request_status as enum ('submitted', 'planning', 'approved', 'rejected', 'paid');

-- ============================================================
-- Таблицы
-- ============================================================
create table public.audit_log (
  id bigint generated always as identity not null,
  user_id uuid,
  action text not null,
  table_name text not null,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamp with time zone not null default now()
);

create table public.cash_account_folders (
  id uuid not null default gen_random_uuid(),
  name text not null,
  parent_id uuid
);

create table public.cash_accounts (
  id uuid not null default gen_random_uuid(),
  name text not null,
  type cash_account_type not null,
  folder_id uuid,
  location_id uuid,
  currency_id uuid not null,
  balance numeric(14,2) not null default 0,
  outer_id text,
  is_archived boolean not null default false
);

create table public.counterparties (
  id uuid not null default gen_random_uuid(),
  name text not null,
  is_supplier boolean not null default false,
  is_client boolean not null default false,
  phone text,
  inn text,
  comment text,
  outer_id text,
  is_archived boolean not null default false,
  created_at timestamp with time zone not null default now()
);

create table public.currencies (
  id uuid not null default gen_random_uuid(),
  code text not null,
  name text not null,
  is_base boolean not null default false
);

create table public.directives (
  id uuid not null default gen_random_uuid(),
  period_id uuid not null,
  total_income numeric(14,2) not null default 0,
  protocol jsonb,
  conducted_by uuid not null,
  conducted_at timestamp with time zone not null default now()
);

create table public.distribution_rules (
  id uuid not null default gen_random_uuid(),
  income_type_id uuid,
  fund_id uuid not null,
  stage distribution_stage not null,
  percent numeric(6,3),
  fixed_amount numeric(14,2),
  priority integer not null default 0,
  is_archived boolean not null default false
);

create table public.exchange_rates (
  id uuid not null default gen_random_uuid(),
  from_cur_id uuid not null,
  to_cur_id uuid not null,
  rate numeric(14,6) not null,
  valid_from date not null,
  created_by uuid
);

create table public.expense_type_access (
  user_id uuid not null,
  expense_type_id uuid not null
);

create table public.expense_types (
  id uuid not null default gen_random_uuid(),
  code text,
  name text not null,
  parent_id uuid,
  location_id uuid,
  outer_id text,
  is_archived boolean not null default false
);

create table public.fp_periods (
  id uuid not null default gen_random_uuid(),
  starts_on date not null,
  ends_on date not null,
  status period_status not null default 'open'::period_status,
  closed_at timestamp with time zone,
  closed_by uuid
);

create table public.fp_register (
  id bigint generated always as identity not null,
  op_type register_op_type not null,
  period_id uuid,
  fund_id uuid,
  fund_amount numeric(14,2),
  cash_account_id uuid,
  cash_amount numeric(14,2),
  pair_id uuid,
  loan_parent_id bigint,
  income_id uuid,
  request_id uuid,
  counterparty_id uuid,
  payment_type_id uuid,
  currency_id uuid,
  fx_rate numeric(14,6),
  comment text,
  created_by uuid not null,
  created_at timestamp with time zone not null default now()
);

create table public.fund_access (
  user_id uuid not null,
  fund_id uuid not null
);

create table public.fund_folders (
  id uuid not null default gen_random_uuid(),
  name text not null,
  parent_id uuid
);

create table public.funds (
  id uuid not null default gen_random_uuid(),
  code text not null,
  name text not null,
  kind fund_kind not null default 'working'::fund_kind,
  folder_id uuid,
  location_id uuid,
  currency_id uuid not null,
  is_restricted boolean not null default false,
  balance numeric(14,2) not null default 0,
  outer_id text,
  is_archived boolean not null default false,
  created_at timestamp with time zone not null default now()
);

create table public.income_types (
  id uuid not null default gen_random_uuid(),
  code text,
  name text not null,
  parent_id uuid,
  location_id uuid,
  outer_id text,
  is_archived boolean not null default false
);

create table public.incomes (
  id uuid not null default gen_random_uuid(),
  income_type_id uuid not null,
  location_id uuid not null,
  period_id uuid not null,
  amount numeric(14,2) not null,
  currency_id uuid not null,
  amount_base numeric(14,2) not null,
  received_on date not null,
  cash_account_id uuid not null,
  payment_type_id uuid not null,
  counterparty_id uuid,
  invoice_id uuid,
  is_return boolean not null default false,
  is_distributed boolean not null default false,
  source text not null default 'manual'::text,
  outer_id text,
  comment text,
  created_by uuid not null,
  created_at timestamp with time zone not null default now()
);

create table public.invites (
  id uuid not null default gen_random_uuid(),
  token text not null default encode(gen_random_bytes(24), 'hex'::text),
  role app_role not null default 'employee'::app_role,
  location_id uuid,
  position_id uuid,
  created_by uuid not null,
  expires_at timestamp with time zone not null default (now() + '7 days'::interval),
  used_by uuid,
  used_at timestamp with time zone
);

create table public.locations (
  id uuid not null default gen_random_uuid(),
  name text not null,
  city text not null,
  type location_type not null,
  status location_status not null default 'active'::location_status,
  manager_id uuid,
  outer_id text,
  is_archived boolean not null default false,
  created_at timestamp with time zone not null default now()
);

create table public.org_divisions (
  id uuid not null default gen_random_uuid(),
  code text not null,
  name text not null,
  sort integer not null default 0
);

create table public.org_positions (
  id uuid not null default gen_random_uuid(),
  code text not null,
  name text not null,
  division_id uuid,
  location_id uuid,
  parent_id uuid,
  outer_id text,
  is_archived boolean not null default false
);

create table public.payment_requests (
  id uuid not null default gen_random_uuid(),
  number bigint generated always as identity not null,
  position_id uuid not null,
  requester_id uuid not null,
  location_id uuid not null,
  expense_type_id uuid not null,
  fund_id uuid,
  period_id uuid,
  planned_amount numeric(14,2) not null,
  currency_id uuid not null,
  payment_type_id uuid,
  counterparty_id uuid,
  csw_data text not null,
  csw_situation text not null,
  csw_solution text not null,
  status request_status not null default 'submitted'::request_status,
  decided_by uuid,
  decided_at timestamp with time zone,
  rejection_reason text,
  outer_id text,
  created_at timestamp with time zone not null default now()
);

create table public.payment_types (
  id uuid not null default gen_random_uuid(),
  name text not null,
  outer_id text,
  is_archived boolean not null default false
);

create table public.period_distribution_overrides (
  period_id uuid not null,
  rule_id uuid not null,
  percent numeric(6,3),
  fixed_amount numeric(14,2)
);

create table public.position_assignments (
  person_id uuid not null,
  position_id uuid not null,
  is_main boolean not null default false,
  is_holder boolean not null default true
);

create table public.profiles (
  id uuid not null,
  full_name text not null,
  phone text,
  role app_role not null default 'employee'::app_role,
  outer_id text,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now()
);

create table public.reconciliations (
  id uuid not null default gen_random_uuid(),
  cash_account_id uuid not null,
  period_id uuid not null,
  actual_balance numeric(14,2) not null,
  system_balance numeric(14,2) not null,
  difference numeric(14,2) generated always as ((actual_balance - system_balance)) stored,
  comment text,
  created_by uuid not null,
  created_at timestamp with time zone not null default now()
);

create table public.request_attachments (
  id uuid not null default gen_random_uuid(),
  request_id uuid not null,
  file_path text not null,
  file_name text not null,
  uploaded_by uuid not null,
  created_at timestamp with time zone not null default now()
);

create table public.request_comments (
  id uuid not null default gen_random_uuid(),
  request_id uuid not null,
  author_id uuid not null,
  body text not null,
  created_at timestamp with time zone not null default now()
);

create table public.statistic_values (
  id uuid not null default gen_random_uuid(),
  statistic_id uuid not null,
  period_id uuid not null,
  value numeric(16,2) not null,
  is_quota boolean not null default false,
  entered_by uuid,
  created_at timestamp with time zone not null default now()
);

create table public.statistics (
  id uuid not null default gen_random_uuid(),
  name text not null,
  unit text,
  invert boolean not null default false,
  location_id uuid,
  position_id uuid,
  owner_id uuid,
  is_auto boolean not null default false,
  source text,
  outer_id text,
  is_archived boolean not null default false
);

create table public.user_location_access (
  user_id uuid not null,
  location_id uuid not null
);

-- ============================================================
-- Функции
-- ============================================================
CREATE OR REPLACE FUNCTION public.fp_close_period(p_period_id uuid, p_protocol jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_status period_status;
  v_income numeric;
  v_ends   date;
begin
  if not is_fin_admin() then
    raise exception 'Закрывать период может только финдиректор или владелец';
  end if;

  select status, ends_on into v_status, v_ends from fp_periods where id = p_period_id;
  if v_status is null then
    raise exception 'Период ФП не найден';
  end if;
  if v_status = 'closed' then
    raise exception 'Период уже закрыт';
  end if;

  select coalesce(sum(case when is_return then -amount_base else amount_base end), 0)
    into v_income from incomes where period_id = p_period_id;

  insert into directives (period_id, total_income, protocol, conducted_by)
  values (p_period_id, v_income, p_protocol, auth.uid());

  update incomes set is_distributed = true
  where period_id = p_period_id and not is_distributed;

  update fp_periods
  set status = 'closed', closed_at = now(), closed_by = auth.uid()
  where id = p_period_id;

  -- автосоздание следующей недели (чт–ср)
  insert into fp_periods (starts_on, ends_on)
  select v_ends + 1, v_ends + 7
  where not exists (select 1 from fp_periods where starts_on = v_ends + 1);
end $function$
;

CREATE OR REPLACE FUNCTION public.fp_distribute_stage(p_period_id uuid, p_stage text, p_allocations jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_status period_status;
  r record;
  v_count int := 0;
begin
  if not is_fin_admin() then
    raise exception 'Одобрять распределение может только финдиректор или владелец';
  end if;
  if p_stage not in ('revenue', 'margin', 'adjusted', 'remainder') then
    raise exception 'Неизвестный этап распределения: %', p_stage;
  end if;

  select status into v_status from fp_periods where id = p_period_id;
  if v_status is null then
    raise exception 'Период ФП не найден';
  end if;
  if v_status = 'closed' then
    raise exception 'Период закрыт — операции запрещены';
  end if;
  if exists (select 1 from fp_register
             where period_id = p_period_id
               and op_type = 'distribution'
               and comment = 'stage:' || p_stage) then
    raise exception 'Этот этап уже одобрен в данном периоде';
  end if;

  for r in
    select (a ->> 'fund_id')::uuid as fund_id, (a ->> 'amount')::numeric as amount
    from jsonb_array_elements(p_allocations) a
  loop
    continue when r.amount is null or r.amount <= 0;
    if not exists (select 1 from funds where id = r.fund_id and not is_archived) then
      raise exception 'Фонд % не найден', r.fund_id;
    end if;
    insert into fp_register (op_type, period_id, fund_id, fund_amount, comment, created_by)
    values ('distribution', p_period_id, r.fund_id, r.amount, 'stage:' || p_stage, auth.uid());
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'Нет сумм к зачислению';
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.fp_reopen_period(p_period_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_status period_status;
begin
  if not is_fin_admin() then
    raise exception 'Открывать период может только финдиректор или владелец';
  end if;

  select status into v_status from fp_periods where id = p_period_id;
  if v_status is null then
    raise exception 'Период ФП не найден';
  end if;
  if v_status <> 'closed' then
    raise exception 'Период и так открыт';
  end if;

  delete from directives where period_id = p_period_id;

  update fp_periods
  set status = 'open', closed_at = null, closed_by = null
  where id = p_period_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.fp_reset_distribution(p_period_id uuid, p_stage text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_status period_status;
  v_count int;
begin
  if not is_fin_admin() then
    raise exception 'Сбрасывать распределение может только финдиректор или владелец';
  end if;
  if p_stage not in ('revenue', 'margin', 'adjusted', 'remainder', 'all') then
    raise exception 'Неизвестный этап распределения: %', p_stage;
  end if;

  select status into v_status from fp_periods where id = p_period_id;
  if v_status is null then
    raise exception 'Период ФП не найден';
  end if;
  if v_status = 'closed' then
    raise exception 'Период закрыт — сначала откройте неделю';
  end if;

  if p_stage = 'all' then
    delete from fp_register
    where period_id = p_period_id and op_type = 'distribution';
  else
    delete from fp_register
    where period_id = p_period_id and op_type = 'distribution'
      and comment = 'stage:' || p_stage;
  end if;

  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'Нечего сбрасывать — распределение не найдено';
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.has_fund_access(f uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select is_fin_admin()
      or exists (select 1 from funds where id = f and not is_restricted)
      or exists (select 1 from fund_access
                 where user_id = auth.uid() and fund_id = f);
$function$
;

CREATE OR REPLACE FUNCTION public.has_location_access(loc uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select is_fin_admin()
      or my_role() = 'ops_director'
      or exists (select 1 from user_location_access
                 where user_id = auth.uid() and location_id = loc);
$function$
;

CREATE OR REPLACE FUNCTION public.holds_position(pos uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select exists (select 1 from position_assignments
                 where person_id = auth.uid() and position_id = pos);
$function$
;

CREATE OR REPLACE FUNCTION public.is_fin_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select my_role() in ('owner', 'fin_director');
$function$
;

CREATE OR REPLACE FUNCTION public.my_role()
 RETURNS app_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select role from profiles where id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.trg_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  insert into audit_log (user_id, action, table_name, record_id, old_data, new_data)
  values (
    auth.uid(), lower(tg_op), tg_table_name,
    coalesce(new.id::text, old.id::text),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $function$
;

CREATE OR REPLACE FUNCTION public.trg_income_to_register()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  insert into fp_register (op_type, period_id, cash_account_id, cash_amount,
    income_id, counterparty_id, payment_type_id, currency_id, created_by)
  values (
    (case when new.is_return then 'income_return' else 'income' end)::register_op_type,
    new.period_id, new.cash_account_id,
    case when new.is_return then -new.amount_base else new.amount_base end,
    new.id, new.counterparty_id, new.payment_type_id, new.currency_id, new.created_by
  );
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.trg_register_balances()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.fund_id is not null then
      update funds set balance = balance + new.fund_amount where id = new.fund_id;
    end if;
    if new.cash_account_id is not null then
      update cash_accounts set balance = balance + new.cash_amount where id = new.cash_account_id;
    end if;
  elsif tg_op = 'DELETE' then
    if old.fund_id is not null then
      update funds set balance = balance - old.fund_amount where id = old.fund_id;
    end if;
    if old.cash_account_id is not null then
      update cash_accounts set balance = balance - old.cash_amount where id = old.cash_account_id;
    end if;
  end if;
  return coalesce(new, old);
end $function$
;

CREATE OR REPLACE FUNCTION public.trg_register_no_overdraft()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare bal numeric;
begin
  if new.fund_id is not null and new.fund_amount < 0 then
    select balance into bal from funds where id = new.fund_id for update;
    if bal + new.fund_amount < 0 then
      raise exception 'Недостаточно средств в фонде (остаток %, операция %)', bal, new.fund_amount;
    end if;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.trg_register_period_lock()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.period_id is not null and exists (
    select 1 from fp_periods where id = new.period_id and status = 'closed'
  ) then
    raise exception 'Период закрыт — операции запрещены';
  end if;
  return new;
end $function$
;

-- ============================================================
-- Первичные ключи, уникальные и проверочные ограничения
-- ============================================================
alter table public.audit_log add constraint audit_log_pkey PRIMARY KEY (id);
alter table public.cash_account_folders add constraint cash_account_folders_pkey PRIMARY KEY (id);
alter table public.cash_accounts add constraint cash_accounts_pkey PRIMARY KEY (id);
alter table public.counterparties add constraint counterparties_pkey PRIMARY KEY (id);
alter table public.currencies add constraint currencies_pkey PRIMARY KEY (id);
alter table public.directives add constraint directives_pkey PRIMARY KEY (id);
alter table public.distribution_rules add constraint distribution_rules_pkey PRIMARY KEY (id);
alter table public.exchange_rates add constraint exchange_rates_pkey PRIMARY KEY (id);
alter table public.expense_type_access add constraint expense_type_access_pkey PRIMARY KEY (user_id, expense_type_id);
alter table public.expense_types add constraint expense_types_pkey PRIMARY KEY (id);
alter table public.fp_periods add constraint fp_periods_pkey PRIMARY KEY (id);
alter table public.fp_register add constraint fp_register_pkey PRIMARY KEY (id);
alter table public.fund_access add constraint fund_access_pkey PRIMARY KEY (user_id, fund_id);
alter table public.fund_folders add constraint fund_folders_pkey PRIMARY KEY (id);
alter table public.funds add constraint funds_pkey PRIMARY KEY (id);
alter table public.income_types add constraint income_types_pkey PRIMARY KEY (id);
alter table public.incomes add constraint incomes_pkey PRIMARY KEY (id);
alter table public.invites add constraint invites_pkey PRIMARY KEY (id);
alter table public.locations add constraint locations_pkey PRIMARY KEY (id);
alter table public.org_divisions add constraint org_divisions_pkey PRIMARY KEY (id);
alter table public.org_positions add constraint org_positions_pkey PRIMARY KEY (id);
alter table public.payment_requests add constraint payment_requests_pkey PRIMARY KEY (id);
alter table public.payment_types add constraint payment_types_pkey PRIMARY KEY (id);
alter table public.period_distribution_overrides add constraint period_distribution_overrides_pkey PRIMARY KEY (period_id, rule_id);
alter table public.position_assignments add constraint position_assignments_pkey PRIMARY KEY (person_id, position_id);
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table public.reconciliations add constraint reconciliations_pkey PRIMARY KEY (id);
alter table public.request_attachments add constraint request_attachments_pkey PRIMARY KEY (id);
alter table public.request_comments add constraint request_comments_pkey PRIMARY KEY (id);
alter table public.statistic_values add constraint statistic_values_pkey PRIMARY KEY (id);
alter table public.statistics add constraint statistics_pkey PRIMARY KEY (id);
alter table public.user_location_access add constraint user_location_access_pkey PRIMARY KEY (user_id, location_id);
alter table public.cash_accounts add constraint cash_accounts_outer_id_key UNIQUE (outer_id);
alter table public.counterparties add constraint counterparties_outer_id_key UNIQUE (outer_id);
alter table public.currencies add constraint currencies_code_key UNIQUE (code);
alter table public.directives add constraint directives_period_id_key UNIQUE (period_id);
alter table public.exchange_rates add constraint exchange_rates_from_cur_id_to_cur_id_valid_from_key UNIQUE (from_cur_id, to_cur_id, valid_from);
alter table public.expense_types add constraint expense_types_outer_id_key UNIQUE (outer_id);
alter table public.fp_periods add constraint fp_periods_starts_on_key UNIQUE (starts_on);
alter table public.funds add constraint funds_code_key UNIQUE (code);
alter table public.funds add constraint funds_outer_id_key UNIQUE (outer_id);
alter table public.income_types add constraint income_types_outer_id_key UNIQUE (outer_id);
alter table public.incomes add constraint incomes_outer_id_key UNIQUE (outer_id);
alter table public.invites add constraint invites_token_key UNIQUE (token);
alter table public.locations add constraint locations_outer_id_key UNIQUE (outer_id);
alter table public.org_divisions add constraint org_divisions_code_key UNIQUE (code);
alter table public.org_positions add constraint org_positions_outer_id_key UNIQUE (outer_id);
alter table public.payment_requests add constraint payment_requests_outer_id_key UNIQUE (outer_id);
alter table public.payment_types add constraint payment_types_outer_id_key UNIQUE (outer_id);
alter table public.profiles add constraint profiles_outer_id_key UNIQUE (outer_id);
alter table public.reconciliations add constraint reconciliations_cash_account_id_period_id_key UNIQUE (cash_account_id, period_id);
alter table public.statistic_values add constraint statistic_values_statistic_id_period_id_is_quota_key UNIQUE (statistic_id, period_id, is_quota);
alter table public.statistics add constraint statistics_outer_id_key UNIQUE (outer_id);
alter table public.distribution_rules add constraint distribution_rules_check CHECK (((percent IS NOT NULL) OR (fixed_amount IS NOT NULL)));
alter table public.distribution_rules add constraint distribution_rules_fixed_amount_check CHECK ((fixed_amount > (0)::numeric));
alter table public.distribution_rules add constraint distribution_rules_percent_check CHECK (((percent > (0)::numeric) AND (percent <= (100)::numeric)));
alter table public.exchange_rates add constraint exchange_rates_rate_check CHECK ((rate > (0)::numeric));
alter table public.fp_periods add constraint fp_periods_check CHECK ((ends_on > starts_on));
alter table public.fp_register add constraint fp_register_check CHECK (((fund_id IS NOT NULL) OR (cash_account_id IS NOT NULL)));
alter table public.fp_register add constraint fp_register_check1 CHECK (((fund_id IS NULL) OR (fund_amount IS NOT NULL)));
alter table public.fp_register add constraint fp_register_check2 CHECK (((cash_account_id IS NULL) OR (cash_amount IS NOT NULL)));
alter table public.incomes add constraint incomes_amount_check CHECK ((amount > (0)::numeric));
alter table public.payment_requests add constraint payment_requests_planned_amount_check CHECK ((planned_amount > (0)::numeric));

-- ============================================================
-- Внешние ключи
-- ============================================================
alter table public.audit_log add constraint audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id);
alter table public.cash_account_folders add constraint cash_account_folders_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES cash_account_folders(id);
alter table public.cash_accounts add constraint cash_accounts_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES currencies(id);
alter table public.cash_accounts add constraint cash_accounts_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES cash_account_folders(id);
alter table public.cash_accounts add constraint cash_accounts_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id);
alter table public.directives add constraint directives_conducted_by_fkey FOREIGN KEY (conducted_by) REFERENCES profiles(id);
alter table public.directives add constraint directives_period_id_fkey FOREIGN KEY (period_id) REFERENCES fp_periods(id);
alter table public.distribution_rules add constraint distribution_rules_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES funds(id);
alter table public.distribution_rules add constraint distribution_rules_income_type_id_fkey FOREIGN KEY (income_type_id) REFERENCES income_types(id) ON DELETE CASCADE;
alter table public.exchange_rates add constraint exchange_rates_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.exchange_rates add constraint exchange_rates_from_cur_id_fkey FOREIGN KEY (from_cur_id) REFERENCES currencies(id);
alter table public.exchange_rates add constraint exchange_rates_to_cur_id_fkey FOREIGN KEY (to_cur_id) REFERENCES currencies(id);
alter table public.expense_type_access add constraint expense_type_access_expense_type_id_fkey FOREIGN KEY (expense_type_id) REFERENCES expense_types(id) ON DELETE CASCADE;
alter table public.expense_type_access add constraint expense_type_access_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.expense_types add constraint expense_types_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id);
alter table public.expense_types add constraint expense_types_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES expense_types(id);
alter table public.fp_periods add constraint fp_periods_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES profiles(id);
alter table public.fp_register add constraint fp_register_cash_account_id_fkey FOREIGN KEY (cash_account_id) REFERENCES cash_accounts(id);
alter table public.fp_register add constraint fp_register_counterparty_id_fkey FOREIGN KEY (counterparty_id) REFERENCES counterparties(id);
alter table public.fp_register add constraint fp_register_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.fp_register add constraint fp_register_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES currencies(id);
alter table public.fp_register add constraint fp_register_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES funds(id);
alter table public.fp_register add constraint fp_register_income_id_fkey FOREIGN KEY (income_id) REFERENCES incomes(id);
alter table public.fp_register add constraint fp_register_loan_parent_id_fkey FOREIGN KEY (loan_parent_id) REFERENCES fp_register(id);
alter table public.fp_register add constraint fp_register_payment_type_id_fkey FOREIGN KEY (payment_type_id) REFERENCES payment_types(id);
alter table public.fp_register add constraint fp_register_period_id_fkey FOREIGN KEY (period_id) REFERENCES fp_periods(id);
alter table public.fp_register add constraint fp_register_request_id_fkey FOREIGN KEY (request_id) REFERENCES payment_requests(id);
alter table public.fund_access add constraint fund_access_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES funds(id) ON DELETE CASCADE;
alter table public.fund_access add constraint fund_access_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.fund_folders add constraint fund_folders_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES fund_folders(id);
alter table public.funds add constraint funds_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES currencies(id);
alter table public.funds add constraint funds_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES fund_folders(id);
alter table public.funds add constraint funds_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id);
alter table public.income_types add constraint income_types_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id);
alter table public.income_types add constraint income_types_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES income_types(id);
alter table public.incomes add constraint incomes_cash_account_id_fkey FOREIGN KEY (cash_account_id) REFERENCES cash_accounts(id);
alter table public.incomes add constraint incomes_counterparty_id_fkey FOREIGN KEY (counterparty_id) REFERENCES counterparties(id);
alter table public.incomes add constraint incomes_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.incomes add constraint incomes_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES currencies(id);
alter table public.incomes add constraint incomes_income_type_id_fkey FOREIGN KEY (income_type_id) REFERENCES income_types(id);
alter table public.incomes add constraint incomes_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id);
alter table public.incomes add constraint incomes_payment_type_id_fkey FOREIGN KEY (payment_type_id) REFERENCES payment_types(id);
alter table public.incomes add constraint incomes_period_id_fkey FOREIGN KEY (period_id) REFERENCES fp_periods(id);
alter table public.invites add constraint invites_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.invites add constraint invites_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id);
alter table public.invites add constraint invites_position_id_fkey FOREIGN KEY (position_id) REFERENCES org_positions(id);
alter table public.invites add constraint invites_used_by_fkey FOREIGN KEY (used_by) REFERENCES profiles(id);
alter table public.locations add constraint locations_manager_fk FOREIGN KEY (manager_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.org_positions add constraint org_positions_division_id_fkey FOREIGN KEY (division_id) REFERENCES org_divisions(id);
alter table public.org_positions add constraint org_positions_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id);
alter table public.org_positions add constraint org_positions_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES org_positions(id);
alter table public.payment_requests add constraint payment_requests_counterparty_id_fkey FOREIGN KEY (counterparty_id) REFERENCES counterparties(id);
alter table public.payment_requests add constraint payment_requests_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES currencies(id);
alter table public.payment_requests add constraint payment_requests_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES profiles(id);
alter table public.payment_requests add constraint payment_requests_expense_type_id_fkey FOREIGN KEY (expense_type_id) REFERENCES expense_types(id);
alter table public.payment_requests add constraint payment_requests_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES funds(id);
alter table public.payment_requests add constraint payment_requests_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id);
alter table public.payment_requests add constraint payment_requests_payment_type_id_fkey FOREIGN KEY (payment_type_id) REFERENCES payment_types(id);
alter table public.payment_requests add constraint payment_requests_period_id_fkey FOREIGN KEY (period_id) REFERENCES fp_periods(id);
alter table public.payment_requests add constraint payment_requests_position_id_fkey FOREIGN KEY (position_id) REFERENCES org_positions(id);
alter table public.payment_requests add constraint payment_requests_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES profiles(id);
alter table public.period_distribution_overrides add constraint period_distribution_overrides_period_id_fkey FOREIGN KEY (period_id) REFERENCES fp_periods(id) ON DELETE CASCADE;
alter table public.period_distribution_overrides add constraint period_distribution_overrides_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES distribution_rules(id) ON DELETE CASCADE;
alter table public.position_assignments add constraint position_assignments_person_id_fkey FOREIGN KEY (person_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.position_assignments add constraint position_assignments_position_id_fkey FOREIGN KEY (position_id) REFERENCES org_positions(id) ON DELETE CASCADE;
alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.reconciliations add constraint reconciliations_cash_account_id_fkey FOREIGN KEY (cash_account_id) REFERENCES cash_accounts(id);
alter table public.reconciliations add constraint reconciliations_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.reconciliations add constraint reconciliations_period_id_fkey FOREIGN KEY (period_id) REFERENCES fp_periods(id);
alter table public.request_attachments add constraint request_attachments_request_id_fkey FOREIGN KEY (request_id) REFERENCES payment_requests(id) ON DELETE CASCADE;
alter table public.request_attachments add constraint request_attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES profiles(id);
alter table public.request_comments add constraint request_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id);
alter table public.request_comments add constraint request_comments_request_id_fkey FOREIGN KEY (request_id) REFERENCES payment_requests(id) ON DELETE CASCADE;
alter table public.statistic_values add constraint statistic_values_entered_by_fkey FOREIGN KEY (entered_by) REFERENCES profiles(id);
alter table public.statistic_values add constraint statistic_values_period_id_fkey FOREIGN KEY (period_id) REFERENCES fp_periods(id);
alter table public.statistic_values add constraint statistic_values_statistic_id_fkey FOREIGN KEY (statistic_id) REFERENCES statistics(id) ON DELETE CASCADE;
alter table public.statistics add constraint statistics_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id);
alter table public.statistics add constraint statistics_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id);
alter table public.statistics add constraint statistics_position_id_fkey FOREIGN KEY (position_id) REFERENCES org_positions(id);
alter table public.user_location_access add constraint user_location_access_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE;
alter table public.user_location_access add constraint user_location_access_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- ============================================================
-- Индексы
-- ============================================================
CREATE INDEX audit_log_table_name_record_id_idx ON public.audit_log USING btree (table_name, record_id);
CREATE INDEX fp_register_cash_account_id_created_at_idx ON public.fp_register USING btree (cash_account_id, created_at);
CREATE INDEX fp_register_fund_id_created_at_idx ON public.fp_register USING btree (fund_id, created_at);
CREATE INDEX fp_register_period_id_op_type_idx ON public.fp_register USING btree (period_id, op_type);
CREATE INDEX fp_register_request_id_idx ON public.fp_register USING btree (request_id);
CREATE INDEX incomes_cash_account_id_idx ON public.incomes USING btree (cash_account_id);
CREATE INDEX incomes_location_id_period_id_idx ON public.incomes USING btree (location_id, period_id);
CREATE INDEX incomes_period_id_idx ON public.incomes USING btree (period_id);
CREATE INDEX org_positions_division_id_idx ON public.org_positions USING btree (division_id);
CREATE INDEX payment_requests_location_id_status_idx ON public.payment_requests USING btree (location_id, status);
CREATE INDEX payment_requests_period_id_idx ON public.payment_requests USING btree (period_id);
CREATE INDEX payment_requests_position_id_idx ON public.payment_requests USING btree (position_id);
CREATE INDEX statistic_values_statistic_id_period_id_idx ON public.statistic_values USING btree (statistic_id, period_id);
CREATE UNIQUE INDEX distribution_rules_default_uniq ON public.distribution_rules USING btree (fund_id, stage) WHERE ((income_type_id IS NULL) AND (NOT is_archived));

-- ============================================================
-- Триггеры
-- ============================================================
CREATE TRIGGER audit_fp_register AFTER INSERT OR DELETE OR UPDATE ON public.fp_register FOR EACH ROW EXECUTE FUNCTION trg_audit();
CREATE TRIGGER fp_register_balances AFTER INSERT OR DELETE ON public.fp_register FOR EACH ROW EXECUTE FUNCTION trg_register_balances();
CREATE TRIGGER fp_register_overdraft BEFORE INSERT ON public.fp_register FOR EACH ROW EXECUTE FUNCTION trg_register_no_overdraft();
CREATE TRIGGER fp_register_period_lock BEFORE INSERT ON public.fp_register FOR EACH ROW EXECUTE FUNCTION trg_register_period_lock();
CREATE TRIGGER audit_funds AFTER DELETE OR UPDATE ON public.funds FOR EACH ROW EXECUTE FUNCTION trg_audit();
CREATE TRIGGER audit_incomes AFTER INSERT OR DELETE OR UPDATE ON public.incomes FOR EACH ROW EXECUTE FUNCTION trg_audit();
CREATE TRIGGER income_to_register AFTER INSERT ON public.incomes FOR EACH ROW EXECUTE FUNCTION trg_income_to_register();
CREATE TRIGGER audit_payment_requests AFTER INSERT OR DELETE OR UPDATE ON public.payment_requests FOR EACH ROW EXECUTE FUNCTION trg_audit();
CREATE TRIGGER audit_reconciliations AFTER INSERT OR DELETE OR UPDATE ON public.reconciliations FOR EACH ROW EXECUTE FUNCTION trg_audit();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.audit_log enable row level security;
alter table public.cash_account_folders enable row level security;
alter table public.cash_accounts enable row level security;
alter table public.counterparties enable row level security;
alter table public.currencies enable row level security;
alter table public.directives enable row level security;
alter table public.distribution_rules enable row level security;
alter table public.exchange_rates enable row level security;
alter table public.expense_type_access enable row level security;
alter table public.expense_types enable row level security;
alter table public.fp_periods enable row level security;
alter table public.fp_register enable row level security;
alter table public.fund_access enable row level security;
alter table public.fund_folders enable row level security;
alter table public.funds enable row level security;
alter table public.income_types enable row level security;
alter table public.incomes enable row level security;
alter table public.invites enable row level security;
alter table public.locations enable row level security;
alter table public.org_divisions enable row level security;
alter table public.org_positions enable row level security;
alter table public.payment_requests enable row level security;
alter table public.payment_types enable row level security;
alter table public.period_distribution_overrides enable row level security;
alter table public.position_assignments enable row level security;
alter table public.profiles enable row level security;
alter table public.reconciliations enable row level security;
alter table public.request_attachments enable row level security;
alter table public.request_comments enable row level security;
alter table public.statistic_values enable row level security;
alter table public.statistics enable row level security;
alter table public.user_location_access enable row level security;

-- ============================================================
-- RLS-политики
-- ============================================================
create policy audit_read on public.audit_log as permissive for select to public
  using (is_fin_admin());
create policy ca_folders_rw on public.cash_account_folders as permissive for all to public
  using ((is_fin_admin() OR (my_role() = 'accountant'::app_role)))
  with check ((is_fin_admin() OR (my_role() = 'accountant'::app_role)));
create policy ca_read on public.cash_accounts as permissive for select to public
  using ((is_fin_admin() OR (my_role() = 'accountant'::app_role) OR ((location_id IS NOT NULL) AND has_location_access(location_id))));
create policy ca_write on public.cash_accounts as permissive for all to public
  using ((is_fin_admin() OR (my_role() = 'accountant'::app_role)))
  with check ((is_fin_admin() OR (my_role() = 'accountant'::app_role)));
create policy cp_insert on public.counterparties as permissive for insert to public
  with check ((my_role() = ANY (ARRAY['owner'::app_role, 'fin_director'::app_role, 'accountant'::app_role, 'location_manager'::app_role, 'ops_director'::app_role])));
create policy cp_update on public.counterparties as permissive for update to public
  using ((is_fin_admin() OR (my_role() = 'accountant'::app_role)));
create policy read_all on public.counterparties as permissive for select to public
  using (true);
create policy read_all on public.currencies as permissive for select to public
  using (true);
create policy directives_insert on public.directives as permissive for insert to public
  with check (is_fin_admin());
create policy directives_read on public.directives as permissive for select to public
  using ((is_fin_admin() OR (my_role() = 'ops_director'::app_role)));
create policy drules_read on public.distribution_rules as permissive for select to public
  using ((is_fin_admin() OR (my_role() = 'ops_director'::app_role)));
create policy drules_write on public.distribution_rules as permissive for all to public
  using (is_fin_admin())
  with check (is_fin_admin());
create policy rates_insert on public.exchange_rates as permissive for insert to public
  with check ((is_fin_admin() OR (my_role() = 'accountant'::app_role)));
create policy read_all on public.exchange_rates as permissive for select to public
  using (true);
create policy eta_admin on public.expense_type_access as permissive for all to public
  using (is_fin_admin())
  with check (is_fin_admin());
create policy etypes_read on public.expense_types as permissive for select to public
  using ((is_fin_admin() OR (location_id IS NULL) OR has_location_access(location_id) OR (EXISTS ( SELECT 1
   FROM expense_type_access
  WHERE ((expense_type_access.user_id = auth.uid()) AND (expense_type_access.expense_type_id = expense_types.id))))));
create policy etypes_write on public.expense_types as permissive for all to public
  using (is_fin_admin())
  with check (is_fin_admin());
create policy admin_write on public.fp_periods as permissive for all to public
  using (is_fin_admin())
  with check (is_fin_admin());
create policy read_all on public.fp_periods as permissive for select to public
  using (true);
create policy register_insert on public.fp_register as permissive for insert to public
  with check ((is_fin_admin() OR (my_role() = 'accountant'::app_role)));
create policy register_read on public.fp_register as permissive for select to public
  using ((is_fin_admin() OR (my_role() = 'accountant'::app_role) OR ((fund_id IS NOT NULL) AND has_fund_access(fund_id)) OR ((cash_account_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM cash_accounts c
  WHERE ((c.id = fp_register.cash_account_id) AND (c.location_id IS NOT NULL) AND has_location_access(c.location_id)))))));
create policy fund_access_admin on public.fund_access as permissive for all to public
  using (is_fin_admin())
  with check (is_fin_admin());
create policy admin_write on public.fund_folders as permissive for all to public
  using (is_fin_admin())
  with check (is_fin_admin());
create policy fund_folders_read on public.fund_folders as permissive for select to public
  using (true);
create policy funds_read on public.funds as permissive for select to public
  using (has_fund_access(id));
create policy funds_write on public.funds as permissive for all to public
  using (is_fin_admin())
  with check (is_fin_admin());
create policy itypes_read on public.income_types as permissive for select to public
  using (((location_id IS NULL) OR has_location_access(location_id)));
create policy itypes_write on public.income_types as permissive for all to public
  using (is_fin_admin())
  with check (is_fin_admin());
create policy incomes_insert on public.incomes as permissive for insert to public
  with check ((has_location_access(location_id) AND (my_role() = ANY (ARRAY['owner'::app_role, 'fin_director'::app_role, 'location_manager'::app_role, 'accountant'::app_role])) AND (EXISTS ( SELECT 1
   FROM fp_periods p
  WHERE ((p.id = incomes.period_id) AND (p.status <> 'closed'::period_status))))));
create policy incomes_read on public.incomes as permissive for select to public
  using (has_location_access(location_id));
create policy incomes_update on public.incomes as permissive for update to public
  using ((is_fin_admin() AND (EXISTS ( SELECT 1
   FROM fp_periods p
  WHERE ((p.id = incomes.period_id) AND (p.status <> 'closed'::period_status))))));
create policy invites_rw on public.invites as permissive for all to public
  using ((is_fin_admin() OR (my_role() = 'ops_director'::app_role)))
  with check ((is_fin_admin() OR (my_role() = 'ops_director'::app_role)));
create policy admin_write on public.locations as permissive for all to public
  using (is_fin_admin())
  with check (is_fin_admin());
create policy read_all on public.locations as permissive for select to public
  using (true);
create policy admin_write on public.org_divisions as permissive for all to public
  using (is_fin_admin())
  with check (is_fin_admin());
create policy read_all on public.org_divisions as permissive for select to public
  using (true);
create policy admin_write on public.org_positions as permissive for all to public
  using ((is_fin_admin() OR (my_role() = 'ops_director'::app_role)))
  with check ((is_fin_admin() OR (my_role() = 'ops_director'::app_role)));
create policy read_all on public.org_positions as permissive for select to public
  using (true);
create policy requests_insert on public.payment_requests as permissive for insert to public
  with check (((requester_id = auth.uid()) AND holds_position(position_id) AND has_location_access(location_id) AND (status = 'submitted'::request_status)));
create policy requests_read on public.payment_requests as permissive for select to public
  using (((requester_id = auth.uid()) OR holds_position(position_id) OR is_fin_admin() OR ((my_role() = ANY (ARRAY['ops_director'::app_role, 'location_manager'::app_role])) AND has_location_access(location_id)) OR ((my_role() = 'accountant'::app_role) AND (status = ANY (ARRAY['approved'::request_status, 'paid'::request_status])))));
create policy requests_update on public.payment_requests as permissive for update to public
  using ((is_fin_admin() OR ((my_role() = 'accountant'::app_role) AND (status = 'approved'::request_status)) OR ((requester_id = auth.uid()) AND (status = 'submitted'::request_status))));
create policy ptypes_write on public.payment_types as permissive for all to public
  using (is_fin_admin())
  with check (is_fin_admin());
create policy read_all on public.payment_types as permissive for select to public
  using (true);
create policy overrides_rw on public.period_distribution_overrides as permissive for all to public
  using (is_fin_admin())
  with check (is_fin_admin());
create policy admin_write on public.position_assignments as permissive for all to public
  using ((is_fin_admin() OR (my_role() = 'ops_director'::app_role)))
  with check ((is_fin_admin() OR (my_role() = 'ops_director'::app_role)));
create policy read_all on public.position_assignments as permissive for select to public
  using (true);
create policy profiles_insert on public.profiles as permissive for insert to public
  with check (((id = auth.uid()) OR is_fin_admin()));
create policy profiles_self on public.profiles as permissive for update to public
  using (((id = auth.uid()) OR is_fin_admin()));
create policy read_all on public.profiles as permissive for select to public
  using (true);
create policy recon_rw on public.reconciliations as permissive for all to public
  using ((is_fin_admin() OR (my_role() = 'accountant'::app_role)))
  with check ((is_fin_admin() OR (my_role() = 'accountant'::app_role)));
create policy req_attach_rw on public.request_attachments as permissive for all to public
  using (((uploaded_by = auth.uid()) OR is_fin_admin() OR (EXISTS ( SELECT 1
   FROM payment_requests r
  WHERE ((r.id = request_attachments.request_id) AND (r.requester_id = auth.uid()))))))
  with check ((uploaded_by = auth.uid()));
create policy req_comments_insert on public.request_comments as permissive for insert to public
  with check ((author_id = auth.uid()));
create policy req_comments_read on public.request_comments as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM payment_requests r
  WHERE (r.id = request_comments.request_id))));
create policy statval_insert on public.statistic_values as permissive for insert to public
  with check ((((NOT is_quota) AND ((my_role() = ANY (ARRAY['owner'::app_role, 'fin_director'::app_role, 'ops_director'::app_role, 'location_manager'::app_role])) OR (EXISTS ( SELECT 1
   FROM statistics s
  WHERE ((s.id = statistic_values.statistic_id) AND (s.owner_id = auth.uid())))))) OR (is_quota AND (is_fin_admin() OR (my_role() = 'ops_director'::app_role)))));
create policy statval_read on public.statistic_values as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM statistics s
  WHERE ((s.id = statistic_values.statistic_id) AND ((s.location_id IS NULL) OR has_location_access(s.location_id) OR (s.owner_id = auth.uid()) OR ((s.position_id IS NOT NULL) AND holds_position(s.position_id)))))));
create policy stats_read on public.statistics as permissive for select to public
  using (((location_id IS NULL) OR has_location_access(location_id) OR (owner_id = auth.uid()) OR ((position_id IS NOT NULL) AND holds_position(position_id))));
create policy stats_write on public.statistics as permissive for all to public
  using ((is_fin_admin() OR (my_role() = 'ops_director'::app_role)))
  with check ((is_fin_admin() OR (my_role() = 'ops_director'::app_role)));
create policy admin_write on public.user_location_access as permissive for all to public
  using (is_fin_admin())
  with check (is_fin_admin());
create policy read_all on public.user_location_access as permissive for select to public
  using (true);

-- ============================================================
-- Комментарии
-- ============================================================
comment on table public.locations is 'Точка/филиал — первоклассная сущность (ТЗ v2 §5)';
comment on table public.profiles is 'Профили пользователей с ролью (ТЗ v2 §3)';
comment on column public.distribution_rules.income_type_id is 'Вид дохода; null — правило схемы по умолчанию (для всего дохода периода)';
