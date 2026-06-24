-- Отмена операции дохода через сторно (Доход §2/§3 gap-map). Прямой update/delete
-- запрещён (неизменяемость Реестра fp_register) — отмена只 компенсирующей записью.
-- Обобщает fp_reverse_invoice_payment на любые операции дохода (продажи, ручной
-- ввод и т.д.): добавляет доход-возврат (is_return=true, reverses_income_id),
-- триггер trg_income_to_register проводит income_return в Реестр (счёт ДС
-- уменьшается). Для дохода, привязанного к счёту клиента, пересчитывает статус.

create or replace function public.fp_reverse_income(p_income_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  r incomes%rowtype;
  v_status period_status;
  v_paid numeric;
  inv client_invoices%rowtype;
begin
  if not (is_fin_admin() or my_role() = any (array['accountant','location_manager']::app_role[])) then
    raise exception 'Отменять операцию дохода может финдиректор, владелец, бухгалтер или управляющий';
  end if;

  select * into r from incomes where id = p_income_id for update;
  if r.id is null then raise exception 'Операция дохода не найдена'; end if;
  if r.is_return then raise exception 'Это уже возврат/сторно — нечего отменять'; end if;
  if exists (select 1 from incomes where reverses_income_id = r.id) then
    raise exception 'Эта операция уже отменена';
  end if;
  if not has_location_access(r.location_id) then raise exception 'Нет доступа к точке этой операции'; end if;

  select status into v_status from fp_periods where id = r.period_id;
  if v_status = 'closed' then
    raise exception 'Неделя операции закрыта — сначала откройте её, чтобы отменить';
  end if;

  insert into incomes (income_type_id, location_id, period_id, amount, currency_id, amount_base,
    received_on, cash_account_id, payment_type_id, counterparty_id, invoice_id,
    is_return, reverses_income_id, source, comment, created_by)
  values (r.income_type_id, r.location_id, r.period_id, r.amount, r.currency_id, r.amount_base,
    r.received_on, r.cash_account_id, r.payment_type_id, r.counterparty_id, r.invoice_id,
    true, r.id, r.source, 'Отмена операции дохода', auth.uid());

  -- Если доход относился к счёту клиента — пересчитать его статус
  if r.invoice_id is not null then
    select * into inv from client_invoices where id = r.invoice_id;
    if inv.id is not null and inv.status <> 'cancelled' then
      select coalesce(sum(case when is_return then -amount else amount end), 0) into v_paid
      from incomes where invoice_id = inv.id;
      update client_invoices
      set status = case when v_paid >= inv.amount - 0.009 then 'paid'::client_invoice_status
                        else 'issued'::client_invoice_status end
      where id = inv.id;
    end if;
  end if;
end $$;
