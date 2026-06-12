-- ============================================================================
-- 008 · Переоткрытие периода ФП
-- Кнопка «Закрыть период» становится переключателем: закрытую неделю можно
-- открыть обратно (только финдиректор/владелец). При переоткрытии протокол
-- Директивы удаляется — при повторном закрытии создастся новый, актуальный
-- (у directives уникальность по period_id, иначе повторное закрытие упадёт).
-- ============================================================================

create or replace function public.fp_reopen_period(p_period_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status period_status;
begin
  if not is_fin_admin() then
    raise exception 'Открывать период может только финдиректор или владелец';
  end if;

  select status into v_status from fp_periods where id = p_period_id;
  if v_status is null then
    raise exception 'Период ФП не найден';
  end if;
  if v_status <> 'closed' then
    raise exception 'Период и так открыт';
  end if;

  delete from directives where period_id = p_period_id;

  update fp_periods
  set status = 'open', closed_at = null, closed_by = null
  where id = p_period_id;
end $$;
