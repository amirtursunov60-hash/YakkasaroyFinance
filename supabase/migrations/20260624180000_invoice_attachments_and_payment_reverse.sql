-- Вложения у счёта клиента + откат отдельной оплаты клиента (Счета §3, §2 gap-map).
-- 1) invoice_attachments — зеркало bill_attachments (договор/смета банкета).
-- 2) incomes.reverses_income_id — ссылка отмены оплаты на исходную операцию.
-- 3) fp_reverse_invoice_payment(uuid) — сторно одной оплаты счёта клиента:
--    добавляет операцию дохода is_return=true (триггер сам гасит её в Реестре,
--    счёт ДС уменьшается), пересчитывает статус счёта. Деньги — только через
--    Реестр; income_return уже существует и проводится триггером.

-- ── 1. Вложения у счёта клиента ────────────────────────────────────────────
create table if not exists public.invoice_attachments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.client_invoices(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists invoice_attachments_invoice_id_idx on public.invoice_attachments(invoice_id);

alter table public.invoice_attachments enable row level security;

drop policy if exists iatt_read on public.invoice_attachments;
create policy iatt_read on public.invoice_attachments for select
  using (exists (select 1 from public.client_invoices i where i.id = invoice_id));

drop policy if exists iatt_insert on public.invoice_attachments;
create policy iatt_insert on public.invoice_attachments for insert
  with check (uploaded_by = (select auth.uid())
    and exists (select 1 from public.client_invoices i where i.id = invoice_id));

drop policy if exists iatt_delete on public.invoice_attachments;
create policy iatt_delete on public.invoice_attachments for delete
  using (uploaded_by = (select auth.uid()) or (select is_fin_admin()));

-- ── 2. Ссылка отмены оплаты ────────────────────────────────────────────────
alter table public.incomes add column if not exists reverses_income_id uuid references public.incomes(id);
create index if not exists incomes_reverses_income_id_idx on public.incomes(reverses_income_id);

-- ── 3. Откат одной оплаты счёта клиента ────────────────────────────────────
create or replace function public.fp_reverse_invoice_payment(p_income_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
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

  -- Сторно: операция дохода-возврата (триггер trg_income_to_register сам
  -- проведёт income_return в Реестр и уменьшит счёт ДС).
  insert into incomes (income_type_id, location_id, period_id, amount, currency_id, amount_base,
    received_on, cash_account_id, payment_type_id, counterparty_id, invoice_id,
    is_return, reverses_income_id, source, comment, created_by)
  values (r.income_type_id, r.location_id, r.period_id, r.amount, r.currency_id, r.amount_base,
    r.received_on, r.cash_account_id, r.payment_type_id, r.counterparty_id, r.invoice_id,
    true, r.id, 'invoice', 'Отмена оплаты счёта клиента', auth.uid());

  -- Пересчёт статуса счёта (отменённый — не трогаем).
  select * into inv from client_invoices where id = r.invoice_id;
  if inv.status <> 'cancelled' then
    select coalesce(sum(case when is_return then -amount else amount end), 0) into v_paid
    from incomes where invoice_id = inv.id;
    update client_invoices
    set status = case when v_paid >= inv.amount - 0.009 then 'paid'::client_invoice_status
                      else 'issued'::client_invoice_status end
    where id = inv.id;
  end if;
end $$;
