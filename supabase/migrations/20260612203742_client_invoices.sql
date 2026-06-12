-- Счета клиентов / банкеты (ТЗ v2 §4.1.7, сущность Invoice из ManaJet).
-- Частичные оплаты (InvoicePayment) = операции дохода: fp_pay_invoice создаёт
-- запись в incomes с invoice_id, существующий триггер incomes сам проводит
-- деньги в Реестр и на счёт ДС. Статус paid выставляется по сумме оплат.
-- Бронь будущей даты = счёт со статусом planned (ТЗ: «планируемые счета»).

create type public.client_invoice_status as enum ('planned', 'issued', 'paid', 'cancelled');

create table public.client_invoices (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity not null,
  counterparty_id uuid not null references counterparties(id),
  location_id uuid not null references locations(id),
  income_type_id uuid not null references income_types(id),
  event_name text not null,
  hall text,
  event_on date,
  amount numeric(14,2) not null check (amount > 0),
  currency_id uuid not null references currencies(id),
  status client_invoice_status not null default 'issued',
  comment text,
  outer_id text unique,
  is_archived boolean not null default false,
  created_by uuid not null references profiles(id),
  created_at timestamp with time zone not null default now()
);
comment on table public.client_invoices is 'Счета клиентам (банкеты): частичные оплаты порождают операции дохода (ТЗ v2 §4.1.7)';

create index client_invoices_counterparty_id_idx on public.client_invoices (counterparty_id);
create index client_invoices_location_id_status_idx on public.client_invoices (location_id, status);
create index client_invoices_event_on_idx on public.client_invoices (event_on);
create index client_invoices_income_type_id_idx on public.client_invoices (income_type_id);

-- Связь оплат: incomes.invoice_id уже существует — добавляем FK и индекс
alter table public.incomes
  add constraint incomes_invoice_id_fkey foreign key (invoice_id) references client_invoices(id);
create index incomes_invoice_id_idx on public.incomes (invoice_id);

alter table public.client_invoices enable row level security;

create policy cinv_read on public.client_invoices for select
  using ((select is_fin_admin()) or ((select my_role()) = 'accountant'::app_role) or has_location_access(location_id));
create policy cinv_insert on public.client_invoices for insert
  with check (
    created_by = (select auth.uid())
    and has_location_access(location_id)
    and (select my_role()) = any (array['owner','fin_director','accountant','location_manager','ops_director']::app_role[])
    and status = any (array['planned','issued']::client_invoice_status[])
  );
create policy cinv_update on public.client_invoices for update
  using ((select is_fin_admin()) or ((select my_role()) = 'accountant'::app_role));

create trigger audit_client_invoices
  after insert or delete or update on public.client_invoices
  for each row execute function trg_audit();

-- Приём оплаты по счёту: создаёт операцию дохода (D-код из счёта), Реестр
-- и баланс счёта ДС обновляет существующий триггер incomes. Статус счёта
-- становится paid, когда сумма оплат покрывает счёт; бронь (planned)
-- после первой предоплаты становится issued.
create or replace function public.fp_pay_invoice(
  p_invoice_id uuid, p_amount numeric, p_cash_account_id uuid,
  p_payment_type_id uuid, p_period_id uuid, p_received_on date default current_date)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
end $$;

revoke execute on function public.fp_pay_invoice(uuid, numeric, uuid, uuid, uuid, date) from public, anon;
grant execute on function public.fp_pay_invoice(uuid, numeric, uuid, uuid, uuid, date) to authenticated, service_role;
