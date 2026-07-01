-- Устойчивость проводок двойной записи (правки по ревью #217):
-- 1. Субсчёт фонда цеплялся не к той стороне: для fund-компоненты аналитика
--    (код+имя фонда) должна идти к счёту фондов (кредит правила при плюсе),
--    а не к корреспондирующему счёту. Для cash-компоненты — как было
--    (дебет правила при плюсе).
-- 2. Полнота проекции защищена на уровне БД: LEFT JOIN правил с фолбэком
--    на счёт 99 (запись Реестра больше не может выпасть из журнала/ОСВ),
--    имена счетов не зависят от архивации (архивный код не роняет строки
--    и не разбалансирует ОСВ).
-- 3. fp_postings фильтрует по period_id (индекс), а не по вычисляемой дате.
-- 4. posting_rules: отозван DELETE (удаление правила рвало бы полноту),
--    CHECK debit_code <> credit_code.
-- 5. Счёт 66 переименован: в парной проекции займов его сальдо всегда
--    сворачивается в ноль — «Транзит займов фондов» честнее «Внутренних
--    займов» (долг фондов виден в колонке «Долг» вкладки Фонды).

-- 4) posting_rules: без удаления, Дт ≠ Кт
revoke delete on public.posting_rules from authenticated;
alter table public.posting_rules drop constraint if exists posting_rules_sides_differ_chk;
alter table public.posting_rules add constraint posting_rules_sides_differ_chk
  check (debit_code <> credit_code);

-- 5) Переименование счёта 66 (только если фин-админ ещё не переименовал сам)
update public.chart_accounts
set name = 'Транзит займов фондов'
where lower(code) = '66' and name = 'Внутренние займы фондов' and not is_archived;

-- 1–3) Журнал проводок
create or replace function public.fp_postings(p_period_id uuid)
returns table (
  reg_id bigint,
  posted_on date,
  op_type text,
  component text,
  debit_code text,
  debit_name text,
  debit_sub text,
  credit_code text,
  credit_name text,
  credit_sub text,
  amount numeric,
  comment text
)
language sql
stable
as $$
  with target as (
    select id, starts_on, ends_on from public.fp_periods where id = p_period_id
  ),
  comp as (
    -- каждая ненулевая компонента записи периода → одна строка журнала;
    -- отбор по period_id (индекс), внепериодные — по дате создания (Душанбе)
    select fr.id, coalesce(t.ends_on, (fr.created_at at time zone 'Asia/Dushanbe')::date) as ed,
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
    -- фолбэк 99: запись без правила не выпадает, а видимо помечается.
    -- Субсчёт: cash → сторона debit-кода правила, fund → сторона credit-кода
    -- (у фондов счёт фондов стоит в кредите правила при положительной сумме).
    select comp.*,
      case when comp.amt >= 0 then coalesce(r.debit_code, '99') else coalesce(r.credit_code, '99') end as dcode,
      case when comp.amt >= 0 then coalesce(r.credit_code, '99') else coalesce(r.debit_code, '99') end as ccode,
      case comp.component
        when 'cash' then (comp.amt >= 0)   -- субсчёт на дебете
        else (comp.amt < 0)                -- fund: субсчёт на дебете только при минусе
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
$$;
grant execute on function public.fp_postings(uuid) to authenticated;

-- 2) ОСВ по плану счетов: строки не теряются ни при архивном счёте,
-- ни при отсутствии кода в плане — Σ Дт = Σ Кт всегда.
create or replace function public.fp_chart_turnover(p_period_id uuid)
returns table (
  code text,
  name text,
  account_type text,
  opening numeric,
  debit_turnover numeric,
  credit_turnover numeric,
  closing numeric
)
language sql
stable
as $$
  with target as (
    select starts_on, ends_on from public.fp_periods where id = p_period_id
  ),
  comp as (
    select coalesce(p.ends_on, (fr.created_at at time zone 'Asia/Dushanbe')::date) as ed,
      fr.op_type, c.component, c.amt
    from public.fp_register fr
    left join public.fp_periods p on p.id = fr.period_id
    cross join lateral (values ('cash', fr.cash_amount), ('fund', fr.fund_amount)) as c(component, amt)
    where c.amt is not null and c.amt <> 0
  ),
  lines as (
    select comp.ed,
      case when comp.amt >= 0 then coalesce(r.debit_code, '99') else coalesce(r.credit_code, '99') end as dcode,
      case when comp.amt >= 0 then coalesce(r.credit_code, '99') else coalesce(r.debit_code, '99') end as ccode,
      abs(comp.amt) as amount
    from comp
    left join public.posting_rules r on r.op_type = comp.op_type and r.component = comp.component
  ),
  by_code as (
    select l.dcode as code, l.ed, l.amount as debit, 0::numeric as credit from lines l
    union all
    select l.ccode, l.ed, 0::numeric, l.amount from lines l
  ),
  named as (
    select b.*, acc.name, acc.account_type
    from by_code b
    left join lateral (
      select ca.name, ca.account_type from public.chart_accounts ca
      where lower(ca.code) = lower(b.code)
      order by ca.is_archived asc limit 1
    ) acc on true
  )
  select n.code,
    coalesce(max(n.name), '(нет в плане счетов)'),
    coalesce(max(n.account_type), 'equity'),
    coalesce(sum(n.debit - n.credit) filter (where n.ed < t.starts_on), 0),
    coalesce(sum(n.debit)  filter (where n.ed between t.starts_on and t.ends_on), 0),
    coalesce(sum(n.credit) filter (where n.ed between t.starts_on and t.ends_on), 0),
    coalesce(sum(n.debit - n.credit) filter (where n.ed <= t.ends_on), 0)
  from named n
  cross join target t
  group by n.code
  order by n.code;
$$;
grant execute on function public.fp_chart_turnover(uuid) to authenticated;
