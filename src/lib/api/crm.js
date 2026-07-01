import { supabase } from "../supabase";

// История изменений одного лида (gap-map CRM §16). Видна благодаря точечной
// политике audit_read_crm_leads. С old_data/new_data для расшифровки изменений.
export async function fetchLeadHistory(leadId) {
  const { data, error } = await supabase
    .from("audit_log")
    .select(`id, action, record_id, old_data, new_data, created_at,
      author:profiles!audit_log_user_id_fkey(full_name)`)
    .eq("table_name", "crm_leads")
    .eq("record_id", leadId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------- CRM банкетов
// Воронка заявок, база клиентов, залы (миграция 20260620200000_crm_banquets).
// Брони залов — производная от заявок (зал + дата + этап), отдельной таблицы нет.

export async function fetchCrmHalls() {
  const { data, error } = await supabase
    .from("crm_halls")
    .select("id, name, location_id, capacity, sort")
    .eq("is_archived", false).order("sort");
  if (error) throw error;
  return data;
}

export async function fetchCrmLeads() {
  const { data, error } = await supabase
    .from("crm_leads")
    .select(`id, name, phone, event_type, event_date, guests, budget, stage, stage_id, source, note,
      due_date, responsible_id, sort,
      hall_id, location_id, client_id, hall:crm_halls(name),
      responsible:profiles(full_name, avatar_url)`)
    .eq("is_archived", false)
    .order("sort").order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createCrmLead(row) {
  const { data, error } = await supabase.from("crm_leads").insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function updateCrmLead(id, patch) {
  const { error } = await supabase.from("crm_leads").update(patch).eq("id", id);
  if (error) throw error;
}

export async function setCrmLeadStage(id, stage) {
  const { error } = await supabase.from("crm_leads").update({ stage }).eq("id", id);
  if (error) throw error;
}

// Перемещение карточки в колонку Kanban (stage_id) + позиция в колонке
export async function moveCrmLead(id, stageId, sort = 0) {
  const { error } = await supabase.from("crm_leads").update({ stage_id: stageId, sort }).eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------- Колонки воронки (Kanban)
export async function fetchCrmStages() {
  const { data, error } = await supabase
    .from("crm_stages")
    .select("id, code, name, color, sort, is_won, is_lost")
    .eq("is_archived", false).order("sort");
  if (error) throw error;
  return data;
}

export async function createCrmStage({ name, color, sort = 0 }) {
  const { data, error } = await supabase
    .from("crm_stages").insert({ name, color: color || null, sort }).select().single();
  if (error) throw error;
  return data;
}

export async function updateCrmStage(id, patch) {
  const { error } = await supabase.from("crm_stages").update(patch).eq("id", id);
  if (error) throw error;
}

export async function archiveCrmStage(id) {
  const { error } = await supabase.from("crm_stages").update({ is_archived: true }).eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------- Чек-лист карточки лида
export async function fetchCrmChecklist(leadIds) {
  if (!leadIds.length) return {};
  const { data, error } = await supabase
    .from("crm_lead_checklist")
    .select("id, lead_id, text, done, sort")
    .in("lead_id", leadIds).order("sort").order("created_at");
  if (error) throw error;
  const m = {};
  for (const r of data) (m[r.lead_id] ??= []).push(r);
  return m;
}

export async function addCrmChecklistItem(leadId, text) {
  const { data, error } = await supabase
    .from("crm_lead_checklist").insert({ lead_id: leadId, text }).select().single();
  if (error) throw error;
  return data;
}

export async function setCrmChecklistDone(id, done) {
  const { error } = await supabase.from("crm_lead_checklist").update({ done }).eq("id", id);
  if (error) throw error;
}

export async function deleteCrmChecklistItem(id) {
  const { error } = await supabase.from("crm_lead_checklist").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchCrmClients() {
  const { data, error } = await supabase
    .from("crm_clients")
    .select("id, name, phone, tag, location_id, note")
    .eq("is_archived", false).order("name");
  if (error) throw error;
  return data;
}

export async function createCrmClient(row) {
  const { data, error } = await supabase.from("crm_clients").insert(row).select().single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------- Рассылки клиентам (Massmail, §12)
// SMS/email-шлюза нет: кампания = снимок получателей (имя+телефон) → WhatsApp-ссылки
// и копируемый список + отметка «отправлено». RLS — по точке (родной CRM-паттерн).
export async function fetchMassmailCampaigns() {
  const { data, error } = await supabase
    .from("massmail_campaigns")
    .select("id, title, template_text, segment_type, segment_filters, location_id, created_at, recipients:massmail_recipients(count)")
    .eq("is_archived", false)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((c) => ({ ...c, recipientCount: c.recipients?.[0]?.count ?? 0 }));
}

export async function fetchMassmailRecipients(campaignId) {
  const { data, error } = await supabase
    .from("massmail_recipients")
    .select("id, recipient_name, recipient_phone, source_type, note, is_sent, sent_at")
    .eq("campaign_id", campaignId)
    .order("recipient_name");
  if (error) throw error;
  return data;
}

// Создать кампанию + снимок получателей (recipients строит модуль из выбранного сегмента).
export async function createMassmailCampaign({ title, templateText, segmentType, segmentFilters, locationId }, recipients) {
  const { data: camp, error } = await supabase
    .from("massmail_campaigns")
    .insert({ title, template_text: templateText || null, segment_type: segmentType,
      segment_filters: segmentFilters || null, location_id: locationId || null })
    .select().single();
  if (error) throw error;
  if (recipients && recipients.length) {
    const rows = recipients.map((r) => ({
      campaign_id: camp.id, recipient_name: r.name, recipient_phone: r.phone,
      source_type: r.sourceType, source_id: r.sourceId || null, note: r.note || null,
    }));
    const { error: rErr } = await supabase.from("massmail_recipients").insert(rows);
    if (rErr) throw rErr;
  }
  return camp;
}

export async function markMassmailRecipientsSent(campaignId, ids = null) {
  let q = supabase.from("massmail_recipients")
    .update({ is_sent: true, sent_at: new Date().toISOString() })
    .eq("campaign_id", campaignId).eq("is_sent", false);
  if (ids && ids.length) q = q.in("id", ids);
  const { error } = await q;
  if (error) throw error;
}

export async function archiveMassmailCampaign(id) {
  const { error } = await supabase.from("massmail_campaigns").update({ is_archived: true }).eq("id", id);
  if (error) throw error;
}
