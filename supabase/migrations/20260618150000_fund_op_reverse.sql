-- Откат операции фонда (docs/funds-spec.md §7): «корзина» в журнале не удаляет
-- запись (Реестр неизменяем), а добавляет компенсирующую запись, возвращающую
-- деньги в исходный фонд. Откатываются только ручные операции:
-- перемещение (fund_transfer), приход (fund_income), возврат (fund_return).
-- Займы возвращаются через «Долг» (fp_fund_loan_return).
--
-- reverses_id указывает на откатываемую строку Реестра — для запрета повторного
-- отката и пометки записей-откатов.
alter table public.fp_register add column if not exists reverses_id bigint references fp_register(id);
create index if not exists fp_register_reverses_id_idx on public.fp_register(reverses_id);
comment on column public.fp_register.reverses_id is 'Строка Реестра, которую откатывает эта компенсирующая запись (docs/funds-spec.md §7)';

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
begin
  if not is_fin_admin() then
    raise exception 'Откатывать операции может только финдиректор или владелец';
  end if;
  select * into r from fp_register where id = p_id;
  if r.id is null then raise exception 'Операция не найдена'; end if;
  if r.op_type not in ('fund_transfer', 'fund_income', 'fund_return') then
    raise exception 'Откатить можно только перемещение, приход или возврат фонда (займы возвращаются через «Долг»)';
  end if;

  if r.pair_id is not null then
    -- парная операция (перемещение): откатываем обе ноги
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
    -- одиночная операция (приход/возврат)
    if exists (select 1 from fp_register where reverses_id = r.id) then
      raise exception 'Эта операция уже откачена';
    end if;
    insert into fp_register (op_type, period_id, fund_id, fund_amount, reverses_id, comment, created_by)
    values ('adjustment', r.period_id, r.fund_id, -r.fund_amount, r.id,
            'Откат: ' || coalesce(r.comment, r.op_type::text), auth.uid());
  end if;
end $$;

revoke execute on function public.fp_reverse_fund_op(bigint) from public, anon;
grant execute on function public.fp_reverse_fund_op(bigint) to authenticated, service_role;
