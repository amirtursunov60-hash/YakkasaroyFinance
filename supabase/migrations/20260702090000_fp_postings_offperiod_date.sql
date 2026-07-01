-- Фикс даты проводки для внепериодных операций в fp_postings (Реестр §13).
-- Было: coalesce(t.ends_on, created_at::date), где t.ends_on — конец ЦЕЛЕВОГО
-- периода, который не бывает NULL → ветка даты создания недостижима, и
-- операции с period_id IS NULL показывались датой конца недели (среда),
-- а не фактической датой создания (как в fp_chart_turnover и как обещает
-- комментарий). Стало: явный case по period_id строки Реестра.
-- Идемпотентно (create or replace). pgTAP — fp_postings_offperiod_date_test.sql.

create or replace function public.fp_postings(p_period_id uuid)
 returns table(reg_id bigint, posted_on date, op_type text, component text, debit_code text, debit_name text, debit_sub text, credit_code text, credit_name text, credit_sub text, amount numeric, comment text)
 language sql
 stable
as $function$
  with target as (
    select id, starts_on, ends_on from public.fp_periods where id = p_period_id
  ),
  comp as (
    select fr.id,
      -- дата проводки: строка в периоде — конец недели; внепериодная — дата создания (Душанбе)
      case when fr.period_id is not null then t.ends_on
           else (fr.created_at at time zone 'Asia/Dushanbe')::date end as ed,
      fr.op_type, c.component, c.amt, fr.comment,
      ca.name as cash_name, f.name as fund_name, f.code as fund_code
    from target t
    join public.fp_register fr
      on fr.period_id = t.id
      or (fr.period_id is null
          and (fr.created_at at time zone 'Asia/Dushanbe')::date between t.starts_on and t.ends_on)
    cross join lateral (values
      ('cash', fr.cash_amount),
      ('fund', fr.fund_amount)
    ) as c(component, amt)
    left join public.cash_accounts ca on ca.id = fr.cash_account_id
    left join public.funds f on f.id = fr.fund_id
    where c.amt is not null and c.amt <> 0
  ),
  sided as (
    select comp.*,
      case when comp.amt >= 0 then coalesce(r.debit_code, '99') else coalesce(r.credit_code, '99') end as dcode,
      case when comp.amt >= 0 then coalesce(r.credit_code, '99') else coalesce(r.debit_code, '99') end as ccode,
      case comp.component
        when 'cash' then (comp.amt >= 0)
        else (comp.amt < 0)
      end as sub_on_debit,
      case comp.component when 'cash' then comp.cash_name
        else comp.fund_code || ' ' || comp.fund_name end as sub
    from comp
    left join public.posting_rules r
      on r.op_type = comp.op_type and r.component = comp.component
  )
  select
    s.id, s.ed, s.op_type::text, s.component,
    s.dcode,
    (select ca.name from public.chart_accounts ca
      where lower(ca.code) = lower(s.dcode) order by ca.is_archived asc limit 1),
    case when s.sub_on_debit then s.sub else null end,
    s.ccode,
    (select ca.name from public.chart_accounts ca
      where lower(ca.code) = lower(s.ccode) order by ca.is_archived asc limit 1),
    case when not s.sub_on_debit then s.sub else null end,
    abs(s.amt),
    s.comment
  from sided s
  order by s.ed, s.id, s.component;
$function$;
