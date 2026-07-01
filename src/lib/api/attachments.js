import { supabase } from "../supabase";
import { chunkIds } from "./shared";

// ---------------------------------------------------------------- Вложения
// kind: 'request' | 'bill' | 'invoice'; файл кладём в Storage, ссылку — в таблицу
const ATT_TABLE = { request: "request_attachments", bill: "bill_attachments", invoice: "invoice_attachments", counterparty: "counterparty_attachments" };
const ATT_FK = { request: "request_id", bill: "bill_id", invoice: "invoice_id", counterparty: "counterparty_id" };
// Префикс пути в Storage (по умолчанию `${kind}s`, но для counterparty — правильное мн. число)
const ATT_PREFIX = { request: "requests", bill: "bills", invoice: "invoices", counterparty: "counterparties" };

export async function uploadAttachment(kind, parentId, file, uploadedBy) {
  const safe = file.name.replace(/[^\wа-яА-ЯёЁ.-]+/gu, "_").slice(-80);
  const path = `${ATT_PREFIX[kind] || `${kind}s`}/${parentId}/${Date.now()}_${safe}`;
  const up = await supabase.storage.from("attachments").upload(path, file);
  if (up.error) throw up.error;
  const { error } = await supabase.from(ATT_TABLE[kind])
    .insert({ [ATT_FK[kind]]: parentId, file_path: path, file_name: file.name, uploaded_by: uploadedBy });
  if (error) throw error;
}

// Удаление вложения: сначала строку из таблицы (RLS: автор или финадмин),
// затем файл из Storage (owner/финадмин по политике attachments)
export async function deleteAttachment(kind, id, filePath) {
  const { error } = await supabase.from(ATT_TABLE[kind]).delete().eq("id", id);
  if (error) throw error;
  await supabase.storage.from("attachments").remove([filePath]);
}

// Вложения по списку счетов клиентов: { [invoice_id]: [{...}] }
export async function fetchInvoiceAttachments(invoiceIds) {
  if (!invoiceIds.length) return {};
  const chunks = await Promise.all(chunkIds(invoiceIds).map(async (ids) => {
    const { data, error } = await supabase
      .from("invoice_attachments")
      .select("id, invoice_id, file_path, file_name, uploaded_by, created_at")
      .in("invoice_id", ids)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data;
  }));
  const m = {};
  for (const r of chunks.flat()) (m[r.invoice_id] ??= []).push(r);
  return m;
}

// Вложения по списку контрагентов: { [counterparty_id]: [{...}] }
export async function fetchCounterpartyAttachments(counterpartyIds) {
  if (!counterpartyIds.length) return {};
  const { data, error } = await supabase
    .from("counterparty_attachments")
    .select("id, counterparty_id, file_path, file_name, uploaded_by, created_at")
    .in("counterparty_id", counterpartyIds)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const m = {};
  for (const r of data) (m[r.counterparty_id] ??= []).push(r);
  return m;
}

export async function attachmentUrl(path) {
  const { data, error } = await supabase.storage.from("attachments").createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}
