-- Периодичность статистик + дневные/месячные значения (gap-map Статистики §5/§6).
-- Недельная модель (statistic_values по period_id) НЕ трогается — это дефолт и
-- остаётся источником для frequency='week'. Для 'day'/'month' значения хранятся в
-- НОВОЙ таблице statistic_dated_values по конкретной дате (для месяца — 1-е число).
-- RLS — точная копия statistic_values (statval_read/insert/update), плюс delete.

-- 1) Периодичность статистики (по умолчанию week — обратная совместимость)
alter table public.statistics add column if not exists frequency text not null default 'week';
alter table public.statistics drop constraint if exists statistics_frequency_chk;
alter table public.statistics add constraint statistics_frequency_chk
  check (frequency in ('day', 'week', 'month'));

-- 2) Датированные значения (день/месяц)
create table if not exists public.statistic_dated_values (
  id uuid primary key default gen_random_uuid(),
  statistic_id uuid not null references public.statistics(id) on delete cascade,
  value_date date not null,                 -- конкретная дата (для месяца — 1-е число месяца)
  value numeric(16,2) not null,
  is_quota boolean not null default false,
  entered_by uuid references public.profiles(id),
  description text,                          -- заметка к факту
  created_at timestamptz not null default now(),
  unique (statistic_id, value_date, is_quota)
);
create index if not exists statistic_dated_values_stat_date_idx
  on public.statistic_dated_values(statistic_id, value_date);

alter table public.statistic_dated_values enable row level security;

-- read: видно, если видна сама статистика (копия statval_read)
drop policy if exists statdated_read on public.statistic_dated_values;
create policy statdated_read on public.statistic_dated_values as permissive for select to public
  using (exists (
    select 1 from public.statistics s
    where s.id = statistic_dated_values.statistic_id
      and (s.location_id is null or has_location_access(s.location_id)
           or s.owner_id = (select auth.uid())
           or (s.position_id is not null and holds_position(s.position_id)))
  ));

-- insert: факт — управляющие/владелец статистики; квота — финадмин/ops_director (копия statval_insert)
drop policy if exists statdated_insert on public.statistic_dated_values;
create policy statdated_insert on public.statistic_dated_values as permissive for insert to public
  with check (
    ((not is_quota) and (((select my_role()) = any (array['owner'::app_role,'fin_director'::app_role,'ops_director'::app_role,'location_manager'::app_role]))
       or exists (select 1 from public.statistics s where s.id = statistic_dated_values.statistic_id and s.owner_id = (select auth.uid()))))
    or (is_quota and ((select is_fin_admin()) or ((select my_role()) = 'ops_director'::app_role)))
  );

-- update: те же условия (копия statval_update)
drop policy if exists statdated_update on public.statistic_dated_values;
create policy statdated_update on public.statistic_dated_values as permissive for update to public
  using (
    ((not is_quota) and (((select my_role()) = any (array['owner'::app_role,'fin_director'::app_role,'ops_director'::app_role,'location_manager'::app_role]))
       or exists (select 1 from public.statistics s where s.id = statistic_dated_values.statistic_id and s.owner_id = (select auth.uid()))))
    or (is_quota and ((select is_fin_admin()) or ((select my_role()) = 'ops_director'::app_role)))
  )
  with check (
    ((not is_quota) and (((select my_role()) = any (array['owner'::app_role,'fin_director'::app_role,'ops_director'::app_role,'location_manager'::app_role]))
       or exists (select 1 from public.statistics s where s.id = statistic_dated_values.statistic_id and s.owner_id = (select auth.uid()))))
    or (is_quota and ((select is_fin_admin()) or ((select my_role()) = 'ops_director'::app_role)))
  );

-- delete: удалить ошибочное значение (те же права)
drop policy if exists statdated_delete on public.statistic_dated_values;
create policy statdated_delete on public.statistic_dated_values as permissive for delete to public
  using (
    ((not is_quota) and (((select my_role()) = any (array['owner'::app_role,'fin_director'::app_role,'ops_director'::app_role,'location_manager'::app_role]))
       or exists (select 1 from public.statistics s where s.id = statistic_dated_values.statistic_id and s.owner_id = (select auth.uid()))))
    or (is_quota and ((select is_fin_admin()) or ((select my_role()) = 'ops_director'::app_role)))
  );

grant select, insert, update, delete on public.statistic_dated_values to authenticated;
