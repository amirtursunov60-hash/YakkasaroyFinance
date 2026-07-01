import { supabase } from "../supabase";

// ---------------------------------------------------------------- Оргсхема (ТЗ v2 §4.3–4.4)
// Полная организующая схема: отделения → посты (с секциями, ЦКП, шляпами) с
// держателями постов и статусом шляпы. Балансы прав — RLS (читают все; пишут
// финадмин/опердиректор; отделения — только финадмин).
export async function fetchOrgChart() {
  const [divs, poss] = await Promise.all([
    supabase.from("org_divisions").select("id, code, name, color, ckp, sort").order("sort"),
    supabase
      .from("org_positions")
      .select(`id, code, name, division_id, location_id, parent_id, section, ckp, statistic, duties, is_executive, sort,
        location:locations(name),
        assignments:position_assignments!position_assignments_position_id_fkey(
          is_main, hat_status, person:profiles!position_assignments_person_id_fkey(id, full_name))`)
      .eq("is_archived", false)
      .order("sort"),
  ]);
  if (divs.error) throw divs.error;
  if (poss.error) throw poss.error;

  const byDiv = {};
  for (const p of poss.data) {
    const holders = (p.assignments || [])
      .map((a) => ({ id: a.person?.id, name: a.person?.full_name, hatStatus: a.hat_status, isMain: a.is_main }))
      .filter((h) => h.id)
      .sort((a, b) => Number(b.isMain) - Number(a.isMain));
    const pos = {
      id: p.id, code: p.code, name: p.name, divisionId: p.division_id,
      locationId: p.location_id, locationName: p.location?.name || null,
      parentId: p.parent_id,
      section: p.section || "Без секции", ckp: p.ckp, statistic: p.statistic,
      duties: Array.isArray(p.duties) ? p.duties : [],
      isExecutive: p.is_executive, sort: p.sort, holders,
    };
    (byDiv[p.division_id] ??= []).push(pos);
  }
  return divs.data.map((d) => ({
    id: d.id, code: d.code, name: d.name, color: d.color, ckp: d.ckp, sort: d.sort,
    positions: byDiv[d.id] || [],
  }));
}

// Активные сотрудники для назначения на пост (лёгкий список)
export async function fetchPeopleBrief() {
  const { data, error } = await supabase
    .from("profiles").select("id, full_name").eq("is_active", true).order("full_name");
  if (error) throw error;
  return data;
}

// Краткий список постов оргсхемы (для адресации задач/БП посту)
export async function fetchPositionsBrief() {
  const { data, error } = await supabase
    .from("org_positions")
    .select("id, code, name, division:org_divisions(code, name)")
    .eq("is_archived", false)
    .order("code");
  if (error) throw error;
  return data;
}

export async function createDivision({ code, name, color, ckp }) {
  const { data, error } = await supabase
    .from("org_divisions")
    .insert({ code, name, color: color || null, ckp: ckp || null })
    .select().single();
  if (error) throw error;
  return data;
}

export async function updateDivision(id, patch) {
  const { error } = await supabase.from("org_divisions").update(patch).eq("id", id);
  if (error) throw error;
}

// Удаление отделения; БД не даст удалить, если на нём висят посты (FK)
export async function deleteDivision(id) {
  const { error } = await supabase.from("org_divisions").delete().eq("id", id);
  if (error) throw error;
}

export async function createPosition(row) {
  const { data, error } = await supabase.from("org_positions").insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function updatePosition(id, patch) {
  const { error } = await supabase.from("org_positions").update(patch).eq("id", id);
  if (error) throw error;
}

// Пост не удаляем, а архивируем (соглашение схемы — is_archived)
export async function archivePosition(id) {
  const { error } = await supabase.from("org_positions").update({ is_archived: true }).eq("id", id);
  if (error) throw error;
}

// Статус шляпы держателя поста: none → learning → done (ТЗ §4.4 «изучил»)
export async function setHatStatus(personId, positionId, status) {
  const { error } = await supabase
    .from("position_assignments")
    .update({ hat_status: status })
    .eq("person_id", personId).eq("position_id", positionId);
  if (error) throw error;
}
