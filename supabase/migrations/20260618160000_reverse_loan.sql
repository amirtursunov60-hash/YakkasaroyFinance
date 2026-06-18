-- Откат займа (docs/funds-spec.md §7): «Откатить» на займе = полный возврат
-- займа — деньги возвращаются в фонд-кредитор, долг закрывается. Реализуется
-- через существующую fp_fund_loan_return (она пишет парные записи Реестра и
-- корректно уменьшает долг). Для перемещения/прихода/возврата поведение прежнее.
create or replace function public.fp_reverse_fund_op(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r fp_register%rowtype;
  leg fp_register%rowtype;
  v_pair uuid := gen_random_uuid();
  v_ret numeric;
  v_out numeric;
begin
  if not is_fin_admin() then
    raise exception 'Откатывать операции может только финдиректор или владелец';
  end if;
  select * into r from fp_register where id = p_id;
  if r.id is null then raise exception 'Операция не найдена'; end if;

  -- Заём: откат = полный возврат (деньги кредитору, долг закрывается)
  if r.op_type = 'fund_loan' then
    if r.fund_amount >= 0 then
      -- передали ногу заёмщика — берём ногу кредитора (родитель займа)
      select * into r from fp_register where pair_id = r.pair_id and fund_amount < 0 limit 1;
      if r.id is null then raise exception 'Не найдена запись займа'; end if;
    end if;
    select coalesce(sum(fund_amount), 0) into v_ret from fp_register
      where loan_parent_id = r.id and op_type = 'fund_loan_return' and fund_amount > 0;
    v_out := -r.fund_amount - v_ret;
    if v_out <= 0 then raise exception 'Заём уже возвращён'; end if;
    perform fp_fund_loan_return(r.id, v_out, r.period_id, 'Откат займа');
    return;
  end if;

  if r.op_type not in ('fund_transfer', 'fund_income', 'fund_return') then
    raise exception 'Откатить можно только перемещение, заём, приход или возврат фонда';
  end if;

  if r.pair_id is not null then
    if exists (select 1 from fp_register rev
               join fp_register o on o.id = rev.reverses_id
               where o.pair_id = r.pair_id) then
      raise exception 'Эта операция уже откачена';
    end if;
    for leg in select * from fp_register where pair_id = r.pair_id loop
      insert into fp_register (op_type, period_id, fund_id, fund_amount, pair_id, reverses_id, comment, created_by)
      values ('adjustment', leg.period_id, leg.fund_id, -leg.fund_amount, v_pair, leg.id,
              'Откат: ' || coalesce(leg.comment, leg.op_type::text), auth.uid());
    end loop;
  else
    if exists (select 1 from fp_register where reverses_id = r.id) then
      raise exception 'Эта операция уже откачена';
    end if;
    insert into fp_register (op_type, period_id, fund_id, fund_amount, reverses_id, comment, created_by)
    values ('adjustment', r.period_id, r.fund_id, -r.fund_amount, r.id,
            'Откат: ' || coalesce(r.comment, r.op_type::text), auth.uid());
  end if;
end $$;
