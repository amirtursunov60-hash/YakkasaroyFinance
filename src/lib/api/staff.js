import { supabase } from "../supabase";

// ---------------------------------------------------------------- Сотрудники
export async function fetchEmployees() {
  const { data, error } = await supabase
    .from("profiles")
    .select(`id, full_name, phone, role, is_active, created_at, avatar_url,
      assignments:position_assignments!position_assignments_person_id_fkey(position:org_positions(id, code, name)),
      location_access:user_location_access!user_location_access_user_id_fkey(location_id)`)
    .order("full_name");
  if (error) throw error;
  return data;
}

export async function updateProfile(id, patch) {
  const { error } = await supabase.from("profiles").update(patch).eq("id", id);
  if (error) throw error;
}

// Загрузка/замена аватара сотрудника. Файл кладётся в свою папку (uid) бакета
// avatars; путь уникален по времени (обход кэша CDN). Возвращает публичный URL,
// который проставляется в profiles.avatar_url (self-update разрешён политикой).
export async function uploadAvatar(userId, file) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${userId}/avatar_${Date.now()}.${ext}`;
  const up = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
  if (up.error) throw up.error;
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  const url = data.publicUrl;
  const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", userId);
  if (error) throw error;
  return url;
}

export async function fetchAllPositions() {
  const { data, error } = await supabase
    .from("org_positions")
    .select("id, code, name, division:org_divisions(code, name)")
    .eq("is_archived", false)
    .order("code");
  if (error) throw error;
  return data;
}

export async function assignPosition(personId, positionId) {
  const { error } = await supabase
    .from("position_assignments")
    .insert({ person_id: personId, position_id: positionId, is_main: false });
  if (error) throw error;
}

export async function unassignPosition(personId, positionId) {
  const { error } = await supabase
    .from("position_assignments")
    .delete().eq("person_id", personId).eq("position_id", positionId);
  if (error) throw error;
}

export async function setLocationAccess(personId, locationId, grant) {
  const q = grant
    ? supabase.from("user_location_access").insert({ user_id: personId, location_id: locationId })
    : supabase.from("user_location_access").delete().eq("user_id", personId).eq("location_id", locationId);
  const { error } = await q;
  if (error) throw error;
}

// ---------------------------------------------------------------- Приглашения
export async function fetchInvites() {
  const { data, error } = await supabase
    .from("invites")
    .select(`id, token, role, expires_at, used_at,
      location:locations(name),
      position:org_positions(code, name),
      used_profile:profiles!invites_used_by_fkey(full_name)`)
    .order("expires_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createInvite({ role, locationId, positionId, createdBy }) {
  const { data, error } = await supabase
    .from("invites")
    .insert({ role, location_id: locationId || null, position_id: positionId || null, created_by: createdBy })
    .select().single();
  if (error) throw error;
  return data;
}

export async function deleteInvite(id) {
  const { error } = await supabase.from("invites").delete().eq("id", id);
  if (error) throw error;
}

// Приём приглашения после входа (серверная функция redeem_invite)
export async function redeemInvite(token, fullName) {
  const { error } = await supabase.rpc("redeem_invite", {
    p_token: token, p_full_name: fullName || null,
  });
  if (error) throw error;
}
