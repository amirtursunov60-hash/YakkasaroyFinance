import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Loader2, AlertCircle, CheckCircle2, Plus, X, Archive, ArchiveRestore,
  Pencil, FolderTree, ChevronRight, Info,
} from "lucide-react";
import { useTheme } from "../../theme/theme";
import { useActionFeedback } from "../../hooks/useActionFeedback";
import {
  fetchIncomeTypesManage, createIncomeType, updateIncomeType, setIncomeTypeArchived,
} from "../../lib/api";

// ---------------------------------------------------------------- INCOME TYPES
// Справочник видов дохода (D-коды, Доход §8) — консервативный CRUD под RLS
// itypes_write = is_fin_admin(). Дерево: папки (parent_id IS NULL) → листья.
// Можно добавить лист под папку, переименовать, архивировать/вернуть.
// Иерархию/папки/привязку к точке здесь не меняем (защищённые стартовые данные).
export function IncomeTypesManager() {
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
  // Добавление листа
  const [add, setAdd] = useState({ parentId: "", code: "", name: "" });
  // Инлайн-переименование
  const [editId, setEditId] = useState(null);
  const [edit, setEdit] = useState({ code: "", name: "" });

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      setRows(await fetchIncomeTypesManage({ includeArchived: showArchived }));
      setLoaded(true);
    } catch (e) {
      setErr("Не удалось загрузить виды дохода: " + (e?.message || e));
    } finally { setLoading(false); }
  }, [showArchived]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const wrapErr = (e) => {
    const msg = e?.message || String(e);
    return msg.includes("row-level security") ? "Нет прав на изменение справочника видов дохода." : msg;
  };

  // Дерево: папки (без parent_id) → их листья; листья без известной папки — в «Без папки».
  const { parents, childrenByParent, orphans } = useMemo(() => {
    const ps = rows.filter((r) => !r.parent_id);
    const pIds = new Set(ps.map((p) => p.id));
    const byParent = {};
    const orph = [];
    rows.filter((r) => r.parent_id).forEach((r) => {
      if (pIds.has(r.parent_id)) (byParent[r.parent_id] ||= []).push(r);
      else orph.push(r);
    });
    return { parents: ps, childrenByParent: byParent, orphans: orph };
  }, [rows]);

  const doAdd = async () => {
    const name = add.name.trim();
    if (busy || !name || !add.parentId) return;
    setBusy("add"); setErr(""); setDone("");
    try {
      await createIncomeType({ code: add.code.trim(), name, parentId: add.parentId });
      setAdd({ parentId: "", code: "", name: "" });
      await load();
      setDone(`«${name}» добавлен`);
    } catch (e) { setErr(wrapErr(e)); }
    finally { setBusy(null); }
  };

  const doRename = async (t) => {
    const name = edit.name.trim();
    if (busy || !name) return;
    if (name === t.name && edit.code.trim() === (t.code || "")) { setEditId(null); return; }
    setBusy(`ren:${t.id}`); setErr(""); setDone("");
    try {
      await updateIncomeType(t.id, { code: edit.code.trim() || null, name });
      setEditId(null);
      await load();
      setDone("Сохранено");
    } catch (e) { setErr(wrapErr(e)); }
    finally { setBusy(null); }
  };

  const doArchive = async (t) => {
    if (busy) return;
    setBusy(`arch:${t.id}`); setErr(""); setDone("");
    try {
      await setIncomeTypeArchived(t.id, !t.is_archived);
      await load();
      setDone(t.is_archived ? `«${t.name}» возвращён из архива` : `«${t.name}» в архиве`);
    } catch (e) { setErr(wrapErr(e)); }
    finally { setBusy(null); }
  };

  const startEdit = (t) => { setEditId(t.id); setEdit({ code: t.code || "", name: t.name }); };

  // Общие пропсы строки. TypeRow вынесен на уровень модуля (см. ниже): иначе
  // инлайн-компонент пересоздаётся на каждый рендер и инпут переименования
  // с autoFocus терял бы фокус на каждый введённый символ.
  const rowProps = {
    C, st, editId, edit, setEdit, busy,
    onRename: doRename, onCancel: () => setEditId(null),
    onStartEdit: startEdit, onArchive: doArchive,
  };

  const renderFolder = (p) => (
    <div key={p.id} style={{ ...st.locCard, padding: "10px 12px", marginBottom: 8 }}>
      <TypeRow t={p} isLeaf={false} {...rowProps} />
      {(childrenByParent[p.id] || []).length > 0 && (
        <div style={{ marginTop: 8, display: "grid", gap: 6, paddingLeft: 10, borderLeft: `2px solid ${C.line}` }}>
          {(childrenByParent[p.id] || []).map((c) => <TypeRow key={c.id} t={c} isLeaf {...rowProps} />)}
        </div>
      )}
    </div>
  );

  return (
    <section style={{ ...st.fpCard, marginTop: 18, padding: 0, overflow: "hidden" }}>
      <button className="btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "14px 16px",
          background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", color: C.text }}>
        <FolderTree size={17} color={C.sub} />
        <span style={{ fontWeight: 700, fontSize: 14 }}>Виды дохода (D-коды)</span>
        {loaded && <span style={{ fontSize: 12, color: C.faint }}>{rows.filter((r) => !r.is_archived).length}</span>}
        <ChevronRight size={18} style={{ marginLeft: "auto", transform: open ? "rotate(90deg)" : "none", transition: "transform .15s", color: C.faint }} />
      </button>

      {open && (
        <div style={{ padding: "0 16px 16px" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: C.sub, background: `${C.info}12`, border: `1px solid ${C.info}33`, borderRadius: 10, padding: "9px 11px", marginBottom: 12 }}>
            <Info size={14} style={{ flexShrink: 0, marginTop: 1, color: C.info }} />
            <span>Новый вид дохода участвует в распределении по фондам только после добавления правила в <b>Директиве</b>. Переименование/архив не затрагивает уже проведённые операции.</span>
          </div>

          {err && <div role="alert" style={{ ...st.reqError, marginBottom: 12 }}><AlertCircle size={15} /> {err}</div>}
          {done && <div style={{ ...st.reqSuccess, marginBottom: 12 }}><CheckCircle2 size={15} /> {done}</div>}

          {/* Добавление листа под папку */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <select style={{ ...st.mdSelect, flex: isMobile ? "1 1 100%" : "1 1 180px", minWidth: 0 }} className="fin"
              value={add.parentId} onChange={(e) => setAdd((p) => ({ ...p, parentId: e.target.value }))} aria-label="Папка">
              <option value="">Папка (направление)…</option>
              {parents.filter((p) => !p.is_archived).map((p) => <option key={p.id} value={p.id}>{p.code ? `${p.code} ` : ""}{p.name}</option>)}
            </select>
            <input style={{ ...st.mdInput, flex: isMobile ? "1 1 30%" : "0 1 100px", minWidth: 0 }} className="fin"
              value={add.code} onChange={(e) => setAdd((p) => ({ ...p, code: e.target.value }))} placeholder="код"
              onKeyDown={(e) => { if (e.key === "Enter") doAdd(); }} aria-label="Код вида дохода" />
            <input style={{ ...st.mdInput, flex: "1 1 160px", minWidth: 0 }} className="fin"
              value={add.name} onChange={(e) => setAdd((p) => ({ ...p, name: e.target.value }))} placeholder="название вида дохода"
              onKeyDown={(e) => { if (e.key === "Enter") doAdd(); }} aria-label="Название вида дохода" />
            <button style={{ ...st.btnGreen }} className="btn" onClick={doAdd} disabled={busy === "add" || !add.name.trim() || !add.parentId}>
              {busy === "add" ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} Добавить
            </button>
            <button className="btn" style={{ ...st.btnGhost, color: showArchived ? C.green : C.sub }}
              onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? <ArchiveRestore size={14} /> : <Archive size={14} />} {showArchived ? "С архивом" : "Без архива"}
            </button>
          </div>

          {loading && <div style={{ ...st.empty, padding: "14px 0" }}><Loader2 size={16} className="spin" /> Загрузка…</div>}
          {!loading && !rows.length && <div style={{ ...st.empty, padding: "14px 0" }}>Видов дохода пока нет</div>}

          {!loading && parents.map(renderFolder)}
          {!loading && orphans.length > 0 && (
            <div style={{ ...st.locCard, padding: "10px 12px" }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: C.faint, marginBottom: 8 }}>Без папки</div>
              <div style={{ display: "grid", gap: 6 }}>
                {orphans.map((c) => <TypeRow key={c.id} t={c} isLeaf {...rowProps} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// Строка вида дохода (папка или лист) с действиями. Вынесена на уровень модуля,
// чтобы стабильная идентичность компонента не теряла фокус инпута при вводе.
function TypeRow({ t, isLeaf, C, st, editId, edit, setEdit, busy, onRename, onCancel, onStartEdit, onArchive }) {
  const isEdit = editId === t.id;
  if (isEdit) {
    return (
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <input style={{ ...st.mdInput, flex: "0 0 84px", minWidth: 0 }} className="fin" value={edit.code}
          onChange={(e) => setEdit((p) => ({ ...p, code: e.target.value }))} placeholder="код"
          onKeyDown={(e) => { if (e.key === "Enter") onRename(t); if (e.key === "Escape") onCancel(); }} />
        <input style={{ ...st.mdInput, flex: "1 1 140px", minWidth: 0 }} className="fin" value={edit.name} autoFocus
          onChange={(e) => setEdit((p) => ({ ...p, name: e.target.value }))} placeholder="название"
          onKeyDown={(e) => { if (e.key === "Enter") onRename(t); if (e.key === "Escape") onCancel(); }} />
        <button className="btn" aria-label="Сохранить" disabled={busy === `ren:${t.id}`}
          style={{ border: "none", background: "transparent", cursor: "pointer", color: C.green, padding: 4 }}
          onClick={() => onRename(t)}>
          {busy === `ren:${t.id}` ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />}
        </button>
        <button className="btn" aria-label="Отмена"
          style={{ border: "none", background: "transparent", cursor: "pointer", color: C.faint, padding: 4 }}
          onClick={onCancel}><X size={15} /></button>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", opacity: t.is_archived ? 0.6 : 1 }}>
      {t.code && <span style={{ ...st.fundCode, flexShrink: 0 }}>{t.code}</span>}
      <span style={{ flex: 1, minWidth: 0, fontSize: isLeaf ? 13 : 13.5, fontWeight: isLeaf ? 600 : 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {t.name}{!isLeaf && t.location?.name ? <span style={{ color: C.faint, fontWeight: 400 }}> · {t.location.name}</span> : null}
      </span>
      {t.is_archived && <span style={{ ...st.weekTag, marginLeft: 0, color: C.faint, background: `${C.faint}1a` }}>архив</span>}
      <button className="btn" aria-label="Переименовать"
        style={{ border: "none", background: "transparent", cursor: "pointer", color: C.faint, padding: 4 }}
        onClick={() => onStartEdit(t)}><Pencil size={13} /></button>
      <button className="btn" aria-label={t.is_archived ? "Из архива" : "В архив"} disabled={busy === `arch:${t.id}`}
        style={{ border: "none", background: "transparent", cursor: "pointer", color: t.is_archived ? C.green : C.danger, padding: 4 }}
        onClick={() => onArchive(t)}>
        {busy === `arch:${t.id}` ? <Loader2 size={13} className="spin" /> : t.is_archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
      </button>
    </div>
  );
}
