-- ============================================================================
-- Справочный снимок фактической схемы public на 2026-07-01
-- Получен из прод-БД Supabase (проект xwenvxkfhblbnhgjrrtb) через pg_catalog
-- (pg_type/pg_enum, pg_class/pg_attribute/pg_attrdef, pg_constraint,
--  pg_indexes, pg_proc/pg_get_functiondef, pg_trigger, pg_policies).
--
-- ЭТО НЕ МИГРАЦИЯ — НЕ ПРИМЕНЯТЬ ПОВЕРХ ЖИВОЙ БАЗЫ.
-- Назначение: git должен содержать полное определение схемы (baseline
-- создавался вне git, вручную через Dashboard) + материал для restore-drill.
--
-- Состав: 16 enum-типов, 55 таблиц, констрейнты (103 PK/UNIQUE/CHECK + 142 FK),
-- 101 индекс, 0 views, 48 функций, 22 триггера, RLS на 55 таблицах,
-- 134 политики, комментарии на объектах.
-- Порядок секций: enums → tables → pk/unique/check → fk → indexes → views →
-- functions → triggers → rls/policies → comments.
-- ============================================================================

-- ============================================================================
-- 1. ENUM-ТИПЫ
-- ============================================================================

create type public.app_role as enum ('owner', 'fin_director', 'ops_director', 'location_manager', 'accountant', 'employee');
create type public.bill_kind as enum ('supply', 'obligation');
create type public.cash_account_type as enum ('cash', 'bank', 'card', 'acquiring');
create type public.client_invoice_status as enum ('planned', 'issued', 'paid', 'cancelled');
create type public.crm_lead_stage as enum ('new', 'show', 'offer', 'contract', 'won', 'lost');
create type public.distribution_stage as enum ('revenue', 'margin', 'adjusted');
create type public.fund_kind as enum ('working', 'accumulative');
create type public.hat_status as enum ('none', 'learning', 'done');
create type public.hms_state as enum ('power', 'affluence', 'normal', 'emergency', 'danger', 'nonexistence');
create type public.location_status as enum ('active', 'construction', 'renovation', 'closed');
create type public.location_type as enum ('tuyhona', 'restaurant', 'cafe');
create type public.period_status as enum ('open', 'planning', 'closed');
create type public.register_op_type as enum ('income', 'income_return', 'distribution', 'request_payment', 'fund_transfer', 'fund_loan', 'fund_loan_return', 'fx_exchange', 'cash_transfer', 'off_plan', 'adjustment', 'bill_payment', 'payroll_payment', 'fund_income', 'fund_return');
create type public.request_status as enum ('submitted', 'planning', 'approved', 'rejected', 'paid', 'withdrawn', 'revision');
create type public.task_priority as enum ('low', 'mid', 'high');
create type public.task_status as enum ('new', 'progress', 'done');

-- ============================================================================
-- 2. ТАБЛИЦЫ (55)
-- ============================================================================

create table public.audit_log (
  id bigint generated always as identity not null,
  user_id uuid,
  action text not null,
  table_name text not null,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamp with time zone default now() not null
);

create table public.battle_plan_items (
  id uuid default gen_random_uuid() not null,
  owner_id uuid default auth.uid() not null,
  text text not null,
  target text,
  done boolean default false not null,
  period_id uuid,
  sort integer default 0 not null,
  outer_id uuid,
  is_archived boolean default false not null,
  created_at timestamp with time zone default now() not null,
  created_by uuid default auth.uid(),
  statistic_id uuid,
  position_id uuid,
  is_stats_visible boolean default false not null
);

create table public.bill_attachments (
  id uuid default gen_random_uuid() not null,
  bill_id uuid not null,
  file_path text not null,
  file_name text not null,
  uploaded_by uuid not null,
  created_at timestamp with time zone default now() not null
);

create table public.cash_account_folders (
  id uuid default gen_random_uuid() not null,
  name text not null,
  parent_id uuid
);

create table public.cash_accounts (
  id uuid default gen_random_uuid() not null,
  name text not null,
  type cash_account_type not null,
  folder_id uuid,
  location_id uuid,
  currency_id uuid not null,
  balance numeric(14,2) default 0 not null,
  outer_id text,
  is_archived boolean default false not null
);

create table public.chart_accounts (
  id uuid default gen_random_uuid() not null,
  code text not null,
  name text not null,
  account_type text not null,
  is_archived boolean default false not null,
  created_by uuid default auth.uid(),
  created_at timestamp with time zone default now() not null
);

create table public.client_invoices (
  id uuid default gen_random_uuid() not null,
  number bigint generated always as identity not null,
  counterparty_id uuid not null,
  location_id uuid not null,
  income_type_id uuid not null,
  event_name text not null,
  hall text,
  event_on date,
  amount numeric(14,2) not null,
  currency_id uuid not null,
  status client_invoice_status default 'issued'::client_invoice_status not null,
  comment text,
  outer_id text,
  is_archived boolean default false not null,
  created_by uuid not null,
  created_at timestamp with time zone default now() not null
);

create table public.counterparties (
  id uuid default gen_random_uuid() not null,
  name text not null,
  is_supplier boolean default false not null,
  is_client boolean default false not null,
  phone text,
  inn text,
  comment text,
  outer_id text,
  is_archived boolean default false not null,
  created_at timestamp with time zone default now() not null,
  category_id uuid,
  entity_type text,
  address text,
  bank_name text,
  bank_account text,
  bank_mfo text,
  contact_person text
);

create table public.counterparty_attachments (
  id uuid default gen_random_uuid() not null,
  counterparty_id uuid not null,
  file_path text not null,
  file_name text not null,
  uploaded_by uuid not null,
  created_at timestamp with time zone default now() not null
);

create table public.counterparty_categories (
  id uuid default gen_random_uuid() not null,
  name text not null,
  color text,
  outer_id text,
  is_archived boolean default false not null,
  created_at timestamp with time zone default now() not null
);

create table public.counterparty_contacts (
  id uuid default gen_random_uuid() not null,
  counterparty_id uuid not null,
  kind text default 'phone'::text not null,
  value text not null,
  label text,
  is_primary boolean default false not null,
  created_at timestamp with time zone default now() not null
);

create table public.crm_clients (
  id uuid default gen_random_uuid() not null,
  name text not null,
  phone text,
  tag text,
  location_id uuid,
  note text,
  outer_id uuid,
  is_archived boolean default false not null,
  created_at timestamp with time zone default now() not null,
  created_by uuid default auth.uid()
);

create table public.crm_halls (
  id uuid default gen_random_uuid() not null,
  name text not null,
  location_id uuid,
  capacity integer,
  sort integer default 0 not null,
  outer_id uuid,
  is_archived boolean default false not null,
  created_at timestamp with time zone default now() not null,
  created_by uuid default auth.uid()
);

create table public.crm_lead_checklist (
  id uuid default gen_random_uuid() not null,
  lead_id uuid not null,
  text text not null,
  done boolean default false not null,
  sort integer default 0 not null,
  created_at timestamp with time zone default now() not null
);

create table public.crm_leads (
  id uuid default gen_random_uuid() not null,
  name text not null,
  client_id uuid,
  phone text,
  event_type text,
  hall_id uuid,
  location_id uuid,
  event_date date,
  guests integer default 0 not null,
  budget numeric(14,2) default 0 not null,
  stage crm_lead_stage default 'new'::crm_lead_stage not null,
  source text,
  note text,
  outer_id uuid,
  is_archived boolean default false not null,
  created_at timestamp with time zone default now() not null,
  created_by uuid default auth.uid(),
  stage_id uuid,
  due_date date,
  responsible_id uuid,
  sort integer default 0 not null
);

create table public.crm_stages (
  id uuid default gen_random_uuid() not null,
  code text,
  name text not null,
  color text,
  sort integer default 0 not null,
  is_won boolean default false not null,
  is_lost boolean default false not null,
  location_id uuid,
  is_archived boolean default false not null,
  created_at timestamp with time zone default now() not null
);

create table public.currencies (
  id uuid default gen_random_uuid() not null,
  code text not null,
  name text not null,
  is_base boolean default false not null
);

create table public.directives (
  id uuid default gen_random_uuid() not null,
  period_id uuid not null,
  total_income numeric(14,2) default 0 not null,
  protocol jsonb,
  conducted_by uuid not null,
  conducted_at timestamp with time zone default now() not null
);

create table public.distribution_rules (
  id uuid default gen_random_uuid() not null,
  income_type_id uuid,
  fund_id uuid not null,
  stage distribution_stage not null,
  percent numeric(6,3),
  fixed_amount numeric(14,2),
  priority integer default 0 not null,
  is_archived boolean default false not null
);

create table public.exchange_rates (
  id uuid default gen_random_uuid() not null,
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
  id uuid default gen_random_uuid() not null,
  code text,
  name text not null,
  parent_id uuid,
  location_id uuid,
  outer_id text,
  is_archived boolean default false not null,
  default_fund_id uuid,
  default_purpose text
);

create table public.fp_periods (
  id uuid default gen_random_uuid() not null,
  starts_on date not null,
  ends_on date not null,
  status period_status default 'open'::period_status not null,
  closed_at timestamp with time zone,
  closed_by uuid,
  is_executive_confirmed boolean default false not null,
  is_baf_confirmed boolean default false not null,
  executive_confirmed_at timestamp with time zone,
  executive_confirmed_by uuid,
  baf_confirmed_at timestamp with time zone,
  baf_confirmed_by uuid
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
  created_at timestamp with time zone default now() not null,
  bill_id uuid,
  payroll_sheet_id uuid,
  reverses_id bigint
);

create table public.fund_access (
  user_id uuid not null,
  fund_id uuid not null
);

create table public.fund_folders (
  id uuid default gen_random_uuid() not null,
  name text not null,
  parent_id uuid,
  color text,
  description text,
  is_archived boolean default false not null
);

create table public.funds (
  id uuid default gen_random_uuid() not null,
  code text not null,
  name text not null,
  kind fund_kind default 'working'::fund_kind not null,
  folder_id uuid,
  location_id uuid,
  currency_id uuid not null,
  is_restricted boolean default false not null,
  balance numeric(14,2) default 0 not null,
  outer_id text,
  is_archived boolean default false not null,
  created_at timestamp with time zone default now() not null,
  description text,
  color text,
  stage distribution_stage,
  no_transfer boolean default false not null,
  is_private boolean default false not null
);

create table public.income_types (
  id uuid default gen_random_uuid() not null,
  code text,
  name text not null,
  parent_id uuid,
  location_id uuid,
  outer_id text,
  is_archived boolean default false not null
);

create table public.incomes (
  id uuid default gen_random_uuid() not null,
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
  is_return boolean default false not null,
  is_distributed boolean default false not null,
  source text default 'manual'::text not null,
  outer_id text,
  comment text,
  created_by uuid not null,
  created_at timestamp with time zone default now() not null,
  reverses_income_id uuid,
  basis_document text
);

create table public.invites (
  id uuid default gen_random_uuid() not null,
  token text default encode(gen_random_bytes(24), 'hex'::text) not null,
  role app_role default 'employee'::app_role not null,
  location_id uuid,
  position_id uuid,
  created_by uuid not null,
  expires_at timestamp with time zone default (now() + '7 days'::interval) not null,
  used_by uuid,
  used_at timestamp with time zone
);

create table public.invoice_attachments (
  id uuid default gen_random_uuid() not null,
  invoice_id uuid not null,
  file_path text not null,
  file_name text not null,
  uploaded_by uuid not null,
  created_at timestamp with time zone default now() not null
);

create table public.locations (
  id uuid default gen_random_uuid() not null,
  name text not null,
  city text not null,
  type location_type not null,
  status location_status default 'active'::location_status not null,
  manager_id uuid,
  outer_id text,
  is_archived boolean default false not null,
  created_at timestamp with time zone default now() not null
);

create table public.massmail_campaigns (
  id uuid default gen_random_uuid() not null,
  title text not null,
  template_text text,
  segment_type text not null,
  segment_filters jsonb,
  location_id uuid,
  is_archived boolean default false not null,
  created_by uuid default auth.uid(),
  created_at timestamp with time zone default now() not null
);

create table public.massmail_recipients (
  id uuid default gen_random_uuid() not null,
  campaign_id uuid not null,
  recipient_name text not null,
  recipient_phone text not null,
  source_type text not null,
  source_id uuid,
  note text,
  is_sent boolean default false not null,
  sent_at timestamp with time zone
);

create table public.notifications (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  kind text not null,
  title text not null,
  body text,
  module text,
  view_key text,
  request_id uuid,
  is_read boolean default false not null,
  created_at timestamp with time zone default now() not null
);

create table public.org_divisions (
  id uuid default gen_random_uuid() not null,
  code text not null,
  name text not null,
  sort integer default 0 not null,
  color text,
  ckp text
);

create table public.org_positions (
  id uuid default gen_random_uuid() not null,
  code text not null,
  name text not null,
  division_id uuid,
  location_id uuid,
  parent_id uuid,
  outer_id text,
  is_archived boolean default false not null,
  section text,
  ckp text,
  statistic text,
  duties jsonb default '[]'::jsonb not null,
  is_executive boolean default false not null,
  sort integer default 0 not null
);

create table public.payment_requests (
  id uuid default gen_random_uuid() not null,
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
  status request_status default 'submitted'::request_status not null,
  decided_by uuid,
  decided_at timestamp with time zone,
  rejection_reason text,
  outer_id text,
  created_at timestamp with time zone default now() not null,
  purpose text,
  tags text[] default '{}'::text[] not null,
  approved_amount numeric,
  comment text,
  paid_amount numeric default 0 not null,
  period_paid_id uuid
);

create table public.payment_types (
  id uuid default gen_random_uuid() not null,
  name text not null,
  outer_id text,
  is_archived boolean default false not null
);

create table public.payroll_lines (
  id uuid default gen_random_uuid() not null,
  sheet_id uuid not null,
  person_id uuid not null,
  points numeric(8,2) default 0 not null,
  state hms_state default 'normal'::hms_state not null,
  coefficient numeric(4,2) default 1.0 not null,
  accrued numeric(14,2) default 0 not null,
  advance numeric(14,2) default 0 not null,
  deduction numeric(14,2) default 0 not null
);

create table public.payroll_sheets (
  id uuid default gen_random_uuid() not null,
  number bigint generated always as identity not null,
  period_id uuid not null,
  location_id uuid,
  fund_id uuid,
  fot_amount numeric(14,2) default 0 not null,
  status request_status default 'submitted'::request_status not null,
  comment text,
  created_by uuid not null,
  created_at timestamp with time zone default now() not null
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
  is_main boolean default false not null,
  is_holder boolean default true not null,
  hat_status hat_status default 'none'::hat_status not null
);

create table public.posting_rules (
  id uuid default gen_random_uuid() not null,
  op_type register_op_type not null,
  component text not null,
  debit_code text not null,
  credit_code text not null,
  created_at timestamp with time zone default now() not null
);

create table public.profiles (
  id uuid not null,
  full_name text not null,
  phone text,
  role app_role default 'employee'::app_role not null,
  outer_id text,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  avatar_url text
);

create table public.reconciliations (
  id uuid default gen_random_uuid() not null,
  cash_account_id uuid not null,
  period_id uuid not null,
  actual_balance numeric(14,2) not null,
  system_balance numeric(14,2) not null,
  difference numeric(14,2) generated always as ((actual_balance - system_balance)) stored,
  comment text,
  created_by uuid not null,
  created_at timestamp with time zone default now() not null
);

create table public.request_attachments (
  id uuid default gen_random_uuid() not null,
  request_id uuid not null,
  file_path text not null,
  file_name text not null,
  uploaded_by uuid not null,
  created_at timestamp with time zone default now() not null
);

create table public.request_comments (
  id uuid default gen_random_uuid() not null,
  request_id uuid not null,
  author_id uuid,
  body text not null,
  created_at timestamp with time zone default now() not null,
  is_ai boolean default false not null
);

create table public.statistic_dated_values (
  id uuid default gen_random_uuid() not null,
  statistic_id uuid not null,
  value_date date not null,
  value numeric(16,2) not null,
  is_quota boolean default false not null,
  entered_by uuid,
  description text,
  created_at timestamp with time zone default now() not null
);

create table public.statistic_values (
  id uuid default gen_random_uuid() not null,
  statistic_id uuid not null,
  period_id uuid not null,
  value numeric(16,2) not null,
  is_quota boolean default false not null,
  entered_by uuid,
  created_at timestamp with time zone default now() not null,
  description text
);

create table public.statistics (
  id uuid default gen_random_uuid() not null,
  name text not null,
  unit text,
  invert boolean default false not null,
  location_id uuid,
  position_id uuid,
  owner_id uuid,
  is_auto boolean default false not null,
  source text,
  outer_id text,
  is_archived boolean default false not null,
  min_val numeric,
  max_val numeric,
  stat_type integer,
  sign boolean,
  frequency text default 'week'::text not null
);

create table public.supplier_bills (
  id uuid default gen_random_uuid() not null,
  number text not null,
  counterparty_id uuid not null,
  location_id uuid not null,
  expense_type_id uuid not null,
  fund_id uuid,
  amount numeric(14,2) not null,
  currency_id uuid not null,
  issued_on date default CURRENT_DATE not null,
  due_on date,
  status request_status default 'submitted'::request_status not null,
  period_approved_id uuid,
  period_paid_id uuid,
  is_recurring boolean default false not null,
  comment text,
  rejection_reason text,
  decided_by uuid,
  decided_at timestamp with time zone,
  outer_id text,
  is_archived boolean default false not null,
  created_by uuid not null,
  created_at timestamp with time zone default now() not null,
  kind bill_kind default 'supply'::bill_kind not null,
  paid_amount numeric default 0 not null
);

create table public.task_comments (
  id uuid default gen_random_uuid() not null,
  task_id uuid not null,
  author_id uuid,
  body text not null,
  created_at timestamp with time zone default now() not null
);

create table public.tasks (
  id uuid default gen_random_uuid() not null,
  title text not null,
  from_id uuid default auth.uid(),
  to_id uuid,
  due_date date,
  status task_status default 'new'::task_status not null,
  priority task_priority default 'mid'::task_priority not null,
  location_id uuid,
  outer_id uuid,
  is_archived boolean default false not null,
  created_at timestamp with time zone default now() not null,
  created_by uuid default auth.uid(),
  position_id uuid,
  description text
);

create table public.user_location_access (
  user_id uuid not null,
  location_id uuid not null
);

-- ============================================================================
-- 3. КОНСТРЕЙНТЫ: PRIMARY KEY / UNIQUE / CHECK
-- ============================================================================

alter table public.audit_log add constraint audit_log_pkey PRIMARY KEY (id);
alter table public.battle_plan_items add constraint battle_plan_items_pkey PRIMARY KEY (id);
alter table public.bill_attachments add constraint bill_attachments_pkey PRIMARY KEY (id);
alter table public.cash_account_folders add constraint cash_account_folders_pkey PRIMARY KEY (id);
alter table public.cash_accounts add constraint cash_accounts_pkey PRIMARY KEY (id);
alter table public.cash_accounts add constraint cash_accounts_outer_id_key UNIQUE (outer_id);
alter table public.chart_accounts add constraint chart_accounts_type_chk CHECK ((account_type = ANY (ARRAY['asset'::text, 'liability'::text, 'equity'::text, 'income'::text, 'expense'::text])));
alter table public.chart_accounts add constraint chart_accounts_pkey PRIMARY KEY (id);
alter table public.client_invoices add constraint client_invoices_amount_check CHECK ((amount > (0)::numeric));
alter table public.client_invoices add constraint client_invoices_pkey PRIMARY KEY (id);
alter table public.client_invoices add constraint client_invoices_outer_id_key UNIQUE (outer_id);
alter table public.counterparties add constraint counterparties_entity_type_chk CHECK (((entity_type IS NULL) OR (entity_type = ANY (ARRAY['individual'::text, 'legal'::text]))));
alter table public.counterparties add constraint counterparties_pkey PRIMARY KEY (id);
alter table public.counterparties add constraint counterparties_outer_id_key UNIQUE (outer_id);
alter table public.counterparty_attachments add constraint counterparty_attachments_pkey PRIMARY KEY (id);
alter table public.counterparty_categories add constraint counterparty_categories_pkey PRIMARY KEY (id);
alter table public.counterparty_contacts add constraint counterparty_contacts_pkey PRIMARY KEY (id);
alter table public.crm_clients add constraint crm_clients_pkey PRIMARY KEY (id);
alter table public.crm_halls add constraint crm_halls_pkey PRIMARY KEY (id);
alter table public.crm_lead_checklist add constraint crm_lead_checklist_pkey PRIMARY KEY (id);
alter table public.crm_leads add constraint crm_leads_pkey PRIMARY KEY (id);
alter table public.crm_stages add constraint crm_stages_pkey PRIMARY KEY (id);
alter table public.currencies add constraint currencies_pkey PRIMARY KEY (id);
alter table public.currencies add constraint currencies_code_key UNIQUE (code);
alter table public.directives add constraint directives_pkey PRIMARY KEY (id);
alter table public.directives add constraint directives_period_id_key UNIQUE (period_id);
alter table public.distribution_rules add constraint distribution_rules_check CHECK (((percent IS NOT NULL) OR (fixed_amount IS NOT NULL)));
alter table public.distribution_rules add constraint distribution_rules_fixed_amount_check CHECK ((fixed_amount > (0)::numeric));
alter table public.distribution_rules add constraint distribution_rules_percent_check CHECK (((percent >= (0)::numeric) AND (percent <= (100)::numeric)));
alter table public.distribution_rules add constraint distribution_rules_pkey PRIMARY KEY (id);
alter table public.exchange_rates add constraint exchange_rates_rate_check CHECK ((rate > (0)::numeric));
alter table public.exchange_rates add constraint exchange_rates_pkey PRIMARY KEY (id);
alter table public.exchange_rates add constraint exchange_rates_from_cur_id_to_cur_id_valid_from_key UNIQUE (from_cur_id, to_cur_id, valid_from);
alter table public.expense_type_access add constraint expense_type_access_pkey PRIMARY KEY (user_id, expense_type_id);
alter table public.expense_types add constraint expense_types_pkey PRIMARY KEY (id);
alter table public.expense_types add constraint expense_types_outer_id_key UNIQUE (outer_id);
alter table public.fp_periods add constraint fp_periods_check CHECK ((ends_on > starts_on));
alter table public.fp_periods add constraint fp_periods_pkey PRIMARY KEY (id);
alter table public.fp_periods add constraint fp_periods_starts_on_key UNIQUE (starts_on);
alter table public.fp_register add constraint fp_register_check CHECK (((fund_id IS NOT NULL) OR (cash_account_id IS NOT NULL)));
alter table public.fp_register add constraint fp_register_check1 CHECK (((fund_id IS NULL) OR (fund_amount IS NOT NULL)));
alter table public.fp_register add constraint fp_register_check2 CHECK (((cash_account_id IS NULL) OR (cash_amount IS NOT NULL)));
alter table public.fp_register add constraint fp_register_pkey PRIMARY KEY (id);
alter table public.fund_access add constraint fund_access_pkey PRIMARY KEY (user_id, fund_id);
alter table public.fund_folders add constraint fund_folders_pkey PRIMARY KEY (id);
alter table public.funds add constraint funds_pkey PRIMARY KEY (id);
alter table public.funds add constraint funds_code_key UNIQUE (code);
alter table public.funds add constraint funds_outer_id_key UNIQUE (outer_id);
alter table public.income_types add constraint income_types_pkey PRIMARY KEY (id);
alter table public.income_types add constraint income_types_outer_id_key UNIQUE (outer_id);
alter table public.incomes add constraint incomes_amount_check CHECK ((amount > (0)::numeric));
alter table public.incomes add constraint incomes_pkey PRIMARY KEY (id);
alter table public.incomes add constraint incomes_outer_id_key UNIQUE (outer_id);
alter table public.invites add constraint invites_pkey PRIMARY KEY (id);
alter table public.invites add constraint invites_token_key UNIQUE (token);
alter table public.invoice_attachments add constraint invoice_attachments_pkey PRIMARY KEY (id);
alter table public.locations add constraint locations_pkey PRIMARY KEY (id);
alter table public.locations add constraint locations_outer_id_key UNIQUE (outer_id);
alter table public.massmail_campaigns add constraint massmail_campaigns_pkey PRIMARY KEY (id);
alter table public.massmail_recipients add constraint massmail_recipients_pkey PRIMARY KEY (id);
alter table public.notifications add constraint notifications_pkey PRIMARY KEY (id);
alter table public.org_divisions add constraint org_divisions_pkey PRIMARY KEY (id);
alter table public.org_divisions add constraint org_divisions_code_key UNIQUE (code);
alter table public.org_positions add constraint org_positions_pkey PRIMARY KEY (id);
alter table public.org_positions add constraint org_positions_outer_id_key UNIQUE (outer_id);
alter table public.payment_requests add constraint payment_requests_approved_amount_positive CHECK (((approved_amount IS NULL) OR (approved_amount > (0)::numeric)));
alter table public.payment_requests add constraint payment_requests_planned_amount_check CHECK ((planned_amount > (0)::numeric));
alter table public.payment_requests add constraint payment_requests_pkey PRIMARY KEY (id);
alter table public.payment_requests add constraint payment_requests_outer_id_key UNIQUE (outer_id);
alter table public.payment_types add constraint payment_types_pkey PRIMARY KEY (id);
alter table public.payment_types add constraint payment_types_outer_id_key UNIQUE (outer_id);
alter table public.payroll_lines add constraint payroll_lines_advance_check CHECK ((advance >= (0)::numeric));
alter table public.payroll_lines add constraint payroll_lines_deduction_check CHECK ((deduction >= (0)::numeric));
alter table public.payroll_lines add constraint payroll_lines_points_check CHECK ((points >= (0)::numeric));
alter table public.payroll_lines add constraint payroll_lines_pkey PRIMARY KEY (id);
alter table public.payroll_lines add constraint payroll_lines_sheet_id_person_id_key UNIQUE (sheet_id, person_id);
alter table public.payroll_sheets add constraint payroll_sheets_fot_amount_check CHECK ((fot_amount >= (0)::numeric));
alter table public.payroll_sheets add constraint payroll_sheets_pkey PRIMARY KEY (id);
alter table public.period_distribution_overrides add constraint period_distribution_overrides_pkey PRIMARY KEY (period_id, rule_id);
alter table public.position_assignments add constraint position_assignments_pkey PRIMARY KEY (person_id, position_id);
alter table public.posting_rules add constraint posting_rules_component_chk CHECK ((component = ANY (ARRAY['cash'::text, 'fund'::text])));
alter table public.posting_rules add constraint posting_rules_sides_differ_chk CHECK ((debit_code <> credit_code));
alter table public.posting_rules add constraint posting_rules_pkey PRIMARY KEY (id);
alter table public.posting_rules add constraint posting_rules_op_component_uniq UNIQUE (op_type, component);
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table public.profiles add constraint profiles_outer_id_key UNIQUE (outer_id);
alter table public.reconciliations add constraint reconciliations_pkey PRIMARY KEY (id);
alter table public.reconciliations add constraint reconciliations_cash_account_id_period_id_key UNIQUE (cash_account_id, period_id);
alter table public.request_attachments add constraint request_attachments_pkey PRIMARY KEY (id);
alter table public.request_comments add constraint request_comments_pkey PRIMARY KEY (id);
alter table public.statistic_dated_values add constraint statistic_dated_values_pkey PRIMARY KEY (id);
alter table public.statistic_dated_values add constraint statistic_dated_values_statistic_id_value_date_is_quota_key UNIQUE (statistic_id, value_date, is_quota);
alter table public.statistic_values add constraint statistic_values_pkey PRIMARY KEY (id);
alter table public.statistic_values add constraint statistic_values_statistic_id_period_id_is_quota_key UNIQUE (statistic_id, period_id, is_quota);
alter table public.statistics add constraint statistics_frequency_chk CHECK ((frequency = ANY (ARRAY['day'::text, 'week'::text, 'month'::text])));
alter table public.statistics add constraint statistics_pkey PRIMARY KEY (id);
alter table public.statistics add constraint statistics_outer_id_key UNIQUE (outer_id);
alter table public.supplier_bills add constraint supplier_bills_amount_check CHECK ((amount > (0)::numeric));
alter table public.supplier_bills add constraint supplier_bills_pkey PRIMARY KEY (id);
alter table public.supplier_bills add constraint supplier_bills_outer_id_key UNIQUE (outer_id);
alter table public.task_comments add constraint task_comments_pkey PRIMARY KEY (id);
alter table public.tasks add constraint tasks_pkey PRIMARY KEY (id);
alter table public.user_location_access add constraint user_location_access_pkey PRIMARY KEY (user_id, location_id);

-- ============================================================================
-- 4. КОНСТРЕЙНТЫ: FOREIGN KEY (после создания всех таблиц)
-- ============================================================================

alter table public.audit_log add constraint audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id);
alter table public.battle_plan_items add constraint battle_plan_items_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id);
alter table public.battle_plan_items add constraint battle_plan_items_period_id_fkey FOREIGN KEY (period_id) REFERENCES fp_periods(id);
alter table public.battle_plan_items add constraint battle_plan_items_position_id_fkey FOREIGN KEY (position_id) REFERENCES org_positions(id);
alter table public.battle_plan_items add constraint battle_plan_items_statistic_id_fkey FOREIGN KEY (statistic_id) REFERENCES statistics(id);
alter table public.bill_attachments add constraint bill_attachments_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES supplier_bills(id) ON DELETE CASCADE;
alter table public.bill_attachments add constraint bill_attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES profiles(id);
alter table public.cash_account_folders add constraint cash_account_folders_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES cash_account_folders(id);
alter table public.cash_accounts add constraint cash_accounts_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES currencies(id);
alter table public.cash_accounts add constraint cash_accounts_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES cash_account_folders(id);
alter table public.cash_accounts add constraint cash_accounts_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id);
alter table public.client_invoices add constraint client_invoices_counterparty_id_fkey FOREIGN KEY (counterparty_id) REFERENCES counterparties(id);
alter table public.client_invoices add constraint client_invoices_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.client_invoices add constraint client_invoices_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES currencies(id);
alter table public.client_invoices add constraint client_invoices_income_type_id_fkey FOREIGN KEY (income_type_id) REFERENCES income_types(id);
alter table public.client_invoices add constraint client_invoices_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id);
alter table public.counterparties add constraint counterparties_category_id_fkey FOREIGN KEY (category_id) REFERENCES counterparty_categories(id);
alter table public.counterparty_attachments add constraint counterparty_attachments_counterparty_id_fkey FOREIGN KEY (counterparty_id) REFERENCES counterparties(id) ON DELETE CASCADE;
alter table public.counterparty_attachments add constraint counterparty_attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES profiles(id);
alter table public.counterparty_contacts add constraint counterparty_contacts_counterparty_id_fkey FOREIGN KEY (counterparty_id) REFERENCES counterparties(id) ON DELETE CASCADE;
alter table public.crm_clients add constraint crm_clients_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id);
alter table public.crm_halls add constraint crm_halls_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id);
alter table public.crm_lead_checklist add constraint crm_lead_checklist_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE CASCADE;
alter table public.crm_leads add constraint crm_leads_client_id_fkey FOREIGN KEY (client_id) REFERENCES crm_clients(id);
alter table public.crm_leads add constraint crm_leads_hall_id_fkey FOREIGN KEY (hall_id) REFERENCES crm_halls(id);
alter table public.crm_leads add constraint crm_leads_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id);
alter table public.crm_leads add constraint crm_leads_responsible_id_fkey FOREIGN KEY (responsible_id) REFERENCES profiles(id);
alter table public.crm_leads add constraint crm_leads_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES crm_stages(id);
alter table public.crm_stages add constraint crm_stages_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id);
alter table public.directives add constraint directives_conducted_by_fkey FOREIGN KEY (conducted_by) REFERENCES profiles(id);
alter table public.directives add constraint directives_period_id_fkey FOREIGN KEY (period_id) REFERENCES fp_periods(id);
alter table public.distribution_rules add constraint distribution_rules_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES funds(id);
alter table public.distribution_rules add constraint distribution_rules_income_type_id_fkey FOREIGN KEY (income_type_id) REFERENCES income_types(id) ON DELETE CASCADE;
alter table public.exchange_rates add constraint exchange_rates_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.exchange_rates add constraint exchange_rates_from_cur_id_fkey FOREIGN KEY (from_cur_id) REFERENCES currencies(id);
alter table public.exchange_rates add constraint exchange_rates_to_cur_id_fkey FOREIGN KEY (to_cur_id) REFERENCES currencies(id);
alter table public.expense_type_access add constraint expense_type_access_expense_type_id_fkey FOREIGN KEY (expense_type_id) REFERENCES expense_types(id) ON DELETE CASCADE;
alter table public.expense_type_access add constraint expense_type_access_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.expense_types add constraint expense_types_default_fund_id_fkey FOREIGN KEY (default_fund_id) REFERENCES funds(id);
alter table public.expense_types add constraint expense_types_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id);
alter table public.expense_types add constraint expense_types_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES expense_types(id);
alter table public.fp_periods add constraint fp_periods_baf_confirmed_by_fkey FOREIGN KEY (baf_confirmed_by) REFERENCES profiles(id);
alter table public.fp_periods add constraint fp_periods_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES profiles(id);
alter table public.fp_periods add constraint fp_periods_executive_confirmed_by_fkey FOREIGN KEY (executive_confirmed_by) REFERENCES profiles(id);
alter table public.fp_register add constraint fp_register_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES supplier_bills(id);
alter table public.fp_register add constraint fp_register_cash_account_id_fkey FOREIGN KEY (cash_account_id) REFERENCES cash_accounts(id);
alter table public.fp_register add constraint fp_register_counterparty_id_fkey FOREIGN KEY (counterparty_id) REFERENCES counterparties(id);
alter table public.fp_register add constraint fp_register_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.fp_register add constraint fp_register_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES currencies(id);
alter table public.fp_register add constraint fp_register_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES funds(id);
alter table public.fp_register add constraint fp_register_income_id_fkey FOREIGN KEY (income_id) REFERENCES incomes(id);
alter table public.fp_register add constraint fp_register_loan_parent_id_fkey FOREIGN KEY (loan_parent_id) REFERENCES fp_register(id);
alter table public.fp_register add constraint fp_register_payment_type_id_fkey FOREIGN KEY (payment_type_id) REFERENCES payment_types(id);
alter table public.fp_register add constraint fp_register_payroll_sheet_id_fkey FOREIGN KEY (payroll_sheet_id) REFERENCES payroll_sheets(id);
alter table public.fp_register add constraint fp_register_period_id_fkey FOREIGN KEY (period_id) REFERENCES fp_periods(id);
alter table public.fp_register add constraint fp_register_request_id_fkey FOREIGN KEY (request_id) REFERENCES payment_requests(id);
alter table public.fp_register add constraint fp_register_reverses_id_fkey FOREIGN KEY (reverses_id) REFERENCES fp_register(id);
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
alter table public.incomes add constraint incomes_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES client_invoices(id);
alter table public.incomes add constraint incomes_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id);
alter table public.incomes add constraint incomes_payment_type_id_fkey FOREIGN KEY (payment_type_id) REFERENCES payment_types(id);
alter table public.incomes add constraint incomes_period_id_fkey FOREIGN KEY (period_id) REFERENCES fp_periods(id);
alter table public.incomes add constraint incomes_reverses_income_id_fkey FOREIGN KEY (reverses_income_id) REFERENCES incomes(id);
alter table public.invites add constraint invites_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.invites add constraint invites_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id);
alter table public.invites add constraint invites_position_id_fkey FOREIGN KEY (position_id) REFERENCES org_positions(id);
alter table public.invites add constraint invites_used_by_fkey FOREIGN KEY (used_by) REFERENCES profiles(id);
alter table public.invoice_attachments add constraint invoice_attachments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES client_invoices(id) ON DELETE CASCADE;
alter table public.invoice_attachments add constraint invoice_attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES profiles(id);
alter table public.locations add constraint locations_manager_fk FOREIGN KEY (manager_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.massmail_campaigns add constraint massmail_campaigns_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id);
alter table public.massmail_recipients add constraint massmail_recipients_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES massmail_campaigns(id) ON DELETE CASCADE;
alter table public.notifications add constraint notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
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
alter table public.payment_requests add constraint payment_requests_period_paid_id_fkey FOREIGN KEY (period_paid_id) REFERENCES fp_periods(id);
alter table public.payment_requests add constraint payment_requests_position_id_fkey FOREIGN KEY (position_id) REFERENCES org_positions(id);
alter table public.payment_requests add constraint payment_requests_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES profiles(id);
alter table public.payroll_lines add constraint payroll_lines_person_id_fkey FOREIGN KEY (person_id) REFERENCES profiles(id);
alter table public.payroll_lines add constraint payroll_lines_sheet_id_fkey FOREIGN KEY (sheet_id) REFERENCES payroll_sheets(id) ON DELETE CASCADE;
alter table public.payroll_sheets add constraint payroll_sheets_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.payroll_sheets add constraint payroll_sheets_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES funds(id);
alter table public.payroll_sheets add constraint payroll_sheets_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id);
alter table public.payroll_sheets add constraint payroll_sheets_period_id_fkey FOREIGN KEY (period_id) REFERENCES fp_periods(id);
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
alter table public.statistic_dated_values add constraint statistic_dated_values_entered_by_fkey FOREIGN KEY (entered_by) REFERENCES profiles(id);
alter table public.statistic_dated_values add constraint statistic_dated_values_statistic_id_fkey FOREIGN KEY (statistic_id) REFERENCES statistics(id) ON DELETE CASCADE;
alter table public.statistic_values add constraint statistic_values_entered_by_fkey FOREIGN KEY (entered_by) REFERENCES profiles(id);
alter table public.statistic_values add constraint statistic_values_period_id_fkey FOREIGN KEY (period_id) REFERENCES fp_periods(id);
alter table public.statistic_values add constraint statistic_values_statistic_id_fkey FOREIGN KEY (statistic_id) REFERENCES statistics(id) ON DELETE CASCADE;
alter table public.statistics add constraint statistics_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id);
alter table public.statistics add constraint statistics_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id);
alter table public.statistics add constraint statistics_position_id_fkey FOREIGN KEY (position_id) REFERENCES org_positions(id);
alter table public.supplier_bills add constraint supplier_bills_counterparty_id_fkey FOREIGN KEY (counterparty_id) REFERENCES counterparties(id);
alter table public.supplier_bills add constraint supplier_bills_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.supplier_bills add constraint supplier_bills_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES currencies(id);
alter table public.supplier_bills add constraint supplier_bills_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES profiles(id);
alter table public.supplier_bills add constraint supplier_bills_expense_type_id_fkey FOREIGN KEY (expense_type_id) REFERENCES expense_types(id);
alter table public.supplier_bills add constraint supplier_bills_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES funds(id);
alter table public.supplier_bills add constraint supplier_bills_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id);
alter table public.supplier_bills add constraint supplier_bills_period_approved_id_fkey FOREIGN KEY (period_approved_id) REFERENCES fp_periods(id);
alter table public.supplier_bills add constraint supplier_bills_period_paid_id_fkey FOREIGN KEY (period_paid_id) REFERENCES fp_periods(id);
alter table public.task_comments add constraint task_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id);
alter table public.task_comments add constraint task_comments_task_id_fkey FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
alter table public.tasks add constraint tasks_from_id_fkey FOREIGN KEY (from_id) REFERENCES profiles(id);
alter table public.tasks add constraint tasks_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id);
alter table public.tasks add constraint tasks_position_id_fkey FOREIGN KEY (position_id) REFERENCES org_positions(id);
alter table public.tasks add constraint tasks_to_id_fkey FOREIGN KEY (to_id) REFERENCES profiles(id);
alter table public.user_location_access add constraint user_location_access_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE;
alter table public.user_location_access add constraint user_location_access_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- ============================================================================
-- 5. ИНДЕКСЫ (неконстрейнтные)
-- ============================================================================

CREATE INDEX audit_log_table_name_record_id_idx ON public.audit_log USING btree (table_name, record_id);
CREATE INDEX audit_log_user_id_idx ON public.audit_log USING btree (user_id);
CREATE INDEX battle_plan_items_owner_idx ON public.battle_plan_items USING btree (owner_id);
CREATE INDEX battle_plan_items_period_idx ON public.battle_plan_items USING btree (period_id);
CREATE INDEX battle_plan_items_position_id_idx ON public.battle_plan_items USING btree (position_id);
CREATE INDEX battle_plan_items_statistic_id_idx ON public.battle_plan_items USING btree (statistic_id);
CREATE INDEX bill_attachments_bill_id_idx ON public.bill_attachments USING btree (bill_id);
CREATE INDEX cash_account_folders_parent_id_idx ON public.cash_account_folders USING btree (parent_id);
CREATE INDEX cash_accounts_currency_id_idx ON public.cash_accounts USING btree (currency_id);
CREATE INDEX cash_accounts_folder_id_idx ON public.cash_accounts USING btree (folder_id);
CREATE INDEX cash_accounts_location_id_idx ON public.cash_accounts USING btree (location_id);
CREATE UNIQUE INDEX chart_accounts_code_uidx ON public.chart_accounts USING btree (lower(code)) WHERE (NOT is_archived);
CREATE INDEX client_invoices_counterparty_id_idx ON public.client_invoices USING btree (counterparty_id);
CREATE INDEX client_invoices_event_on_idx ON public.client_invoices USING btree (event_on);
CREATE INDEX client_invoices_income_type_id_idx ON public.client_invoices USING btree (income_type_id);
CREATE INDEX client_invoices_location_id_status_idx ON public.client_invoices USING btree (location_id, status);
CREATE INDEX counterparties_category_id_idx ON public.counterparties USING btree (category_id);
CREATE INDEX counterparty_attachments_counterparty_id_idx ON public.counterparty_attachments USING btree (counterparty_id);
CREATE INDEX counterparty_contacts_cp_id_idx ON public.counterparty_contacts USING btree (counterparty_id);
CREATE INDEX crm_clients_location_idx ON public.crm_clients USING btree (location_id);
CREATE INDEX crm_halls_location_idx ON public.crm_halls USING btree (location_id);
CREATE INDEX crm_lead_checklist_lead_id_idx ON public.crm_lead_checklist USING btree (lead_id);
CREATE INDEX crm_leads_client_idx ON public.crm_leads USING btree (client_id);
CREATE INDEX crm_leads_event_date_idx ON public.crm_leads USING btree (event_date);
CREATE INDEX crm_leads_hall_idx ON public.crm_leads USING btree (hall_id);
CREATE INDEX crm_leads_location_idx ON public.crm_leads USING btree (location_id);
CREATE INDEX crm_leads_stage_id_idx ON public.crm_leads USING btree (stage_id);
CREATE INDEX crm_leads_stage_idx ON public.crm_leads USING btree (stage);
CREATE UNIQUE INDEX distribution_rules_default_uniq ON public.distribution_rules USING btree (fund_id, stage) WHERE ((income_type_id IS NULL) AND (NOT is_archived));
CREATE INDEX distribution_rules_income_type_id_idx ON public.distribution_rules USING btree (income_type_id);
CREATE INDEX exchange_rates_to_cur_id_idx ON public.exchange_rates USING btree (to_cur_id);
CREATE INDEX expense_type_access_expense_type_id_idx ON public.expense_type_access USING btree (expense_type_id);
CREATE INDEX expense_types_location_id_idx ON public.expense_types USING btree (location_id);
CREATE INDEX expense_types_parent_id_idx ON public.expense_types USING btree (parent_id);
CREATE INDEX fp_register_bill_id_idx ON public.fp_register USING btree (bill_id);
CREATE INDEX fp_register_cash_account_id_created_at_idx ON public.fp_register USING btree (cash_account_id, created_at);
CREATE INDEX fp_register_counterparty_id_idx ON public.fp_register USING btree (counterparty_id);
CREATE INDEX fp_register_created_by_idx ON public.fp_register USING btree (created_by);
CREATE INDEX fp_register_fund_id_created_at_idx ON public.fp_register USING btree (fund_id, created_at);
CREATE INDEX fp_register_income_id_idx ON public.fp_register USING btree (income_id);
CREATE INDEX fp_register_loan_parent_id_idx ON public.fp_register USING btree (loan_parent_id);
CREATE INDEX fp_register_payroll_sheet_id_idx ON public.fp_register USING btree (payroll_sheet_id);
CREATE INDEX fp_register_period_id_op_type_idx ON public.fp_register USING btree (period_id, op_type);
CREATE INDEX fp_register_request_id_idx ON public.fp_register USING btree (request_id);
CREATE INDEX fp_register_reverses_id_idx ON public.fp_register USING btree (reverses_id);
CREATE INDEX fund_access_fund_id_idx ON public.fund_access USING btree (fund_id);
CREATE INDEX fund_folders_parent_id_idx ON public.fund_folders USING btree (parent_id);
CREATE INDEX funds_folder_id_idx ON public.funds USING btree (folder_id);
CREATE INDEX funds_location_id_idx ON public.funds USING btree (location_id);
CREATE INDEX income_types_location_id_idx ON public.income_types USING btree (location_id);
CREATE INDEX income_types_parent_id_idx ON public.income_types USING btree (parent_id);
CREATE INDEX incomes_cash_account_id_idx ON public.incomes USING btree (cash_account_id);
CREATE INDEX incomes_counterparty_id_idx ON public.incomes USING btree (counterparty_id);
CREATE INDEX incomes_created_by_idx ON public.incomes USING btree (created_by);
CREATE INDEX incomes_income_type_id_idx ON public.incomes USING btree (income_type_id);
CREATE INDEX incomes_invoice_id_idx ON public.incomes USING btree (invoice_id);
CREATE INDEX incomes_location_id_period_id_idx ON public.incomes USING btree (location_id, period_id);
CREATE INDEX incomes_period_id_idx ON public.incomes USING btree (period_id);
CREATE INDEX incomes_reverses_income_id_idx ON public.incomes USING btree (reverses_income_id);
CREATE INDEX invoice_attachments_invoice_id_idx ON public.invoice_attachments USING btree (invoice_id);
CREATE INDEX massmail_campaigns_loc_idx ON public.massmail_campaigns USING btree (location_id, is_archived);
CREATE INDEX massmail_recipients_campaign_idx ON public.massmail_recipients USING btree (campaign_id);
CREATE INDEX notifications_user_idx ON public.notifications USING btree (user_id, is_read, created_at DESC);
CREATE INDEX org_positions_division_id_idx ON public.org_positions USING btree (division_id);
CREATE INDEX org_positions_location_id_idx ON public.org_positions USING btree (location_id);
CREATE INDEX org_positions_parent_id_idx ON public.org_positions USING btree (parent_id);
CREATE INDEX payment_requests_counterparty_id_idx ON public.payment_requests USING btree (counterparty_id);
CREATE INDEX payment_requests_expense_type_id_idx ON public.payment_requests USING btree (expense_type_id);
CREATE INDEX payment_requests_fund_id_idx ON public.payment_requests USING btree (fund_id);
CREATE INDEX payment_requests_location_id_status_idx ON public.payment_requests USING btree (location_id, status);
CREATE INDEX payment_requests_period_id_idx ON public.payment_requests USING btree (period_id);
CREATE INDEX payment_requests_period_paid_id_idx ON public.payment_requests USING btree (period_paid_id);
CREATE INDEX payment_requests_position_id_idx ON public.payment_requests USING btree (position_id);
CREATE INDEX payment_requests_requester_id_idx ON public.payment_requests USING btree (requester_id);
CREATE INDEX payroll_lines_person_id_idx ON public.payroll_lines USING btree (person_id);
CREATE INDEX payroll_lines_sheet_id_idx ON public.payroll_lines USING btree (sheet_id);
CREATE INDEX payroll_sheets_period_id_idx ON public.payroll_sheets USING btree (period_id);
CREATE INDEX period_distribution_overrides_rule_id_idx ON public.period_distribution_overrides USING btree (rule_id);
CREATE INDEX position_assignments_position_id_idx ON public.position_assignments USING btree (position_id);
CREATE INDEX reconciliations_period_id_idx ON public.reconciliations USING btree (period_id);
CREATE INDEX request_attachments_request_id_idx ON public.request_attachments USING btree (request_id);
CREATE INDEX request_comments_request_id_idx ON public.request_comments USING btree (request_id);
CREATE INDEX statistic_dated_values_stat_date_idx ON public.statistic_dated_values USING btree (statistic_id, value_date);
CREATE INDEX statistic_values_period_id_idx ON public.statistic_values USING btree (period_id);
CREATE INDEX statistic_values_statistic_id_period_id_idx ON public.statistic_values USING btree (statistic_id, period_id);
CREATE INDEX statistics_location_id_idx ON public.statistics USING btree (location_id);
CREATE INDEX statistics_owner_id_idx ON public.statistics USING btree (owner_id);
CREATE INDEX statistics_position_id_idx ON public.statistics USING btree (position_id);
CREATE INDEX supplier_bills_counterparty_id_idx ON public.supplier_bills USING btree (counterparty_id);
CREATE INDEX supplier_bills_expense_type_id_idx ON public.supplier_bills USING btree (expense_type_id);
CREATE INDEX supplier_bills_kind_idx ON public.supplier_bills USING btree (kind, status);
CREATE INDEX supplier_bills_location_id_status_idx ON public.supplier_bills USING btree (location_id, status);
CREATE INDEX supplier_bills_period_approved_id_idx ON public.supplier_bills USING btree (period_approved_id);
CREATE INDEX supplier_bills_period_paid_id_idx ON public.supplier_bills USING btree (period_paid_id);
CREATE INDEX task_comments_task_idx ON public.task_comments USING btree (task_id, created_at);
CREATE INDEX tasks_from_idx ON public.tasks USING btree (from_id);
CREATE INDEX tasks_location_idx ON public.tasks USING btree (location_id);
CREATE INDEX tasks_position_id_idx ON public.tasks USING btree (position_id);
CREATE INDEX tasks_status_idx ON public.tasks USING btree (status);
CREATE INDEX tasks_to_idx ON public.tasks USING btree (to_id);
CREATE INDEX user_location_access_location_id_idx ON public.user_location_access USING btree (location_id);

-- ============================================================================
-- 6. ПРЕДСТАВЛЕНИЯ (VIEWS)
-- ============================================================================
-- В схеме public представлений нет (0 на дату снимка).

-- ============================================================================
-- 7. ФУНКЦИИ (48)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.app_secret(p_name text)
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
  select decrypted_secret from vault.decrypted_secrets where name = p_name limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.fp_cash_transfer(p_from uuid, p_to uuid, p_amount numeric, p_period_id uuid, p_comment text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_status period_status;
  v_bal numeric;
  v_pair uuid := gen_random_uuid();
begin
  if not (is_fin_admin() or my_role() = 'accountant') then
    raise exception 'Перемещать средства между счетами может финдиректор, владелец или бухгалтер';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Сумма должна быть больше нуля'; end if;
  if p_from = p_to then raise exception 'Выберите два разных счёта'; end if;
  if not exists (select 1 from cash_accounts where id = p_to and not is_archived) then
    raise exception 'Счёт-получатель не найден';
  end if;
  select balance into v_bal from cash_accounts where id = p_from and not is_archived for update;
  if v_bal is null then raise exception 'Счёт-источник не найден'; end if;
  if v_bal < p_amount then
    raise exception 'Недостаточно средств на счёте (остаток %, перемещение %)', v_bal, p_amount;
  end if;
  select status into v_status from fp_periods where id = p_period_id;
  if v_status is null then raise exception 'Период ФП не найден'; end if;
  if v_status = 'closed' then raise exception 'Период закрыт — операции запрещены'; end if;

  insert into fp_register (op_type, period_id, cash_account_id, cash_amount, pair_id, comment, created_by)
  values ('cash_transfer', p_period_id, p_from, -p_amount, v_pair, p_comment, auth.uid());
  insert into fp_register (op_type, period_id, cash_account_id, cash_amount, pair_id, comment, created_by)
  values ('cash_transfer', p_period_id, p_to, p_amount, v_pair, p_comment, auth.uid());
end $function$
;

CREATE OR REPLACE FUNCTION public.fp_chart_turnover(p_period_id uuid)
 RETURNS TABLE(code text, name text, account_type text, opening numeric, debit_turnover numeric, credit_turnover numeric, closing numeric)
 LANGUAGE sql
 STABLE
AS $function$
  with target as (
    select starts_on, ends_on from public.fp_periods where id = p_period_id
  ),
  comp as (
    select coalesce(p.ends_on, (fr.created_at at time zone 'Asia/Dushanbe')::date) as ed,
      fr.op_type, c.component, c.amt
    from public.fp_register fr
    left join public.fp_periods p on p.id = fr.period_id
    cross join lateral (values ('cash', fr.cash_amount), ('fund', fr.fund_amount)) as c(component, amt)
    where c.amt is not null and c.amt <> 0
  ),
  lines as (
    select comp.ed,
      case when comp.amt >= 0 then coalesce(r.debit_code, '99') else coalesce(r.credit_code, '99') end as dcode,
      case when comp.amt >= 0 then coalesce(r.credit_code, '99') else coalesce(r.debit_code, '99') end as ccode,
      abs(comp.amt) as amount
    from comp
    left join public.posting_rules r on r.op_type = comp.op_type and r.component = comp.component
  ),
  by_code as (
    select l.dcode as code, l.ed, l.amount as debit, 0::numeric as credit from lines l
    union all
    select l.ccode, l.ed, 0::numeric, l.amount from lines l
  ),
  named as (
    select b.*, acc.name, acc.account_type
    from by_code b
    left join lateral (
      select ca.name, ca.account_type from public.chart_accounts ca
      where lower(ca.code) = lower(b.code)
      order by ca.is_archived asc limit 1
    ) acc on true
  )
  select n.code,
    coalesce(max(n.name), '(нет в плане счетов)'),
    coalesce(max(n.account_type), 'equity'),
    coalesce(sum(n.debit - n.credit) filter (where n.ed < t.starts_on), 0),
    coalesce(sum(n.debit)  filter (where n.ed between t.starts_on and t.ends_on), 0),
    coalesce(sum(n.credit) filter (where n.ed between t.starts_on and t.ends_on), 0),
    coalesce(sum(n.debit - n.credit) filter (where n.ed <= t.ends_on), 0)
  from named n
  cross join target t
  group by n.code
  order by n.code;
$function$
;

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
  v_exec   boolean;
  v_baf    boolean;
begin
  if not is_fin_admin() then
    raise exception 'Закрывать период может только финдиректор или владелец';
  end if;

  select status, ends_on, is_executive_confirmed, is_baf_confirmed
    into v_status, v_ends, v_exec, v_baf
    from fp_periods where id = p_period_id;
  if v_status is null then
    raise exception 'Период ФП не найден';
  end if;
  if v_status = 'closed' then
    raise exception 'Период уже закрыт';
  end if;
  if not v_exec then
    raise exception 'Нет исполнительного подтверждения недели';
  end if;
  if not v_baf then
    raise exception 'Нет подтверждения финкомитета (BAF)';
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

  select status into v_status from fp_periods where id = p_period_id for update;
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

CREATE OR REPLACE FUNCTION public.fp_fund_income(p_fund uuid, p_amount numeric, p_period_id uuid, p_comment text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_status period_status;
begin
  if not is_fin_admin() then
    raise exception 'Приходовать средства в фонд может только финдиректор или владелец';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Сумма должна быть больше нуля'; end if;
  if not exists (select 1 from funds where id = p_fund and not is_archived) then raise exception 'Фонд не найден'; end if;
  select status into v_status from fp_periods where id = p_period_id;
  if v_status is null then raise exception 'Период ФП не найден'; end if;
  if v_status = 'closed' then raise exception 'Период закрыт — операции запрещены'; end if;

  insert into fp_register (op_type, period_id, fund_id, fund_amount, comment, created_by)
  values ('fund_income', p_period_id, p_fund, p_amount, p_comment, auth.uid());
end $function$
;

CREATE OR REPLACE FUNCTION public.fp_fund_loan(p_from uuid, p_to uuid, p_amount numeric, p_period_id uuid, p_comment text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_status period_status;
  v_pair uuid := gen_random_uuid();
  v_id bigint;
begin
  if not is_fin_admin() then
    raise exception 'Выдавать займы между фондами может только финдиректор или владелец';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Сумма должна быть больше нуля'; end if;
  if p_from = p_to then raise exception 'Выберите два разных фонда'; end if;
  if not exists (select 1 from funds where id = p_from and not is_archived) then raise exception 'Фонд-кредитор не найден'; end if;
  if not exists (select 1 from funds where id = p_to and not is_archived) then raise exception 'Фонд-заёмщик не найден'; end if;
  if exists (select 1 from funds where id = p_from and no_transfer) then
    raise exception 'Из фонда-кредитора запрещено перемещение средств (стоит «Запрет перемещения»)';
  end if;
  select status into v_status from fp_periods where id = p_period_id;
  if v_status is null then raise exception 'Период ФП не найден'; end if;
  if v_status = 'closed' then raise exception 'Период закрыт — операции запрещены'; end if;

  insert into fp_register (op_type, period_id, fund_id, fund_amount, pair_id, comment, created_by)
  values ('fund_loan', p_period_id, p_from, -p_amount, v_pair, p_comment, auth.uid())
  returning id into v_id;
  insert into fp_register (op_type, period_id, fund_id, fund_amount, pair_id, comment, created_by)
  values ('fund_loan', p_period_id, p_to, p_amount, v_pair, p_comment, auth.uid());
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.fp_fund_loan_return(p_loan_id bigint, p_amount numeric, p_period_id uuid, p_comment text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  parent fp_register%rowtype;
  v_borrower uuid;
  v_status period_status;
  v_returned numeric;
  v_out numeric;
  v_pair uuid := gen_random_uuid();
begin
  if not is_fin_admin() then
    raise exception 'Возвращать займы может только финдиректор или владелец';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Сумма должна быть больше нуля'; end if;

  select * into parent from fp_register
  where id = p_loan_id and op_type = 'fund_loan' and fund_amount < 0;
  if parent.id is null then raise exception 'Заём не найден'; end if;

  select fund_id into v_borrower from fp_register
  where pair_id = parent.pair_id and id <> parent.id;
  if v_borrower is null then raise exception 'Не найден фонд-заёмщик по этому займу'; end if;

  select status into v_status from fp_periods where id = p_period_id;
  if v_status is null then raise exception 'Период ФП не найден'; end if;
  if v_status = 'closed' then raise exception 'Период закрыт — операции запрещены'; end if;

  select coalesce(sum(fund_amount), 0) into v_returned from fp_register
  where loan_parent_id = p_loan_id and op_type = 'fund_loan_return' and fund_amount > 0;
  v_out := -parent.fund_amount - v_returned;
  if p_amount > v_out then
    raise exception 'К возврату по этому займу осталось %', v_out;
  end if;

  insert into fp_register (op_type, period_id, fund_id, fund_amount, pair_id, loan_parent_id, comment, created_by)
  values ('fund_loan_return', p_period_id, v_borrower, -p_amount, v_pair, p_loan_id, p_comment, auth.uid());
  insert into fp_register (op_type, period_id, fund_id, fund_amount, pair_id, loan_parent_id, comment, created_by)
  values ('fund_loan_return', p_period_id, parent.fund_id, p_amount, v_pair, p_loan_id, p_comment, auth.uid());
end $function$
;

CREATE OR REPLACE FUNCTION public.fp_fund_return(p_fund uuid, p_amount numeric, p_period_id uuid, p_comment text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_status period_status;
begin
  if not is_fin_admin() then
    raise exception 'Изымать средства из фонда может только финдиректор или владелец';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Сумма должна быть больше нуля'; end if;
  if not exists (select 1 from funds where id = p_fund and not is_archived) then raise exception 'Фонд не найден'; end if;
  if exists (select 1 from funds where id = p_fund and no_transfer) then
    raise exception 'Из этого фонда запрещён вывод средств (стоит «Запрет перемещения»)';
  end if;
  select status into v_status from fp_periods where id = p_period_id;
  if v_status is null then raise exception 'Период ФП не найден'; end if;
  if v_status = 'closed' then raise exception 'Период закрыт — операции запрещены'; end if;

  insert into fp_register (op_type, period_id, fund_id, fund_amount, comment, created_by)
  values ('fund_return', p_period_id, p_fund, -p_amount, p_comment, auth.uid());
end $function$
;

CREATE OR REPLACE FUNCTION public.fp_fund_transfer(p_from uuid, p_to uuid, p_amount numeric, p_period_id uuid, p_comment text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_status period_status;
  v_pair uuid := gen_random_uuid();
begin
  if not is_fin_admin() then
    raise exception 'Перемещать средства между фондами может только финдиректор или владелец';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Сумма должна быть больше нуля'; end if;
  if p_from = p_to then raise exception 'Выберите два разных фонда'; end if;
  if not exists (select 1 from funds where id = p_from and not is_archived) then raise exception 'Фонд-источник не найден'; end if;
  if not exists (select 1 from funds where id = p_to and not is_archived) then raise exception 'Фонд-получатель не найден'; end if;
  if exists (select 1 from funds where id = p_from and no_transfer) then
    raise exception 'Из фонда-источника запрещено перемещение средств (стоит «Запрет перемещения»)';
  end if;
  select status into v_status from fp_periods where id = p_period_id;
  if v_status is null then raise exception 'Период ФП не найден'; end if;
  if v_status = 'closed' then raise exception 'Период закрыт — операции запрещены'; end if;

  insert into fp_register (op_type, period_id, fund_id, fund_amount, pair_id, comment, created_by)
  values ('fund_transfer', p_period_id, p_from, -p_amount, v_pair, p_comment, auth.uid());
  insert into fp_register (op_type, period_id, fund_id, fund_amount, pair_id, comment, created_by)
  values ('fund_transfer', p_period_id, p_to, p_amount, v_pair, p_comment, auth.uid());
end $function$
;

CREATE OR REPLACE FUNCTION public.fp_generate_due_reminders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := (select auth.uid());
  cnt integer := 0;
  today date := (now() at time zone 'Asia/Dushanbe')::date;
  r record;
begin
  if me is null then return 0; end if;

  for r in
    select t.id, t.title, t.due_date
    from public.tasks t
    where t.to_id = me
      and t.status <> 'done'::task_status
      and t.is_archived = false
      and t.due_date is not null
      and t.due_date <= today
      and not exists (
        select 1 from public.notifications n
        where n.user_id = me and n.kind = 'reminder' and n.request_id = t.id and n.is_read = false
      )
  loop
    insert into public.notifications(user_id, kind, title, body, module, view_key, request_id)
    values (me, 'reminder',
      case when r.due_date < today then 'Просрочена задача: ' || r.title
           else 'Сегодня срок задачи: ' || r.title end,
      'Срок: ' || to_char(r.due_date, 'DD.MM.YYYY'),
      'dashboard', 'd_tasks', r.id);
    cnt := cnt + 1;
  end loop;

  for r in
    select l.id, l.name, l.due_date
    from public.crm_leads l
    left join public.crm_stages s on s.id = l.stage_id
    where l.responsible_id = me
      and l.due_date is not null
      and l.due_date <= today
      and coalesce(s.is_won, false) = false
      and coalesce(s.is_lost, false) = false
      and not exists (
        select 1 from public.notifications n
        where n.user_id = me and n.kind = 'reminder' and n.request_id = l.id and n.is_read = false
      )
  loop
    insert into public.notifications(user_id, kind, title, body, module, view_key, request_id)
    values (me, 'reminder',
      case when r.due_date < today then 'Просрочен лид: ' || coalesce(r.name, 'без имени')
           else 'Сегодня по лиду: ' || coalesce(r.name, 'без имени') end,
      'Следующий шаг: ' || to_char(r.due_date, 'DD.MM.YYYY'),
      'crm', 'c_funnel', r.id);
    cnt := cnt + 1;
  end loop;

  return cnt;
end $function$
;

CREATE OR REPLACE FUNCTION public.fp_pay_bill(p_bill_id uuid, p_cash_account_id uuid, p_period_id uuid, p_amount numeric DEFAULT NULL::numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  b supplier_bills%rowtype;
  v_status period_status;
  v_total numeric; v_remaining numeric; v_pay numeric;
  v_base numeric; v_rate numeric; v_is_base boolean; v_base_cur uuid; v_new_paid numeric;
begin
  if not (is_fin_admin() or my_role() = 'accountant') then
    raise exception 'Оплачивать счета может финдиректор, владелец или бухгалтер';
  end if;
  select * into b from supplier_bills where id = p_bill_id for update;
  if b.id is null then raise exception 'Счёт не найден'; end if;
  if b.status <> 'approved' then raise exception 'Оплатить можно только одобренный счёт'; end if;
  if b.fund_id is null then raise exception 'У счёта не назначен фонд-источник'; end if;
  if exists (select 1 from funds where id = b.fund_id and kind = 'accumulative') then
    raise exception 'Накопительный фонд нельзя использовать для оплаты счетов';
  end if;

  v_total := b.amount;
  v_remaining := round(v_total - coalesce(b.paid_amount, 0), 2);
  v_pay := round(coalesce(p_amount, v_remaining), 2);
  if v_pay <= 0 then raise exception 'Сумма оплаты должна быть больше нуля'; end if;
  if v_pay > v_remaining + 0.005 then
    raise exception 'Сумма оплаты (%) больше остатка к оплате (%)', v_pay, v_remaining;
  end if;

  select status into v_status from fp_periods where id = p_period_id;
  if v_status is null then raise exception 'Период ФП не найден'; end if;
  if v_status = 'closed' then raise exception 'Период закрыт — операции запрещены'; end if;
  if not exists (select 1 from cash_accounts where id = p_cash_account_id and not is_archived) then
    raise exception 'Счёт ДС не найден';
  end if;

  select is_base into v_is_base from currencies where id = b.currency_id;
  if v_is_base then v_base := v_pay;
  else
    select id into v_base_cur from currencies where is_base limit 1;
    select rate into v_rate from exchange_rates
      where from_cur_id = b.currency_id and to_cur_id = v_base_cur and valid_from <= current_date
      order by valid_from desc limit 1;
    if v_rate is null then raise exception 'Нет курса валюты счёта к базовой — добавьте курс'; end if;
    v_base := round(v_pay * v_rate, 2);
  end if;

  insert into fp_register (op_type, period_id, fund_id, fund_amount, cash_account_id, cash_amount,
    bill_id, counterparty_id, currency_id, fx_rate, comment, created_by)
  values ('bill_payment', p_period_id, b.fund_id, -v_base, p_cash_account_id, -v_base,
    b.id, b.counterparty_id, b.currency_id, v_rate, 'Оплата счёта №' || b.number, auth.uid());

  v_new_paid := round(coalesce(b.paid_amount, 0) + v_pay, 2);
  update supplier_bills
    set paid_amount = v_new_paid, period_paid_id = p_period_id,
        status = case when v_new_paid >= v_total - 0.005 then 'paid'::request_status else 'approved'::request_status end
    where id = b.id;
end $function$
;

CREATE OR REPLACE FUNCTION public.fp_pay_invoice(p_invoice_id uuid, p_amount numeric, p_cash_account_id uuid, p_payment_type_id uuid, p_period_id uuid, p_received_on date DEFAULT CURRENT_DATE)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  inv client_invoices%rowtype;
  v_status period_status;
  v_paid numeric;
  v_base numeric;
  v_rate numeric;
  v_is_base boolean;
  v_base_cur uuid;
begin
  if not (is_fin_admin() or my_role() = any (array['accountant','location_manager']::app_role[])) then
    raise exception 'Принимать оплату может финдиректор, владелец, бухгалтер или управляющий';
  end if;

  select * into inv from client_invoices where id = p_invoice_id;
  if inv.id is null then raise exception 'Счёт клиента не найден'; end if;
  if inv.status = 'cancelled' then raise exception 'Счёт отменён'; end if;
  if inv.status = 'paid' then raise exception 'Счёт уже оплачен полностью'; end if;
  if not has_location_access(inv.location_id) then raise exception 'Нет доступа к точке этого счёта'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Сумма должна быть больше нуля'; end if;

  select coalesce(sum(case when is_return then -amount else amount end), 0) into v_paid
  from incomes where invoice_id = inv.id;
  if p_amount > inv.amount - v_paid + 0.009 then
    raise exception 'Долг по счёту: % — нельзя принять больше', inv.amount - v_paid;
  end if;

  select status into v_status from fp_periods where id = p_period_id;
  if v_status is null then raise exception 'Период ФП не найден'; end if;
  if v_status = 'closed' then raise exception 'Период закрыт — операции запрещены'; end if;

  if not exists (select 1 from cash_accounts where id = p_cash_account_id and not is_archived) then
    raise exception 'Счёт ДС не найден';
  end if;

  select is_base into v_is_base from currencies where id = inv.currency_id;
  if v_is_base then
    v_base := p_amount;
  else
    select id into v_base_cur from currencies where is_base limit 1;
    select rate into v_rate from exchange_rates
    where from_cur_id = inv.currency_id and to_cur_id = v_base_cur and valid_from <= p_received_on
    order by valid_from desc limit 1;
    if v_rate is null then raise exception 'Нет курса валюты счёта к базовой — добавьте курс'; end if;
    v_base := round(p_amount * v_rate, 2);
  end if;

  insert into incomes (income_type_id, location_id, period_id, amount, currency_id, amount_base,
    received_on, cash_account_id, payment_type_id, counterparty_id, invoice_id,
    source, comment, created_by)
  values (inv.income_type_id, inv.location_id, p_period_id, p_amount, inv.currency_id, v_base,
    p_received_on, p_cash_account_id, p_payment_type_id, inv.counterparty_id, inv.id,
    'invoice', 'Оплата счёта клиента №' || inv.number || ' · ' || inv.event_name, auth.uid());

  update client_invoices
  set status = case when v_paid + p_amount >= amount - 0.009 then 'paid'::client_invoice_status
                    else 'issued'::client_invoice_status end
  where id = inv.id;
end $function$
;

CREATE OR REPLACE FUNCTION public.fp_pay_payroll(p_sheet_id uuid, p_cash_account_id uuid, p_period_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s payroll_sheets%rowtype;
  v_status period_status;
  v_total numeric;
begin
  if not (is_fin_admin() or my_role() = 'accountant') then
    raise exception 'Выплачивать ЗП может финдиректор, владелец или бухгалтер';
  end if;

  select * into s from payroll_sheets where id = p_sheet_id;
  if s.id is null then raise exception 'Ведомость не найдена'; end if;
  if s.status <> 'approved' then raise exception 'Выплатить можно только утверждённую ведомость'; end if;
  if s.fund_id is null then raise exception 'У ведомости не назначен фонд-источник (ФД3)'; end if;

  select coalesce(sum(accrued - advance - deduction), 0) into v_total
  from payroll_lines where sheet_id = s.id;
  if v_total <= 0 then raise exception 'Сумма к выплате по ведомости равна нулю'; end if;

  select status into v_status from fp_periods where id = p_period_id;
  if v_status is null then raise exception 'Период ФП не найден'; end if;
  if v_status = 'closed' then raise exception 'Период закрыт — операции запрещены'; end if;

  if not exists (select 1 from cash_accounts where id = p_cash_account_id and not is_archived) then
    raise exception 'Счёт ДС не найден';
  end if;

  insert into fp_register (op_type, period_id, fund_id, fund_amount, cash_account_id, cash_amount,
    payroll_sheet_id, comment, created_by)
  values ('payroll_payment', p_period_id, s.fund_id, -v_total, p_cash_account_id, -v_total,
    s.id, 'Выплата ЗП · ведомость №' || s.number, auth.uid());

  update payroll_sheets set status = 'paid' where id = s.id;
end $function$
;

CREATE OR REPLACE FUNCTION public.fp_pay_request(p_request_id uuid, p_cash_account_id uuid, p_period_id uuid, p_amount numeric DEFAULT NULL::numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r payment_requests%rowtype;
  v_status period_status;
  v_total numeric; v_remaining numeric; v_pay numeric;
  v_base numeric; v_rate numeric; v_is_base boolean; v_base_cur uuid; v_new_paid numeric;
begin
  if not (is_fin_admin() or my_role() = 'accountant') then
    raise exception 'Оплачивать заявки может финдиректор, владелец или бухгалтер';
  end if;
  select * into r from payment_requests where id = p_request_id for update;
  if r.id is null then raise exception 'Заявка не найдена'; end if;
  if r.status <> 'approved' then raise exception 'Оплатить можно только одобренную заявку'; end if;
  if r.fund_id is null then raise exception 'У заявки не назначен фонд-источник'; end if;
  if exists (select 1 from funds where id = r.fund_id and kind = 'accumulative') then
    raise exception 'Накопительный фонд нельзя использовать для оплаты заявок';
  end if;

  v_total := coalesce(r.approved_amount, r.planned_amount);
  v_remaining := round(v_total - coalesce(r.paid_amount, 0), 2);
  v_pay := round(coalesce(p_amount, v_remaining), 2);
  if v_pay <= 0 then raise exception 'Сумма оплаты должна быть больше нуля'; end if;
  if v_pay > v_remaining + 0.005 then
    raise exception 'Сумма оплаты (%) больше остатка к оплате (%)', v_pay, v_remaining;
  end if;

  select status into v_status from fp_periods where id = p_period_id;
  if v_status is null then raise exception 'Период ФП не найден'; end if;
  if v_status = 'closed' then raise exception 'Период закрыт — операции запрещены'; end if;
  if not exists (select 1 from cash_accounts where id = p_cash_account_id and not is_archived) then
    raise exception 'Счёт ДС не найден';
  end if;

  select is_base into v_is_base from currencies where id = r.currency_id;
  if v_is_base then v_base := v_pay;
  else
    select id into v_base_cur from currencies where is_base limit 1;
    select rate into v_rate from exchange_rates
      where from_cur_id = r.currency_id and to_cur_id = v_base_cur and valid_from <= current_date
      order by valid_from desc limit 1;
    if v_rate is null then raise exception 'Нет курса валюты заявки к базовой — добавьте курс'; end if;
    v_base := round(v_pay * v_rate, 2);
  end if;

  insert into fp_register (op_type, period_id, fund_id, fund_amount, cash_account_id, cash_amount,
    request_id, counterparty_id, payment_type_id, currency_id, fx_rate, comment, created_by)
  values ('request_payment', p_period_id, r.fund_id, -v_base, p_cash_account_id, -v_base,
    r.id, r.counterparty_id, r.payment_type_id, r.currency_id, v_rate, 'Оплата заявки №' || r.number, auth.uid());

  v_new_paid := round(coalesce(r.paid_amount, 0) + v_pay, 2);
  update payment_requests
    set paid_amount = v_new_paid, period_paid_id = p_period_id,
        status = case when v_new_paid >= v_total - 0.005 then 'paid'::request_status else 'approved'::request_status end
    where id = r.id;
end $function$
;

CREATE OR REPLACE FUNCTION public.fp_period_balances(p_period_id uuid)
 RETURNS TABLE(kind text, entity_id uuid, balance numeric)
 LANGUAGE sql
 STABLE
AS $function$
  with target as (
    select ends_on from public.fp_periods where id = p_period_id
  )
  select 'fund'::text, fr.fund_id, sum(fr.fund_amount)
  from public.fp_register fr
  left join public.fp_periods p on p.id = fr.period_id
  cross join target t
  where fr.fund_id is not null
    and coalesce(p.ends_on, (fr.created_at at time zone 'Asia/Dushanbe')::date) <= t.ends_on
  group by fr.fund_id
  union all
  select 'cash'::text, fr.cash_account_id, sum(fr.cash_amount)
  from public.fp_register fr
  left join public.fp_periods p on p.id = fr.period_id
  cross join target t
  where fr.cash_account_id is not null
    and coalesce(p.ends_on, (fr.created_at at time zone 'Asia/Dushanbe')::date) <= t.ends_on
  group by fr.cash_account_id;
$function$
;

CREATE OR REPLACE FUNCTION public.fp_postings(p_period_id uuid)
 RETURNS TABLE(reg_id bigint, posted_on date, op_type text, component text, debit_code text, debit_name text, debit_sub text, credit_code text, credit_name text, credit_sub text, amount numeric, comment text)
 LANGUAGE sql
 STABLE
AS $function$
  with target as (
    select id, starts_on, ends_on from public.fp_periods where id = p_period_id
  ),
  comp as (
    select fr.id, coalesce(t.ends_on, (fr.created_at at time zone 'Asia/Dushanbe')::date) as ed,
      fr.op_type, c.component, c.amt, fr.comment,
      ca.name as cash_name, f.name as fund_name, f.code as fund_code
    from target t
    join public.fp_register fr
      on fr.period_id = t.id
      or (fr.period_id is null
          and (fr.created_at at time zone 'Asia/Dushanbe')::date between t.starts_on and t.ends_on)
    cross join lateral (values
      ('cash', fr.cash_amount),
      ('fund', fr.fund_amount)
    ) as c(component, amt)
    left join public.cash_accounts ca on ca.id = fr.cash_account_id
    left join public.funds f on f.id = fr.fund_id
    where c.amt is not null and c.amt <> 0
  ),
  sided as (
    select comp.*,
      case when comp.amt >= 0 then coalesce(r.debit_code, '99') else coalesce(r.credit_code, '99') end as dcode,
      case when comp.amt >= 0 then coalesce(r.credit_code, '99') else coalesce(r.debit_code, '99') end as ccode,
      case comp.component
        when 'cash' then (comp.amt >= 0)
        else (comp.amt < 0)
      end as sub_on_debit,
      case comp.component when 'cash' then comp.cash_name
        else comp.fund_code || ' ' || comp.fund_name end as sub
    from comp
    left join public.posting_rules r
      on r.op_type = comp.op_type and r.component = comp.component
  )
  select
    s.id, s.ed, s.op_type::text, s.component,
    s.dcode,
    (select ca.name from public.chart_accounts ca
      where lower(ca.code) = lower(s.dcode) order by ca.is_archived asc limit 1),
    case when s.sub_on_debit then s.sub else null end,
    s.ccode,
    (select ca.name from public.chart_accounts ca
      where lower(ca.code) = lower(s.ccode) order by ca.is_archived asc limit 1),
    case when not s.sub_on_debit then s.sub else null end,
    abs(s.amt),
    s.comment
  from sided s
  order by s.ed, s.id, s.component;
$function$
;

CREATE OR REPLACE FUNCTION public.fp_reconcile_balances()
 RETURNS TABLE(kind text, entity_id uuid, code text, ledger_sum numeric, stored_balance numeric, diff numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_fin_admin() then
    raise exception 'Сверку балансов может запускать только финдиректор или владелец';
  end if;

  return query
    select 'fund'::text, f.id, f.code,
           coalesce(l.s, 0)::numeric, f.balance::numeric, (f.balance - coalesce(l.s, 0))::numeric
    from funds f
    left join (
      select fund_id, sum(fund_amount) s from fp_register where fund_id is not null group by fund_id
    ) l on l.fund_id = f.id
    where f.balance <> coalesce(l.s, 0)
    union all
    select 'cash_account'::text, c.id, c.name,
           coalesce(l.s, 0)::numeric, c.balance::numeric, (c.balance - coalesce(l.s, 0))::numeric
    from cash_accounts c
    left join (
      select cash_account_id, sum(cash_amount) s from fp_register where cash_account_id is not null group by cash_account_id
    ) l on l.cash_account_id = c.id
    where c.balance <> coalesce(l.s, 0);
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
  set status = 'open', closed_at = null, closed_by = null,
      is_executive_confirmed = false, executive_confirmed_at = null, executive_confirmed_by = null,
      is_baf_confirmed = false, baf_confirmed_at = null, baf_confirmed_by = null
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

CREATE OR REPLACE FUNCTION public.fp_reverse_bill_payment(p_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r fp_register%rowtype; v_status period_status; v_number text; v_pay_req numeric;
begin
  if not (is_fin_admin() or my_role() = 'accountant') then
    raise exception 'Отменять оплату счёта может финдиректор, владелец или бухгалтер';
  end if;
  select * into r from fp_register where id = p_id for update;
  if r.id is null then raise exception 'Операция не найдена'; end if;
  if r.op_type <> 'bill_payment' or r.reverses_id is not null then
    raise exception 'Отменить можно только оплату счёта';
  end if;
  if r.bill_id is null then raise exception 'Операция не привязана к счёту'; end if;
  if exists (select 1 from fp_register where reverses_id = r.id) then
    raise exception 'Эта оплата уже отменена';
  end if;
  select status into v_status from fp_periods where id = r.period_id;
  if v_status = 'closed' then
    raise exception 'Неделя оплаты закрыта — сначала откройте её, чтобы отменить оплату';
  end if;
  select number into v_number from supplier_bills where id = r.bill_id;

  insert into fp_register (op_type, period_id, fund_id, fund_amount, cash_account_id, cash_amount,
    bill_id, counterparty_id, currency_id, fx_rate, reverses_id, comment, created_by)
  values ('bill_payment', r.period_id, r.fund_id, -r.fund_amount, r.cash_account_id, -r.cash_amount,
    r.bill_id, r.counterparty_id, r.currency_id, r.fx_rate, r.id,
    'Отмена оплаты счёта №' || coalesce(v_number, ''), auth.uid());

  v_pay_req := round(abs(r.fund_amount) / coalesce(r.fx_rate, 1), 2);
  update supplier_bills
    set paid_amount = greatest(0, round(coalesce(paid_amount,0) - v_pay_req, 2)),
        status = 'approved'::request_status,
        period_paid_id = case when round(coalesce(paid_amount,0) - v_pay_req, 2) <= 0.005 then null else period_paid_id end
    where id = r.bill_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.fp_reverse_fund_op(p_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r fp_register%rowtype;
  leg fp_register%rowtype;
  v_pair uuid := gen_random_uuid();
  v_ret numeric;
  v_out numeric;
begin
  if not is_fin_admin() then
    raise exception 'Откатывать операции может только финдиректор или владелец';
  end if;
  select * into r from fp_register where id = p_id;
  if r.id is null then raise exception 'Операция не найдена'; end if;

  if r.op_type = 'fund_loan' then
    if r.fund_amount >= 0 then
      select * into r from fp_register where pair_id = r.pair_id and fund_amount < 0 limit 1;
      if r.id is null then raise exception 'Не найдена запись займа'; end if;
    end if;
    select coalesce(sum(fund_amount), 0) into v_ret from fp_register
      where loan_parent_id = r.id and op_type = 'fund_loan_return' and fund_amount > 0;
    v_out := -r.fund_amount - v_ret;
    if v_out <= 0 then raise exception 'Заём уже возвращён'; end if;
    perform fp_fund_loan_return(r.id, v_out, r.period_id, 'Откат займа');
    return;
  end if;

  if r.op_type not in ('fund_transfer', 'fund_income', 'fund_return') then
    raise exception 'Откатить можно только перемещение, заём, приход или возврат фонда';
  end if;

  if r.pair_id is not null then
    if exists (select 1 from fp_register rev
               join fp_register o on o.id = rev.reverses_id
               where o.pair_id = r.pair_id) then
      raise exception 'Эта операция уже откачена';
    end if;
    for leg in select * from fp_register where pair_id = r.pair_id loop
      insert into fp_register (op_type, period_id, fund_id, fund_amount, pair_id, reverses_id, comment, created_by)
      values ('adjustment', leg.period_id, leg.fund_id, -leg.fund_amount, v_pair, leg.id,
              'Откат: ' || coalesce(leg.comment, leg.op_type::text), auth.uid());
    end loop;
  else
    if exists (select 1 from fp_register where reverses_id = r.id) then
      raise exception 'Эта операция уже откачена';
    end if;
    insert into fp_register (op_type, period_id, fund_id, fund_amount, reverses_id, comment, created_by)
    values ('adjustment', r.period_id, r.fund_id, -r.fund_amount, r.id,
            'Откат: ' || coalesce(r.comment, r.op_type::text), auth.uid());
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.fp_reverse_income(p_income_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r incomes%rowtype;
  v_status period_status;
  v_paid numeric;
  inv client_invoices%rowtype;
begin
  if not (is_fin_admin() or my_role() = any (array['accountant','location_manager']::app_role[])) then
    raise exception 'Отменять операцию дохода может финдиректор, владелец, бухгалтер или управляющий';
  end if;

  select * into r from incomes where id = p_income_id for update;
  if r.id is null then raise exception 'Операция дохода не найдена'; end if;
  if r.is_return then raise exception 'Это уже возврат/сторно — нечего отменять'; end if;
  if exists (select 1 from incomes where reverses_income_id = r.id) then
    raise exception 'Эта операция уже отменена';
  end if;
  if not has_location_access(r.location_id) then raise exception 'Нет доступа к точке этой операции'; end if;

  select status into v_status from fp_periods where id = r.period_id;
  if v_status = 'closed' then
    raise exception 'Неделя операции закрыта — сначала откройте её, чтобы отменить';
  end if;

  insert into incomes (income_type_id, location_id, period_id, amount, currency_id, amount_base,
    received_on, cash_account_id, payment_type_id, counterparty_id, invoice_id,
    is_return, reverses_income_id, source, comment, created_by)
  values (r.income_type_id, r.location_id, r.period_id, r.amount, r.currency_id, r.amount_base,
    r.received_on, r.cash_account_id, r.payment_type_id, r.counterparty_id, r.invoice_id,
    true, r.id, r.source, 'Отмена операции дохода', auth.uid());

  if r.invoice_id is not null then
    select * into inv from client_invoices where id = r.invoice_id;
    if inv.id is not null and inv.status <> 'cancelled' then
      select coalesce(sum(case when is_return then -amount else amount end), 0) into v_paid
      from incomes where invoice_id = inv.id;
      update client_invoices
      set status = case when v_paid >= inv.amount - 0.009 then 'paid'::client_invoice_status
                        else 'issued'::client_invoice_status end
      where id = inv.id;
    end if;
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.fp_reverse_invoice_payment(p_income_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r incomes%rowtype;
  v_status period_status;
  v_paid numeric;
  inv client_invoices%rowtype;
begin
  if not (is_fin_admin() or my_role() = any (array['accountant','location_manager']::app_role[])) then
    raise exception 'Отменять оплату может финдиректор, владелец, бухгалтер или управляющий';
  end if;

  select * into r from incomes where id = p_income_id for update;
  if r.id is null then raise exception 'Операция дохода не найдена'; end if;
  if r.invoice_id is null or r.source <> 'invoice' then
    raise exception 'Отменить можно только оплату счёта клиента';
  end if;
  if r.is_return then raise exception 'Это уже возврат — нечего отменять'; end if;
  if exists (select 1 from incomes where reverses_income_id = r.id) then
    raise exception 'Эта оплата уже отменена';
  end if;
  if not has_location_access(r.location_id) then raise exception 'Нет доступа к точке этого счёта'; end if;

  select status into v_status from fp_periods where id = r.period_id;
  if v_status = 'closed' then
    raise exception 'Неделя оплаты закрыта — сначала откройте её, чтобы отменить оплату';
  end if;

  insert into incomes (income_type_id, location_id, period_id, amount, currency_id, amount_base,
    received_on, cash_account_id, payment_type_id, counterparty_id, invoice_id,
    is_return, reverses_income_id, source, comment, created_by)
  values (r.income_type_id, r.location_id, r.period_id, r.amount, r.currency_id, r.amount_base,
    r.received_on, r.cash_account_id, r.payment_type_id, r.counterparty_id, r.invoice_id,
    true, r.id, 'invoice', 'Отмена оплаты счёта клиента', auth.uid());

  select * into inv from client_invoices where id = r.invoice_id;
  if inv.status <> 'cancelled' then
    select coalesce(sum(case when is_return then -amount else amount end), 0) into v_paid
    from incomes where invoice_id = inv.id;
    update client_invoices
    set status = case when v_paid >= inv.amount - 0.009 then 'paid'::client_invoice_status
                      else 'issued'::client_invoice_status end
    where id = inv.id;
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.fp_reverse_request_payment(p_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r fp_register%rowtype; v_status period_status; v_number bigint; v_pay_req numeric;
begin
  if not (is_fin_admin() or my_role() = 'accountant') then
    raise exception 'Отменять оплату заявки может финдиректор, владелец или бухгалтер';
  end if;
  select * into r from fp_register where id = p_id for update;
  if r.id is null then raise exception 'Операция не найдена'; end if;
  if r.op_type <> 'request_payment' or r.reverses_id is not null then
    raise exception 'Отменить можно только оплату заявки';
  end if;
  if r.request_id is null then raise exception 'Операция не привязана к заявке'; end if;
  if exists (select 1 from fp_register where reverses_id = r.id) then
    raise exception 'Эта оплата уже отменена';
  end if;
  select status into v_status from fp_periods where id = r.period_id;
  if v_status = 'closed' then
    raise exception 'Неделя оплаты закрыта — сначала откройте её, чтобы отменить оплату';
  end if;
  select number into v_number from payment_requests where id = r.request_id;

  insert into fp_register (op_type, period_id, fund_id, fund_amount, cash_account_id, cash_amount,
    request_id, counterparty_id, payment_type_id, currency_id, fx_rate, reverses_id, comment, created_by)
  values ('request_payment', r.period_id, r.fund_id, -r.fund_amount, r.cash_account_id, -r.cash_amount,
    r.request_id, r.counterparty_id, r.payment_type_id, r.currency_id, r.fx_rate, r.id,
    'Отмена оплаты заявки №' || coalesce(v_number::text, ''), auth.uid());

  v_pay_req := round(abs(r.fund_amount) / coalesce(r.fx_rate, 1), 2);
  update payment_requests
    set paid_amount = greatest(0, round(coalesce(paid_amount,0) - v_pay_req, 2)),
        status = 'approved'::request_status,
        period_paid_id = case when round(coalesce(paid_amount,0) - v_pay_req, 2) <= 0.005 then null else period_paid_id end
    where id = r.request_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.fp_set_base_currency(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_fin_admin() then
    raise exception 'Недостаточно прав для смены базовой валюты';
  end if;
  if not exists (select 1 from public.currencies where id = p_id) then
    raise exception 'Валюта не найдена';
  end if;
  update public.currencies set is_base = (id = p_id);
end $function$
;

CREATE OR REPLACE FUNCTION public.fp_set_fund_stage(p_fund uuid, p_stage distribution_stage)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_keeper uuid;
begin
  if not is_fin_admin() then
    raise exception 'Менять этап фонда может только финдиректор или владелец';
  end if;
  if not exists (select 1 from funds where id = p_fund and not is_archived) then
    raise exception 'Фонд не найден';
  end if;

  update funds set stage = p_stage where id = p_fund;
  if p_stage is null then return; end if;

  select id into v_keeper from distribution_rules
    where fund_id = p_fund and income_type_id is null and not is_archived and stage = p_stage
    limit 1;
  if v_keeper is null then
    select id into v_keeper from distribution_rules
      where fund_id = p_fund and income_type_id is null and not is_archived
      order by priority, id limit 1;
  end if;

  if v_keeper is null then
    if not exists (select 1 from distribution_rules
                   where fund_id = p_fund and income_type_id is not null and not is_archived) then
      insert into distribution_rules (fund_id, stage, percent, income_type_id)
      values (p_fund, p_stage, 0, null);
    end if;
  else
    update distribution_rules set stage = p_stage where id = v_keeper;
    update distribution_rules set is_archived = true
      where fund_id = p_fund and income_type_id is null and not is_archived and id <> v_keeper;
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.fp_set_period_confirmation(p_period_id uuid, p_kind text, p_value boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_status period_status;
begin
  if p_kind not in ('executive', 'baf') then
    raise exception 'Неизвестный тип подтверждения: %', p_kind;
  end if;
  if p_kind = 'executive' then
    if not (my_role() = any (array['owner','fin_director','ops_director']::app_role[])) then
      raise exception 'Исполнительное подтверждение даёт исполнительный директор, финдиректор или владелец';
    end if;
  else
    if not is_fin_admin() then
      raise exception 'Подтверждение финкомитета даёт финдиректор или владелец';
    end if;
  end if;

  select status into v_status from fp_periods where id = p_period_id;
  if v_status is null then raise exception 'Период ФП не найден'; end if;
  if v_status = 'closed' then raise exception 'Период закрыт — подтверждения зафиксированы'; end if;

  if p_kind = 'executive' then
    update fp_periods set
      is_executive_confirmed = p_value,
      executive_confirmed_at = case when p_value then now() else null end,
      executive_confirmed_by = case when p_value then auth.uid() else null end
    where id = p_period_id;
  else
    update fp_periods set
      is_baf_confirmed = p_value,
      baf_confirmed_at = case when p_value then now() else null end,
      baf_confirmed_by = case when p_value then auth.uid() else null end
    where id = p_period_id;
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.fp_turnover_sheet(p_period_id uuid)
 RETURNS TABLE(kind text, entity_id uuid, opening numeric, inflow numeric, outflow numeric, closing numeric)
 LANGUAGE sql
 STABLE
AS $function$
  with target as (
    select starts_on, ends_on from public.fp_periods where id = p_period_id
  ),
  eff as (
    select fr.fund_id, fr.cash_account_id, fr.fund_amount, fr.cash_amount,
      coalesce(p.ends_on, (fr.created_at at time zone 'Asia/Dushanbe')::date) as ed
    from public.fp_register fr
    left join public.fp_periods p on p.id = fr.period_id
  )
  select 'fund'::text, e.fund_id,
    coalesce(sum(e.fund_amount) filter (where e.ed < t.starts_on), 0),
    coalesce(sum(e.fund_amount) filter (where e.ed between t.starts_on and t.ends_on and e.fund_amount > 0), 0),
    coalesce(-sum(e.fund_amount) filter (where e.ed between t.starts_on and t.ends_on and e.fund_amount < 0), 0),
    coalesce(sum(e.fund_amount) filter (where e.ed <= t.ends_on), 0)
  from eff e cross join target t
  where e.fund_id is not null
  group by e.fund_id
  union all
  select 'cash'::text, e.cash_account_id,
    coalesce(sum(e.cash_amount) filter (where e.ed < t.starts_on), 0),
    coalesce(sum(e.cash_amount) filter (where e.ed between t.starts_on and t.ends_on and e.cash_amount > 0), 0),
    coalesce(-sum(e.cash_amount) filter (where e.ed between t.starts_on and t.ends_on and e.cash_amount < 0), 0),
    coalesce(sum(e.cash_amount) filter (where e.ed <= t.ends_on), 0)
  from eff e cross join target t
  where e.cash_account_id is not null
  group by e.cash_account_id;
$function$
;

CREATE OR REPLACE FUNCTION public.fp_withdraw_request(p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_requester uuid;
  v_status    request_status;
begin
  select requester_id, status
    into v_requester, v_status
    from public.payment_requests
   where id = p_request_id
   for update;

  if not found then
    raise exception 'Заявка не найдена';
  end if;

  if v_requester is distinct from (select auth.uid()) then
    raise exception 'Отозвать можно только свою заявку';
  end if;

  if v_status <> 'submitted'::request_status then
    raise exception 'Отозвать можно только заявку на рассмотрении (статус «подана»)';
  end if;

  update public.payment_requests
     set status = 'withdrawn'::request_status
   where id = p_request_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.has_fund_access(f uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
      public.is_fin_admin()
      or exists (select 1 from public.funds
                 where id = f and not is_restricted and not is_private)
      or (exists (select 1 from public.fund_access
                  where user_id = auth.uid() and fund_id = f)
          and not exists (select 1 from public.funds where id = f and is_private))
  , false);
$function$
;

CREATE OR REPLACE FUNCTION public.has_location_access(loc uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
      public.is_fin_admin()
      or public.my_role() = 'ops_director'
      or exists (select 1 from public.user_location_access
                 where user_id = auth.uid() and location_id = loc)
  , false);
$function$
;

CREATE OR REPLACE FUNCTION public.holds_position(pos uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.position_assignments
                 where person_id = auth.uid() and position_id = pos);
$function$
;

CREATE OR REPLACE FUNCTION public.is_fin_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(public.my_role() in ('owner', 'fin_director'), false);
$function$
;

CREATE OR REPLACE FUNCTION public.my_role()
 RETURNS app_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select role from public.profiles where id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.redeem_invite(p_token text, p_full_name text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  inv invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Требуется вход в систему';
  end if;

  select * into inv from invites where token = p_token;
  if inv.id is null then raise exception 'Приглашение не найдено'; end if;
  if inv.used_by is not null then raise exception 'Приглашение уже использовано'; end if;
  if inv.expires_at < now() then raise exception 'Срок действия приглашения истёк'; end if;

  insert into profiles (id, full_name, role)
  values (auth.uid(), coalesce(nullif(trim(p_full_name), ''), 'Сотрудник'), inv.role)
  on conflict (id) do update set role = excluded.role;

  if inv.location_id is not null then
    insert into user_location_access (user_id, location_id)
    values (auth.uid(), inv.location_id)
    on conflict do nothing;
  end if;

  if inv.position_id is not null then
    insert into position_assignments (person_id, position_id, is_main)
    values (auth.uid(), inv.position_id, true)
    on conflict do nothing;
  end if;

  update invites set used_by = auth.uid(), used_at = now() where id = inv.id;
end $function$
;

CREATE OR REPLACE FUNCTION public.trg_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

CREATE OR REPLACE FUNCTION public.trg_bill_approve_funds_check()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_bal numeric;
  v_committed numeric;
  v_amount numeric;
begin
  if new.status = 'approved' and new.fund_id is not null
     and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    select balance into v_bal from funds where id = new.fund_id;
    v_amount := new.amount;
    select coalesce(sum(amount), 0) into v_committed
      from supplier_bills
      where fund_id = new.fund_id and status = 'approved' and not is_archived and id <> new.id;
    v_committed := v_committed + coalesce((select sum(coalesce(approved_amount, planned_amount))
      from payment_requests where fund_id = new.fund_id and status = 'approved'), 0);
    if v_amount > coalesce(v_bal, 0) - v_committed + 0.009 then
      raise exception 'Недостаточно средств в фонде: доступно %, к одобрению %',
        round(coalesce(v_bal, 0) - v_committed, 2), v_amount;
    end if;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.trg_income_to_register()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

CREATE OR REPLACE FUNCTION public.trg_notify_request_comment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record;
begin
  select id, number, requester_id into r from public.payment_requests where id = new.request_id;
  if not found or r.requester_id is null then return new; end if;
  -- не уведомляем автора о его же комментарии
  if new.author_id is not null and new.author_id = r.requester_id then return new; end if;
  insert into public.notifications(user_id, kind, title, body, module, view_key, request_id)
  values (r.requester_id, 'request_comment',
    case when new.is_ai then 'Финансовый директор ответил по заявке №' || r.number
         else 'Новый комментарий по заявке №' || r.number end,
    left(coalesce(new.body, ''), 140), 'finance', 'requests', r.id);
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.trg_notify_request_decision()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status is distinct from old.status
     and new.status = any (array['approved','rejected','revision','paid']::request_status[])
     and new.requester_id is not null then
    insert into public.notifications(user_id, kind, title, body, module, view_key, request_id)
    values (new.requester_id, 'request_decision',
      'Заявка №' || new.number || ': ' ||
        case new.status
          when 'approved' then 'одобрена'
          when 'rejected' then 'отклонена'
          when 'revision' then 'возвращена на доработку'
          when 'paid' then 'оплачена'
          else new.status::text end,
      new.rejection_reason, 'finance', 'requests', new.id);
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.trg_org_position_no_cycle()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.parent_id is null then return new; end if;
  if new.parent_id = new.id then
    raise exception 'Пост не может быть подчинён сам себе';
  end if;
  if exists (
    with recursive anc as (
      select id, parent_id from public.org_positions where id = new.parent_id
      union all
      select o.id, o.parent_id from public.org_positions o join anc on o.id = anc.parent_id
    )
    select 1 from anc where id = new.id
  ) then
    raise exception 'Циклическая ссылка в иерархии постов (пост стал бы своим предком)';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.trg_register_balances()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
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
 SET search_path TO 'public'
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

CREATE OR REPLACE FUNCTION public.trg_register_no_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  raise exception 'Реестр fp_register неизменяем: коррекция — только встречной проводкой или сбросом (reset)';
end $function$
;

CREATE OR REPLACE FUNCTION public.trg_register_period_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
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

CREATE OR REPLACE FUNCTION public.trg_request_approve_funds_check()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_bal numeric;
  v_committed numeric;
  v_amount numeric;
begin
  if new.status = 'approved' and new.fund_id is not null
     and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    select balance into v_bal from funds where id = new.fund_id;
    v_amount := coalesce(new.approved_amount, new.planned_amount);
    select coalesce(sum(coalesce(approved_amount, planned_amount)), 0) into v_committed
      from payment_requests
      where fund_id = new.fund_id and status = 'approved' and id <> new.id;
    v_committed := v_committed + coalesce((select sum(amount) from supplier_bills
      where fund_id = new.fund_id and status = 'approved' and not is_archived), 0);
    if v_amount > coalesce(v_bal, 0) - v_committed + 0.009 then
      raise exception 'Недостаточно средств в фонде: доступно %, к одобрению %',
        round(coalesce(v_bal, 0) - v_committed, 2), v_amount;
    end if;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.trg_request_period_open_check()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_status period_status;
begin
  if new.period_id is not null
     and (tg_op = 'INSERT' or new.period_id is distinct from old.period_id) then
    select status into v_status from fp_periods where id = new.period_id;
    if v_status = 'closed' then
      raise exception 'Неделя ФП закрыта — нельзя подать или перенести заявку в закрытый период'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $function$
;

-- ============================================================================
-- 8. ТРИГГЕРЫ (22)
-- ============================================================================

CREATE TRIGGER audit_client_invoices AFTER INSERT OR DELETE OR UPDATE ON public.client_invoices FOR EACH ROW EXECUTE FUNCTION trg_audit();
CREATE TRIGGER audit_crm_leads AFTER INSERT OR DELETE OR UPDATE ON public.crm_leads FOR EACH ROW EXECUTE FUNCTION trg_audit();
CREATE TRIGGER audit_directives AFTER INSERT OR DELETE OR UPDATE ON public.directives FOR EACH ROW EXECUTE FUNCTION trg_audit();
CREATE TRIGGER audit_fp_periods AFTER INSERT OR DELETE OR UPDATE ON public.fp_periods FOR EACH ROW EXECUTE FUNCTION trg_audit();
CREATE TRIGGER audit_fp_register AFTER INSERT OR DELETE OR UPDATE ON public.fp_register FOR EACH ROW EXECUTE FUNCTION trg_audit();
CREATE TRIGGER fp_register_balances AFTER INSERT OR DELETE ON public.fp_register FOR EACH ROW EXECUTE FUNCTION trg_register_balances();
CREATE TRIGGER fp_register_no_update BEFORE UPDATE ON public.fp_register FOR EACH ROW EXECUTE FUNCTION trg_register_no_update();
CREATE TRIGGER fp_register_overdraft BEFORE INSERT ON public.fp_register FOR EACH ROW EXECUTE FUNCTION trg_register_no_overdraft();
CREATE TRIGGER fp_register_period_lock BEFORE INSERT ON public.fp_register FOR EACH ROW EXECUTE FUNCTION trg_register_period_lock();
CREATE TRIGGER audit_funds AFTER DELETE OR UPDATE ON public.funds FOR EACH ROW EXECUTE FUNCTION trg_audit();
CREATE TRIGGER audit_incomes AFTER INSERT OR DELETE OR UPDATE ON public.incomes FOR EACH ROW EXECUTE FUNCTION trg_audit();
CREATE TRIGGER income_to_register AFTER INSERT ON public.incomes FOR EACH ROW EXECUTE FUNCTION trg_income_to_register();
CREATE TRIGGER org_position_no_cycle BEFORE INSERT OR UPDATE OF parent_id ON public.org_positions FOR EACH ROW EXECUTE FUNCTION trg_org_position_no_cycle();
CREATE TRIGGER audit_payment_requests AFTER INSERT OR DELETE OR UPDATE ON public.payment_requests FOR EACH ROW EXECUTE FUNCTION trg_audit();
CREATE TRIGGER notify_request_decision AFTER UPDATE OF status ON public.payment_requests FOR EACH ROW EXECUTE FUNCTION trg_notify_request_decision();
CREATE TRIGGER request_approve_funds_check BEFORE INSERT OR UPDATE ON public.payment_requests FOR EACH ROW EXECUTE FUNCTION trg_request_approve_funds_check();
CREATE TRIGGER request_period_open_check BEFORE INSERT OR UPDATE ON public.payment_requests FOR EACH ROW EXECUTE FUNCTION trg_request_period_open_check();
CREATE TRIGGER audit_payroll_sheets AFTER INSERT OR DELETE OR UPDATE ON public.payroll_sheets FOR EACH ROW EXECUTE FUNCTION trg_audit();
CREATE TRIGGER audit_reconciliations AFTER INSERT OR DELETE OR UPDATE ON public.reconciliations FOR EACH ROW EXECUTE FUNCTION trg_audit();
CREATE TRIGGER notify_request_comment AFTER INSERT ON public.request_comments FOR EACH ROW EXECUTE FUNCTION trg_notify_request_comment();
CREATE TRIGGER audit_supplier_bills AFTER INSERT OR DELETE OR UPDATE ON public.supplier_bills FOR EACH ROW EXECUTE FUNCTION trg_audit();
CREATE TRIGGER bill_approve_funds_check BEFORE INSERT OR UPDATE ON public.supplier_bills FOR EACH ROW EXECUTE FUNCTION trg_bill_approve_funds_check();

-- ============================================================================
-- 9. RLS: ВКЛЮЧЕНИЕ НА ТАБЛИЦАХ (55)
-- ============================================================================

alter table public.audit_log enable row level security;
alter table public.battle_plan_items enable row level security;
alter table public.bill_attachments enable row level security;
alter table public.cash_account_folders enable row level security;
alter table public.cash_accounts enable row level security;
alter table public.chart_accounts enable row level security;
alter table public.client_invoices enable row level security;
alter table public.counterparties enable row level security;
alter table public.counterparty_attachments enable row level security;
alter table public.counterparty_categories enable row level security;
alter table public.counterparty_contacts enable row level security;
alter table public.crm_clients enable row level security;
alter table public.crm_halls enable row level security;
alter table public.crm_lead_checklist enable row level security;
alter table public.crm_leads enable row level security;
alter table public.crm_stages enable row level security;
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
alter table public.invoice_attachments enable row level security;
alter table public.locations enable row level security;
alter table public.massmail_campaigns enable row level security;
alter table public.massmail_recipients enable row level security;
alter table public.notifications enable row level security;
alter table public.org_divisions enable row level security;
alter table public.org_positions enable row level security;
alter table public.payment_requests enable row level security;
alter table public.payment_types enable row level security;
alter table public.payroll_lines enable row level security;
alter table public.payroll_sheets enable row level security;
alter table public.period_distribution_overrides enable row level security;
alter table public.position_assignments enable row level security;
alter table public.posting_rules enable row level security;
alter table public.profiles enable row level security;
alter table public.reconciliations enable row level security;
alter table public.request_attachments enable row level security;
alter table public.request_comments enable row level security;
alter table public.statistic_dated_values enable row level security;
alter table public.statistic_values enable row level security;
alter table public.statistics enable row level security;
alter table public.supplier_bills enable row level security;
alter table public.task_comments enable row level security;
alter table public.tasks enable row level security;
alter table public.user_location_access enable row level security;

-- ============================================================================
-- 10. RLS-ПОЛИТИКИ (134)
-- ============================================================================

create policy audit_read on public.audit_log as permissive for select to public
  using (is_fin_admin());
create policy audit_read_crm_leads on public.audit_log as permissive for select to public
  using (((table_name = 'crm_leads'::text) AND (EXISTS ( SELECT 1
   FROM crm_leads l
  WHERE ((l.id)::text = audit_log.record_id)))));
create policy bp_insert on public.battle_plan_items as permissive for insert to public
  with check ((owner_id = ( SELECT auth.uid() AS uid)));
create policy bp_read on public.battle_plan_items as permissive for select to public
  using ((( SELECT is_fin_admin() AS is_fin_admin) OR (owner_id = ( SELECT auth.uid() AS uid))));
create policy bp_update on public.battle_plan_items as permissive for update to public
  using ((owner_id = ( SELECT auth.uid() AS uid)));
create policy batt_delete on public.bill_attachments as permissive for delete to public
  using (((uploaded_by = ( SELECT auth.uid() AS uid)) OR ( SELECT is_fin_admin() AS is_fin_admin)));
create policy batt_insert on public.bill_attachments as permissive for insert to public
  with check (((uploaded_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM supplier_bills b
  WHERE (b.id = bill_attachments.bill_id)))));
create policy batt_read on public.bill_attachments as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM supplier_bills b
  WHERE (b.id = bill_attachments.bill_id))));
create policy ca_folders_rw on public.cash_account_folders as permissive for all to public
  using ((is_fin_admin() OR (my_role() = 'accountant'::app_role)))
  with check ((is_fin_admin() OR (my_role() = 'accountant'::app_role)));
create policy ca_read on public.cash_accounts as permissive for select to public
  using ((is_fin_admin() OR (my_role() = 'accountant'::app_role) OR ((location_id IS NOT NULL) AND has_location_access(location_id))));
create policy ca_write on public.cash_accounts as permissive for all to public
  using ((is_fin_admin() OR (my_role() = 'accountant'::app_role)))
  with check ((is_fin_admin() OR (my_role() = 'accountant'::app_role)));
create policy ca_insert on public.chart_accounts as permissive for insert to public
  with check (is_fin_admin());
create policy ca_read on public.chart_accounts as permissive for select to public
  using (true);
create policy ca_update on public.chart_accounts as permissive for update to public
  using (is_fin_admin())
  with check (is_fin_admin());
create policy cinv_insert on public.client_invoices as permissive for insert to public
  with check (((created_by = ( SELECT auth.uid() AS uid)) AND has_location_access(location_id) AND (( SELECT my_role() AS my_role) = ANY (ARRAY['owner'::app_role, 'fin_director'::app_role, 'accountant'::app_role, 'location_manager'::app_role, 'ops_director'::app_role])) AND (status = ANY (ARRAY['planned'::client_invoice_status, 'issued'::client_invoice_status]))));
create policy cinv_read on public.client_invoices as permissive for select to public
  using ((( SELECT is_fin_admin() AS is_fin_admin) OR (( SELECT my_role() AS my_role) = 'accountant'::app_role) OR has_location_access(location_id)));
create policy cinv_update on public.client_invoices as permissive for update to public
  using ((( SELECT is_fin_admin() AS is_fin_admin) OR (( SELECT my_role() AS my_role) = 'accountant'::app_role)));
create policy cp_insert on public.counterparties as permissive for insert to public
  with check ((my_role() = ANY (ARRAY['owner'::app_role, 'fin_director'::app_role, 'accountant'::app_role, 'location_manager'::app_role, 'ops_director'::app_role])));
create policy cp_update on public.counterparties as permissive for update to public
  using ((is_fin_admin() OR (my_role() = 'accountant'::app_role)));
create policy read_all on public.counterparties as permissive for select to public
  using (true);
create policy catt_delete on public.counterparty_attachments as permissive for delete to public
  using (((uploaded_by = ( SELECT auth.uid() AS uid)) OR ( SELECT is_fin_admin() AS is_fin_admin)));
create policy catt_insert on public.counterparty_attachments as permissive for insert to public
  with check (((uploaded_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM counterparties c
  WHERE (c.id = counterparty_attachments.counterparty_id)))));
create policy catt_read on public.counterparty_attachments as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM counterparties c
  WHERE (c.id = counterparty_attachments.counterparty_id))));
create policy cpcat_insert on public.counterparty_categories as permissive for insert to public
  with check ((my_role() = ANY (ARRAY['owner'::app_role, 'fin_director'::app_role, 'accountant'::app_role, 'location_manager'::app_role, 'ops_director'::app_role])));
create policy cpcat_read on public.counterparty_categories as permissive for select to public
  using (true);
create policy cpcat_update on public.counterparty_categories as permissive for update to public
  using ((is_fin_admin() OR (my_role() = 'accountant'::app_role)));
create policy cpcon_delete on public.counterparty_contacts as permissive for delete to public
  using ((is_fin_admin() OR (my_role() = 'accountant'::app_role)));
create policy cpcon_insert on public.counterparty_contacts as permissive for insert to public
  with check ((my_role() = ANY (ARRAY['owner'::app_role, 'fin_director'::app_role, 'accountant'::app_role, 'location_manager'::app_role, 'ops_director'::app_role])));
create policy cpcon_read on public.counterparty_contacts as permissive for select to public
  using (true);
create policy cpcon_update on public.counterparty_contacts as permissive for update to public
  using ((is_fin_admin() OR (my_role() = 'accountant'::app_role)));
create policy crm_clients_insert on public.crm_clients as permissive for insert to public
  with check ((( SELECT is_fin_admin() AS is_fin_admin) OR (location_id IS NULL) OR has_location_access(location_id)));
create policy crm_clients_read on public.crm_clients as permissive for select to public
  using ((( SELECT is_fin_admin() AS is_fin_admin) OR (location_id IS NULL) OR has_location_access(location_id)));
create policy crm_clients_update on public.crm_clients as permissive for update to public
  using ((( SELECT is_fin_admin() AS is_fin_admin) OR (location_id IS NULL) OR has_location_access(location_id)));
create policy crm_halls_insert on public.crm_halls as permissive for insert to public
  with check ((( SELECT is_fin_admin() AS is_fin_admin) OR (location_id IS NULL) OR has_location_access(location_id)));
create policy crm_halls_read on public.crm_halls as permissive for select to public
  using ((( SELECT is_fin_admin() AS is_fin_admin) OR (location_id IS NULL) OR has_location_access(location_id)));
create policy crm_halls_update on public.crm_halls as permissive for update to public
  using ((( SELECT is_fin_admin() AS is_fin_admin) OR (location_id IS NULL) OR has_location_access(location_id)));
create policy crm_check_delete on public.crm_lead_checklist as permissive for delete to public
  using ((EXISTS ( SELECT 1
   FROM crm_leads l
  WHERE ((l.id = crm_lead_checklist.lead_id) AND (is_fin_admin() OR (l.location_id IS NULL) OR has_location_access(l.location_id))))));
create policy crm_check_insert on public.crm_lead_checklist as permissive for insert to public
  with check ((EXISTS ( SELECT 1
   FROM crm_leads l
  WHERE ((l.id = crm_lead_checklist.lead_id) AND (is_fin_admin() OR (l.location_id IS NULL) OR has_location_access(l.location_id))))));
create policy crm_check_read on public.crm_lead_checklist as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM crm_leads l
  WHERE ((l.id = crm_lead_checklist.lead_id) AND (is_fin_admin() OR (l.location_id IS NULL) OR has_location_access(l.location_id))))));
create policy crm_check_update on public.crm_lead_checklist as permissive for update to public
  using ((EXISTS ( SELECT 1
   FROM crm_leads l
  WHERE ((l.id = crm_lead_checklist.lead_id) AND (is_fin_admin() OR (l.location_id IS NULL) OR has_location_access(l.location_id))))));
create policy crm_leads_insert on public.crm_leads as permissive for insert to public
  with check ((( SELECT is_fin_admin() AS is_fin_admin) OR (location_id IS NULL) OR has_location_access(location_id)));
create policy crm_leads_read on public.crm_leads as permissive for select to public
  using ((( SELECT is_fin_admin() AS is_fin_admin) OR (location_id IS NULL) OR has_location_access(location_id)));
create policy crm_leads_update on public.crm_leads as permissive for update to public
  using ((( SELECT is_fin_admin() AS is_fin_admin) OR (location_id IS NULL) OR has_location_access(location_id)));
create policy crm_stages_insert on public.crm_stages as permissive for insert to public
  with check ((is_fin_admin() OR (location_id IS NULL) OR has_location_access(location_id)));
create policy crm_stages_read on public.crm_stages as permissive for select to public
  using ((is_fin_admin() OR (location_id IS NULL) OR has_location_access(location_id)));
create policy crm_stages_update on public.crm_stages as permissive for update to public
  using ((is_fin_admin() OR (location_id IS NULL) OR has_location_access(location_id)));
create policy currencies_insert on public.currencies as permissive for insert to public
  with check (is_fin_admin());
create policy currencies_update on public.currencies as permissive for update to public
  using (is_fin_admin())
  with check (is_fin_admin());
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
create policy rates_delete on public.exchange_rates as permissive for delete to public
  using (is_fin_admin());
create policy rates_insert on public.exchange_rates as permissive for insert to public
  with check ((is_fin_admin() OR (my_role() = 'accountant'::app_role)));
create policy rates_update on public.exchange_rates as permissive for update to public
  using (is_fin_admin())
  with check (is_fin_admin());
create policy read_all on public.exchange_rates as permissive for select to public
  using (true);
create policy eta_admin on public.expense_type_access as permissive for all to public
  using (is_fin_admin())
  with check (is_fin_admin());
create policy etypes_read on public.expense_types as permissive for select to public
  using ((( SELECT is_fin_admin() AS is_fin_admin) OR (location_id IS NULL) OR has_location_access(location_id) OR (EXISTS ( SELECT 1
   FROM expense_type_access
  WHERE ((expense_type_access.user_id = ( SELECT auth.uid() AS uid)) AND (expense_type_access.expense_type_id = expense_types.id))))));
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
create policy iatt_delete on public.invoice_attachments as permissive for delete to public
  using (((uploaded_by = ( SELECT auth.uid() AS uid)) OR ( SELECT is_fin_admin() AS is_fin_admin)));
create policy iatt_insert on public.invoice_attachments as permissive for insert to public
  with check (((uploaded_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM client_invoices i
  WHERE (i.id = invoice_attachments.invoice_id)))));
create policy iatt_read on public.invoice_attachments as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM client_invoices i
  WHERE (i.id = invoice_attachments.invoice_id))));
create policy admin_write on public.locations as permissive for all to public
  using (is_fin_admin())
  with check (is_fin_admin());
create policy read_all on public.locations as permissive for select to public
  using (true);
create policy mmcamp_insert on public.massmail_campaigns as permissive for insert to public
  with check ((is_fin_admin() OR (location_id IS NULL) OR has_location_access(location_id)));
create policy mmcamp_read on public.massmail_campaigns as permissive for select to public
  using ((is_fin_admin() OR (location_id IS NULL) OR has_location_access(location_id)));
create policy mmcamp_update on public.massmail_campaigns as permissive for update to public
  using ((is_fin_admin() OR (location_id IS NULL) OR has_location_access(location_id)))
  with check ((is_fin_admin() OR (location_id IS NULL) OR has_location_access(location_id)));
create policy mmrecip_insert on public.massmail_recipients as permissive for insert to public
  with check ((EXISTS ( SELECT 1
   FROM massmail_campaigns c
  WHERE ((c.id = massmail_recipients.campaign_id) AND (is_fin_admin() OR (c.location_id IS NULL) OR has_location_access(c.location_id))))));
create policy mmrecip_read on public.massmail_recipients as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM massmail_campaigns c
  WHERE ((c.id = massmail_recipients.campaign_id) AND (is_fin_admin() OR (c.location_id IS NULL) OR has_location_access(c.location_id))))));
create policy mmrecip_update on public.massmail_recipients as permissive for update to public
  using ((EXISTS ( SELECT 1
   FROM massmail_campaigns c
  WHERE ((c.id = massmail_recipients.campaign_id) AND (is_fin_admin() OR (c.location_id IS NULL) OR has_location_access(c.location_id))))))
  with check ((EXISTS ( SELECT 1
   FROM massmail_campaigns c
  WHERE ((c.id = massmail_recipients.campaign_id) AND (is_fin_admin() OR (c.location_id IS NULL) OR has_location_access(c.location_id))))));
create policy notif_read on public.notifications as permissive for select to public
  using ((user_id = ( SELECT auth.uid() AS uid)));
create policy notif_update on public.notifications as permissive for update to public
  using ((user_id = ( SELECT auth.uid() AS uid)))
  with check ((user_id = ( SELECT auth.uid() AS uid)));
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
  with check (((requester_id = ( SELECT auth.uid() AS uid)) AND holds_position(position_id) AND has_location_access(location_id) AND (status = 'submitted'::request_status)));
create policy requests_read on public.payment_requests as permissive for select to public
  using (((requester_id = ( SELECT auth.uid() AS uid)) OR holds_position(position_id) OR ( SELECT is_fin_admin() AS is_fin_admin) OR ((( SELECT my_role() AS my_role) = ANY (ARRAY['ops_director'::app_role, 'location_manager'::app_role])) AND has_location_access(location_id)) OR ((( SELECT my_role() AS my_role) = 'accountant'::app_role) AND (status = ANY (ARRAY['approved'::request_status, 'paid'::request_status])))));
create policy requests_update on public.payment_requests as permissive for update to public
  using ((( SELECT is_fin_admin() AS is_fin_admin) OR ((( SELECT my_role() AS my_role) = 'accountant'::app_role) AND (status = 'approved'::request_status)) OR ((requester_id = ( SELECT auth.uid() AS uid)) AND (status = ANY (ARRAY['submitted'::request_status, 'revision'::request_status])))));
create policy ptypes_write on public.payment_types as permissive for all to public
  using (is_fin_admin())
  with check (is_fin_admin());
create policy read_all on public.payment_types as permissive for select to public
  using (true);
create policy plines_read on public.payroll_lines as permissive for select to public
  using ((( SELECT is_fin_admin() AS is_fin_admin) OR (( SELECT my_role() AS my_role) = 'accountant'::app_role) OR (person_id = ( SELECT auth.uid() AS uid))));
create policy plines_write on public.payroll_lines as permissive for all to public
  using ((EXISTS ( SELECT 1
   FROM payroll_sheets s
  WHERE ((s.id = payroll_lines.sheet_id) AND (( SELECT is_fin_admin() AS is_fin_admin) OR ((( SELECT my_role() AS my_role) = 'accountant'::app_role) AND (s.status = 'submitted'::request_status)))))))
  with check ((EXISTS ( SELECT 1
   FROM payroll_sheets s
  WHERE ((s.id = payroll_lines.sheet_id) AND (( SELECT is_fin_admin() AS is_fin_admin) OR ((( SELECT my_role() AS my_role) = 'accountant'::app_role) AND (s.status = 'submitted'::request_status)))))));
create policy psheets_delete on public.payroll_sheets as permissive for delete to public
  using ((( SELECT is_fin_admin() AS is_fin_admin) AND (status = 'submitted'::request_status)));
create policy psheets_insert on public.payroll_sheets as permissive for insert to public
  with check (((created_by = ( SELECT auth.uid() AS uid)) AND (( SELECT is_fin_admin() AS is_fin_admin) OR (( SELECT my_role() AS my_role) = 'accountant'::app_role)) AND (status = 'submitted'::request_status)));
create policy psheets_read on public.payroll_sheets as permissive for select to public
  using ((( SELECT is_fin_admin() AS is_fin_admin) OR (( SELECT my_role() AS my_role) = 'accountant'::app_role)));
create policy psheets_update on public.payroll_sheets as permissive for update to public
  using ((( SELECT is_fin_admin() AS is_fin_admin) OR ((( SELECT my_role() AS my_role) = 'accountant'::app_role) AND (status = 'submitted'::request_status))))
  with check ((( SELECT is_fin_admin() AS is_fin_admin) OR ((( SELECT my_role() AS my_role) = 'accountant'::app_role) AND (status = 'submitted'::request_status))));
create policy overrides_rw on public.period_distribution_overrides as permissive for all to public
  using (is_fin_admin())
  with check (is_fin_admin());
create policy admin_write on public.position_assignments as permissive for all to public
  using ((is_fin_admin() OR (my_role() = 'ops_director'::app_role)))
  with check ((is_fin_admin() OR (my_role() = 'ops_director'::app_role)));
create policy read_all on public.position_assignments as permissive for select to public
  using (true);
create policy pr_read on public.posting_rules as permissive for select to public
  using (true);
create policy pr_write on public.posting_rules as permissive for all to public
  using (is_fin_admin())
  with check (is_fin_admin());
create policy profiles_insert on public.profiles as permissive for insert to public
  with check ((( SELECT is_fin_admin() AS is_fin_admin) OR ((id = ( SELECT auth.uid() AS uid)) AND (role = 'employee'::app_role))));
create policy profiles_self on public.profiles as permissive for update to public
  using (((id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_fin_admin() AS is_fin_admin)))
  with check ((( SELECT is_fin_admin() AS is_fin_admin) OR ((id = ( SELECT auth.uid() AS uid)) AND (role = ( SELECT p.role
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))) AND (is_active = ( SELECT p.is_active
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))))));
create policy read_all on public.profiles as permissive for select to public
  using (true);
create policy recon_rw on public.reconciliations as permissive for all to public
  using ((is_fin_admin() OR (my_role() = 'accountant'::app_role)))
  with check ((is_fin_admin() OR (my_role() = 'accountant'::app_role)));
create policy req_attach_rw on public.request_attachments as permissive for all to public
  using (((uploaded_by = ( SELECT auth.uid() AS uid)) OR ( SELECT is_fin_admin() AS is_fin_admin) OR (EXISTS ( SELECT 1
   FROM payment_requests r
  WHERE ((r.id = request_attachments.request_id) AND (r.requester_id = ( SELECT auth.uid() AS uid)))))))
  with check ((uploaded_by = ( SELECT auth.uid() AS uid)));
create policy req_comments_insert on public.request_comments as permissive for insert to public
  with check ((author_id = ( SELECT auth.uid() AS uid)));
create policy req_comments_read on public.request_comments as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM payment_requests r
  WHERE (r.id = request_comments.request_id))));
create policy statdated_delete on public.statistic_dated_values as permissive for delete to public
  using ((((NOT is_quota) AND ((( SELECT my_role() AS my_role) = ANY (ARRAY['owner'::app_role, 'fin_director'::app_role, 'ops_director'::app_role, 'location_manager'::app_role])) OR (EXISTS ( SELECT 1
   FROM statistics s
  WHERE ((s.id = statistic_dated_values.statistic_id) AND (s.owner_id = ( SELECT auth.uid() AS uid))))))) OR (is_quota AND (( SELECT is_fin_admin() AS is_fin_admin) OR (( SELECT my_role() AS my_role) = 'ops_director'::app_role)))));
create policy statdated_insert on public.statistic_dated_values as permissive for insert to public
  with check ((((NOT is_quota) AND ((( SELECT my_role() AS my_role) = ANY (ARRAY['owner'::app_role, 'fin_director'::app_role, 'ops_director'::app_role, 'location_manager'::app_role])) OR (EXISTS ( SELECT 1
   FROM statistics s
  WHERE ((s.id = statistic_dated_values.statistic_id) AND (s.owner_id = ( SELECT auth.uid() AS uid))))))) OR (is_quota AND (( SELECT is_fin_admin() AS is_fin_admin) OR (( SELECT my_role() AS my_role) = 'ops_director'::app_role)))));
create policy statdated_read on public.statistic_dated_values as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM statistics s
  WHERE ((s.id = statistic_dated_values.statistic_id) AND ((s.location_id IS NULL) OR has_location_access(s.location_id) OR (s.owner_id = ( SELECT auth.uid() AS uid)) OR ((s.position_id IS NOT NULL) AND holds_position(s.position_id)))))));
create policy statdated_update on public.statistic_dated_values as permissive for update to public
  using ((((NOT is_quota) AND ((( SELECT my_role() AS my_role) = ANY (ARRAY['owner'::app_role, 'fin_director'::app_role, 'ops_director'::app_role, 'location_manager'::app_role])) OR (EXISTS ( SELECT 1
   FROM statistics s
  WHERE ((s.id = statistic_dated_values.statistic_id) AND (s.owner_id = ( SELECT auth.uid() AS uid))))))) OR (is_quota AND (( SELECT is_fin_admin() AS is_fin_admin) OR (( SELECT my_role() AS my_role) = 'ops_director'::app_role)))))
  with check ((((NOT is_quota) AND ((( SELECT my_role() AS my_role) = ANY (ARRAY['owner'::app_role, 'fin_director'::app_role, 'ops_director'::app_role, 'location_manager'::app_role])) OR (EXISTS ( SELECT 1
   FROM statistics s
  WHERE ((s.id = statistic_dated_values.statistic_id) AND (s.owner_id = ( SELECT auth.uid() AS uid))))))) OR (is_quota AND (( SELECT is_fin_admin() AS is_fin_admin) OR (( SELECT my_role() AS my_role) = 'ops_director'::app_role)))));
create policy statval_insert on public.statistic_values as permissive for insert to public
  with check ((((NOT is_quota) AND ((( SELECT my_role() AS my_role) = ANY (ARRAY['owner'::app_role, 'fin_director'::app_role, 'ops_director'::app_role, 'location_manager'::app_role])) OR (EXISTS ( SELECT 1
   FROM statistics s
  WHERE ((s.id = statistic_values.statistic_id) AND (s.owner_id = ( SELECT auth.uid() AS uid))))))) OR (is_quota AND (( SELECT is_fin_admin() AS is_fin_admin) OR (( SELECT my_role() AS my_role) = 'ops_director'::app_role)))));
create policy statval_read on public.statistic_values as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM statistics s
  WHERE ((s.id = statistic_values.statistic_id) AND ((s.location_id IS NULL) OR has_location_access(s.location_id) OR (s.owner_id = ( SELECT auth.uid() AS uid)) OR ((s.position_id IS NOT NULL) AND holds_position(s.position_id)))))));
create policy statval_update on public.statistic_values as permissive for update to public
  using ((((NOT is_quota) AND ((( SELECT my_role() AS my_role) = ANY (ARRAY['owner'::app_role, 'fin_director'::app_role, 'ops_director'::app_role, 'location_manager'::app_role])) OR (EXISTS ( SELECT 1
   FROM statistics s
  WHERE ((s.id = statistic_values.statistic_id) AND (s.owner_id = ( SELECT auth.uid() AS uid))))))) OR (is_quota AND (( SELECT is_fin_admin() AS is_fin_admin) OR (( SELECT my_role() AS my_role) = 'ops_director'::app_role)))))
  with check ((((NOT is_quota) AND ((( SELECT my_role() AS my_role) = ANY (ARRAY['owner'::app_role, 'fin_director'::app_role, 'ops_director'::app_role, 'location_manager'::app_role])) OR (EXISTS ( SELECT 1
   FROM statistics s
  WHERE ((s.id = statistic_values.statistic_id) AND (s.owner_id = ( SELECT auth.uid() AS uid))))))) OR (is_quota AND (( SELECT is_fin_admin() AS is_fin_admin) OR (( SELECT my_role() AS my_role) = 'ops_director'::app_role)))));
create policy stats_read on public.statistics as permissive for select to public
  using (((location_id IS NULL) OR has_location_access(location_id) OR (owner_id = ( SELECT auth.uid() AS uid)) OR ((position_id IS NOT NULL) AND holds_position(position_id))));
create policy stats_write on public.statistics as permissive for all to public
  using ((is_fin_admin() OR (my_role() = 'ops_director'::app_role)))
  with check ((is_fin_admin() OR (my_role() = 'ops_director'::app_role)));
create policy bills_insert on public.supplier_bills as permissive for insert to public
  with check (((created_by = ( SELECT auth.uid() AS uid)) AND has_location_access(location_id) AND (( SELECT my_role() AS my_role) = ANY (ARRAY['owner'::app_role, 'fin_director'::app_role, 'accountant'::app_role, 'location_manager'::app_role, 'ops_director'::app_role])) AND (status = 'submitted'::request_status)));
create policy bills_read on public.supplier_bills as permissive for select to public
  using ((( SELECT is_fin_admin() AS is_fin_admin) OR (( SELECT my_role() AS my_role) = 'accountant'::app_role) OR has_location_access(location_id)));
create policy bills_update on public.supplier_bills as permissive for update to public
  using ((( SELECT is_fin_admin() AS is_fin_admin) OR ((( SELECT my_role() AS my_role) = 'accountant'::app_role) AND (status = 'approved'::request_status)) OR ((created_by = ( SELECT auth.uid() AS uid)) AND (status = 'submitted'::request_status))));
create policy task_comments_insert on public.task_comments as permissive for insert to public
  with check ((author_id = ( SELECT auth.uid() AS uid)));
create policy task_comments_read on public.task_comments as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM tasks t
  WHERE (t.id = task_comments.task_id))));
create policy tasks_insert on public.tasks as permissive for insert to public
  with check ((( SELECT is_fin_admin() AS is_fin_admin) OR (from_id = ( SELECT auth.uid() AS uid))));
create policy tasks_read on public.tasks as permissive for select to public
  using ((is_fin_admin() OR (from_id = ( SELECT auth.uid() AS uid)) OR (to_id = ( SELECT auth.uid() AS uid)) OR ((position_id IS NOT NULL) AND holds_position(position_id))));
create policy tasks_update on public.tasks as permissive for update to public
  using ((is_fin_admin() OR (from_id = ( SELECT auth.uid() AS uid)) OR (to_id = ( SELECT auth.uid() AS uid)) OR ((position_id IS NOT NULL) AND holds_position(position_id))));
create policy admin_write on public.user_location_access as permissive for all to public
  using (is_fin_admin())
  with check (is_fin_admin());
create policy read_all on public.user_location_access as permissive for select to public
  using (true);

-- ============================================================================
-- 11. КОММЕНТАРИИ НА ОБЪЕКТАХ
-- ============================================================================

comment on table public.client_invoices is 'Счета клиентам (банкеты): частичные оплаты порождают операции дохода (ТЗ v2 §4.1.7)';
comment on table public.locations is 'Точка/филиал — первоклассная сущность (ТЗ v2 §5)';
comment on table public.payroll_sheets is 'Ведомости безокладной ЗП по неделям ФП (ТЗ v2 §4.1.11)';
comment on table public.profiles is 'Профили пользователей с ролью (ТЗ v2 §3)';
comment on table public.supplier_bills is 'Счета поставщиков: два периода — одобрения и оплаты (ТЗ v2 §4.1.6)';
comment on column public.distribution_rules.income_type_id is 'Вид дохода; null — правило схемы по умолчанию (для всего дохода периода)';
comment on column public.fp_register.reverses_id is 'Строка Реестра, которую откатывает эта компенсирующая запись (docs/funds-spec.md §7)';
comment on column public.fund_folders.color is 'Цвет-метка папки (пресет палитры темы)';
comment on column public.fund_folders.description is 'Описание папки/раздела';
comment on column public.fund_folders.is_archived is 'Архив вместо удаления (фонды при архиве папки остаются, folder_id → null)';
comment on column public.funds.color is 'Цвет-метка фонда (пресет палитры темы)';
comment on column public.funds.description is 'Описание фонда (вкладка «Фонды»)';
comment on column public.funds.is_private is 'Приватный фонд: виден только владельцу и финдиректору';
comment on column public.funds.no_transfer is 'Запрет перемещения: блок ручных операций (перемещение/заём/возврат), приход разрешён';
comment on column public.funds.stage is 'Этап распределения фонда — один на фонд (docs/funds-spec.md §10)';
comment on column public.incomes.basis_document is 'Документ-основание операции дохода (номер счёта/договора/чека/акта и т.п.) — структурное поле (ManaJet), отдельно от свободного comment';
comment on column public.request_comments.is_ai is 'Комментарий от ИИ-рецензента ЗРС (author_id = null), пишется Edge Function request-ai-review';
comment on column public.statistics.max_val is 'Верхняя граница целевого коридора (ManaJet Stat.max_val)';
comment on column public.statistics.min_val is 'Нижняя граница целевого коридора (ManaJet Stat.min_val)';
comment on column public.statistics.sign is 'Направление: true = рост желателен (ManaJet Stat.sign)';
comment on column public.statistics.source is 'Источник записи: manual | manajet';
comment on column public.statistics.stat_type is 'Тип статистики ManaJet (Stat.stat_type)';
comment on column public.supplier_bills.kind is 'supply — поставки продуктов/хозтоваров; obligation — обязательства (оборудование, услуги, ремонт)';
comment on function public.app_secret(p_name text) is 'Чтение секрета Vault по имени. EXECUTE только service_role — вызывают Edge Functions (request-ai-review).';

-- Конец снимка схемы (2026-07-01).
