-- ============================================================================
-- pgTAP · Устойчивость проводок (hardening по ревью #217)
--
-- Запуск:  supabase test db   (на ветке/staging) либо pg_prove.
-- Проверки структурные и read-only — безопасно везде.
-- ============================================================================
begin;
select plan(6);

set search_path = extensions, public;

-- 1) DELETE на posting_rules отозван: правило нельзя удалить даже фин-админу
-- (полнота проекции держится на уровне БД, а не только сидом)
select is(
  has_table_privilege('authenticated', 'public.posting_rules', 'DELETE'),
  false, 'DELETE на posting_rules отозван у authenticated'
);

-- 2) CHECK: дебет и кредит правила — разные счета
select has_check('public', 'posting_rules', 'на posting_rules есть CHECK (стороны различны)');

-- 3) Функции по-прежнему read-only
select is(
  (select provolatile from pg_proc where oid = 'public.fp_postings(uuid)'::regprocedure),
  's', 'fp_postings STABLE'
);
select is(
  (select provolatile from pg_proc where oid = 'public.fp_chart_turnover(uuid)'::regprocedure),
  's', 'fp_chart_turnover STABLE'
);

-- 4) Инвариант баланса держится и с фолбэком правил
select is(
  (select coalesce(sum(debit_turnover), 0) - coalesce(sum(credit_turnover), 0)
     from public.fp_chart_turnover((select id from public.fp_periods order by starts_on desc limit 1))),
  0::numeric,
  'Σ Дт = Σ Кт за последний период (после hardening)'
);

-- 5) Субсчёт фонда — на стороне счёта фондов: у fund-компоненты
-- субсчёт не может оказаться на стороне 76/66 (корреспондирующей)
select is(
  (select count(*)::int from public.fp_postings((select id from public.fp_periods order by starts_on desc limit 1)) p
    where p.component = 'fund'
      and ((p.debit_sub is not null and p.debit_code in ('76', '66'))
        or (p.credit_sub is not null and p.credit_code in ('76', '66')))),
  0, 'субсчёт фонда не цепляется к корреспондирующему счёту 76/66'
);

select * from finish();
rollback;
