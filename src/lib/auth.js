import { supabase } from "./supabase";

// Вход по email и паролю
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// Выход
export async function signOut() {
  await supabase.auth.signOut();
}

// Текущая сессия (или null)
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// Профиль вошедшего пользователя (с ролью). null — если не вошёл или профиля нет.
export async function getProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, phone, is_active")
    .eq("id", user.id)
    .single();
  if (error) return null;
  return { ...data, email: user.email };
}
