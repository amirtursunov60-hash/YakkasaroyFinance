import { supabase } from "./supabase";

// Вход по email и паролю
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// Регистрация по приглашению (профиль создаст redeem_invite после входа).
// emailRedirectTo — куда Supabase вернёт сотрудника после подтверждения почты:
// адрес самого приложения (а не дефолтный Site URL, который может смотреть на
// localhost). Ссылка несёт токен приглашения, поэтому приглашение применяется
// даже если письмо открыто на другом устройстве.
export async function signUp(email, password, emailRedirectTo) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: emailRedirectTo ? { emailRedirectTo } : undefined,
  });
  if (error) throw error;
  return data;
}

// Регистрация по приглашению без письма-подтверждения: серверная функция
// invite-register проверяет одноразовый токен приглашения, создаёт аккаунт уже
// подтверждённым и применяет роль/точку/пост. Возвращает { ok, error }.
export async function registerByInvite({ token, email, password, fullName }) {
  const { data, error } = await supabase.functions.invoke("invite-register", {
    body: { token, email, password, full_name: fullName },
  });
  if (error) {
    // Текст ошибки функции лежит в теле ответа (functions.invoke отдаёт его в context)
    let msg = "Сервис регистрации недоступен, попробуйте позже";
    try { const b = await error.context?.json?.(); if (b?.error) msg = b.error; } catch { /* ignore */ }
    return { ok: false, error: msg };
  }
  return data ?? { ok: false, error: "Пустой ответ сервиса регистрации" };
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
    .select("id, full_name, role, phone, is_active, avatar_url")
    .eq("id", user.id)
    .single();
  if (error) return null;
  return { ...data, email: user.email };
}
