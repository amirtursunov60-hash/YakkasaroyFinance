-- Операции между фондами (ТЗ v2 §4.1.4): перемещение, заём, возврат займа.
-- Каждая операция — пара записей Реестра (−из / +в), связанных pair_id.
-- Возвраты ссылаются на родительскую запись займа через loan_parent_id.
-- Балансы и запрет минуса обеспечивают существующие триггеры Реестра.

create or replace function public.fp_fund_transfer(p_from uuid, p_to uuid, p_amount numeric, p_period_id uuid, p_comment text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status period_status;
  v_pair uuid := gen_random_uuid();
begin
  if not is_fin_admin() then
    raise exception 'Перемещать средства между фондами может только финдиректор или владелец';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Сумма должна быть больше нуля'; end if;
  if p_from = p_to then raise exception 'Выберите два разных фонда'; end if;
  if not exists (select 1 from funds where id = p_from and not is_archived) then raise exception 'Фонд-источник не найден'; end if;
  if not exists (select 1 from funds where id = p_to and not is_archived) then raise exception 'Фонд-получатель не найден'; end if;
  select status into v_status from fp_periods where id = p_period_id;
  if v_status is null then raise exception 'Период ФП не найден'; end if;
  if v_status = 'closed' then raise exception 'Период закрыт — операции запрещены'; end if;

  insert into fp_register (op_type, period_id, fund_id, fund_amount, pair_id, comment, created_by)
  values ('fund_transfer', p_period_id, p_from, -p_amount, v_pair, p_comment, auth.uid());
  insert into fp_register (op_type, period_id, fund_id, fund_amount, pair_id, comment, created_by)
  values ('fund_transfer', p_period_id, p_to, p_amount, v_pair, p_comment, auth.uid());
end $$;

create or replace function public.fp_fund_loan(p_from uuid, p_to uuid, p_amount numeric, p_period_id uuid, p_comment text default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status period_status;
  v_pair uuid := gen_random_uuid();
  v_id bigint;
begin
  if not is_fin_admin() then
    raise exception 'Выдавать займы между фондами может только финдиректор или владелец';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Сумма должна быть больше нуля'; end if;
  if p_from = p_to then raise exception 'Выберите два разных фонда'; end if;
  if not exists (select 1 from funds where id = p_from and not is_archived) then raise exception 'Фонд-кредитор не найден'; end if;
  if not exists (select 1 from funds where id = p_to and not is_archived) then raise exception 'Фонд-заёмщик не найден'; end if;
  select status into v_status from fp_periods where id = p_period_id;
  if v_status is null then raise exception 'Период ФП не найден'; end if;
  if v_status = 'closed' then raise exception 'Период закрыт — операции запрещены'; end if;

  insert into fp_register (op_type, period_id, fund_id, fund_amount, pair_id, comment, created_by)
  values ('fund_loan', p_period_id, p_from, -p_amount, v_pair, p_comment, auth.uid())
  returning id into v_id;
  insert into fp_register (op_type, period_id, fund_id, fund_amount, pair_id, comment, created_by)
  values ('fund_loan', p_period_id, p_to, p_amount, v_pair, p_comment, auth.uid());
  return v_id;
end $$;

create or replace function public.fp_fund_loan_return(p_loan_id bigint, p_amount numeric, p_period_id uuid, p_comment text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  parent fp_register%rowtype;
  v_borrower uuid;
  v_status period_status;
  v_returned numeric;
  v_out numeric;
  v_pair uuid := gen_random_uuid();
begin
  if not is_fin_admin() then
    raise exception 'Возвращать займы может только финдиректор или владелец';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Сумма должна быть больше нуля'; end if;

  select * into parent from fp_register
  where id = p_loan_id and op_type = 'fund_loan' and fund_amount < 0;
  if parent.id is null then raise exception 'Заём не найден'; end if;

  select fund_id into v_borrower from fp_register
  where pair_id = parent.pair_id and id <> parent.id;
  if v_borrower is null then raise exception 'Не найден фонд-заёмщик по этому займу'; end if;

  select status into v_status from fp_periods where id = p_period_id;
  if v_status is null then raise exception 'Период ФП не найден'; end if;
  if v_status = 'closed' then raise exception 'Период закрыт — операции запрещены'; end if;

  select coalesce(sum(fund_amount), 0) into v_returned from fp_register
  where loan_parent_id = p_loan_id and op_type = 'fund_loan_return' and fund_amount > 0;
  v_out := -parent.fund_amount - v_returned;
  if p_amount > v_out then
    raise exception 'К возврату по этому займу осталось %', v_out;
  end if;

  insert into fp_register (op_type, period_id, fund_id, fund_amount, pair_id, loan_parent_id, comment, created_by)
  values ('fund_loan_return', p_period_id, v_borrower, -p_amount, v_pair, p_loan_id, p_comment, auth.uid());
  insert into fp_register (op_type, period_id, fund_id, fund_amount, pair_id, loan_parent_id, comment, created_by)
  values ('fund_loan_return', p_period_id, parent.fund_id, p_amount, v_pair, p_loan_id, p_comment, auth.uid());
end $$;

revoke execute on function public.fp_fund_transfer(uuid, uuid, numeric, uuid, text) from public, anon;
revoke execute on function public.fp_fund_loan(uuid, uuid, numeric, uuid, text) from public, anon;
revoke execute on function public.fp_fund_loan_return(bigint, numeric, uuid, text) from public, anon;
grant execute on function public.fp_fund_transfer(uuid, uuid, numeric, uuid, text) to authenticated, service_role;
grant execute on function public.fp_fund_loan(uuid, uuid, numeric, uuid, text) to authenticated, service_role;
grant execute on function public.fp_fund_loan_return(bigint, numeric, uuid, text) to authenticated, service_role;
