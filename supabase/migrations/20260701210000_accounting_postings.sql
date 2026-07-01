-- Проводки двойной записи (gap-map Реестр §13, ManaJet AccountingReg).
-- Принцип: Реестр fp_register — единственный источник истины; проводки — это
-- ДЕТЕРМИНИРОВАННАЯ ПРОЕКЦИЯ каждой записи Реестра в Дт/Кт по плану счетов
-- через таблицу правил posting_rules. Параллельного учёта нет: проводка не
-- хранится, а вычисляется, поэтому разойтись с балансами не может; сторно в
-- Реестре автоматически даёт обратную проводку.
--
-- Каждая запись Реестра имеет до двух компонент: cash_amount (счёт ДС) и
-- fund_amount (фонд). Каждая ненулевая компонента даёт РОВНО одну проводку
-- (Дт, Кт, |сумма|) — журнал сбалансирован по построению. Правило задаётся
-- для положительной суммы; отрицательная меняет Дт и Кт местами.

-- 1) Сид плана счетов — только недостающие коды (справочник пока пуст;
-- фин-админ может переименовывать через UI «План счетов»).
insert into public.chart_accounts (code, name, account_type)
select v.code, v.name, v.account_type
from (values
  ('50', 'Денежные средства',        'asset'),
  ('57', 'Переводы в пути',          'asset'),
  ('20', 'Операционные расходы',     'expense'),
  ('70', 'Оплата труда (ЗП)',        'expense'),
  ('90', 'Выручка',                  'income'),
  ('84', 'Фонды ФРС',                'equity'),
  ('76', 'Распределение дохода',     'equity'),
  ('66', 'Внутренние займы фондов',  'liability'),
  ('99', 'Корректировки',            'equity')
) as v(code, name, account_type)
where not exists (
  select 1 from public.chart_accounts ca
  where lower(ca.code) = lower(v.code) and not ca.is_archived
);

-- 2) Правила проводок: (тип операции, компонента) → Дт/Кт для положительной
-- суммы. Настраиваются фин-админом; уникальность пары гарантирует
-- детерминированность проекции.
create table if not exists public.posting_rules (
  id uuid primary key default gen_random_uuid(),
  op_type public.register_op_type not null,
  component text not null,
  debit_code text not null,
  credit_code text not null,
  created_at timestamptz not null default now(),
  constraint posting_rules_component_chk check (component in ('cash', 'fund')),
  constraint posting_rules_op_component_uniq unique (op_type, component)
);

alter table public.posting_rules enable row level security;
drop policy if exists pr_read on public.posting_rules;
create policy pr_read on public.posting_rules for select to public using (true);
drop policy if exists pr_write on public.posting_rules;
create policy pr_write on public.posting_rules for all to public
  using (is_fin_admin()) with check (is_fin_admin());
grant select, insert, update, delete on public.posting_rules to authenticated;

-- Сид правил: cash-компонента (положительная = деньги пришли на счёт ДС)
insert into public.posting_rules (op_type, component, debit_code, credit_code)
select v.op_type::public.register_op_type, 'cash', v.d, v.c
from (values
  ('income',          '50', '90'),
  ('income_return',   '50', '90'),  -- знак минус сам развернёт в Дт 90 / Кт 50
  ('distribution',    '50', '99'),
  ('request_payment', '50', '20'),
  ('bill_payment',    '50', '20'),
  ('payroll_payment', '50', '70'),
  ('cash_transfer',   '50', '57'),
  ('fx_exchange',     '50', '57'),
  ('off_plan',        '50', '99'),
  ('adjustment',      '50', '99'),
  ('fund_income',     '50', '99'),
  ('fund_return',     '50', '99'),
  ('fund_transfer',   '50', '99'),
  ('fund_loan',       '50', '99'),
  ('fund_loan_return','50', '99')
) as v(op_type, d, c)
on conflict (op_type, component) do nothing;

-- Сид правил: fund-компонента (положительная = фонд пополнился)
insert into public.posting_rules (op_type, component, debit_code, credit_code)
select v.op_type::public.register_op_type, 'fund', v.d, v.c
from (values
  ('income',          '76', '84'),
  ('income_return',   '76', '84'),
  ('distribution',    '76', '84'),
  ('request_payment', '76', '84'),
  ('bill_payment',    '76', '84'),
  ('payroll_payment', '76', '84'),
  ('cash_transfer',   '76', '84'),
  ('fx_exchange',     '76', '84'),
  ('off_plan',        '76', '84'),
  ('adjustment',      '76', '84'),
  ('fund_income',     '76', '84'),
  ('fund_return',     '76', '84'),
  ('fund_transfer',   '76', '84'),
  ('fund_loan',       '66', '84'),
  ('fund_loan_return','66', '84')
) as v(op_type, d, c)
on conflict (op_type, component) do nothing;

-- 3) Журнал проводок за период: проекция Реестра. Эффективная дата записи —
-- как в ОСВ (fp_turnover_sheet): конец её периода ФП, для внепериодных —
-- дата создания по Душанбе. SECURITY INVOKER: RLS fp_register действует
-- на вызывающего.
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
    select starts_on, ends_on from public.fp_periods where id = p_period_id
  ),
  eff as (
    select fr.*, coalesce(p.ends_on, (fr.created_at at time zone 'Asia/Dushanbe')::date) as ed
    from public.fp_register fr
    left join public.fp_periods p on p.id = fr.period_id
  ),
  comp as (
    -- каждая ненулевая компонента записи → одна строка журнала
    select e.id, e.ed, e.op_type, c.component, c.amt, e.comment,
      ca.name as cash_name, f.name as fund_name, f.code as fund_code
    from eff e
    cross join target t
    cross join lateral (values
      ('cash', e.cash_amount),
      ('fund', e.fund_amount)
    ) as c(component, amt)
    left join public.cash_accounts ca on ca.id = e.cash_account_id
    left join public.funds f on f.id = e.fund_id
    where e.ed between t.starts_on and t.ends_on
      and c.amt is not null and c.amt <> 0
  )
  select
    comp.id,
    comp.ed,
    comp.op_type::text,
    comp.component,
    case when comp.amt >= 0 then r.debit_code  else r.credit_code end,
    case when comp.amt >= 0 then da.name       else ca2.name      end,
    case when comp.amt >= 0
      then (case comp.component when 'cash' then comp.cash_name else comp.fund_code || ' ' || comp.fund_name end)
      else null end,
    case when comp.amt >= 0 then r.credit_code else r.debit_code  end,
    case when comp.amt >= 0 then ca2.name      else da.name       end,
    case when comp.amt < 0
      then (case comp.component when 'cash' then comp.cash_name else comp.fund_code || ' ' || comp.fund_name end)
      else null end,
    abs(comp.amt),
    comp.comment
  from comp
  join public.posting_rules r
    on r.op_type = comp.op_type and r.component = comp.component
  left join public.chart_accounts da
    on lower(da.code) = lower(r.debit_code) and not da.is_archived
  left join public.chart_accounts ca2
    on lower(ca2.code) = lower(r.credit_code) and not ca2.is_archived
  order by comp.ed, comp.id, comp.component;
$$;
grant execute on function public.fp_postings(uuid) to authenticated;

-- Субсчёт (имя счёта ДС / код+имя фонда) ставится на «денежную» сторону
-- проводки: при положительной сумме это дебет (деньги/фонд выросли), при
-- отрицательной — кредит. Вторая сторона — корреспондирующий счёт правила.

-- 4) ОСВ по плану счетов: сальдо на начало, обороты Дт/Кт, сальдо на конец.
-- Сальдо — накопленное (Дт − Кт) от начала времён; знак интерпретирует UI
-- по типу счёта.
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
  eff as (
    select fr.*, coalesce(p.ends_on, (fr.created_at at time zone 'Asia/Dushanbe')::date) as ed
    from public.fp_register fr
    left join public.fp_periods p on p.id = fr.period_id
  ),
  comp as (
    select e.ed, e.op_type, c.component, c.amt
    from eff e
    cross join lateral (values ('cash', e.cash_amount), ('fund', e.fund_amount)) as c(component, amt)
    where c.amt is not null and c.amt <> 0
  ),
  lines as (
    -- разворачиваем каждую проводку в две строки: дебетовую и кредитовую
    select comp.ed,
      case when comp.amt >= 0 then r.debit_code else r.credit_code end as dcode,
      case when comp.amt >= 0 then r.credit_code else r.debit_code end as ccode,
      abs(comp.amt) as amount
    from comp
    join public.posting_rules r on r.op_type = comp.op_type and r.component = comp.component
  ),
  by_code as (
    select l.dcode as code, l.ed, l.amount as debit, 0::numeric as credit from lines l
    union all
    select l.ccode, l.ed, 0::numeric, l.amount from lines l
  )
  select ca.code, ca.name, ca.account_type,
    coalesce(sum(b.debit - b.credit) filter (where b.ed < t.starts_on), 0),
    coalesce(sum(b.debit)  filter (where b.ed between t.starts_on and t.ends_on), 0),
    coalesce(sum(b.credit) filter (where b.ed between t.starts_on and t.ends_on), 0),
    coalesce(sum(b.debit - b.credit) filter (where b.ed <= t.ends_on), 0)
  from by_code b
  cross join target t
  join public.chart_accounts ca on lower(ca.code) = lower(b.code) and not ca.is_archived
  group by ca.code, ca.name, ca.account_type
  order by ca.code;
$$;
grant execute on function public.fp_chart_turnover(uuid) to authenticated;
