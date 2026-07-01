import { supabase } from "../supabase";

// Дата → 'YYYY-MM-DD' в локальном времени (не UTC, чтобы не съехал день)
export const isoDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ---------------------------------------------------------------- Периоды ФП
// Границы финансовой недели чт–ср, содержащей дату d (ТЗ v2 §4.1.1)
export function weekBounds(d = new Date()) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const offset = (date.getDay() - 4 + 7) % 7; // getDay(): 0=вс…6=сб; 4 = четверг
  const start = new Date(date);
  start.setDate(date.getDate() - offset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

// Период, содержащий дату. create=true — создать, если нет (нужны права
// финдиректора/владельца; без прав вернёт null).
export async function getPeriodFor(date, { create = false } = {}) {
  const { start, end } = weekBounds(date);
  const startIso = isoDate(start);
  const { data, error } = await supabase
    .from("fp_periods").select("*").eq("starts_on", startIso).maybeSingle();
  if (error) throw error;
  if (data || !create) return data;

  const ins = await supabase
    .from("fp_periods")
    .insert({ starts_on: startIso, ends_on: isoDate(end) })
    .select().single();
  if (!ins.error) return ins.data;
  if (ins.error.code === "42501") return null; // нет прав на создание периода
  if (ins.error.code === "23505") {            // параллельно создал кто-то другой
    const again = await supabase
      .from("fp_periods").select("*").eq("starts_on", startIso).maybeSingle();
    if (again.error) throw again.error;
    return again.data;
  }
  throw ins.error;
}

// Период предыдущей недели относительно даты
export async function getPrevPeriodFor(date) {
  const prev = new Date(date);
  prev.setDate(prev.getDate() - 7);
  return getPeriodFor(prev);
}

// Последние периоды ФП (для выбора недели)
export async function fetchPeriods(limit = 12) {
  const { data, error } = await supabase
    .from("fp_periods").select("*")
    .order("starts_on", { ascending: false }).limit(limit);
  if (error) throw error;
  return data;
}

// Создать период с заданными границами (кнопка «Добавить неделю»)
export async function createPeriod(startsIso, endsIso) {
  const ins = await supabase
    .from("fp_periods")
    .insert({ starts_on: startsIso, ends_on: endsIso })
    .select().single();
  if (!ins.error) return ins.data;
  if (ins.error.code === "42501") return null; // нет прав
  if (ins.error.code === "23505") {            // такая неделя уже есть
    const again = await supabase
      .from("fp_periods").select("*").eq("starts_on", startsIso).maybeSingle();
    if (again.error) throw again.error;
    return again.data;
  }
  throw ins.error;
}

// Есть ли в периоде операции (доходы, Реестр, заявки, протокол Директивы)
export async function periodHasData(periodId) {
  const cnt = (table) => supabase
    .from(table).select("*", { count: "exact", head: true }).eq("period_id", periodId);
  const rs = await Promise.all([cnt("incomes"), cnt("fp_register"), cnt("payment_requests"), cnt("directives")]);
  for (const r of rs) if (r.error) throw r.error;
  return rs.some((r) => (r.count || 0) > 0);
}

// Удаление пустой недели (FK в БД не дадут удалить неделю с операциями)
export async function deletePeriod(periodId) {
  const { error } = await supabase.from("fp_periods").delete().eq("id", periodId);
  if (error) throw error;
}

// Статус периода: open ↔ planning (запрет подачи заявок на время финкомитета)
export async function setPeriodStatus(periodId, status) {
  const { error } = await supabase.from("fp_periods").update({ status }).eq("id", periodId);
  if (error) throw error;
}

// Подтверждение недели ФП: kind 'executive' (исполнительный контур) | 'baf'
// (финкомитет). Закрытие Директивой требует обоих (миграция 20260624190000).
export async function setPeriodConfirmation(periodId, kind, value) {
  const { error } = await supabase.rpc("fp_set_period_confirmation", {
    p_period_id: periodId, p_kind: kind, p_value: value,
  });
  if (error) throw error;
}

// Протокол Директивы + закрытие периода (серверная функция, миграция 006)
export async function closePeriod(periodId, protocol) {
  const { error } = await supabase.rpc("fp_close_period", {
    p_period_id: periodId, p_protocol: protocol,
  });
  if (error) throw error;
}

// Переоткрытие закрытого периода (серверная функция, миграция 008)
export async function reopenPeriod(periodId) {
  const { error } = await supabase.rpc("fp_reopen_period", { p_period_id: periodId });
  if (error) throw error;
}
