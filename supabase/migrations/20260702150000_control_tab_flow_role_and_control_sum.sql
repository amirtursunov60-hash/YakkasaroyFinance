-- Вкладка «Контроль средств» — доработка по образцу ManaJet (сверка по скринам
-- + живой Swagger api.manajet.org, 02.07.2026):
--
-- 1) Классификация счетов ДС «Приходной/Расходной» (папки М1/Д1 у ManaJet,
--    система расчётных счетов из курса ФП). Одно свойство счёта, необязательное:
--    incoming — приходной (сейф/касса, куда поступает выручка),
--    outgoing  — расходной (откуда платятся заявки/счета).
--
-- 2) RPC fp_control_sum(p_period_id) — «Контрольная сумма» ФП: сверка
--       деньги на счетах ДС  =  нераспределённые доходы + фонды,
--    где фонды раскладываются на «доступно» и одобренные невыплаченные
--    обязательства (заявки + счета поставщиков). Разница ≠ 0 — сигнал:
--    внеплановые траты (off_plan), корректировки, ручные операции фондов.
--    Read-only, SECURITY INVOKER (RLS Реестра применяется к вызывающему),
--    леджер и балансы не трогает — считает производную из fp_register,
--    как fp_period_balances/fp_turnover_sheet («эффективная дата» записи =
--    конец её периода; для записей без периода — дата создания).
--
--    Компоненты на конец выбранной недели N:
--    - cash_total             Σ cash_amount (эффективная дата ≤ конца N)
--    - funds_total            Σ fund_amount (эффективная дата ≤ конца N)
--    - incomes_undistributed  Σ доходов (income + income_return) − Σ распределений
--    - requests_unpaid        одобренные заявки: остаток к оплате (− частичные оплаты),
--                             в базовой валюте по последнему курсу (текущее состояние)
--    - bills_unpaid           одобренные счета поставщиков: остаток к оплате (текущее состояние)

alter table public.cash_accounts add column if not exists flow_role text;
alter table public.cash_accounts drop constraint if exists cash_accounts_flow_role_chk;
alter table public.cash_accounts add constraint cash_accounts_flow_role_chk
  check (flow_role is null or flow_role in ('incoming', 'outgoing'));
comment on column public.cash_accounts.flow_role is
  'Классификация счёта в системе расчётных счетов ФП: incoming — приходной, outgoing — расходной, NULL — без классификации';

create or replace function public.fp_control_sum(p_period_id uuid)
returns table (
  cash_total numeric,
  funds_total numeric,
  incomes_undistributed numeric,
  requests_unpaid numeric,
  bills_unpaid numeric
)
language sql
stable
as $$
  with target as (
    select ends_on from public.fp_periods where id = p_period_id
  ),
  eff as (
    select fr.op_type, fr.cash_amount, fr.fund_amount,
      coalesce(p.ends_on, (fr.created_at at time zone 'Asia/Dushanbe')::date) as ed
    from public.fp_register fr
    left join public.fp_periods p on p.id = fr.period_id
  ),
  base as (
    select id from public.currencies where is_base limit 1
  ),
  latest_rate as (
    select distinct on (er.from_cur_id) er.from_cur_id, er.rate
    from public.exchange_rates er
    cross join base b
    where er.to_cur_id = b.id and er.valid_from <= current_date
    order by er.from_cur_id, er.valid_from desc
  )
  select
    coalesce((select sum(e.cash_amount) from eff e cross join target t
      where e.cash_amount is not null and e.ed <= t.ends_on), 0),
    coalesce((select sum(e.fund_amount) from eff e cross join target t
      where e.fund_amount is not null and e.ed <= t.ends_on), 0),
    coalesce((select sum(case
        when e.op_type in ('income', 'income_return') then coalesce(e.cash_amount, 0)
        when e.op_type = 'distribution' then -coalesce(e.fund_amount, 0)
        else 0 end)
      from eff e cross join target t where e.ed <= t.ends_on), 0),
    coalesce((select sum(greatest(0, round(
        (coalesce(r.approved_amount, r.planned_amount) - coalesce(r.paid_amount, 0))
        * case when c.is_base then 1 else coalesce(lr.rate, 1) end, 2)))
      from public.payment_requests r
      join public.currencies c on c.id = r.currency_id
      left join latest_rate lr on lr.from_cur_id = r.currency_id
      where r.status = 'approved'), 0),
    coalesce((select sum(greatest(0, round(
        (b.amount - coalesce(b.paid_amount, 0))
        * case when c.is_base then 1 else coalesce(lr.rate, 1) end, 2)))
      from public.supplier_bills b
      join public.currencies c on c.id = b.currency_id
      left join latest_rate lr on lr.from_cur_id = b.currency_id
      where b.status = 'approved' and not b.is_archived), 0);
$$;

grant execute on function public.fp_control_sum(uuid) to authenticated;
