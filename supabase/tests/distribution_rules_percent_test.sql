-- ============================================================================
-- pgTAP · Констрейнт процента распределения (миграция 20260628120000)
--
-- Запуск:  supabase test db   (на ветке/staging) либо pg_prove.
-- Только структурные проверки — ничего не пишут, безопасно везде.
--
-- Инвариант: percent в distribution_rules допускает 0 (placeholder-правило,
-- которое создаёт fp_set_fund_stage), но ограничен сверху 100.
-- ============================================================================
begin;
select plan(3);

set search_path = extensions, public;

select has_column('public', 'distribution_rules', 'percent', 'distribution_rules.percent есть');

select ok(
  (select pg_get_constraintdef(c.oid)
     from pg_constraint c where c.conname = 'distribution_rules_percent_check')
    ilike '%percent >= %0%',
  'percent допускает 0 (placeholder-правило этапа фонда)'
);

select ok(
  (select pg_get_constraintdef(c.oid)
     from pg_constraint c where c.conname = 'distribution_rules_percent_check')
    ilike '%percent <= %100%',
  'percent ограничен сверху 100'
);

select * from finish();
rollback;
