-- ============================================================================
-- 007 · Директива: поэтапное одобрение распределения (как в прототипе)
--
-- Каждый этап (выручка / маржинальный / скорректированный) одобряется
-- отдельной кнопкой. Этап операции хранится в fp_register.comment в виде
-- 'stage:revenue' и т.п. — у Реестра нет отдельной колонки этапа, а ФД6
-- участвует в двух этапах, поэтому по фонду этап не восстановить.
-- 'stage:remainder' — перенос нераспределённого остатка в фонд.
--
-- Заменяет fp_run_distribution из миграции 006 (одобрение всего периода
-- разом); fp_close_period теперь помечает доходы периода распределёнными.
-- ============================================================================

create or replace function public.fp_distribute_stage(p_period_id uuid, p_stage text, p_allocations jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status period_status;
  r record;
  v_count int := 0;
begin
  if not is_fin_admin() then
    raise exception 'Одобрять распределение может только финдиректор или владелец';
  end if;
  if p_stage not in ('revenue', 'margin', 'adjusted', 'remainder') then
    raise exception 'Неизвестный этап распределения: %', p_stage;
  end if;

  select status into v_status from fp_periods where id = p_period_id;
  if v_status is null then
    raise exception 'Период ФП не найден';
  end if;
  if v_status = 'closed' then
    raise exception 'Период закрыт — операции запрещены';
  end if;
  if exists (select 1 from fp_register
             where period_id = p_period_id
               and op_type = 'distribution'
               and comment = 'stage:' || p_stage) then
    raise exception 'Этот этап уже одобрен в данном периоде';
  end if;

  for r in
    select (a ->> 'fund_id')::uuid as fund_id, (a ->> 'amount')::numeric as amount
    from jsonb_array_elements(p_allocations) a
  loop
    continue when r.amount is null or r.amount <= 0;
    if not exists (select 1 from funds where id = r.fund_id and not is_archived) then
      raise exception 'Фонд % не найден', r.fund_id;
    end if;
    insert into fp_register (op_type, period_id, fund_id, fund_amount, comment, created_by)
    values ('distribution', p_period_id, r.fund_id, r.amount, 'stage:' || p_stage, auth.uid());
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'Нет сумм к зачислению';
  end if;
end $$;

-- Одобрение всего периода одной операцией больше не используется
drop function if exists public.fp_run_distribution(uuid, jsonb);

-- Закрытие периода: протокол Директивы + блокировка + пометка доходов
create or replace function public.fp_close_period(p_period_id uuid, p_protocol jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status period_status;
  v_income numeric;
begin
  if not is_fin_admin() then
    raise exception 'Закрывать период может только финдиректор или владелец';
  end if;

  select status into v_status from fp_periods where id = p_period_id;
  if v_status is null then
    raise exception 'Период ФП не найден';
  end if;
  if v_status = 'closed' then
    raise exception 'Период уже закрыт';
  end if;

  select coalesce(sum(case when is_return then -amount_base else amount_base end), 0)
    into v_income from incomes where period_id = p_period_id;

  insert into directives (period_id, total_income, protocol, conducted_by)
  values (p_period_id, v_income, p_protocol, auth.uid());

  update incomes set is_distributed = true
  where period_id = p_period_id and not is_distributed;

  update fp_periods
  set status = 'closed', closed_at = now(), closed_by = auth.uid()
  where id = p_period_id;
end $$;
