import { useState, useEffect, useCallback } from "react";
import {
  Loader2, AlertCircle, CheckCircle2, Plus, X, Archive, ArchiveRestore,
  Pencil, CreditCard, ChevronRight,
} from "lucide-react";
import { useTheme } from "../../theme/theme";
import { useActionFeedback } from "../../hooks/useActionFeedback";
import {
  fetchPaymentTypes, createPaymentType, updatePaymentType, setPaymentTypeArchived,
} from "../../lib/api";

// ---------------------------------------------------------------- PAYMENT TYPES
// Справочник способов оплаты (Фонды §8). CRUD под RLS ptypes_write = is_fin_admin().
// Встроен сворачиваемой секцией во вкладку «Фонды» — только для фин-админов.
export function PaymentTypesManager() {
  const { C, st, isMobile } = useTheme();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  useActionFeedback(done, err);
  const [rows, setRows] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState(null);
  const [adding, setAdding] = useState("");
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      setRows(await fetchPaymentTypes({ includeArchived: showArchived }));
      setLoaded(true);
    } catch (e) {
      setErr("Не удалось загрузить способы оплаты: " + (e?.message || e));
    } finally { setLoading(false); }
  }, [showArchived]);

  // Лениво — грузим только при первом раскрытии (и при смене фильтра архива).
  useEffect(() => { if (open) load(); }, [open, load]);

  const wrapErr = (e) => {
    const msg = e?.message || String(e);
    return msg.includes("row-level security") ? "Нет прав на изменение справочника способов оплаты." : msg;
  };

  const doAdd = async () => {
    const name = adding.trim();
    if (busy || !name) return;
    setBusy("add"); setErr(""); setDone("");
    try {
      await createPaymentType(name);
      setAdding("");
      await load();
      setDone(`«${name}» добавлен`);
    } catch (e) { setErr(wrapErr(e)); }
    finally { setBusy(null); }
  };

  const doRename = async (pt) => {
    const name = editVal.trim();
    if (busy || !name) return;
    if (name === pt.name) { setEditId(null); return; }
    setBusy(`ren:${pt.id}`); setErr(""); setDone("");
    try {
      await updatePaymentType(pt.id, { name });
      setEditId(null);
      await load();
      setDone("Переименовано");
    } catch (e) { setErr(wrapErr(e)); }
    finally { setBusy(null); }
  };

  const doArchive = async (pt) => {
    if (busy) return;
    setBusy(`arch:${pt.id}`); setErr(""); setDone("");
    try {
      await setPaymentTypeArchived(pt.id, !pt.is_archived);
      await load();
      setDone(pt.is_archived ? `«${pt.name}» возвращён из архива` : `«${pt.name}» в архиве`);
    } catch (e) { setErr(wrapErr(e)); }
    finally { setBusy(null); }
  };

  return (
    <section style={{ ...st.fpCard, marginTop: 18, padding: 0, overflow: "hidden" }}>
      <button className="btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "14px 16px",
          background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", color: C.text }}>
        <CreditCard size={17} color={C.sub} />
        <span style={{ fontWeight: 700, fontSize: 14 }}>Способы оплаты</span>
        {loaded && <span style={{ fontSize: 12, color: C.faint }}>{rows.filter((r) => !r.is_archived).length}</span>}
        <ChevronRight size={18} style={{ marginLeft: "auto", transform: open ? "rotate(90deg)" : "none", transition: "transform .15s", color: C.faint }} />
      </button>

      {open && (
        <div style={{ padding: "0 16px 16px" }}>
          {err && <div role="alert" style={{ ...st.reqError, marginBottom: 12 }}><AlertCircle size={15} /> {err}</div>}
          {done && <div style={{ ...st.reqSuccess, marginBottom: 12 }}><CheckCircle2 size={15} /> {done}</div>}

          {/* Добавление */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <input style={{ ...st.mdInput, flex: "1 1 200px", minWidth: 0 }} className="fin"
              value={adding} onChange={(e) => setAdding(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") doAdd(); }}
              placeholder="Новый способ оплаты (наличные, карта, перевод…)" aria-label="Новый способ оплаты" />
            <button style={{ ...st.btnGreen }} className="btn" onClick={doAdd} disabled={busy === "add" || !adding.trim()}>
              {busy === "add" ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} Добавить
            </button>
            <button className="btn" style={{ ...st.btnGhost, color: showArchived ? C.green : C.sub }}
              onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? <ArchiveRestore size={14} /> : <Archive size={14} />} {showArchived ? "С архивом" : "Без архива"}
            </button>
          </div>

          {loading && <div style={{ ...st.empty, padding: "14px 0" }}><Loader2 size={16} className="spin" /> Загрузка…</div>}
          {!loading && !rows.length && <div style={{ ...st.empty, padding: "14px 0" }}>Способов оплаты пока нет — добавьте первый</div>}

          <div style={{ display: "grid", gap: 8, gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(240px, 1fr))" }}>
            {rows.map((pt) => {
              const isEdit = editId === pt.id;
              return (
                <div key={pt.id} style={{ ...st.locCard, padding: "10px 12px", display: "flex", alignItems: "center", gap: 8, opacity: pt.is_archived ? 0.6 : 1 }}>
                  {isEdit ? (
                    <>
                      <input style={{ ...st.mdInput, flex: 1, minWidth: 0 }} className="fin" value={editVal} autoFocus
                        onChange={(e) => setEditVal(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") doRename(pt); if (e.key === "Escape") setEditId(null); }} />
                      <button className="btn" aria-label="Сохранить" disabled={busy === `ren:${pt.id}`}
                        style={{ border: "none", background: "transparent", cursor: "pointer", color: C.green, padding: 4 }}
                        onClick={() => doRename(pt)}>
                        {busy === `ren:${pt.id}` ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />}
                      </button>
                      <button className="btn" aria-label="Отмена"
                        style={{ border: "none", background: "transparent", cursor: "pointer", color: C.faint, padding: 4 }}
                        onClick={() => setEditId(null)}><X size={15} /></button>
                    </>
                  ) : (
                    <>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pt.name}</span>
                      {pt.is_archived && <span style={{ ...st.weekTag, marginLeft: 0, color: C.faint, background: `${C.faint}1a` }}>архив</span>}
                      <button className="btn" aria-label="Переименовать"
                        style={{ border: "none", background: "transparent", cursor: "pointer", color: C.faint, padding: 4 }}
                        onClick={() => { setEditId(pt.id); setEditVal(pt.name); }}><Pencil size={14} /></button>
                      <button className="btn" aria-label={pt.is_archived ? "Из архива" : "В архив"} disabled={busy === `arch:${pt.id}`}
                        style={{ border: "none", background: "transparent", cursor: "pointer", color: pt.is_archived ? C.green : C.danger, padding: 4 }}
                        onClick={() => doArchive(pt)}>
                        {busy === `arch:${pt.id}` ? <Loader2 size={14} className="spin" /> : pt.is_archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
