-- ============================================================================
-- 006 · Директива: схема распределения по умолчанию + серверные функции
--
-- 1. distribution_rules.income_type_id становится необязательным:
--    null = правило схемы по умолчанию (применяется ко всему доходу периода).
--    Схемы под конкретные виды дохода (ТЗ v2 §4.1.3) добавятся позже.
-- 2. Сид стартовой схемы 3 этапов из прототипа (FUND_LEVELS):
--    этап — свойство правила; ФД6 пополняется с двух этапов (10% + 8%).
-- 3. fp_run_distribution(period, allocations) — атомарное проведение
--    распределения: строки op_type='distribution' в Реестр (балансы фондов
--    обновит триггер fp_register_balances), доходы помечаются is_distributed.
-- 4. fp_close_period(period, protocol) — протокол Директивы + закрытие
--    периода (после этого операции блокирует триггер fp_register_period_lock).
-- ============================================================================

-- ---------------------------------------------------------------- 1. Схема по умолчанию
alter table public.distribution_rules alter column income_type_id drop not null;

comment on column public.distribution_rules.income_type_id is
  'Вид дохода; null — правило схемы по умолчанию (для всего дохода периода)';

-- Уникальность правил схемы по умолчанию: один фонд один раз на этап
create unique index if not exists distribution_rules_default_uniq
  on public.distribution_rules (fund_id, stage)
  where income_type_id is null and not is_archived;

-- ---------------------------------------------------------------- 2. Сид стартовой схемы
insert into public.distribution_rules (income_type_id, fund_id, stage, percent)
select null, f.id, v.stage::distribution_stage, v.pct
from (values
  -- Этап 1: от выручки
  ('FD1',   'revenue',  5.0),
  ('FD1/1', 'revenue',  5.0),
  ('FD2',   'revenue', 15.0),
  ('FD6',   'revenue', 10.0),
  -- Этап 2: от маржинального дохода
  ('FD3',   'margin',  25.0),
  ('FD3/3', 'margin',   5.0),
  ('FD4',   'margin',  12.0),
  ('FD5',   'margin',  20.0),
  ('FD6',   'margin',   8.0),
  ('FD7',   'margin',   5.0),
  ('FD8',   'margin',  15.0),
  ('FD9',   'margin',  10.0),
  -- Этап 3: от скорректированного дохода
  ('FD9/1', 'adjusted', 10.0)
) as v (fund_code, stage, pct)
join public.funds f on f.code = v.fund_code
where not exists (
  select 1 from public.distribution_rules d
  where d.income_type_id is null
    and d.fund_id = f.id
    and d.stage = v.stage::distribution_stage
);

-- ---------------------------------------------------------------- 3. Проведение распределения
-- p_allocations: [{"fund_id":"uuid","amount":123.45}, ...]
create or replace function public.fp_run_distribution(p_period_id uuid, p_allocations jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status period_status;
  r record;
  v_count int := 0;
begin
  if not is_fin_admin() then
    raise exception 'Проводить распределение может только финдиректор или владелец';
  end if;

  select status into v_status from fp_periods where id = p_period_id;
  if v_status is null then
    raise exception 'Период ФП не найден';
  end if;
  if v_status = 'closed' then
    raise exception 'Период закрыт — операции запрещены';
  end if;
  if exists (select 1 from fp_register
             where period_id = p_period_id and op_type = 'distribution') then
    raise exception 'Распределение по этому периоду уже проведено';
  end if;

  for r in
    select (a ->> 'fund_id')::uuid as fund_id, (a ->> 'amount')::numeric as amount
    from jsonb_array_elements(p_allocations) a
  loop
    continue when r.amount is null or r.amount <= 0;
    if not exists (select 1 from funds where id = r.fund_id and not is_archived) then
      raise exception 'Фонд % не найден', r.fund_id;
    end if;
    insert into fp_register (op_type, period_id, fund_id, fund_amount, created_by)
    values ('distribution', p_period_id, r.fund_id, r.amount, auth.uid());
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'Нет сумм к распределению';
  end if;

  update incomes set is_distributed = true
  where period_id = p_period_id and not is_distributed;
end $$;

-- ---------------------------------------------------------------- 4. Закрытие периода Директивой
create or replace function public.fp_close_period(p_period_id uuid, p_protocol jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status period_status;
  v_income numeric;
begin
  if not is_fin_admin() then
    raise exception 'Закрывать период может только финдиректор или владелец';
  end if;

  select status into v_status from fp_periods where id = p_period_id;
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

  update fp_periods
  set status = 'closed', closed_at = now(), closed_by = auth.uid()
  where id = p_period_id;
end $$;
