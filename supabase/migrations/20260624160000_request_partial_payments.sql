-- Частичные оплаты заявок ЗРС.
-- payment_requests.paid_amount — накопленная оплата (в валюте заявки).
-- fp_pay_request получает необязательный p_amount (по умолчанию = остаток →
-- обратная совместимость). Статус 'paid' только при полной оплате; иначе остаётся
-- 'approved' (заявку можно доплатить). Реверс оплаты уменьшает paid_amount.
-- Применено на прод через Supabase MCP (apply_migration).

alter table payment_requests add column if not exists paid_amount numeric not null default 0;
update payment_requests set paid_amount = coalesce(approved_amount, planned_amount)
  where status = 'paid' and paid_amount = 0;

-- старая 3-аргументная версия удаляется, чтобы не было неоднозначной перегрузки
drop function if exists public.fp_pay_request(uuid, uuid, uuid);

create or replace function public.fp_pay_request(p_request_id uuid, p_cash_account_id uuid, p_period_id uuid, p_amount numeric default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  r payment_requests%rowtype;
  v_status period_status;
  v_total numeric; v_remaining numeric; v_pay numeric;
  v_base numeric; v_rate numeric; v_is_base boolean; v_base_cur uuid; v_new_paid numeric;
begin
  if not (is_fin_admin() or my_role() = 'accountant') then
    raise exception 'Оплачивать заявки может финдиректор, владелец или бухгалтер';
  end if;
  select * into r from payment_requests where id = p_request_id for update;
  if r.id is null then raise exception 'Заявка не найдена'; end if;
  if r.status <> 'approved' then raise exception 'Оплатить можно только одобренную заявку'; end if;
  if r.fund_id is null then raise exception 'У заявки не назначен фонд-источник'; end if;
  if exists (select 1 from funds where id = r.fund_id and kind = 'accumulative') then
    raise exception 'Накопительный фонд нельзя использовать для оплаты заявок';
  end if;

  v_total := coalesce(r.approved_amount, r.planned_amount);
  v_remaining := round(v_total - coalesce(r.paid_amount, 0), 2);
  v_pay := round(coalesce(p_amount, v_remaining), 2);
  if v_pay <= 0 then raise exception 'Сумма оплаты должна быть больше нуля'; end if;
  if v_pay > v_remaining + 0.005 then
    raise exception 'Сумма оплаты (%) больше остатка к оплате (%)', v_pay, v_remaining;
  end if;

  select status into v_status from fp_periods where id = p_period_id;
  if v_status is null then raise exception 'Период ФП не найден'; end if;
  if v_status = 'closed' then raise exception 'Период закрыт — операции запрещены'; end if;
  if not exists (select 1 from cash_accounts where id = p_cash_account_id and not is_archived) then
    raise exception 'Счёт ДС не найден';
  end if;

  select is_base into v_is_base from currencies where id = r.currency_id;
  if v_is_base then v_base := v_pay;
  else
    select id into v_base_cur from currencies where is_base limit 1;
    select rate into v_rate from exchange_rates
      where from_cur_id = r.currency_id and to_cur_id = v_base_cur and valid_from <= current_date
      order by valid_from desc limit 1;
    if v_rate is null then raise exception 'Нет курса валюты заявки к базовой — добавьте курс'; end if;
    v_base := round(v_pay * v_rate, 2);
  end if;

  insert into fp_register (op_type, period_id, fund_id, fund_amount, cash_account_id, cash_amount,
    request_id, counterparty_id, payment_type_id, currency_id, fx_rate, comment, created_by)
  values ('request_payment', p_period_id, r.fund_id, -v_base, p_cash_account_id, -v_base,
    r.id, r.counterparty_id, r.payment_type_id, r.currency_id, v_rate, 'Оплата заявки №' || r.number, auth.uid());

  v_new_paid := round(coalesce(r.paid_amount, 0) + v_pay, 2);
  update payment_requests
    set paid_amount = v_new_paid,
        status = case when v_new_paid >= v_total - 0.005 then 'paid'::request_status else 'approved'::request_status end
    where id = r.id;
end $$;

create or replace function public.fp_reverse_request_payment(p_id bigint)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  r fp_register%rowtype; v_status period_status; v_number bigint; v_pay_req numeric;
begin
  if not (is_fin_admin() or my_role() = 'accountant') then
    raise exception 'Отменять оплату заявки может финдиректор, владелец или бухгалтер';
  end if;
  select * into r from fp_register where id = p_id for update;
  if r.id is null then raise exception 'Операция не найдена'; end if;
  if r.op_type <> 'request_payment' or r.reverses_id is not null then
    raise exception 'Отменить можно только оплату заявки';
  end if;
  if r.request_id is null then raise exception 'Операция не привязана к заявке'; end if;
  if exists (select 1 from fp_register where reverses_id = r.id) then
    raise exception 'Эта оплата уже отменена';
  end if;
  select status into v_status from fp_periods where id = r.period_id;
  if v_status = 'closed' then
    raise exception 'Неделя оплаты закрыта — сначала откройте её, чтобы отменить оплату';
  end if;
  select number into v_number from payment_requests where id = r.request_id;

  insert into fp_register (op_type, period_id, fund_id, fund_amount, cash_account_id, cash_amount,
    request_id, counterparty_id, payment_type_id, currency_id, fx_rate, reverses_id, comment, created_by)
  values ('request_payment', r.period_id, r.fund_id, -r.fund_amount, r.cash_account_id, -r.cash_amount,
    r.request_id, r.counterparty_id, r.payment_type_id, r.currency_id, r.fx_rate, r.id,
    'Отмена оплаты заявки №' || coalesce(v_number::text, ''), auth.uid());

  v_pay_req := round(abs(r.fund_amount) / coalesce(r.fx_rate, 1), 2);
  update payment_requests
    set paid_amount = greatest(0, round(coalesce(paid_amount,0) - v_pay_req, 2)),
        status = 'approved'::request_status
    where id = r.request_id;
end $$;
