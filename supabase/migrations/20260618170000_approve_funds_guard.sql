-- Запрет одобрения сверх «Доступно» в фонде (docs/funds-spec.md §4, принцип ТЗ
-- «распоряжаемся только фактически имеющимися средствами»). При переводе заявки
-- или счёта в статус 'approved' проверяем, что сумма не больше доступного остатка
-- фонда: Доступно = funds.balance − уже одобренные-неоплаченные (заявки + счета),
-- кроме самой проверяемой строки. Инвариант держит БД (триггеры BEFORE).
--
-- Суммы сравниваем «как есть» (как и отображаемые Остаток/Доступно); валютная
-- конвертация — задача отдельная (большинство операций в базовой TJS).

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
end $$;

drop trigger if exists request_approve_funds_check on public.payment_requests;
create trigger request_approve_funds_check
  before insert or update on public.payment_requests
  for each row execute function public.trg_request_approve_funds_check();

drop trigger if exists bill_approve_funds_check on public.supplier_bills;
create trigger bill_approve_funds_check
  before insert or update on public.supplier_bills
  for each row execute function public.trg_bill_approve_funds_check();
