-- Пофондовое одобрение распределения (модель ManaJet, ТЗ §4.1.3):
-- этап можно одобрять частями — по каждому фонду отдельно (калькулятор
-- по видам дохода) или общей кнопкой. Защита от дублей — по фонду,
-- а не по этапу целиком.
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
  v_code text;
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

  for r in
    select (a ->> 'fund_id')::uuid as fund_id, (a ->> 'amount')::numeric as amount
    from jsonb_array_elements(p_allocations) a
  loop
    continue when r.amount is null or r.amount <= 0;
    select code into v_code from funds where id = r.fund_id and not is_archived;
    if v_code is null then
      raise exception 'Фонд % не найден', r.fund_id;
    end if;
    if exists (select 1 from fp_register
               where period_id = p_period_id
                 and op_type = 'distribution'
                 and comment = 'stage:' || p_stage
                 and fund_id = r.fund_id) then
      raise exception 'Фонд % уже одобрен на этом этапе — сначала сбросьте', v_code;
    end if;
    insert into fp_register (op_type, period_id, fund_id, fund_amount, comment, created_by)
    values ('distribution', p_period_id, r.fund_id, r.amount, 'stage:' || p_stage, auth.uid());
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'Нет сумм к зачислению';
  end if;
end $$;
