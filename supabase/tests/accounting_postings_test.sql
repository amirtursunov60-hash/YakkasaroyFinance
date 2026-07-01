-- ============================================================================
-- pgTAP · Проводки двойной записи: posting_rules + fp_postings + fp_chart_turnover
--
-- Запуск:  supabase test db   (на ветке/staging) либо pg_prove.
-- Проверки структурные и read-only — ничего не пишут, безопасно везде.
-- ============================================================================
begin;
select plan(14);

set search_path = extensions, public;

-- 1) Таблица правил проводок: структура, уникальность, CHECK
select has_table('public', 'posting_rules', 'таблица posting_rules есть');
select has_column('public', 'posting_rules', 'op_type', 'posting_rules.op_type есть');
select has_column('public', 'posting_rules', 'component', 'posting_rules.component есть');
select has_check('public', 'posting_rules', 'на posting_rules есть CHECK (component)');
select col_is_unique('public', 'posting_rules', array['op_type', 'component'],
  'пара (op_type, component) уникальна — проекция детерминирована');

-- 2) RLS: читают все, пишет фин-админ
select is(
  (select relrowsecurity from pg_class where oid = 'public.posting_rules'::regclass),
  true, 'RLS включён на posting_rules'
);
select policies_are('public', 'posting_rules', array['pr_read', 'pr_write'],
  'политики posting_rules: pr_read + pr_write');

-- 3) Полнота сида: каждое значение register_op_type покрыто правилами
-- для обеих компонент (cash и fund) — проекция не теряет операций
select is(
  (select count(*)::int from public.posting_rules),
  (select count(*)::int * 2 from unnest(enum_range(null::public.register_op_type))),
  'правил ровно 2 × количество типов операций (cash + fund)'
);

-- 4) Все коды счетов из правил существуют в плане счетов
select is(
  (select count(*)::int from public.posting_rules r
    where not exists (select 1 from public.chart_accounts ca
      where lower(ca.code) = lower(r.debit_code) and not ca.is_archived)
       or not exists (select 1 from public.chart_accounts ca
      where lower(ca.code) = lower(r.credit_code) and not ca.is_archived)),
  0, 'каждый Дт/Кт код правила есть в chart_accounts'
);

-- 5) Функции проекции существуют и read-only (STABLE)
select has_function('public', 'fp_postings', array['uuid'], 'функция fp_postings(uuid) есть');
select is(
  (select provolatile from pg_proc where oid = 'public.fp_postings(uuid)'::regprocedure),
  's', 'fp_postings STABLE (read-only)'
);
select has_function('public', 'fp_chart_turnover', array['uuid'], 'функция fp_chart_turnover(uuid) есть');
select is(
  (select provolatile from pg_proc where oid = 'public.fp_chart_turnover(uuid)'::regprocedure),
  's', 'fp_chart_turnover STABLE (read-only)'
);

-- 6) Главный инвариант двойной записи: за любой период сумма дебетовых
-- оборотов равна сумме кредитовых (журнал сбалансирован по построению).
-- Берём последний период; если периодов нет — 0 = 0.
select is(
  (select coalesce(sum(debit_turnover), 0) - coalesce(sum(credit_turnover), 0)
     from public.fp_chart_turnover((select id from public.fp_periods order by starts_on desc limit 1))),
  0::numeric,
  'Σ Дт = Σ Кт за последний период ФП'
);

select * from finish();
rollback;
