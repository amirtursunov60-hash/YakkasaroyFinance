-- ============================================================================
-- 009 · Директива: сброс одобренного распределения + автосоздание новой недели
--
-- 1. fp_reset_distribution — «Сброс» работает и после одобрения этапа:
--    строки распределения удаляются из Реестра, балансы фондов пересчитает
--    триггер fp_register_balances (он обрабатывает delete), удаление
--    фиксируется в audit_log. p_stage = 'all' — сброс всего распределения
--    периода (для распределений, проведённых до поэтапной модели, без метки).
-- 2. fp_close_period — при закрытии недели автоматически создаётся следующий
--    период (autocreate как у FpPlan в ManaJet). Переоткрытие закрытой недели
--    (fp_reopen_period) созданные периоды НЕ удаляет.
-- ============================================================================

create or replace function public.fp_reset_distribution(p_period_id uuid, p_stage text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status period_status;
  v_count int;
begin
  if not is_fin_admin() then
    raise exception 'Сбрасывать распределение может только финдиректор или владелец';
  end if;
  if p_stage not in ('revenue', 'margin', 'adjusted', 'remainder', 'all') then
    raise exception 'Неизвестный этап распределения: %', p_stage;
  end if;

  select status into v_status from fp_periods where id = p_period_id;
  if v_status is null then
    raise exception 'Период ФП не найден';
  end if;
  if v_status = 'closed' then
    raise exception 'Период закрыт — сначала откройте неделю';
  end if;

  if p_stage = 'all' then
    delete from fp_register
    where period_id = p_period_id and op_type = 'distribution';
  else
    delete from fp_register
    where period_id = p_period_id and op_type = 'distribution'
      and comment = 'stage:' || p_stage;
  end if;

  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'Нечего сбрасывать — распределение не найдено';
  end if;
end $$;

-- Закрытие периода: протокол + блокировка + пометка доходов + следующая неделя
create or replace function public.fp_close_period(p_period_id uuid, p_protocol jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status period_status;
  v_income numeric;
  v_ends   date;
begin
  if not is_fin_admin() then
    raise exception 'Закрывать период может только финдиректор или владелец';
  end if;

  select status, ends_on into v_status, v_ends from fp_periods where id = p_period_id;
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

  -- автосоздание следующей недели (чт–ср)
  insert into fp_periods (starts_on, ends_on)
  select v_ends + 1, v_ends + 7
  where not exists (select 1 from fp_periods where starts_on = v_ends + 1);
end $$;
