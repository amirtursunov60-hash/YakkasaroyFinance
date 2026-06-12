-- Улучшения финконтура (2026-06-12):
-- 1) Перемещение между счетами ДС (инкассация касса→банк) — fp_cash_transfer,
--    парные записи Реестра op_type=cash_transfer, запрет минуса счёта-источника.
-- 2) Вложения (фото счетов): bucket 'attachments' в Storage + таблица
--    bill_attachments (для заявок request_attachments уже существует).

-- ---------- 1. Перемещение ДС ----------
create or replace function public.fp_cash_transfer(p_from uuid, p_to uuid, p_amount numeric, p_period_id uuid, p_comment text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
end $$;

revoke execute on function public.fp_cash_transfer(uuid, uuid, numeric, uuid, text) from public, anon;
grant execute on function public.fp_cash_transfer(uuid, uuid, numeric, uuid, text) to authenticated, service_role;

-- ---------- 2. Storage: bucket вложений ----------
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

create policy yk_attachments_read on storage.objects for select
  using (bucket_id = 'attachments' and (select auth.uid()) is not null);
create policy yk_attachments_insert on storage.objects for insert
  with check (bucket_id = 'attachments' and (select auth.uid()) is not null);
create policy yk_attachments_delete on storage.objects for delete
  using (bucket_id = 'attachments' and (owner = (select auth.uid()) or (select is_fin_admin())));

-- ---------- 3. Вложения к счетам поставщиков / обязательствам ----------
create table public.bill_attachments (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references supplier_bills(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  uploaded_by uuid not null references profiles(id),
  created_at timestamp with time zone not null default now()
);
create index bill_attachments_bill_id_idx on public.bill_attachments (bill_id);

alter table public.bill_attachments enable row level security;
create policy batt_read on public.bill_attachments for select
  using (exists (select 1 from supplier_bills b where b.id = bill_id));
create policy batt_insert on public.bill_attachments for insert
  with check (uploaded_by = (select auth.uid())
    and exists (select 1 from supplier_bills b where b.id = bill_id));
create policy batt_delete on public.bill_attachments for delete
  using (uploaded_by = (select auth.uid()) or (select is_fin_admin()));
