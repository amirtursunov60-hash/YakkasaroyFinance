-- Оплата одобренной заявки (PurchaseOrderPayment, ТЗ v2 §4.1.5).
-- Атомарно: запись в Реестр (период оплаты = p_period_id, суммы в базовой
-- валюте — конвенция как у trg_income_to_register) + перевод статуса в paid.
-- Списание из фонда защищено триггерами Реестра (овердрафт, закрытый период).
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

revoke execute on function public.fp_pay_request(uuid, uuid, uuid) from public, anon;
grant execute on function public.fp_pay_request(uuid, uuid, uuid) to authenticated, service_role;
