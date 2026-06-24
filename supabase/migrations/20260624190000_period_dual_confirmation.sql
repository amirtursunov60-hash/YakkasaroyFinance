-- Два флага подтверждения периода ФП (Фонды §1 gap-map): исполнительное
-- подтверждение + подтверждение финкомитета (BAF) — как у ManaJet
-- (FpPlanOutput.is_executive_confirmed / is_baf_confirmed). Закрытие Директивой
-- (status='closed') теперь требует обоих подтверждений; переоткрытие их сбрасывает.
-- Статус 'planning' (запрет подачи заявок) не трогаем — это отдельный механизм.

-- ── 1. Флаги подтверждения на периоде ──────────────────────────────────────
alter table public.fp_periods add column if not exists is_executive_confirmed boolean not null default false;
alter table public.fp_periods add column if not exists is_baf_confirmed boolean not null default false;
alter table public.fp_periods add column if not exists executive_confirmed_at timestamptz;
alter table public.fp_periods add column if not exists executive_confirmed_by uuid references public.profiles(id);
alter table public.fp_periods add column if not exists baf_confirmed_at timestamptz;
alter table public.fp_periods add column if not exists baf_confirmed_by uuid references public.profiles(id);

-- Закрытые периоды историчны → считаем подтверждёнными (иначе их нельзя переоткрыть/закрыть заново)
update public.fp_periods
  set is_executive_confirmed = true, is_baf_confirmed = true
  where status = 'closed' and not (is_executive_confirmed and is_baf_confirmed);

-- ── 2. Установка/снятие флага подтверждения ────────────────────────────────
-- p_kind: 'executive' (исполнительный контур) | 'baf' (финкомитет).
create or replace function public.fp_set_period_confirmation(p_period_id uuid, p_kind text, p_value boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_status period_status;
begin
  if p_kind not in ('executive', 'baf') then
    raise exception 'Неизвестный тип подтверждения: %', p_kind;
  end if;
  if p_kind = 'executive' then
    if not (my_role() = any (array['owner','fin_director','ops_director']::app_role[])) then
      raise exception 'Исполнительное подтверждение даёт исполнительный директор, финдиректор или владелец';
    end if;
  else
    if not is_fin_admin() then
      raise exception 'Подтверждение финкомитета даёт финдиректор или владелец';
    end if;
  end if;

  select status into v_status from fp_periods where id = p_period_id;
  if v_status is null then raise exception 'Период ФП не найден'; end if;
  if v_status = 'closed' then raise exception 'Период закрыт — подтверждения зафиксированы'; end if;

  if p_kind = 'executive' then
    update fp_periods set
      is_executive_confirmed = p_value,
      executive_confirmed_at = case when p_value then now() else null end,
      executive_confirmed_by = case when p_value then auth.uid() else null end
    where id = p_period_id;
  else
    update fp_periods set
      is_baf_confirmed = p_value,
      baf_confirmed_at = case when p_value then now() else null end,
      baf_confirmed_by = case when p_value then auth.uid() else null end
    where id = p_period_id;
  end if;
end $$;

-- ── 3. Закрытие требует обоих подтверждений ────────────────────────────────
create or replace function public.fp_close_period(p_period_id uuid, p_protocol jsonb default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_status period_status;
  v_income numeric;
  v_ends   date;
  v_exec   boolean;
  v_baf    boolean;
begin
  if not is_fin_admin() then
    raise exception 'Закрывать период может только финдиректор или владелец';
  end if;

  select status, ends_on, is_executive_confirmed, is_baf_confirmed
    into v_status, v_ends, v_exec, v_baf
    from fp_periods where id = p_period_id;
  if v_status is null then
    raise exception 'Период ФП не найден';
  end if;
  if v_status = 'closed' then
    raise exception 'Период уже закрыт';
  end if;
  if not v_exec then
    raise exception 'Нет исполнительного подтверждения недели';
  end if;
  if not v_baf then
    raise exception 'Нет подтверждения финкомитета (BAF)';
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

-- ── 4. Переоткрытие сбрасывает подтверждения ───────────────────────────────
create or replace function public.fp_reopen_period(p_period_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
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
  set status = 'open', closed_at = null, closed_by = null,
      is_executive_confirmed = false, executive_confirmed_at = null, executive_confirmed_by = null,
      is_baf_confirmed = false, baf_confirmed_at = null, baf_confirmed_by = null
  where id = p_period_id;
end $$;
