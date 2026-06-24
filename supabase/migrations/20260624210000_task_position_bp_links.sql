-- Задача на ПОСТ оргсхемы + связь боевого планирования со статистикой/постом
-- (gap-map Задачи §1, §2; модель ManaJet Task.id_orgboard_position,
-- BP is_stats_visible + посты). Раньше задача адресовалась только человеку
-- (to_id), а пункт БП имел лишь текстовый target.

-- ── 1. Задача может адресоваться посту оргсхемы ────────────────────────────
alter table public.tasks add column if not exists position_id uuid references public.org_positions(id);
create index if not exists tasks_position_id_idx on public.tasks(position_id);

-- Держатель поста видит и ведёт адресованную посту задачу
drop policy if exists tasks_read on public.tasks;
create policy tasks_read on public.tasks for select
  using (is_fin_admin()
    or from_id = (select auth.uid())
    or to_id = (select auth.uid())
    or (position_id is not null and holds_position(position_id)));

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update
  using (is_fin_admin()
    or from_id = (select auth.uid())
    or to_id = (select auth.uid())
    or (position_id is not null and holds_position(position_id)));

-- ── 2. Пункт БП связан со статистикой и/или постом ─────────────────────────
alter table public.battle_plan_items add column if not exists statistic_id uuid references public.statistics(id);
alter table public.battle_plan_items add column if not exists position_id uuid references public.org_positions(id);
alter table public.battle_plan_items add column if not exists is_stats_visible boolean not null default false;
create index if not exists battle_plan_items_statistic_id_idx on public.battle_plan_items(statistic_id);
create index if not exists battle_plan_items_position_id_idx on public.battle_plan_items(position_id);
