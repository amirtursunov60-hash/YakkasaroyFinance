-- Комментарий к значению статистики (gap-map Статистики §8) + ПОЧИНКА правки
-- значений. У statistic_values была только INSERT/SELECT-политика и не было
-- UPDATE — поэтому повторный ввод (исправление уже введённого значения) молча
-- не сохранялся (UPDATE затрагивал 0 строк по RLS). Добавляем:
--   1) колонку description (заметка к факту: почему значение такое);
--   2) UPDATE-политику, зеркальную INSERT (факт — управляющие/владелец;
--      квота — финадмин/ops_director), чтобы правка и заметка сохранялись.

alter table public.statistic_values add column if not exists description text;

drop policy if exists statval_update on public.statistic_values;
create policy statval_update on public.statistic_values as permissive for update to public
  using (
    (((NOT is_quota) AND (((select my_role()) = any (array['owner'::app_role, 'fin_director'::app_role, 'ops_director'::app_role, 'location_manager'::app_role]))
        OR (exists (select 1 from statistics s where ((s.id = statistic_values.statistic_id) AND (s.owner_id = (select auth.uid())))))))
     OR (is_quota AND (((select is_fin_admin())) OR ((select my_role()) = 'ops_director'::app_role))))
  )
  with check (
    (((NOT is_quota) AND (((select my_role()) = any (array['owner'::app_role, 'fin_director'::app_role, 'ops_director'::app_role, 'location_manager'::app_role]))
        OR (exists (select 1 from statistics s where ((s.id = statistic_values.statistic_id) AND (s.owner_id = (select auth.uid())))))))
     OR (is_quota AND (((select is_fin_admin())) OR ((select my_role()) = 'ops_director'::app_role))))
  );
