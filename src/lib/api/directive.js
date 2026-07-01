import { supabase } from "../supabase";

// ---------------------------------------------------------------- Схемы по видам дохода (ManaJet)
// Правила «вид дохода → фонд, этап, %»: своя схема на каждый вид дохода
// (ТЗ §4.1.3). Сгруппированы по фонду для калькулятора в Директиве.
export async function fetchIncomeTypeRules() {
  const { data, error } = await supabase
    .from("distribution_rules")
    .select("id, fund_id, stage, percent, fixed_amount, priority, income_type:income_types(id, code, name)")
    .not("income_type_id", "is", null)
    .eq("is_archived", false)
    .order("priority");
  if (error) throw error;
  const byFund = {};
  for (const r of data) (byFund[r.fund_id] ??= []).push(r);
  return byFund;
}

// Правила, сгруппированные по виду дохода (для настройки схемы в «Доходах»):
// { [income_type_id]: [{ id, fund_id, stage, percent, fund:{code,name} }] }
export async function fetchRulesByIncomeType() {
  const { data, error } = await supabase
    .from("distribution_rules")
    .select("id, fund_id, income_type_id, stage, percent, fixed_amount, fund:funds(code, name)")
    .not("income_type_id", "is", null)
    .eq("is_archived", false);
  if (error) throw error;
  const m = {};
  for (const r of data) (m[r.income_type_id] ??= []).push(r);
  return m;
}

export async function addDistributionRule({ fundId, incomeTypeId, stage, percent }) {
  const { error } = await supabase
    .from("distribution_rules")
    .insert({ fund_id: fundId, income_type_id: incomeTypeId, stage, percent });
  if (error) throw error;
}

export async function deleteDistributionRule(id) {
  const { error } = await supabase
    .from("distribution_rules")
    .update({ is_archived: true })
    .eq("id", id);
  if (error) throw error;
}

// Доход недели по видам дохода: { [income_type_id]: сумма } (факт для калькулятора)
export async function fetchIncomeByType(periodId) {
  if (!periodId) return {};
  const { data, error } = await supabase
    .from("incomes")
    .select("income_type_id, amount_base, is_return")
    .eq("period_id", periodId);
  if (error) throw error;
  const m = {};
  for (const r of data)
    m[r.income_type_id] = (m[r.income_type_id] || 0) + (r.is_return ? -r.amount_base : Number(r.amount_base));
  return m;
}

// ---------------------------------------------------------------- Скорректированная схема недели
// Правки процентов в Директиве сохраняются на период (ТЗ §4.1.3)
export async function fetchPeriodOverrides(periodId) {
  if (!periodId) return {};
  const { data, error } = await supabase
    .from("period_distribution_overrides")
    .select("rule_id, percent")
    .eq("period_id", periodId);
  if (error) throw error;
  return Object.fromEntries(data.map((r) => [r.rule_id, Number(r.percent)]));
}

export async function savePeriodOverrides(periodId, entries) {
  if (!entries.length) return;
  const { error } = await supabase
    .from("period_distribution_overrides")
    .upsert(entries.map(({ ruleId, percent }) => ({ period_id: periodId, rule_id: ruleId, percent })),
      { onConflict: "period_id,rule_id" });
  if (error) throw error;
}

// ---------------------------------------------------------------- Директива

// Правила схемы распределения по умолчанию (income_type_id is null)
export async function fetchDefaultRules() {
  const { data, error } = await supabase
    .from("distribution_rules")
    .select("id, fund_id, stage, percent, fixed_amount, priority")
    .is("income_type_id", null)
    .eq("is_archived", false)
    .order("priority");
  if (error) throw error;
  return data;
}

// Доход периода в базовой валюте (возвраты вычитаются)
export async function fetchPeriodIncome(periodId) {
  if (!periodId) return 0;
  const { data, error } = await supabase
    .from("incomes").select("amount_base, is_return").eq("period_id", periodId);
  if (error) throw error;
  return data.reduce((s, r) => s + (r.is_return ? -r.amount_base : r.amount_base), 0);
}

// Проведённое распределение периода: [{ fund_id, amount, stage|null }]
// Этап хранится в comment Реестра как 'stage:revenue' (см. миграцию 007);
// stage = null — строки, проведённые до поэтапной модели.
export async function fetchPeriodDistribution(periodId) {
  if (!periodId) return [];
  const { data, error } = await supabase
    .from("fp_register")
    .select("fund_id, fund_amount, comment")
    .eq("period_id", periodId).eq("op_type", "distribution");
  if (error) throw error;
  return data.map((r) => ({
    fund_id: r.fund_id,
    amount: Number(r.fund_amount),
    stage: r.comment?.startsWith("stage:") ? r.comment.slice(6) : null,
  }));
}

// Одобрение этапа распределения (серверная функция, миграция 007)
export async function distributeStage(periodId, stage, allocations) {
  const { error } = await supabase.rpc("fp_distribute_stage", {
    p_period_id: periodId, p_stage: stage, p_allocations: allocations,
  });
  if (error) throw error;
}

// Сброс одобренного распределения этапа ('all' — всего периода; миграция 009)
export async function resetDistribution(periodId, stage) {
  const { error } = await supabase.rpc("fp_reset_distribution", {
    p_period_id: periodId, p_stage: stage,
  });
  if (error) throw error;
}
