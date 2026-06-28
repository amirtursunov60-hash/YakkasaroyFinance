-- ============================================================================
-- Разрешить percent = 0 в distribution_rules (placeholder-правило этапа фонда).
--
-- Причина: RPC fp_set_fund_stage при назначении этапа фонду без правил создаёт
-- дефолтное правило с percent = 0 (фонд стоит в этапе, авто-распределение 0% —
-- процент задаётся позже вручную). Прежний CHECK (percent > 0) ломал это:
--   new row for relation "distribution_rules" violates check constraint
--   "distribution_rules_percent_check"
-- из-за чего нельзя было назначить фонду этап через UI «Фонды».
--
-- 0% безопасен (распределяет ноль). Верхняя граница 100 сохранена. UI «Доходы»
-- по-прежнему требует процент > 0 при ручном добавлении правила.
--
-- Применено на прод через Supabase MCP (apply_migration).
-- ============================================================================
alter table distribution_rules drop constraint if exists distribution_rules_percent_check;
alter table distribution_rules add constraint distribution_rules_percent_check
  check (percent >= 0 and percent <= 100);
