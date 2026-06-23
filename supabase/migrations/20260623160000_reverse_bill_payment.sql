-- Отмена оплаты счёта поставщика (по аналогии с отменой оплаты заявки,
-- 20260623140000). Реестр неизменяем — оплату не удаляем, а добавляем
-- КОМПЕНСИРУЮЩУЮ запись (фонд + и счёт ДС +, reverses_id на оплату) и возвращаем
-- счёт в 'approved' (можно оплатить заново), снимая период оплаты.
--
-- Тип записи-отмены — тот же 'bill_payment' с плюсом: в отчётах оплата и её
-- отмена гасятся в ноль, а в ленте «Операции со счетами» отмена видна рядом.
-- У bill_payment нет уникального индекса (в отличие от заявок), поэтому вторая
-- проводка по тому же счёту допустима.

create or replace function public.fp_reverse_bill_payment(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r fp_register%rowtype;
  v_status period_status;
  v_number text;
begin
  if not (is_fin_admin() or my_role() = 'accountant') then
    raise exception 'Отменять оплату счёта может финдиректор, владелец или бухгалтер';
  end if;

  select * into r from fp_register where id = p_id for update;
  if r.id is null then raise exception 'Операция не найдена'; end if;
  if r.op_type <> 'bill_payment' or r.reverses_id is not null then
    raise exception 'Отменить можно только оплату счёта';
  end if;
  if r.bill_id is null then raise exception 'Операция не привязана к счёту'; end if;
  if exists (select 1 from fp_register where reverses_id = r.id) then
    raise exception 'Эта оплата уже отменена';
  end if;

  select status into v_status from fp_periods where id = r.period_id;
  if v_status = 'closed' then
    raise exception 'Неделя оплаты закрыта — сначала откройте её, чтобы отменить оплату';
  end if;

  select number into v_number from supplier_bills where id = r.bill_id;

  -- компенсирующая запись: деньги возвращаются в фонд и на счёт ДС
  insert into fp_register (op_type, period_id, fund_id, fund_amount, cash_account_id, cash_amount,
    bill_id, counterparty_id, currency_id, fx_rate, reverses_id, comment, created_by)
  values ('bill_payment', r.period_id, r.fund_id, -r.fund_amount, r.cash_account_id, -r.cash_amount,
    r.bill_id, r.counterparty_id, r.currency_id, r.fx_rate, r.id,
    'Отмена оплаты счёта №' || coalesce(v_number, ''), auth.uid());

  -- счёт возвращается в «одобрен», период оплаты снимается
  update supplier_bills set status = 'approved', period_paid_id = null
  where id = r.bill_id and status = 'paid';
end $$;

revoke execute on function public.fp_reverse_bill_payment(bigint) from public, anon;
grant execute on function public.fp_reverse_bill_payment(bigint) to authenticated, service_role;
