-- Синхронизация этапа фонда с Директивой (docs/funds-spec.md §10).
-- Этап фонда (funds.stage) — отображаемое свойство, но «домашний этап» в
-- Директиве определяется дефолтным правилом распределения
-- (distribution_rules, income_type_id IS NULL). Раньше смена этапа в карточке
-- фонда не переносила его в Директиве. Эта функция меняет этап фонда И
-- переносит/сворачивает его дефолтное правило на новый этап атомарно.
--
-- Логика (учитывая UNIQUE (fund_id, stage) WHERE income_type_id IS NULL):
--   • один дефолтный правило-ряд → переносим его на новый этап;
--   • несколько (как у ФД6 на двух этапах) → оставляем один на новом этапе,
--     остальные сворачиваем (is_archived) — фонд становится одноэтапным;
--   • ни одного дефолтного правила и нет схемы по видам (ФРС) → создаём
--     дефолтное правило 0% на новом этапе, чтобы фонд появился в Директиве.
-- Правила по видам дохода (ФРС, income_type_id IS NOT NULL) не трогаем.
create or replace function public.fp_set_fund_stage(p_fund uuid, p_stage distribution_stage)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_keeper uuid;
begin
  if not is_fin_admin() then
    raise exception 'Менять этап фонда может только финдиректор или владелец';
  end if;
  if not exists (select 1 from funds where id = p_fund and not is_archived) then
    raise exception 'Фонд не найден';
  end if;

  update funds set stage = p_stage where id = p_fund;
  if p_stage is null then return; end if;

  -- предпочесть правило, уже стоящее на целевом этапе (чтобы не нарушить UNIQUE)
  select id into v_keeper from distribution_rules
    where fund_id = p_fund and income_type_id is null and not is_archived and stage = p_stage
    limit 1;
  if v_keeper is null then
    select id into v_keeper from distribution_rules
      where fund_id = p_fund and income_type_id is null and not is_archived
      order by priority, id limit 1;
  end if;

  if v_keeper is null then
    -- дефолтных правил нет: создаём 0% только если у фонда нет и схемы по видам
    if not exists (select 1 from distribution_rules
                   where fund_id = p_fund and income_type_id is not null and not is_archived) then
      insert into distribution_rules (fund_id, stage, percent, income_type_id)
      values (p_fund, p_stage, 0, null);
    end if;
  else
    update distribution_rules set stage = p_stage where id = v_keeper;
    update distribution_rules set is_archived = true
      where fund_id = p_fund and income_type_id is null and not is_archived and id <> v_keeper;
  end if;
end $$;

revoke execute on function public.fp_set_fund_stage(uuid, distribution_stage) from public, anon;
grant execute on function public.fp_set_fund_stage(uuid, distribution_stage) to authenticated, service_role;
