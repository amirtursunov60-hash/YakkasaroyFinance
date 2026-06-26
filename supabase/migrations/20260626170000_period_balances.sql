-- Остаток фонда/счёта ДС в разрезе периода (gap-map Фонды §2/§9). По принципу
-- проекта (Реестр fp_register — источник истины, балансы — производные) считаем
-- НЕ материализуя снапшот: остаток на конец недели N = накопленная сумма всех
-- движений по фонду/счёту до конца периода N включительно.
--
-- «Эффективная дата» записи Реестра = конец её периода (period_id → fp_periods.ends_on),
-- а для записей без периода (off_plan/adjustment) — дата создания. Включаем строки,
-- чья эффективная дата ≤ конца целевой недели. Периоды ФП не пересекаются, поэтому
-- ends_on монотонно упорядочивает их во времени.
--
-- SECURITY INVOKER (по умолчанию): RLS fp_register применяется к вызывающему —
-- пользователь видит остаток только по доступным ему фондам/счетам. Read-only,
-- не трогает балансы/триггеры/инварианты.

create or replace function public.fp_period_balances(p_period_id uuid)
returns table (kind text, entity_id uuid, balance numeric)
language sql
stable
as $$
  with target as (
    select ends_on from public.fp_periods where id = p_period_id
  )
  select 'fund'::text, fr.fund_id, sum(fr.fund_amount)
  from public.fp_register fr
  left join public.fp_periods p on p.id = fr.period_id
  cross join target t
  where fr.fund_id is not null
    and coalesce(p.ends_on, (fr.created_at at time zone 'Asia/Dushanbe')::date) <= t.ends_on
  group by fr.fund_id
  union all
  select 'cash'::text, fr.cash_account_id, sum(fr.cash_amount)
  from public.fp_register fr
  left join public.fp_periods p on p.id = fr.period_id
  cross join target t
  where fr.cash_account_id is not null
    and coalesce(p.ends_on, (fr.created_at at time zone 'Asia/Dushanbe')::date) <= t.ends_on
  group by fr.cash_account_id;
$$;

grant execute on function public.fp_period_balances(uuid) to authenticated;
