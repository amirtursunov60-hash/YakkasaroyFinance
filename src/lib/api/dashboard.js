import { supabase } from "../supabase";

// ---------------------------------------------------------------- Задачи и боевое планирование
// Личный кабинет (миграция 20260620210000_dashboard_tasks_bp). Задача — поручение
// от пользователя исполнителю; боевое планирование — личный список действий.

export async function fetchTasks() {
  const { data, error } = await supabase
    .from("tasks")
    .select(`id, title, description, due_date, status, priority, from_id, to_id, position_id,
      from:profiles!tasks_from_id_fkey(full_name),
      assignee:profiles!tasks_to_id_fkey(full_name),
      position:org_positions(code, name)`)
    .eq("is_archived", false)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createTask({ title, description, toId, positionId, dueDate, priority }) {
  const { data, error } = await supabase
    .from("tasks")
    .insert({ title, description: description || null, to_id: toId || null, position_id: positionId || null, due_date: dueDate || null, priority: priority || "mid" })
    .select().single();
  if (error) throw error;
  return data;
}

export async function setTaskStatus(id, status) {
  const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
  if (error) throw error;
}

// Тред комментариев задачи (gap-map Задачи §6; образец — request_comments).
export async function fetchTaskComments(taskId) {
  const { data, error } = await supabase
    .from("task_comments")
    .select(`id, body, created_at, author_id,
      author:profiles!task_comments_author_id_fkey(full_name, avatar_url)`)
    .eq("task_id", taskId)
    .order("created_at");
  if (error) throw error;
  return data;
}

export async function addTaskComment(taskId, body) {
  const authorId = (await supabase.auth.getUser()).data.user?.id ?? null;
  const { data, error } = await supabase
    .from("task_comments")
    .insert({ task_id: taskId, author_id: authorId, body })
    .select(`id, body, created_at, author_id,
      author:profiles!task_comments_author_id_fkey(full_name, avatar_url)`)
    .single();
  if (error) throw error;
  return data;
}

export async function fetchBattlePlan() {
  const { data, error } = await supabase
    .from("battle_plan_items")
    .select(`id, text, target, done, sort, created_at, statistic_id, position_id, is_stats_visible,
      statistic:statistics(id, name, unit),
      position:org_positions(code, name)`)
    .eq("is_archived", false)
    .order("sort").order("created_at");
  if (error) throw error;
  return data;
}

export async function createBattleItem({ text, target, statisticId, positionId, isStatsVisible }) {
  const { data, error } = await supabase
    .from("battle_plan_items")
    .insert({
      text, target: target || "Личный план",
      statistic_id: statisticId || null, position_id: positionId || null,
      is_stats_visible: !!isStatsVisible,
    })
    .select().single();
  if (error) throw error;
  return data;
}

export async function setBattleDone(id, done) {
  const { error } = await supabase.from("battle_plan_items").update({ done }).eq("id", id);
  if (error) throw error;
}

// Мои заявки (ЗРС) для личного кабинета — read-only; создание в модуле «Заявки».
export async function fetchMyRequests(userId) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from("payment_requests")
    .select("id, purpose, planned_amount, approved_amount, status, created_at")
    .eq("requester_id", userId)
    .order("created_at", { ascending: false }).limit(10);
  if (error) throw error;
  return data;
}
