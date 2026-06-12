-- Счета поставщиков (ТЗ v2 §4.1.6, сущность Bill из ManaJet).
-- Ключевой принцип: счёт живёт в ДВУХ периодах — одобрения (period_approved_id)
-- и оплаты (period_paid_id), они могут отличаться. Статусы — общий enum
-- request_status. Оплата — fp_pay_bill: запись Реестра (новый тип
-- bill_payment) + статус paid атомарно.

alter type register_op_type add value if not exists 'bill_payment';

create table public.supplier_bills (
  id uuid primary key default gen_random_uuid(),
  number text not null,
  counterparty_id uuid not null references counterparties(id),
  location_id uuid not null references locations(id),
  expense_type_id uuid not null references expense_types(id),
  fund_id uuid references funds(id),
  amount numeric(14,2) not null check (amount > 0),
  currency_id uuid not null references currencies(id),
  issued_on date not null default current_date,
  due_on date,
  status request_status not null default 'submitted',
  period_approved_id uuid references fp_periods(id),
  period_paid_id uuid references fp_periods(id),
  is_recurring boolean not null default false,
  comment text,
  rejection_reason text,
  decided_by uuid references profiles(id),
  decided_at timestamp with time zone,
  outer_id text unique,
  is_archived boolean not null default false,
  created_by uuid not null references profiles(id),
  created_at timestamp with time zone not null default now()
);
comment on table public.supplier_bills is 'Счета поставщиков: два периода — одобрения и оплаты (ТЗ v2 §4.1.6)';

create index supplier_bills_location_id_status_idx on public.supplier_bills (location_id, status);
create index supplier_bills_counterparty_id_idx on public.supplier_bills (counterparty_id);
create index supplier_bills_period_approved_id_idx on public.supplier_bills (period_approved_id);
create index supplier_bills_period_paid_id_idx on public.supplier_bills (period_paid_id);
create index supplier_bills_expense_type_id_idx on public.supplier_bills (expense_type_id);

alter table public.supplier_bills enable row level security;

create policy bills_read on public.supplier_bills for select
  using ((select is_fin_admin()) or ((select my_role()) = 'accountant'::app_role) or has_location_access(location_id));
create policy bills_insert on public.supplier_bills for insert
  with check (
    created_by = (select auth.uid())
    and has_location_access(location_id)
    and (select my_role()) = any (array['owner','fin_director','accountant','location_manager','ops_director']::app_role[])
    and status = 'submitted'::request_status
  );
create policy bills_update on public.supplier_bills for update
  using (
    (select is_fin_admin())
    or (((select my_role()) = 'accountant'::app_role) and status = 'approved'::request_status)
    or ((created_by = (select auth.uid())) and status = 'submitted'::request_status)
  );

create trigger audit_supplier_bills
  after insert or delete or update on public.supplier_bills
  for each row execute function trg_audit();

-- Связь оплаты в Реестре со счётом
alter table public.fp_register add column bill_id uuid references supplier_bills(id);
create index fp_register_bill_id_idx on public.fp_register (bill_id);

-- Оплата одобренного счёта: период оплаты может отличаться от периода одобрения
create or replace function public.fp_pay_bill(p_bill_id uuid, p_cash_account_id uuid, p_period_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b supplier_bills%rowtype;
  v_status period_status;
  v_base numeric;
  v_rate numeric;
  v_is_base boolean;
  v_base_cur uuid;
begin
  if not (is_fin_admin() or my_role() = 'accountant') then
    raise exception 'Оплачивать счета может финдиректор, владелец или бухгалтер';
  end if;

  select * into b from supplier_bills where id = p_bill_id;
  if b.id is null then raise exception 'Счёт не найден'; end if;
  if b.status <> 'approved' then raise exception 'Оплатить можно только одобренный счёт'; end if;
  if b.fund_id is null then raise exception 'У счёта не назначен фонд-источник'; end if;

  select status into v_status from fp_periods where id = p_period_id;
  if v_status is null then raise exception 'Период ФП не найден'; end if;
  if v_status = 'closed' then raise exception 'Период закрыт — операции запрещены'; end if;

  if not exists (select 1 from cash_accounts where id = p_cash_account_id and not is_archived) then
    raise exception 'Счёт ДС не найден';
  end if;

  select is_base into v_is_base from currencies where id = b.currency_id;
  if v_is_base then
    v_base := b.amount;
  else
    select id into v_base_cur from currencies where is_base limit 1;
    select rate into v_rate from exchange_rates
    where from_cur_id = b.currency_id and to_cur_id = v_base_cur and valid_from <= current_date
    order by valid_from desc limit 1;
    if v_rate is null then raise exception 'Нет курса валюты счёта к базовой — добавьте курс'; end if;
    v_base := round(b.amount * v_rate, 2);
  end if;

  insert into fp_register (op_type, period_id, fund_id, fund_amount, cash_account_id, cash_amount,
    bill_id, counterparty_id, currency_id, fx_rate, comment, created_by)
  values ('bill_payment', p_period_id, b.fund_id, -v_base, p_cash_account_id, -v_base,
    b.id, b.counterparty_id, b.currency_id, v_rate, 'Оплата счёта №' || b.number, auth.uid());

  update supplier_bills set status = 'paid', period_paid_id = p_period_id where id = b.id;
end $$;

revoke execute on function public.fp_pay_bill(uuid, uuid, uuid) from public, anon;
grant execute on function public.fp_pay_bill(uuid, uuid, uuid) to authenticated, service_role;
