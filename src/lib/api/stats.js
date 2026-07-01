import { supabase } from "../supabase";

// ---------------------------------------------------------------- Статистики (ИЦО)
// Статистика принадлежит посту оргсхемы (через него — отделению) и/или точке.
// Значения хранятся понедельно (statistic_values.period_id → fp_periods), флаг
// is_quota отделяет квоту от факта. Состояние считается по тренду факта
// (src/utils/stats.ts · calcState). RLS — из baseline (родные функции прав).

export async function fetchStatistics() {
  const { data, error } = await supabase
    .from("statistics")
    .select(`id, name, unit, invert, is_auto, source, location_id, owner_id, position_id, min_val, max_val, stat_type, frequency,
      owner:profiles(full_name),
      position:org_positions(code, name, division:org_divisions(code, name))`)
    .eq("is_archived", false)
    .order("name");
  if (error) throw error;
  return data;
}

// Датированные значения статистики (день/месяц) за диапазон дат:
// { [value_date]: { value, quota, description } }. Для frequency='day'/'month'
// (для месяца value_date — 1-е число месяца). Недельные значения — fetchStatisticValues.
export async function fetchStatisticDatedValues(statisticId, fromDate, toDate) {
  if (!statisticId) return {};
  let q = supabase
    .from("statistic_dated_values")
    .select("value_date, value, is_quota, description")
    .eq("statistic_id", statisticId)
    .order("value_date");
  if (fromDate) q = q.gte("value_date", fromDate);
  if (toDate) q = q.lte("value_date", toDate);
  const { data, error } = await q;
  if (error) throw error;
  const m = {};
  for (const r of data) {
    const cell = (m[r.value_date] ??= { value: null, quota: null, description: null });
    if (r.is_quota) cell.quota = Number(r.value);
    else { cell.value = Number(r.value); cell.description = r.description || null; }
  }
  return m;
}

// Апсерт датированного значения (день/месяц). description — только к факту.
export async function upsertStatisticDatedValue(statisticId, valueDate, value, isQuota = false, description = null) {
  if (!valueDate) throw new Error("Не указана дата значения");
  const enteredBy = (await supabase.auth.getUser()).data.user?.id ?? null;
  const note = isQuota ? null : (description || null);
  const found = await supabase
    .from("statistic_dated_values").select("id")
    .eq("statistic_id", statisticId).eq("value_date", valueDate).eq("is_quota", isQuota)
    .maybeSingle();
  if (found.error) throw found.error;
  if (found.data) {
    const { error } = await supabase
      .from("statistic_dated_values").update({ value, entered_by: enteredBy, description: note }).eq("id", found.data.id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from("statistic_dated_values")
    .insert({ statistic_id: statisticId, value_date: valueDate, value, is_quota: isQuota, entered_by: enteredBy, description: note });
  if (error) throw error;
}

// Значения за указанные периоды:
// { [statistic_id]: { [period_id]: { value, quota, description } } }
// description — заметка к ФАКТУ (is_quota=false): почему значение такое.
export async function fetchStatisticValues(periodIds) {
  const ids = (periodIds || []).filter(Boolean);
  if (!ids.length) return {};
  const { data, error } = await supabase
    .from("statistic_values")
    .select("statistic_id, period_id, value, is_quota, description")
    .in("period_id", ids);
  if (error) throw error;
  const m = {};
  for (const r of data) {
    const byPeriod = (m[r.statistic_id] ??= {});
    const cell = (byPeriod[r.period_id] ??= { value: null, quota: null, description: null });
    if (r.is_quota) cell.quota = Number(r.value);
    else { cell.value = Number(r.value); cell.description = r.description || null; }
  }
  return m;
}

export async function createStatistic({ name, unit, invert = false, positionId, ownerId, locationId, source, minVal = null, maxVal = null, statType = null, frequency = "week" }) {
  const { data, error } = await supabase
    .from("statistics")
    .insert({
      name, unit: unit || null, invert,
      position_id: positionId || null, owner_id: ownerId || null,
      location_id: locationId || null, source: source || null,
      min_val: minVal, max_val: maxVal, stat_type: statType, frequency: frequency || "week",
    })
    .select().single();
  if (error) throw error;
  return data;
}

export async function updateStatistic(id, patch) {
  const { error } = await supabase.from("statistics").update(patch).eq("id", id);
  if (error) throw error;
}

export async function archiveStatistic(id) {
  const { error } = await supabase.from("statistics").update({ is_archived: true }).eq("id", id);
  if (error) throw error;
}

// Внести/обновить значение статистики за неделю (факт или квота). Уникальна
// тройка (statistic_id, period_id, is_quota) — апсертим вручную select→update/insert.
// description — заметка к факту (is_quota=false); для квоты игнорируется (всегда null).
export async function upsertStatisticValue(statisticId, periodId, value, isQuota = false, description = null) {
  if (!periodId) throw new Error("Не выбрана неделя ФП");
  // Кто внёс значение — для аудита (колонка entered_by ранее не заполнялась).
  const enteredBy = (await supabase.auth.getUser()).data.user?.id ?? null;
  const note = isQuota ? null : (description || null);
  const found = await supabase
    .from("statistic_values").select("id")
    .eq("statistic_id", statisticId).eq("period_id", periodId).eq("is_quota", isQuota)
    .maybeSingle();
  if (found.error) throw found.error;
  if (found.data) {
    const { error } = await supabase
      .from("statistic_values").update({ value, entered_by: enteredBy, description: note }).eq("id", found.data.id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from("statistic_values")
    .insert({ statistic_id: statisticId, period_id: periodId, value, is_quota: isQuota, entered_by: enteredBy, description: note });
  if (error) throw error;
}
