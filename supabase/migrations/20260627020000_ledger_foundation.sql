-- Бухгалтерский фундамент (gap-map Реестр §9/§12): ОСВ (оборотно-сальдовая
-- ведомость) поверх Реестра + справочник «План счетов». Реестр fp_register НЕ
-- трогаем — ОСВ это read-only выборка; план счетов — аддитивный справочник.

-- 1) ОСВ: по фондам и счетам ДС за период — вход/приход/расход/исход.
-- «Эффективная дата» записи = конец её периода (period_id→ends_on), для записей
-- без периода (off_plan/adjustment) — дата создания (по Душанбе). Вход = до начала
-- недели; оборот = внутри [starts_on, ends_on]; исход = накопленный до конца недели.
create or replace function public.fp_turnover_sheet(p_period_id uuid)
returns table (kind text, entity_id uuid, opening numeric, inflow numeric, outflow numeric, closing numeric)
language sql
stable
as $$
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
$$;
grant execute on function public.fp_turnover_sheet(uuid) to authenticated;

-- 2) План счетов (справочник). Пока не привязан к Реестру (двойная запись —
-- следующий этап); вводит словарь счетов для будущих проводок.
create table if not exists public.chart_accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  account_type text not null,         -- asset | liability | equity | income | expense
  is_archived boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.chart_accounts drop constraint if exists chart_accounts_type_chk;
alter table public.chart_accounts add constraint chart_accounts_type_chk
  check (account_type in ('asset', 'liability', 'equity', 'income', 'expense'));
create unique index if not exists chart_accounts_code_uidx on public.chart_accounts(lower(code)) where not is_archived;

alter table public.chart_accounts enable row level security;
drop policy if exists ca_read on public.chart_accounts;
create policy ca_read on public.chart_accounts as permissive for select to public using (true);
drop policy if exists ca_insert on public.chart_accounts;
create policy ca_insert on public.chart_accounts as permissive for insert to public with check (is_fin_admin());
drop policy if exists ca_update on public.chart_accounts;
create policy ca_update on public.chart_accounts as permissive for update to public using (is_fin_admin()) with check (is_fin_admin());
grant select, insert, update on public.chart_accounts to authenticated;
