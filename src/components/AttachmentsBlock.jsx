import { useState } from "react";
import { Paperclip, Loader2, AlertCircle, X } from "lucide-react";
import { useTheme } from "../theme/theme";
import { uploadAttachment, attachmentUrl, deleteAttachment } from "../lib/api";


// ---------------------------------------------------------------- Вложения
// Фото счёта и документы к заявкам (kind='request'), счетам/обязательствам
// (kind='bill') и счетам клиентов (kind='invoice' — договор/смета банкета).
// Файлы — в Storage (bucket attachments), ссылки — в таблицах.
const UPLOAD_LABEL = {
  request: "Прикрепить документ",
  bill: "Прикрепить фото счёта",
  invoice: "Прикрепить договор/смету",
  counterparty: "Прикрепить договор/документ",
};

export function AttachmentsBlock({ kind, parentId, attachments = [], canUpload, canDelete = canUpload, profileId, onChanged }) {
  const { C, st } = useTheme();
  const [busy, setBusy] = useState(false);
  const [delId, setDelId] = useState(null);
  const [err, setErr] = useState("");

  const open = async (att) => {
    try {
      const url = await attachmentUrl(att.file_path);
      window.open(url, "_blank", "noopener");
    } catch (e) { setErr(e?.message || String(e)); }
  };

  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || busy) return;
    if (file.size > 10 * 1024 * 1024) { setErr("Файл больше 10 МБ"); return; }
    setBusy(true); setErr("");
    try {
      await uploadAttachment(kind, parentId, file, profileId);
      await onChanged();
    } catch (e2) { setErr(e2?.message || String(e2)); }
    finally { setBusy(false); }
  };

  const remove = async (att) => {
    if (delId) return;
    if (!window.confirm(`Удалить вложение «${att.file_name}»?`)) return;
    setDelId(att.id); setErr("");
    try {
      await deleteAttachment(kind, att.id, att.file_path);
      await onChanged();
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setDelId(null); }
  };

  return (
    <div>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: C.faint, fontWeight: 700, marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
        <Paperclip size={12} /> Вложения
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {attachments.map((a) => (
          <span key={a.id} style={{ ...st.weekTag, marginLeft: 0, padding: "5px 6px 5px 11px", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <button className="btn"
              style={{ border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", color: "inherit", padding: 0, fontSize: "inherit" }}
              onClick={() => open(a)}>
              📎 {a.file_name.length > 28 ? a.file_name.slice(0, 25) + "…" : a.file_name}
            </button>
            {canDelete && (
              <button className="btn" aria-label="Удалить вложение" disabled={delId === a.id}
                style={{ border: "none", background: "transparent", cursor: "pointer", color: C.faint, padding: 0, display: "inline-flex" }}
                onClick={() => remove(a)}>
                {delId === a.id ? <Loader2 size={12} className="spin" /> : <X size={12} />}
              </button>
            )}
          </span>
        ))}
        {!attachments.length && <span style={{ fontSize: 12, color: C.faint }}>нет</span>}
        {canUpload && (
          <label style={{ ...st.btnGhost, padding: "5px 11px", fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }} className="btn">
            {busy ? <Loader2 size={13} className="spin" /> : <Paperclip size={13} />}
            {UPLOAD_LABEL[kind] || "Прикрепить файл"}
            <input type="file" accept="image/*,.pdf" style={{ display: "none" }} onChange={upload} disabled={busy} />
          </label>
        )}
      </div>
      {err && <div role="alert" style={{ display: "flex", gap: 5, alignItems: "center", color: C.danger, fontSize: 12, marginTop: 5 }}><AlertCircle size={12} /> {err}</div>}
    </div>
  );
}
