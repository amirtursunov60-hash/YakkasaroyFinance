import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Building2, Loader2, AlertCircle, CheckCircle2, Plus, X, Search, Phone, Mail,
  Archive, ArchiveRestore, Pencil, Trash2, Tag,
} from "lucide-react";
import { Stat } from "../../components/common";
import { useTheme } from "../../theme/theme";
import { useScrollLock } from "../../hooks/useScrollLock";
import { useActionFeedback } from "../../hooks/useActionFeedback";
import {
  fetchCounterpartiesFull, fetchCounterpartyCategories, createCounterpartyCategory,
  createCounterpartyFull, updateCounterparty, setCounterpartyArchived,
  addCounterpartyContact, deleteCounterpartyContact,
} from "../../lib/api";


// ---------------------------------------------------------------- CONTRAGENTS
// Справочник контрагентов (модуль CRM; gap-map Стат/Контр §16–18): категории,
// контакты (несколько телефонов/почт), поиск/фильтры, архив. Раньше контрагенты
// создавались «на лету» в формах дохода/счетов.

const ROLE_FILTERS = [["all", "Все"], ["supplier", "Поставщики"], ["client", "Клиенты"]];

export function Counterparties() {
  const { C, st, isMobile, profile } = useTheme();
  const canEdit = ["owner", "fin_director", "accountant", "location_manager", "ops_director"].includes(profile?.role);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  useActionFeedback(done, err);
  const [rows, setRows] = useState([]);
  const [cats, setCats] = useState([]);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");
  const [categoryId, setCategoryId] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState(null);
  const [form, setForm] = useState(null);          // редактируемый/новый контрагент
  const [contactFor, setContactFor] = useState(null); // контрагент для добавления контакта

  const load = useCallback(async () => {
    setErr("");
    try {
      const [data, cs] = await Promise.all([
        fetchCounterpartiesFull({
          q, role: role === "all" ? null : role,
          categoryId: categoryId || null, includeArchived: showArchived,
        }),
        fetchCounterpartyCategories(),
      ]);
      setRows(data); setCats(cs);
    } catch (e) {
      setErr("Не удалось загрузить контрагентов: " + (e?.message || e));
    } finally { setLoading(false); }
  }, [q, role, categoryId, showArchived]);
  useEffect(() => { load(); }, [load]);

  const sums = useMemo(() => ({
    total: rows.length,
    suppliers: rows.filter((r) => r.is_supplier).length,
    clients: rows.filter((r) => r.is_client).length,
  }), [rows]);

  const doArchive = async (cp) => {
    if (busy) return;
    setBusy(`arch:${cp.id}`); setErr(""); setDone("");
    try {
      await setCounterpartyArchived(cp.id, !cp.is_archived);
      await load();
      setDone(cp.is_archived ? `${cp.name} — возвращён из архива` : `${cp.name} — в архиве`);
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  const doDeleteContact = async (cp, c) => {
    if (busy) return;
    setBusy(`delc:${c.id}`); setErr("");
    try { await deleteCounterpartyContact(c.id); await load(); }
    catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  if (loading) return <div style={st.empty}><Loader2 size={18} className="spin" /> Загрузка…</div>;

  return (<>
    <section style={st.hero}>
      <div style={st.heroGlow} />
      <div style={st.heroContent}>
        <div style={st.heroTop}>
          <div>
            <div style={st.heroLabel}>Справочник контрагентов</div>
            <div style={st.heroTitle}>Контрагентов: {sums.total}</div>
          </div>
          {canEdit && (
            <button style={st.btnGreen} className="btn" onClick={() => setForm({ isSupplier: true })}>
              <Plus size={15} /> {isMobile ? "Контрагент" : "Добавить контрагента"}
            </button>
          )}
        </div>
        <div style={st.heroStats}>
          <Stat label="Всего" value={String(sums.total)} unit="" />
          <Stat label="Поставщики" value={String(sums.suppliers)} unit="" accent />
          <Stat label="Клиенты" value={String(sums.clients)} unit="" />
          <Stat label="Категорий" value={String(cats.length)} unit="" />
        </div>
      </div>
    </section>

    {err && <div role="alert" style={{ ...st.reqError, marginBottom: 14 }}><AlertCircle size={15} /> {err}</div>}
    {done && <div style={{ ...st.reqSuccess, marginBottom: 14 }}><CheckCircle2 size={15} /> {done}</div>}

    {/* Тулбар: поиск, роль, категория, архив */}
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
      <div style={{ position: "relative", flex: isMobile ? "1 1 100%" : "0 0 260px" }}>
        <Search size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.faint }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по имени или ИНН…"
          style={{ ...st.mdInput, width: "100%", paddingLeft: 32 }} className="fin" />
      </div>
      <div className="chiptray" style={{ display: "flex", gap: 6 }}>
        {ROLE_FILTERS.map(([key, label]) => {
          const active = role === key;
          return (
            <button key={key} className="btn"
              style={{ flexShrink: 0, border: "none", cursor: "pointer", fontFamily: "inherit", padding: "6px 13px",
                borderRadius: 99, fontSize: 12, fontWeight: 700, color: active ? "#04130a" : C.green, background: active ? C.green : "transparent" }}
              onClick={() => setRole(key)}>{label}</button>
          );
        })}
      </div>
      <select style={{ ...st.mdSelect, width: "auto" }} className="fin" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
        <option value="">Все категории</option>
        {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <button className="btn" style={{ ...st.btnGhost, color: showArchived ? C.green : C.sub }}
        onClick={() => setShowArchived((v) => !v)}>
        {showArchived ? <ArchiveRestore size={14} /> : <Archive size={14} />} {showArchived ? "С архивом" : "Без архива"}
      </button>
    </div>

    {!rows.length && (
      <div style={{ ...st.locCard, ...st.empty }}>
        {q || role !== "all" || categoryId ? "Ничего не найдено по фильтрам" : "Контрагентов пока нет — добавьте первого кнопкой выше"}
      </div>
    )}

    <div style={{ display: "grid", gap: 12, gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(320px, 1fr))" }}>
      {rows.map((cp) => (
        <div key={cp.id} style={{ ...st.locCard, padding: 16, opacity: cp.is_archived ? 0.6 : 1 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, display: "grid", placeItems: "center", flexShrink: 0,
              background: `${(cp.category?.color || C.green)}22`, color: cp.category?.color || C.green }}>
              <Building2 size={19} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis" }}>{cp.name}</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 5 }}>
                {cp.is_supplier && <span style={{ ...st.weekTag, marginLeft: 0, color: C.info, background: `${C.info}1a` }}>поставщик</span>}
                {cp.is_client && <span style={{ ...st.weekTag, marginLeft: 0, color: C.violet, background: `${C.violet}1a` }}>клиент</span>}
                {cp.category && <span style={{ ...st.weekTag, marginLeft: 0, color: cp.category.color || C.green, background: `${cp.category.color || C.green}1a` }}><Tag size={10} style={{ verticalAlign: -1, marginRight: 3 }} />{cp.category.name}</span>}
                {cp.is_archived && <span style={{ ...st.weekTag, marginLeft: 0, color: C.faint, background: `${C.faint}1a` }}>в архиве</span>}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 10, display: "grid", gap: 4, fontSize: 12.5, color: C.sub }}>
            {cp.inn && <div>ИНН: <b style={{ color: C.text }}>{cp.inn}</b></div>}
            {cp.phone && <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Phone size={12} /> {cp.phone}</div>}
            {(cp.contacts || []).map((c) => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {c.kind === "email" ? <Mail size={12} /> : <Phone size={12} />}
                <span>{c.value}</span>
                {c.label && <span style={{ color: C.faint }}>· {c.label}</span>}
                {canEdit && (
                  <button className="btn" aria-label="Удалить контакт" disabled={busy === `delc:${c.id}`}
                    style={{ border: "none", background: "transparent", cursor: "pointer", color: C.faint, padding: 0, marginLeft: "auto" }}
                    onClick={() => doDeleteContact(cp, c)}>
                    {busy === `delc:${c.id}` ? <Loader2 size={12} className="spin" /> : <Trash2 size={12} />}
                  </button>
                )}
              </div>
            ))}
            {cp.comment && <div style={{ color: C.faint }}>{cp.comment}</div>}
          </div>

          {canEdit && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
              <button style={{ ...st.btnGhost, padding: "6px 11px", fontSize: 12 }} className="btn" onClick={() => setContactFor(cp)}>
                <Plus size={13} /> Контакт
              </button>
              <button style={{ ...st.btnGhost, padding: "6px 11px", fontSize: 12 }} className="btn" onClick={() => setForm(cp)}>
                <Pencil size={13} /> Изменить
              </button>
              <button style={{ ...st.btnGhost, padding: "6px 11px", fontSize: 12, color: cp.is_archived ? C.green : C.danger }}
                className="btn" disabled={busy === `arch:${cp.id}`} onClick={() => doArchive(cp)}>
                {busy === `arch:${cp.id}` ? <Loader2 size={13} className="spin" /> : cp.is_archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                {cp.is_archived ? " Из архива" : " В архив"}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>

    {form && (
      <CounterpartyForm st={st} isMobile={isMobile} cats={cats} cp={form.id ? form : null} initSupplier={form.isSupplier}
        onClose={() => setForm(null)}
        onCatsChanged={async () => setCats(await fetchCounterpartyCategories())}
        onSaved={(msg) => { setForm(null); load(); setDone(msg); }} />
    )}
    {contactFor && (
      <ContactForm st={st} cp={contactFor}
        onClose={() => setContactFor(null)}
        onSaved={() => { setContactFor(null); load(); setDone("Контакт добавлен"); }} />
    )}
  </>);
}


// ---------------------------------------------------------------- Форма контрагента
function CounterpartyForm({ st, isMobile, cats, cp, initSupplier, onClose, onCatsChanged, onSaved }) {
  useScrollLock();
  const isEdit = !!cp;
  const [f, setF] = useState({
    name: cp?.name || "", isSupplier: cp ? cp.is_supplier : !!initSupplier, isClient: cp ? cp.is_client : false,
    phone: cp?.phone || "", inn: cp?.inn || "", categoryId: cp?.category_id || "", comment: cp?.comment || "",
  });
  const [newCat, setNewCat] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e?.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e }));

  const addCat = async () => {
    if (busy || !newCat.trim()) return;
    setBusy(true); setErr("");
    try {
      const c = await createCounterpartyCategory(newCat.trim());
      await onCatsChanged();
      setF((p) => ({ ...p, categoryId: c.id }));
      setNewCat("");
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    if (busy) return;
    setErr("");
    if (!f.name.trim()) return setErr("Укажите название контрагента");
    if (!f.isSupplier && !f.isClient) return setErr("Отметьте роль: поставщик и/или клиент");
    setBusy(true);
    try {
      if (isEdit) {
        await updateCounterparty(cp.id, {
          name: f.name.trim(), is_supplier: f.isSupplier, is_client: f.isClient,
          phone: f.phone.trim() || null, inn: f.inn.trim() || null,
          category_id: f.categoryId || null, comment: f.comment.trim() || null,
        });
        onSaved(`${f.name.trim()} — сохранён`);
      } else {
        await createCounterpartyFull({
          name: f.name.trim(), isSupplier: f.isSupplier, isClient: f.isClient,
          phone: f.phone.trim(), inn: f.inn.trim(), categoryId: f.categoryId, comment: f.comment.trim(),
        });
        onSaved(`${f.name.trim()} — добавлен`);
      }
    } catch (e) {
      const msg = e?.message || String(e);
      setErr(msg.includes("row-level security") ? "Нет прав на изменение справочника контрагентов." : msg);
      setBusy(false);
    }
  };

  return (
    <div style={st.mdOverlay} data-modal="1" onClick={onClose}>
      <div style={{ ...st.mdCard, width: "min(500px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>{isEdit ? "Контрагент" : "Новый контрагент"}</div>
          <button style={st.iconBtn} onClick={onClose} aria-label="Закрыть"><X size={17} /></button>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Название</span>
            <input style={st.mdInput} className="fin" value={f.name} onChange={set("name")} autoFocus />
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <label style={st.mdCheck}><input type="checkbox" checked={f.isSupplier} onChange={set("isSupplier")} /> Поставщик</label>
            <label style={st.mdCheck}><input type="checkbox" checked={f.isClient} onChange={set("isClient")} /> Клиент</label>
          </div>
          <div style={{ ...st.mdGrid, ...(isMobile ? { gridTemplateColumns: "1fr" } : {}) }}>
            <div style={st.reqField}>
              <span style={st.reqFieldLbl}>Телефон</span>
              <input style={st.mdInput} className="fin" value={f.phone} onChange={set("phone")} />
            </div>
            <div style={st.reqField}>
              <span style={st.reqFieldLbl}>ИНН</span>
              <input style={st.mdInput} className="fin" value={f.inn} onChange={set("inn")} />
            </div>
          </div>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Категория</span>
            <select style={st.mdSelect} className="fin" value={f.categoryId} onChange={set("categoryId")}>
              <option value="">— без категории —</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <input style={{ ...st.mdInput, flex: 1 }} className="fin" placeholder="…или новая категория"
                value={newCat} onChange={(e) => setNewCat(e.target.value)} />
              <button style={{ ...st.btnGhost, whiteSpace: "nowrap" }} className="btn" onClick={addCat} disabled={busy || !newCat.trim()}>
                <Plus size={14} /> Добавить
              </button>
            </div>
          </div>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Комментарий</span>
            <input style={st.mdInput} className="fin" value={f.comment} onChange={set("comment")} />
          </div>
        </div>

        {err && <div role="alert" style={st.reqError}><AlertCircle size={15} /> {err}</div>}

        <div style={st.mdActions}>
          <button style={st.btnGhost} className="btn" onClick={onClose}>Отмена</button>
          <button style={{ ...st.btnGreen, opacity: busy ? 0.7 : 1 }} className="btn" onClick={submit} disabled={busy}>
            {busy ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />} {isEdit ? "Сохранить" : "Добавить"}
          </button>
        </div>
      </div>
    </div>
  );
}


// ---------------------------------------------------------------- Добавление контакта
function ContactForm({ st, cp, onClose, onSaved }) {
  useScrollLock();
  const [kind, setKind] = useState("phone");
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (busy) return;
    setErr("");
    if (!value.trim()) return setErr("Введите значение контакта");
    setBusy(true);
    try {
      await addCounterpartyContact(cp.id, { kind, value: value.trim(), label: label.trim() });
      onSaved();
    } catch (e) {
      const msg = e?.message || String(e);
      setErr(msg.includes("row-level security") ? "Нет прав на изменение контактов." : msg);
      setBusy(false);
    }
  };

  return (
    <div style={st.mdOverlay} data-modal="1" onClick={onClose}>
      <div style={{ ...st.mdCard, width: "min(420px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>Контакт · {cp.name}</div>
          <button style={st.iconBtn} onClick={onClose} aria-label="Закрыть"><X size={17} /></button>
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Тип</span>
            <select style={st.mdSelect} className="fin" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="phone">Телефон</option>
              <option value="email">Эл. почта</option>
              <option value="other">Другое</option>
            </select>
          </div>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Значение</span>
            <input style={st.mdInput} className="fin" value={value} onChange={(e) => setValue(e.target.value)} autoFocus
              placeholder={kind === "email" ? "name@example.com" : kind === "phone" ? "+992…" : ""} />
          </div>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Подпись (необязательно)</span>
            <input style={st.mdInput} className="fin" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="директор, бухгалтерия…" />
          </div>
        </div>
        {err && <div role="alert" style={st.reqError}><AlertCircle size={15} /> {err}</div>}
        <div style={st.mdActions}>
          <button style={st.btnGhost} className="btn" onClick={onClose}>Отмена</button>
          <button style={{ ...st.btnGreen, opacity: busy ? 0.7 : 1 }} className="btn" onClick={submit} disabled={busy}>
            {busy ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} Добавить
          </button>
        </div>
      </div>
    </div>
  );
}
