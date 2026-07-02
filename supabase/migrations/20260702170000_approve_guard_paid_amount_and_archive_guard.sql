-- Правки по ревью PR #225 (вкладка «Контроль средств»), три пункта:
--
-- 1) ФИКС ДЕНЕЖНОГО ИНВАРИАНТА: триггеры запрета одобрения сверх «Доступно»
--    (trg_request_approve_funds_check / trg_bill_approve_funds_check из
--    20260618170000) считали занятое БЕЗ вычета paid_amount. После появления
--    частичных оплат (20260624160000/170000) частично оплаченная заявка/счёт
--    остаётся в 'approved': баланс фонда уже уменьшен оплатой, а триггер
--    продолжал резервировать ПОЛНУЮ сумму — двойной счёт оплаченной части,
--    «Доступно» занижено, легитимные одобрения блокируются. Клиент
--    (fetchFundCommitments) уже считает остаток к оплате — приводим БД к тому же
--    определению (funds-spec §11: Остаток = одобренное, но НЕ оплаченное).
--
-- 2) Защита архива счёта ДС: нельзя архивировать счёт с ненулевым остатком —
--    деньги «исчезали» бы из UI (список по умолчанию без архивных), оставаясь
--    в Реестре и контрольной сумме. Сначала переместить остаток (fp_cash_transfer).
--
-- 3) fp_control_sum: один проход по Реестру вместо трёх коррелированных
--    подзапросов (правило «эффективной даты» записано один раз, меньше дрейфа
--    и сканов). Сигнатура и семантика не меняются.

-- ---------- 1. Триггеры одобрения: занятое = остаток к оплате --------------

create or replace function public.trg_request_approve_funds_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bal numeric;
  v_committed numeric;
  v_amount numeric;
begin
  if new.status = 'approved' and new.fund_id is not null
     and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    select balance into v_bal from funds where id = new.fund_id;
    v_amount := coalesce(new.approved_amount, new.planned_amount);
    -- остаток к оплате: полная сумма минус уже оплаченное (частичные оплаты)
    select coalesce(sum(greatest(0,
        coalesce(approved_amount, planned_amount) - coalesce(paid_amount, 0))), 0)
      into v_committed
      from payment_requests
      where fund_id = new.fund_id and status = 'approved' and id <> new.id;
    v_committed := v_committed + coalesce((select sum(greatest(0,
        amount - coalesce(paid_amount, 0))) from supplier_bills
      where fund_id = new.fund_id and status = 'approved' and not is_archived), 0);
    if v_amount > coalesce(v_bal, 0) - v_committed + 0.009 then
      raise exception 'Недостаточно средств в фонде: доступно %, к одобрению %',
        round(coalesce(v_bal, 0) - v_committed, 2), v_amount;
    end if;
  end if;
  return new;
end $$;

create or replace function public.trg_bill_approve_funds_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bal numeric;
  v_committed numeric;
  v_amount numeric;
begin
  if new.status = 'approved' and new.fund_id is not null
     and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    select balance into v_bal from funds where id = new.fund_id;
    v_amount := new.amount;
    select coalesce(sum(greatest(0, amount - coalesce(paid_amount, 0))), 0)
      into v_committed
      from supplier_bills
      where fund_id = new.fund_id and status = 'approved' and not is_archived and id <> new.id;
    v_committed := v_committed + coalesce((select sum(greatest(0,
        coalesce(approved_amount, planned_amount) - coalesce(paid_amount, 0)))
      from payment_requests where fund_id = new.fund_id and status = 'approved'), 0);
    if v_amount > coalesce(v_bal, 0) - v_committed + 0.009 then
      raise exception 'Недостаточно средств в фонде: доступно %, к одобрению %',
        round(coalesce(v_bal, 0) - v_committed, 2), v_amount;
    end if;
  end if;
  return new;
end $$;

-- Триггеры уже привязаны к функциям (20260618170000) — replace достаточно.

-- ---------- 2. Запрет архива счёта ДС с ненулевым остатком ------------------

create or replace function public.trg_cash_account_archive_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_archived and not old.is_archived and abs(coalesce(new.balance, 0)) > 0.005 then
    raise exception 'Нельзя архивировать счёт с остатком % — сначала переместите деньги на другой счёт',
      round(new.balance, 2);
  end if;
  return new;
end $$;

drop trigger if exists cash_account_archive_guard on public.cash_accounts;
create trigger cash_account_archive_guard
  before update on public.cash_accounts
  for each row execute function public.trg_cash_account_archive_guard();

-- ---------- 3. fp_control_sum: один проход по Реестру -----------------------

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
  reg as (
    -- один скан Реестра; «эффективная дата» = конец периода записи,
    -- для внепериодных — дата создания (как fp_period_balances/fp_turnover_sheet)
    select
      coalesce(sum(fr.cash_amount), 0) as cash_total,
      coalesce(sum(fr.fund_amount), 0) as funds_total,
      coalesce(sum(case
        when fr.op_type in ('income', 'income_return') then coalesce(fr.cash_amount, 0)
        when fr.op_type = 'distribution' then -coalesce(fr.fund_amount, 0)
        else 0 end), 0) as incomes_undistributed
    from public.fp_register fr
    left join public.fp_periods p on p.id = fr.period_id
    cross join target t
    where coalesce(p.ends_on, (fr.created_at at time zone 'Asia/Dushanbe')::date) <= t.ends_on
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
  ),
  req as (
    select coalesce(sum(greatest(0, round(
        (coalesce(r.approved_amount, r.planned_amount) - coalesce(r.paid_amount, 0))
        * case when c.is_base then 1 else coalesce(lr.rate, 1) end, 2))), 0) as v
    from public.payment_requests r
    join public.currencies c on c.id = r.currency_id
    left join latest_rate lr on lr.from_cur_id = r.currency_id
    where r.status = 'approved'
  ),
  bil as (
    select coalesce(sum(greatest(0, round(
        (b.amount - coalesce(b.paid_amount, 0))
        * case when c.is_base then 1 else coalesce(lr.rate, 1) end, 2))), 0) as v
    from public.supplier_bills b
    join public.currencies c on c.id = b.currency_id
    left join latest_rate lr on lr.from_cur_id = b.currency_id
    where b.status = 'approved' and not b.is_archived
  )
  select reg.cash_total, reg.funds_total, reg.incomes_undistributed, req.v, bil.v
  from reg, req, bil;
$$;

grant execute on function public.fp_control_sum(uuid) to authenticated;
