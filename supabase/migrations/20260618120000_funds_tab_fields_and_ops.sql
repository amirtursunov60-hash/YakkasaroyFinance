-- Вкладка «Фонды» (docs/funds-spec.md): новые свойства фонда и ручные операции.
-- 1) Поля funds: description, color, stage (один этап на фонд), no_transfer
--    (☑ запрет ручного перемещения/возврата), is_private (виден только owner/fin_director).
-- 2) Ручные операции фонда: Приход (fund_income, +) и Возврат (fund_return, −) —
--    строки Реестра, балансы/овердрафт/блокировку периода держат триггеры.
-- 3) Режимы: накопительный фонд нельзя использовать для оплаты заявок/счетов;
--    галочка «Запрет перемещения» блокирует только ручные операции (перемещение,
--    заём, возврат), штатный ход ФП (оплата) ей не мешает.
-- 4) Приватность фонда учитывается в has_fund_access.

-- ---------- 1. Новые поля фонда ----------
alter table public.funds add column if not exists description text;
alter table public.funds add column if not exists color text;
alter table public.funds add column if not exists stage distribution_stage;
alter table public.funds add column if not exists no_transfer boolean not null default false;
alter table public.funds add column if not exists is_private boolean not null default false;

comment on column public.funds.description is 'Описание фонда (вкладка «Фонды»)';
comment on column public.funds.color is 'Цвет-метка фонда (пресет палитры темы)';
comment on column public.funds.stage is 'Этап распределения фонда — один на фонд (docs/funds-spec.md §10)';
comment on column public.funds.no_transfer is '☑ Запрет перемещения: блок ручных операций (перемещение/заём/возврат), приход разрешён';
comment on column public.funds.is_private is 'Приватный фонд: виден только владельцу и финдиректору';

-- Бэкофилл этапа из правил распределения по умолчанию (по одному на фонд).
-- Не удаляем правила распределения — это задача Директивы; здесь только заполняем
-- отображаемый этап фонда (для ФД6 берётся один — поправляется в модалке фонда).
update public.funds f set stage = sub.stage
from (
  select distinct on (fund_id) fund_id, stage
  from public.distribution_rules
  where income_type_id is null
  order by fund_id, priority asc nulls last, stage
) sub
where f.id = sub.fund_id and f.stage is null;

-- ---------- 2. Типы операций Реестра ----------
alter type register_op_type add value if not exists 'fund_income';
alter type register_op_type add value if not exists 'fund_return';

-- ---------- 3. Приватность фонда в правах доступа ----------
-- Приватный фонд (is_private) виден только владельцу/финдиректору; персональный
-- список доступа (is_restricted/fund_access) на приватные фонды не распространяется.
create or replace function public.has_fund_access(f uuid)
 returns boolean
 language sql
 stable security definer
 set search_path = public
as $function$
  select coalesce(
      public.is_fin_admin()
      or exists (select 1 from public.funds
                 where id = f and not is_restricted and not is_private)
      or (exists (select 1 from public.fund_access
                  where user_id = auth.uid() and fund_id = f)
          and not exists (select 1 from public.funds where id = f and is_private))
  , false);
$function$;
revoke execute on function public.has_fund_access(uuid) from public, anon;
grant execute on function public.has_fund_access(uuid) to authenticated, service_role;

-- ---------- 4. Ручной приход средств в фонд (Приход) ----------
create or replace function public.fp_fund_income(p_fund uuid, p_amount numeric, p_period_id uuid, p_comment text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status period_status;
begin
  if not is_fin_admin() then
    raise exception 'Приходовать средства в фонд может только финдиректор или владелец';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Сумма должна быть больше нуля'; end if;
  if not exists (select 1 from funds where id = p_fund and not is_archived) then raise exception 'Фонд не найден'; end if;
  select status into v_status from fp_periods where id = p_period_id;
  if v_status is null then raise exception 'Период ФП не найден'; end if;
  if v_status = 'closed' then raise exception 'Период закрыт — операции запрещены'; end if;

  insert into fp_register (op_type, period_id, fund_id, fund_amount, comment, created_by)
  values ('fund_income', p_period_id, p_fund, p_amount, p_comment, auth.uid());
end $$;

-- ---------- 5. Ручной возврат (изъятие) средств из фонда (Возврат) ----------
create or replace function public.fp_fund_return(p_fund uuid, p_amount numeric, p_period_id uuid, p_comment text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status period_status;
begin
  if not is_fin_admin() then
    raise exception 'Изымать средства из фонда может только финдиректор или владелец';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Сумма должна быть больше нуля'; end if;
  if not exists (select 1 from funds where id = p_fund and not is_archived) then raise exception 'Фонд не найден'; end if;
  if exists (select 1 from funds where id = p_fund and no_transfer) then
    raise exception 'Из этого фонда запрещён вывод средств (стоит «Запрет перемещения»)';
  end if;
  select status into v_status from fp_periods where id = p_period_id;
  if v_status is null then raise exception 'Период ФП не найден'; end if;
  if v_status = 'closed' then raise exception 'Период закрыт — операции запрещены'; end if;

  -- овердрафт (запрет минуса) держит триггер Реестра
  insert into fp_register (op_type, period_id, fund_id, fund_amount, comment, created_by)
  values ('fund_return', p_period_id, p_fund, -p_amount, p_comment, auth.uid());
end $$;

-- ---------- 6. Перемещение/заём: учитываем «Запрет перемещения» источника ----------
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
  if exists (select 1 from funds where id = p_from and no_transfer) then
    raise exception 'Из фонда-источника запрещено перемещение средств (стоит «Запрет перемещения»)';
  end if;
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
  if exists (select 1 from funds where id = p_from and no_transfer) then
    raise exception 'Из фонда-кредитора запрещено перемещение средств (стоит «Запрет перемещения»)';
  end if;
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

-- ---------- 7. Оплата заявки/счёта: накопительный фонд использовать нельзя ----------
create or replace function public.fp_pay_request(p_request_id uuid, p_cash_account_id uuid, p_period_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r payment_requests%rowtype;
  v_status period_status;
  v_base numeric;
  v_rate numeric;
  v_is_base boolean;
  v_base_cur uuid;
begin
  if not (is_fin_admin() or my_role() = 'accountant') then
    raise exception 'Оплачивать заявки может финдиректор, владелец или бухгалтер';
  end if;

  select * into r from payment_requests where id = p_request_id;
  if r.id is null then raise exception 'Заявка не найдена'; end if;
  if r.status <> 'approved' then raise exception 'Оплатить можно только одобренную заявку'; end if;
  if r.fund_id is null then raise exception 'У заявки не назначен фонд-источник'; end if;
  if exists (select 1 from funds where id = r.fund_id and kind = 'accumulative') then
    raise exception 'Накопительный фонд нельзя использовать для оплаты заявок';
  end if;

  select status into v_status from fp_periods where id = p_period_id;
  if v_status is null then raise exception 'Период ФП не найден'; end if;
  if v_status = 'closed' then raise exception 'Период закрыт — операции запрещены'; end if;

  if not exists (select 1 from cash_accounts where id = p_cash_account_id and not is_archived) then
    raise exception 'Счёт ДС не найден';
  end if;

  select is_base into v_is_base from currencies where id = r.currency_id;
  if v_is_base then
    v_base := r.planned_amount;
  else
    select id into v_base_cur from currencies where is_base limit 1;
    select rate into v_rate from exchange_rates
    where from_cur_id = r.currency_id and to_cur_id = v_base_cur and valid_from <= current_date
    order by valid_from desc limit 1;
    if v_rate is null then raise exception 'Нет курса валюты заявки к базовой — добавьте курс'; end if;
    v_base := round(r.planned_amount * v_rate, 2);
  end if;

  insert into fp_register (op_type, period_id, fund_id, fund_amount, cash_account_id, cash_amount,
    request_id, counterparty_id, payment_type_id, currency_id, fx_rate, comment, created_by)
  values ('request_payment', p_period_id, r.fund_id, -v_base, p_cash_account_id, -v_base,
    r.id, r.counterparty_id, r.payment_type_id, r.currency_id, v_rate, 'Оплата заявки №' || r.number, auth.uid());

  update payment_requests set status = 'paid' where id = r.id;
end $$;

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
  if exists (select 1 from funds where id = b.fund_id and kind = 'accumulative') then
    raise exception 'Накопительный фонд нельзя использовать для оплаты счетов';
  end if;

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

-- ---------- 8. Права на новые RPC ----------
revoke execute on function public.fp_fund_income(uuid, numeric, uuid, text) from public, anon;
revoke execute on function public.fp_fund_return(uuid, numeric, uuid, text) from public, anon;
grant execute on function public.fp_fund_income(uuid, numeric, uuid, text) to authenticated, service_role;
grant execute on function public.fp_fund_return(uuid, numeric, uuid, text) to authenticated, service_role;
