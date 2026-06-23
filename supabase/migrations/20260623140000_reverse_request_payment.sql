-- Отмена оплаты заявки (docs §4.1.5; «корзина» в ленте «Операции с заявками»).
-- Реестр неизменяем — оплату не удаляем, а добавляем КОМПЕНСИРУЮЩУЮ запись,
-- возвращающую деньги в фонд и на счёт ДС, и возвращаем заявку в статус
-- 'approved' (можно оплатить заново или изменить). reverses_id указывает на
-- откатываемую строку — для запрета повторной отмены и пометки записи-отмены.
--
-- Тип компенсирующей записи — тот же 'request_payment', но с положительными
-- суммами: в отчётах оплата и её отмена взаимно гасятся в ноль (это корректно),
-- а в ленте заявок отмена видна рядом с оплатой.

create or replace function public.fp_reverse_request_payment(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r fp_register%rowtype;
  v_status period_status;
  v_number bigint;
begin
  if not (is_fin_admin() or my_role() = 'accountant') then
    raise exception 'Отменять оплату заявки может финдиректор, владелец или бухгалтер';
  end if;

  -- блокировка строки от гонок (двойная отмена)
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

  -- компенсирующая запись: деньги возвращаются в фонд и на счёт ДС
  insert into fp_register (op_type, period_id, fund_id, fund_amount, cash_account_id, cash_amount,
    request_id, counterparty_id, payment_type_id, currency_id, fx_rate, reverses_id, comment, created_by)
  values ('request_payment', r.period_id, r.fund_id, -r.fund_amount, r.cash_account_id, -r.cash_amount,
    r.request_id, r.counterparty_id, r.payment_type_id, r.currency_id, r.fx_rate, r.id,
    'Отмена оплаты заявки №' || coalesce(v_number::text, ''), auth.uid());

  -- заявка возвращается в «одобрена»
  update payment_requests set status = 'approved' where id = r.request_id and status = 'paid';
end $$;

revoke execute on function public.fp_reverse_request_payment(bigint) from public, anon;
grant execute on function public.fp_reverse_request_payment(bigint) to authenticated, service_role;
