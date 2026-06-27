import { useState, useEffect, useCallback } from "react";
import {
  Loader2, AlertCircle, CheckCircle2, Plus, X, Archive, ArchiveRestore,
  Pencil, BookText, ChevronRight,
} from "lucide-react";
import { useTheme } from "../../theme/theme";
import { useActionFeedback } from "../../hooks/useActionFeedback";
import {
  fetchChartAccounts, createChartAccount, updateChartAccount, setChartAccountArchived,
} from "../../lib/api";

// ------------------------------------------------------------- CHART OF ACCOUNTS
// Справочник «План счетов» (chart_accounts, Реестр §12) — фундамент будущей
// двойной записи. Пока не привязан к Реестру, вводит словарь счетов. CRUD под
// RLS ca_* = is_fin_admin(). Встроен сворачиваемой секцией во вкладку «Фонды».
const TYPES = [
  { v: "asset", label: "Актив" },
  { v: "liability", label: "Обязательство" },
  { v: "equity", label: "Капитал" },
  { v: "income", label: "Доход" },
  { v: "expense", label: "Расход" },
];
const typeLabel = (v) => TYPES.find((t) => t.v === v)?.label || v;

export function ChartAccountsManager() {
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
  const [addCode, setAddCode] = useState("");
  const [addName, setAddName] = useState("");
  const [addType, setAddType] = useState("asset");
  const [editId, setEditId] = useState(null);
  const [editCode, setEditCode] = useState("");
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("asset");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      setRows(await fetchChartAccounts({ includeArchived: showArchived }));
      setLoaded(true);
    } catch (e) {
      setErr("Не удалось загрузить план счетов: " + (e?.message || e));
    } finally { setLoading(false); }
  }, [showArchived]);

  // Лениво — грузим только при первом раскрытии (и при смене фильтра архива).
  useEffect(() => { if (open) load(); }, [open, load]);

  const wrapErr = (e) => {
    const msg = e?.message || String(e);
    if (msg.includes("row-level security")) return "Нет прав на изменение плана счетов.";
    if (msg.includes("chart_accounts_code_uidx") || msg.includes("duplicate key")) return "Счёт с таким кодом уже есть.";
    return msg;
  };

  const doAdd = async () => {
    const code = addCode.trim(); const name = addName.trim();
    if (busy || !code || !name) return;
    setBusy("add"); setErr(""); setDone("");
    try {
      await createChartAccount({ code, name, accountType: addType });
      setAddCode(""); setAddName(""); setAddType("asset");
      await load();
      setDone(`«${code} · ${name}» добавлен`);
    } catch (e) { setErr(wrapErr(e)); }
    finally { setBusy(null); }
  };

  const startEdit = (a) => {
    setEditId(a.id); setEditCode(a.code); setEditName(a.name); setEditType(a.account_type);
  };

  const doSave = async (a) => {
    const code = editCode.trim(); const name = editName.trim();
    if (busy || !code || !name) return;
    if (code === a.code && name === a.name && editType === a.account_type) { setEditId(null); return; }
    setBusy(`ed:${a.id}`); setErr(""); setDone("");
    try {
      await updateChartAccount(a.id, { code, name, account_type: editType });
      setEditId(null);
      await load();
      setDone("Сохранено");
    } catch (e) { setErr(wrapErr(e)); }
    finally { setBusy(null); }
  };

  const doArchive = async (a) => {
    if (busy) return;
    setBusy(`arch:${a.id}`); setErr(""); setDone("");
    try {
      await setChartAccountArchived(a.id, !a.is_archived);
      await load();
      setDone(a.is_archived ? `«${a.code}» возвращён из архива` : `«${a.code}» в архиве`);
    } catch (e) { setErr(wrapErr(e)); }
    finally { setBusy(null); }
  };

  return (
    <section style={{ ...st.fpCard, marginTop: 18, padding: 0, overflow: "hidden" }}>
      <button className="btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "14px 16px",
          background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", color: C.text }}>
        <BookText size={17} color={C.sub} />
        <span style={{ fontWeight: 700, fontSize: 14 }}>План счетов</span>
        {loaded && <span style={{ fontSize: 12, color: C.faint }}>{rows.filter((r) => !r.is_archived).length}</span>}
        <ChevronRight size={18} style={{ marginLeft: "auto", transform: open ? "rotate(90deg)" : "none", transition: "transform .15s", color: C.faint }} />
      </button>

      {open && (
        <div style={{ padding: "0 16px 16px" }}>
          <p style={{ fontSize: 12, color: C.faint, margin: "0 0 12px" }}>
            Справочник счетов для будущей двойной записи. Пока не привязан к Реестру — задаёт словарь счетов.
          </p>
          {err && <div role="alert" style={{ ...st.reqError, marginBottom: 12 }}><AlertCircle size={15} /> {err}</div>}
          {done && <div style={{ ...st.reqSuccess, marginBottom: 12 }}><CheckCircle2 size={15} /> {done}</div>}

          {/* Добавление */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <input style={{ ...st.mdInput, flex: "0 1 110px", minWidth: 0 }} className="fin"
              value={addCode} onChange={(e) => setAddCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") doAdd(); }}
              placeholder="Код (1010)" aria-label="Код счёта" />
            <input style={{ ...st.mdInput, flex: "1 1 180px", minWidth: 0 }} className="fin"
              value={addName} onChange={(e) => setAddName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") doAdd(); }}
              placeholder="Наименование счёта" aria-label="Наименование счёта" />
            <select style={{ ...st.mdInput, flex: "0 1 160px", minWidth: 0 }} className="fin"
              value={addType} onChange={(e) => setAddType(e.target.value)} aria-label="Тип счёта">
              {TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
            </select>
            <button style={{ ...st.btnGreen }} className="btn" onClick={doAdd} disabled={busy === "add" || !addCode.trim() || !addName.trim()}>
              {busy === "add" ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} Добавить
            </button>
            <button className="btn" style={{ ...st.btnGhost, color: showArchived ? C.green : C.sub }}
              onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? <ArchiveRestore size={14} /> : <Archive size={14} />} {showArchived ? "С архивом" : "Без архива"}
            </button>
          </div>

          {loading && <div style={{ ...st.empty, padding: "14px 0" }}><Loader2 size={16} className="spin" /> Загрузка…</div>}
          {!loading && !rows.length && <div style={{ ...st.empty, padding: "14px 0" }}>Счетов пока нет — добавьте первый</div>}

          <div style={{ display: "grid", gap: 8, gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {rows.map((a) => {
              const isEdit = editId === a.id;
              return (
                <div key={a.id} style={{ ...st.locCard, padding: "10px 12px", opacity: a.is_archived ? 0.6 : 1 }}>
                  {isEdit ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <input style={{ ...st.mdInput, flex: "0 1 90px", minWidth: 0 }} className="fin" value={editCode} autoFocus
                          onChange={(e) => setEditCode(e.target.value)} aria-label="Код" />
                        <input style={{ ...st.mdInput, flex: 1, minWidth: 0 }} className="fin" value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") doSave(a); if (e.key === "Escape") setEditId(null); }} aria-label="Наименование" />
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <select style={{ ...st.mdInput, flex: 1, minWidth: 0 }} className="fin"
                          value={editType} onChange={(e) => setEditType(e.target.value)} aria-label="Тип счёта">
                          {TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
                        </select>
                        <button className="btn" aria-label="Сохранить" disabled={busy === `ed:${a.id}`}
                          style={{ border: "none", background: "transparent", cursor: "pointer", color: C.green, padding: 4 }}
                          onClick={() => doSave(a)}>
                          {busy === `ed:${a.id}` ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />}
                        </button>
                        <button className="btn" aria-label="Отмена"
                          style={{ border: "none", background: "transparent", cursor: "pointer", color: C.faint, padding: 4 }}
                          onClick={() => setEditId(null)}><X size={15} /></button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, fontWeight: 700, color: C.sub, flexShrink: 0 }}>{a.code}</span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                      <span style={{ ...st.weekTag, marginLeft: 0, color: C.sub, background: `${C.sub}1a` }}>{typeLabel(a.account_type)}</span>
                      {a.is_archived && <span style={{ ...st.weekTag, marginLeft: 0, color: C.faint, background: `${C.faint}1a` }}>архив</span>}
                      <button className="btn" aria-label="Изменить"
                        style={{ border: "none", background: "transparent", cursor: "pointer", color: C.faint, padding: 4 }}
                        onClick={() => startEdit(a)}><Pencil size={14} /></button>
                      <button className="btn" aria-label={a.is_archived ? "Из архива" : "В архив"} disabled={busy === `arch:${a.id}`}
                        style={{ border: "none", background: "transparent", cursor: "pointer", color: a.is_archived ? C.green : C.danger, padding: 4 }}
                        onClick={() => doArchive(a)}>
                        {busy === `arch:${a.id}` ? <Loader2 size={14} className="spin" /> : a.is_archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                      </button>
                    </div>
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
