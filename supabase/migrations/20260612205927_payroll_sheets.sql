-- Безокладная ЗП (ТЗ v2 §4.1.11, SheetOfAccounts из ManaJet).
-- Ведомость недели: ФОТ из фонда (ФД3), строки по сотрудникам — баллы ×
-- коэффициент состояния ХМС (Власть 1.3, Изобилие 1.15, Норма 1.0, ЧП 0.85,
-- Опасность 0.7, Несуществование 0.9); стоимость балла = ФОТ ÷ Σ эфф. баллов,
-- ФОТ не превышается по построению. Аванс и удержания — в строке.
-- Статусы (request_status): submitted (черновик) → approved → paid.
-- Выплата — fp_pay_payroll: списание из фонда и счёта ДС через Реестр.

create type public.hms_state as enum
  ('power', 'affluence', 'normal', 'emergency', 'danger', 'nonexistence');

create table public.payroll_sheets (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity not null,
  period_id uuid not null references fp_periods(id),
  location_id uuid references locations(id),
  fund_id uuid references funds(id),
  fot_amount numeric(14,2) not null default 0 check (fot_amount >= 0),
  status request_status not null default 'submitted',
  comment text,
  created_by uuid not null references profiles(id),
  created_at timestamp with time zone not null default now()
);
comment on table public.payroll_sheets is 'Ведомости безокладной ЗП по неделям ФП (ТЗ v2 §4.1.11)';

create table public.payroll_lines (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references payroll_sheets(id) on delete cascade,
  person_id uuid not null references profiles(id),
  points numeric(8,2) not null default 0 check (points >= 0),
  state hms_state not null default 'normal',
  coefficient numeric(4,2) not null default 1.0,
  accrued numeric(14,2) not null default 0,
  advance numeric(14,2) not null default 0 check (advance >= 0),
  deduction numeric(14,2) not null default 0 check (deduction >= 0),
  unique (sheet_id, person_id)
);

create index payroll_sheets_period_id_idx on public.payroll_sheets (period_id);
create index payroll_lines_sheet_id_idx on public.payroll_lines (sheet_id);
create index payroll_lines_person_id_idx on public.payroll_lines (person_id);

alter table public.payroll_sheets enable row level security;
alter table public.payroll_lines enable row level security;

-- Ведомости видят и готовят финадмин и бухгалтер; утверждает только финадмин
create policy psheets_read on public.payroll_sheets for select
  using ((select is_fin_admin()) or ((select my_role()) = 'accountant'::app_role));
create policy psheets_insert on public.payroll_sheets for insert
  with check (created_by = (select auth.uid())
    and ((select is_fin_admin()) or ((select my_role()) = 'accountant'::app_role))
    and status = 'submitted'::request_status);
create policy psheets_update on public.payroll_sheets for update
  using ((select is_fin_admin())
    or (((select my_role()) = 'accountant'::app_role) and status = 'submitted'::request_status))
  with check ((select is_fin_admin())
    or (((select my_role()) = 'accountant'::app_role) and status = 'submitted'::request_status));
create policy psheets_delete on public.payroll_sheets for delete
  using ((select is_fin_admin()) and status = 'submitted'::request_status);

-- Строки: сотрудник видит свою строку (свой расчёт ЗП)
create policy plines_read on public.payroll_lines for select
  using ((select is_fin_admin()) or ((select my_role()) = 'accountant'::app_role)
    or person_id = (select auth.uid()));
create policy plines_write on public.payroll_lines for all
  using (exists (select 1 from payroll_sheets s where s.id = sheet_id
    and ((select is_fin_admin())
      or (((select my_role()) = 'accountant'::app_role) and s.status = 'submitted'::request_status))))
  with check (exists (select 1 from payroll_sheets s where s.id = sheet_id
    and ((select is_fin_admin())
      or (((select my_role()) = 'accountant'::app_role) and s.status = 'submitted'::request_status))));

create trigger audit_payroll_sheets
  after insert or delete or update on public.payroll_sheets
  for each row execute function trg_audit();

-- Выплата ведомости через Реестр
alter type register_op_type add value if not exists 'payroll_payment';
alter table public.fp_register add column payroll_sheet_id uuid references payroll_sheets(id);
create index fp_register_payroll_sheet_id_idx on public.fp_register (payroll_sheet_id);

create or replace function public.fp_pay_payroll(p_sheet_id uuid, p_cash_account_id uuid, p_period_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
end $$;

revoke execute on function public.fp_pay_payroll(uuid, uuid, uuid) from public, anon;
grant execute on function public.fp_pay_payroll(uuid, uuid, uuid) to authenticated, service_role;
