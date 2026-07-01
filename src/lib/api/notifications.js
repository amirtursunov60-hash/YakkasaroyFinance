import { supabase } from "../supabase";

// --- In-app уведомления (наполняются триггерами БД; RLS — только свои) ---
export async function fetchNotifications({ limit = 20 } = {}) {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, kind, title, body, module, view_key, request_id, is_read, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

// Сгенерировать напоминания по срокам задач/лидов текущего пользователя
// (gap-map §10): RPC создаёт уведомления kind='reminder' по просроченным/
// сегодняшним, идемпотентно (без дублей, пока есть непрочитанное). Возвращает
// число созданных. Вызывается при входе перед загрузкой ленты.
export async function generateDueReminders() {
  const { data, error } = await supabase.rpc("fp_generate_due_reminders");
  if (error) throw error;
  return data || 0;
}

// Пометить прочитанными: ids — массив id, либо null = все непрочитанные.
export async function markNotificationsRead(ids = null) {
  let q = supabase.from("notifications").update({ is_read: true }).eq("is_read", false);
  if (ids && ids.length) q = q.in("id", ids);
  const { error } = await q;
  if (error) throw error;
}
