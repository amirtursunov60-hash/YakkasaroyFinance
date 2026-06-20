-- Личный кабинет: задачи (поручения) и боевое планирование (ТЗ v2 §4 · этап 2).
-- Перевод модуля dashboard с моков (src/data/dashboard.js) на реальные данные.
-- Задача: от поста/пользователя исполнителю; боевое планирование — личный список
-- действий пользователя на день/неделю. Новые таблицы с RLS на родных функциях.

do $$ begin
  if not exists (select 1 from pg_type where typname = 'task_status') then
    create type task_status as enum ('new', 'progress', 'done');
  end if;
  if not exists (select 1 from pg_type where typname = 'task_priority') then
    create type task_priority as enum ('low', 'mid', 'high');
  end if;
end $$;

-- ---------------------------------------------------------------- Задачи
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  from_id uuid references profiles(id) default auth.uid(),  -- поручил
  to_id uuid references profiles(id),                        -- исполнитель
  due_date date,
  status task_status not null default 'new',
  priority task_priority not null default 'mid',
  location_id uuid references locations(id),
  outer_id uuid,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
alter table public.tasks enable row level security;

-- ---------------------------------------------------------------- Боевое планирование
create table if not exists public.battle_plan_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) default auth.uid(),
  text text not null,
  target text,                          -- к какой ЦКП/статистике ведёт действие
  done boolean not null default false,
  period_id uuid references fp_periods(id),
  sort int not null default 0,
  outer_id uuid,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
alter table public.battle_plan_items enable row level security;

-- ---------------------------------------------------------------- RLS
do $$ begin
  -- tasks: видит финадмин, постановщик и исполнитель
  if not exists (select 1 from pg_policies where tablename = 'tasks' and policyname = 'tasks_read') then
    create policy "tasks_read" on public.tasks for select
      using ( (select is_fin_admin()) or from_id = (select auth.uid()) or to_id = (select auth.uid()) );
  end if;
  if not exists (select 1 from pg_policies where tablename = 'tasks' and policyname = 'tasks_insert') then
    create policy "tasks_insert" on public.tasks for insert
      with check ( (select is_fin_admin()) or from_id = (select auth.uid()) );
  end if;
  if not exists (select 1 from pg_policies where tablename = 'tasks' and policyname = 'tasks_update') then
    create policy "tasks_update" on public.tasks for update
      using ( (select is_fin_admin()) or from_id = (select auth.uid()) or to_id = (select auth.uid()) );
  end if;
  -- battle_plan_items: личный список владельца (+ финадмин на чтение)
  if not exists (select 1 from pg_policies where tablename = 'battle_plan_items' and policyname = 'bp_read') then
    create policy "bp_read" on public.battle_plan_items for select
      using ( (select is_fin_admin()) or owner_id = (select auth.uid()) );
  end if;
  if not exists (select 1 from pg_policies where tablename = 'battle_plan_items' and policyname = 'bp_insert') then
    create policy "bp_insert" on public.battle_plan_items for insert
      with check ( owner_id = (select auth.uid()) );
  end if;
  if not exists (select 1 from pg_policies where tablename = 'battle_plan_items' and policyname = 'bp_update') then
    create policy "bp_update" on public.battle_plan_items for update
      using ( owner_id = (select auth.uid()) );
  end if;
end $$;

-- ---------------------------------------------------------------- Индексы по FK
create index if not exists tasks_from_idx on public.tasks(from_id);
create index if not exists tasks_to_idx on public.tasks(to_id);
create index if not exists tasks_location_idx on public.tasks(location_id);
create index if not exists tasks_status_idx on public.tasks(status);
create index if not exists battle_plan_items_owner_idx on public.battle_plan_items(owner_id);
create index if not exists battle_plan_items_period_idx on public.battle_plan_items(period_id);
