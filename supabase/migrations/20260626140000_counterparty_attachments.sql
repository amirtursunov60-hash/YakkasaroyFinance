-- Вложения к контрагенту (gap-map Контрагенты §22): договоры, реквизиты, акты.
-- Зеркало invoice_attachments/bill_attachments; тот же бакет Storage `attachments`
-- (путь counterparties/<id>/...), та же модель RLS (читать — кому виден контрагент,
-- вставлять — от своего имени, удалять — автор или финадмин).

create table if not exists public.counterparty_attachments (
  id uuid primary key default gen_random_uuid(),
  counterparty_id uuid not null references public.counterparties(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists counterparty_attachments_counterparty_id_idx
  on public.counterparty_attachments(counterparty_id);

alter table public.counterparty_attachments enable row level security;

drop policy if exists catt_read on public.counterparty_attachments;
create policy catt_read on public.counterparty_attachments for select
  using (exists (select 1 from public.counterparties c where c.id = counterparty_id));

drop policy if exists catt_insert on public.counterparty_attachments;
create policy catt_insert on public.counterparty_attachments for insert
  with check (uploaded_by = (select auth.uid())
    and exists (select 1 from public.counterparties c where c.id = counterparty_id));

drop policy if exists catt_delete on public.counterparty_attachments;
create policy catt_delete on public.counterparty_attachments for delete
  using (uploaded_by = (select auth.uid()) or (select is_fin_admin()));

grant select, insert, delete on public.counterparty_attachments to authenticated;
