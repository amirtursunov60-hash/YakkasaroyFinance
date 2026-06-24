-- Workflow/Kanban для CRM-воронки (gap-map Задачи §8/§9/§11/§15): переход с
-- хардкод-enum crm_lead_stage на настраиваемые колонки crm_stages (цвет/порядок/
-- флаги won/lost), плюс обогащение карточки лида (срок, ответственный, порядок)
-- и чек-лист. Enum-колонка crm_leads.stage оставлена для обратной совместимости.

-- ── 1. Настраиваемые колонки воронки ───────────────────────────────────────
create table if not exists public.crm_stages (
  id uuid primary key default gen_random_uuid(),
  code text,                       -- legacy-ключ enum (new/show/…) для маппинга
  name text not null,
  color text,
  sort integer not null default 0,
  is_won boolean not null default false,
  is_lost boolean not null default false,
  location_id uuid references public.locations(id),
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.crm_stages enable row level security;

drop policy if exists crm_stages_read on public.crm_stages;
create policy crm_stages_read on public.crm_stages for select
  using (is_fin_admin() or location_id is null or has_location_access(location_id));

drop policy if exists crm_stages_insert on public.crm_stages;
create policy crm_stages_insert on public.crm_stages for insert
  with check (is_fin_admin() or location_id is null or has_location_access(location_id));

drop policy if exists crm_stages_update on public.crm_stages;
create policy crm_stages_update on public.crm_stages for update
  using (is_fin_admin() or location_id is null or has_location_access(location_id));

-- Сид стартовых колонок из прежнего enum (один раз; сетевые — location_id null)
insert into public.crm_stages (code, name, color, sort, is_won, is_lost)
select * from (values
  ('new',      'Новая заявка',         '#5b8def', 0, false, false),
  ('show',     'Показ зала',           '#9c6ade', 1, false, false),
  ('offer',    'Смета и КП',           '#e8911c', 2, false, false),
  ('contract', 'Договор и предоплата', '#5bd6c9', 3, false, false),
  ('won',      'Банкет проведён',      '#1fd65f', 4, true,  false),
  ('lost',     'Потеряна',             '#ff6b5e', 5, false, true )
) as v(code, name, color, sort, is_won, is_lost)
where not exists (select 1 from public.crm_stages);

-- ── 2. Обогащение карточки лида ────────────────────────────────────────────
alter table public.crm_leads add column if not exists stage_id uuid references public.crm_stages(id);
alter table public.crm_leads add column if not exists due_date date;
alter table public.crm_leads add column if not exists responsible_id uuid references public.profiles(id);
alter table public.crm_leads add column if not exists sort integer not null default 0;
create index if not exists crm_leads_stage_id_idx on public.crm_leads(stage_id);

-- Бэкофилл колонки по legacy-ключу enum
update public.crm_leads l
  set stage_id = s.id
  from public.crm_stages s
  where l.stage_id is null and s.location_id is null and s.code = l.stage::text;

-- ── 3. Чек-лист карточки лида ──────────────────────────────────────────────
create table if not exists public.crm_lead_checklist (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  text text not null,
  done boolean not null default false,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists crm_lead_checklist_lead_id_idx on public.crm_lead_checklist(lead_id);
alter table public.crm_lead_checklist enable row level security;

drop policy if exists crm_check_read on public.crm_lead_checklist;
create policy crm_check_read on public.crm_lead_checklist for select
  using (exists (select 1 from public.crm_leads l where l.id = lead_id
    and (is_fin_admin() or l.location_id is null or has_location_access(l.location_id))));

drop policy if exists crm_check_insert on public.crm_lead_checklist;
create policy crm_check_insert on public.crm_lead_checklist for insert
  with check (exists (select 1 from public.crm_leads l where l.id = lead_id
    and (is_fin_admin() or l.location_id is null or has_location_access(l.location_id))));

drop policy if exists crm_check_update on public.crm_lead_checklist;
create policy crm_check_update on public.crm_lead_checklist for update
  using (exists (select 1 from public.crm_leads l where l.id = lead_id
    and (is_fin_admin() or l.location_id is null or has_location_access(l.location_id))));

drop policy if exists crm_check_delete on public.crm_lead_checklist;
create policy crm_check_delete on public.crm_lead_checklist for delete
  using (exists (select 1 from public.crm_leads l where l.id = lead_id
    and (is_fin_admin() or l.location_id is null or has_location_access(l.location_id))));
