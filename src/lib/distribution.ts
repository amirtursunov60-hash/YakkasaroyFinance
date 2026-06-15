// ============================================================================
//  Распределение дохода по фондам (ФРС) — чистая логика, без React и Supabase.
//  Каскад «матрёшка»: доход распределяется в 3 этапа (выручка → маржинальный →
//  скорректированный доход), и на входе КАЖДОГО этапа доход вида берётся за
//  вычетом того, что удержали фонды предыдущих этапов.
//  Пример (Флай Гарден 10000): выручка 50% → 5000 (остаток 5000);
//  маржа 80% → 4000 (остаток 1000); СКД 100% → 1000 (остаток 0).
// ============================================================================

// Этапы распределения в каноническом порядке ФРС
export type StageKey = "revenue" | "margin" | "adjusted";
export const STAGE_KEYS: readonly StageKey[] = ["revenue", "margin", "adjusted"];

// Правило распределения фонда: процент (или фиксированная сумма) от дохода вида
// на своём этапе. percent/fixed_amount могут приходить из БД строками.
export interface DistributionRule {
  stage: StageKey;
  income_type?: { id: string } | null;
  percent?: number | string | null;
  fixed_amount?: number | string | null;
}

// Доход каждого вида (income_type_id → сумма)
export type IncomeByType = Record<string, number>;

// Доход вида на входе каждого этапа (после удержаний предыдущих этапов)
export type TypeStageBase = Record<StageKey, IncomeByType>;

// Сумма, которую правило удерживает от доступного дохода вида
function ruleAmount(rule: DistributionRule, available: number): number {
  if (rule.percent != null) return (available * Number(rule.percent)) / 100;
  return Number(rule.fixed_amount || 0);
}

// Каскад дохода по видам через этапы. Возвращает для каждого этапа доход каждого
// вида, доступный на его входе (остаток после предыдущих этапов).
export function cascadeTypeStageBase(
  incomeByType: IncomeByType,
  fundRules: Record<string, DistributionRule[]>,
): TypeStageBase {
  const result = { revenue: {}, margin: {}, adjusted: {} } as TypeStageBase;
  const remaining: IncomeByType = { ...incomeByType };
  const allRules = Object.values(fundRules);
  for (const stage of STAGE_KEYS) {
    const entry: IncomeByType = { ...remaining }; // доход вида на входе этапа
    result[stage] = entry;
    for (const rules of allRules) {
      for (const rule of rules) {
        if (rule.stage !== stage) continue;
        const tid = rule.income_type?.id;
        if (!tid) continue;
        const amt = ruleAmount(rule, entry[tid] || 0);
        remaining[tid] = Math.max(0, (remaining[tid] || 0) - amt);
      }
    }
  }
  return result;
}

// Сумма для фонда со схемой по видам дохода (калькулятор): Σ (остаток вида на
// этапе × %). stageFact — срез TypeStageBase по нужному этапу. Округление до копеек.
export function calcTypeRulesAmount(rules: DistributionRule[], stageFact: IncomeByType): number {
  const amount = rules.reduce((sum, rule) => {
    const tid = rule.income_type?.id;
    const fact = (tid && stageFact[tid]) || 0;
    return sum + ruleAmount(rule, fact);
  }, 0);
  return Math.round(amount * 100) / 100;
}
