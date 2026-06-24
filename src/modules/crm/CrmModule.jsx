import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Search, CalendarDays, Plus, X, XCircle, Trophy,
  Loader2, AlertCircle, CheckCircle2, Settings2, GripVertical, Trash2, Check,
  ListChecks, ArrowUp, ArrowDown,
} from "lucide-react";
import { Stat } from "../../components/common";
import { useTheme } from "../../theme/theme";
import { usePeriod } from "../../lib/PeriodCtx";
import { fmt, avatarColor } from "../../utils/format";
import {
  fetchCrmLeads, fetchCrmClients, fetchCrmHalls, createCrmLead, createCrmClient,
  fetchCrmStages, createCrmStage, updateCrmStage, archiveCrmStage,
  moveCrmLead, updateCrmLead, fetchPeopleBrief,
  fetchCrmChecklist, addCrmChecklistItem, setCrmChecklistDone, deleteCrmChecklistItem,
} from "../../lib/api";

const EVENTS = ["Свадьба", "Туй", "Оши нахор", "Юбилей", "Корпоратив"];
const STAGE_COLORS = ["#5b8def", "#9c6ade", "#e8911c", "#5bd6c9", "#1fd65f", "#ff6b5e", "#f06595", "#22b8cf"];

const fmtDate = (iso) => iso ? new Date(iso + "T00:00:00").toLocaleDateString("ru-RU", { day: "2-digit", month: "short" }) : "дата не выбрана";

export function CrmModule({ view }) {
  const { C, st, isMobile, profile } = useTheme();
  const { locationId } = usePeriod();
  const canEdit = ["owner", "fin_director", "ops_director", "location_manager", "accountant"].includes(profile?.role);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const [leads, setLeads] = useState([]);
  const [stages, setStages] = useState([]);
  const [clients, setClients] = useState([]);
  const [halls, setHalls] = useState([]);
  const [people, setPeople] = useState([]);
  const [checklist, setChecklist] = useState({});   // { leadId: [items] }
  const [query, setQuery] = useState("");
  const [dragId, setDragId] = useState(null);
  const [card, setCard] = useState(null);           // лид для модала-карточки
  const [stageMgr, setStageMgr] = useState(false);

  const load = useCallback(async () => {
    setErr("");
    try {
      const [ls, ss, cs, hs, ppl] = await Promise.all([
        fetchCrmLeads(), fetchCrmStages(), fetchCrmClients(), fetchCrmHalls(), fetchPeopleBrief(),
      ]);
      setLeads(ls); setStages(ss); setClients(cs); setHalls(hs); setPeople(ppl);
      setChecklist(await fetchCrmChecklist(ls.map((l) => l.id)));
    } catch (e) {
      setErr("Не удалось загрузить CRM: " + (e?.message || e));
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const hallName = (id) => halls.find((h) => h.id === id)?.name || "";
  const stageById = useMemo(() => Object.fromEntries(stages.map((s) => [s.id, s])), [stages]);
  const checkProgress = useCallback((leadId) => {
    const items = checklist[leadId] || [];
    return { done: items.filter((i) => i.done).length, total: items.length };
  }, [checklist]);

  const moveTo = async (lead, stageId) => {
    if (!stageId || lead.stage_id === stageId) return;
    setErr(""); setDone("");
    try { await moveCrmLead(lead.id, stageId); await load(); }
    catch (e) { setErr(e?.message || String(e)); }
  };

  if (loading) return <div style={st.empty}><Loader2 size={18} className="spin" /> Загрузка…</div>;

  const banners = (<>
    {err && <div role="alert" style={{ ...st.reqError, marginBottom: 14 }}><AlertCircle size={15} /> {err}</div>}
    {done && <div style={{ ...st.reqSuccess, marginBottom: 14 }}><CheckCircle2 size={15} /> {done}</div>}
  </>);

  // ============ ВОРОНКА (KANBAN) ============
  if (view !== "c_clients" && view !== "c_bookings") {
    const isWon = (l) => stageById[l.stage_id]?.is_won;
    const isLost = (l) => stageById[l.stage_id]?.is_lost;
    const inWork = leads.filter((l) => { const s = stageById[l.stage_id]; return s && !s.is_won && !s.is_lost; });
    const won = leads.filter(isWon);
    const lost = leads.filter(isLost);
    const funnelSum = inWork.reduce((a, l) => a + Number(l.budget || 0), 0);
    const closed = won.length + lost.length;
    const conv = closed ? Math.round((won.length / closed) * 100) : 0;

    const leadsOf = (stage) => leads
      .filter((l) => l.stage_id === stage.id)
      .sort((a, b) => (a.sort - b.sort) || (b.created_at > a.created_at ? 1 : -1));

    const Card = ({ l }) => {
      const cp = checkProgress(l.id);
      return (
        <div
          draggable={canEdit && !isMobile}
          onDragStart={(e) => { setDragId(l.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", l.id); }}
          onDragEnd={() => setDragId(null)}
          onClick={() => setCard(l)}
          style={{ background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 12, padding: 11, marginBottom: 8,
            cursor: "pointer", opacity: dragId === l.id ? 0.4 : 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</div>
            {canEdit && !isMobile && <GripVertical size={14} style={{ color: C.faint, flexShrink: 0 }} />}
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.money, fontVariantNumeric: "tabular-nums", marginTop: 3 }}>
            {l.budget ? fmt(l.budget) : "—"} <span style={{ fontSize: 10, color: C.faint }}>TJS</span>
          </div>
          <div style={{ fontSize: 11.5, color: C.sub, marginTop: 5, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span>{[l.event_type, hallName(l.hall_id)].filter(Boolean).join(" · ") || "—"}</span>
          </div>
          <div style={{ fontSize: 11, color: C.faint, marginTop: 5, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><CalendarDays size={11} /> {fmtDate(l.event_date)}</span>
            {l.guests ? <span>{l.guests} гост.</span> : null}
            {cp.total > 0 && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: cp.done === cp.total ? C.green : C.faint }}><ListChecks size={11} /> {cp.done}/{cp.total}</span>}
            {l.responsible && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
                <span style={{ width: 16, height: 16, borderRadius: "50%", background: avatarColor(l.responsible.full_name), color: "#fff", fontSize: 9, fontWeight: 700, display: "grid", placeItems: "center" }}>
                  {l.responsible.full_name?.[0] || "?"}
                </span>
              </span>
            )}
          </div>
          {l.due_date && (
            <div style={{ fontSize: 10.5, color: C.warning, marginTop: 5 }}>срок: {fmtDate(l.due_date)}</div>
          )}
          {/* мобильное перемещение — select (DnD недоступен) */}
          {canEdit && isMobile && (
            <select value={l.stage_id || ""} onClick={(e) => e.stopPropagation()} onChange={(e) => moveTo(l, e.target.value)}
              style={{ ...st.mdSelect, marginTop: 8, fontSize: 12, padding: "5px 8px" }} className="fin">
              {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </div>
      );
    };

    return (<>
      <section style={st.hero}>
        <div style={st.heroGlow} />
        <div style={st.heroContent}>
          <div style={st.heroTop}>
            <div><div style={st.heroLabel}>CRM · воронка продаж банкетов</div><div style={st.heroTitle}>Воронка</div></div>
            {canEdit && (
              <button style={st.btnGhost} className="btn" onClick={() => setStageMgr(true)}>
                <Settings2 size={15} /> {isMobile ? "" : "Колонки"}
              </button>
            )}
          </div>
          <div style={st.heroStats}>
            <Stat label="Заявок в работе" value={String(inWork.length)} unit="" />
            <Stat label="Сумма воронки" value={fmt(funnelSum)} unit="TJS" accent />
            <Stat label="Конверсия в банкет" value={`${conv}%`} unit="" />
            <Stat label="Потеряно" value={String(lost.length)} unit="" />
          </div>
        </div>
      </section>
      {banners}

      <LeadForm st={st} isMobile={isMobile} halls={halls} stages={stages} locationId={locationId}
        onSaved={async (msg) => { await load(); setDone(msg); }} onError={setErr} />

      {/* Доска Kanban — колонки с горизонтальным скроллом */}
      <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 12, alignItems: "flex-start" }}>
        {stages.map((s) => {
          const items = leadsOf(s);
          const sum = items.reduce((a, l) => a + Number(l.budget || 0), 0);
          return (
            <div key={s.id}
              onDragOver={(e) => { if (canEdit && !isMobile) e.preventDefault(); }}
              onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain"); const l = leads.find((x) => x.id === id); if (l) moveTo(l, s.id); }}
              style={{ flex: isMobile ? "0 0 85%" : "0 0 290px", maxWidth: isMobile ? "85%" : 290,
                background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 10,
                ...(dragId && canEdit && !isMobile ? { outline: `1px dashed ${s.color || C.green}55` } : {}) }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, padding: "2px 2px 8px", borderBottom: `1px solid ${C.line}` }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: s.color || C.green, flexShrink: 0 }} />
                <span style={{ fontWeight: 700, fontSize: 13.5, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                {s.is_won && <Trophy size={13} style={{ color: C.green }} />}
                <span style={{ fontSize: 11.5, color: C.faint, flexShrink: 0 }}>{items.length}</span>
              </div>
              <div style={{ fontSize: 11.5, color: C.sub, marginBottom: 8 }}>{fmt(sum)} TJS</div>
              {items.map((l) => <Card key={l.id} l={l} />)}
              {!items.length && <div style={{ fontSize: 11.5, color: C.faint, textAlign: "center", padding: "14px 0" }}>пусто</div>}
            </div>
          );
        })}
      </div>

      <div style={st.vibeNote}>
        <b style={{ color: C.green }}>Где теряются деньги:</b> самый дорогой провал — между «Сметой» и «Договором».
        Правило: КП отправлено — звонок через 24 часа, не жди, пока клиент «подумает» у конкурента.
      </div>

      {card && (
        <CardModal C={C} st={st} isMobile={isMobile} lead={card} stages={stages} people={people}
          hallName={hallName} items={checklist[card.id] || []}
          onClose={() => setCard(null)}
          onReload={async () => { await load(); }}
          syncCard={(id) => setCard((leads.find((x) => x.id === id)) || null)} />
      )}
      {stageMgr && (
        <StageManager C={C} st={st} stages={stages} onClose={() => setStageMgr(false)}
          onReload={async () => { await load(); }} />
      )}
    </>);
  }

  // ============ БАЗА КЛИЕНТОВ ============
  if (view === "c_clients") {
    const TAG_COLOR = { VIP: C.warning, "Повторный": C.teal, "Новый": C.info };
    const agg = {};
    for (const l of leads) {
      if (!l.client_id || !stageById[l.stage_id]?.is_won) continue;
      const a = (agg[l.client_id] ??= { events: 0, total: 0, last: null });
      a.events++; a.total += Number(l.budget || 0);
      if (l.event_date && (!a.last || l.event_date > a.last)) a.last = l.event_date;
    }
    const q = query.trim().toLowerCase();
    const shown = clients.filter((c) => !q || c.name.toLowerCase().includes(q) || (c.phone || "").includes(q));
    const totalLtv = clients.reduce((a, c) => a + (agg[c.id]?.total || 0), 0);
    return (<>
      <section style={st.hero}>
        <div style={st.heroGlow} />
        <div style={st.heroContent}>
          <div style={st.heroTop}>
            <div><div style={st.heroLabel}>CRM · база клиентов сети</div><div style={st.heroTitle}>Клиенты</div></div>
          </div>
          <div style={st.heroStats}>
            <Stat label="Клиентов в базе" value={String(clients.length)} unit="" />
            <Stat label="Принесли всего" value={fmt(totalLtv)} unit="TJS" accent />
            <Stat label="VIP" value={String(clients.filter((c) => c.tag === "VIP").length)} unit="" />
            <Stat label="Повторных" value={String(clients.filter((c) => c.tag === "Повторный").length)} unit="" />
          </div>
        </div>
      </section>
      {banners}
      <ClientForm st={st} isMobile={isMobile} locationId={locationId}
        onSaved={async (msg) => { await load(); setDone(msg); }} onError={setErr} />
      <div style={{ ...st.searchWrap, maxWidth: "100%", margin: "14px 0" }}>
        <Search size={16} color={C.faint} />
        <input style={st.search} placeholder="Поиск по имени или телефону…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div style={st.incList}>
        {shown.map((c) => {
          const a = agg[c.id] || { events: 0, total: 0, last: null };
          const tagCol = TAG_COLOR[c.tag] || C.sub;
          return (
            <div key={c.id} style={{ ...st.locCard, padding: "14px 18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14.5, fontWeight: 700 }}>{c.name}</span>
                    {c.tag && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 20, color: tagCol, background: `${tagCol}1a` }}>{c.tag}</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: C.faint, marginTop: 3 }}>{c.phone || "—"}{a.last ? ` · последний: ${fmtDate(a.last)}` : ""}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{fmt(a.total)} <span style={st.locUnit}>TJS</span></div>
                  <div style={{ fontSize: 11, color: C.sub }}>{a.events} банкета(ов)</div>
                </div>
              </div>
            </div>
          );
        })}
        {shown.length === 0 && <div style={st.empty}>{clients.length ? `Никого не нашли по запросу «${query}»` : "Клиентов пока нет — добавьте первого"}</div>}
      </div>
    </>);
  }

  // ============ БРОНИ ЗАЛОВ (производная от заявок) ============
  const bookingLeads = leads.filter((l) => {
    const s = stageById[l.stage_id];
    return l.hall_id && l.event_date && s && !s.is_lost;
  });
  const byDate = {};
  for (const l of bookingLeads) (byDate[l.event_date] ??= []).push(l);
  const dates = Object.keys(byDate).sort();
  const totalGuests = bookingLeads.reduce((a, l) => a + (l.guests || 0), 0);

  return (<>
    <section style={st.hero}>
      <div style={st.heroGlow} />
      <div style={st.heroContent}>
        <div style={st.heroTop}>
          <div><div style={st.heroLabel}>CRM · брони залов по датам</div><div style={st.heroTitle}>Брони</div></div>
        </div>
        <div style={st.heroStats}>
          <Stat label="Броней" value={String(bookingLeads.length)} unit="" accent />
          <Stat label="Гостей суммарно" value={String(totalGuests)} unit="" />
          <Stat label="Дат с событиями" value={String(dates.length)} unit="" />
        </div>
      </div>
    </section>
    {banners}
    {dates.length === 0 && <div style={st.empty}>Броней пока нет — заявки с залом и датой (кроме потерянных) попадут сюда</div>}
    <div style={st.incList}>
      {dates.map((d) => (
        <div key={d} style={st.locCard}>
          <div style={{ ...st.locHead, cursor: "default" }}>
            <CalendarDays size={17} color={C.green} />
            <div style={st.locTitle}><div style={st.locName}>{new Date(d + "T00:00:00").toLocaleDateString("ru-RU", { day: "2-digit", month: "long", weekday: "long" })}</div></div>
          </div>
          <div style={st.locBody}>
            {byDate[d].map((l) => { const s = stageById[l.stage_id]; const col = s?.color || C.info; return (
              <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", borderBottom: `1px solid ${C.line}` }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: col, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{hallName(l.hall_id)}</div>
                  <div style={{ fontSize: 11.5, color: C.sub }}>{l.name} · {l.event_type || "—"}{l.guests ? ` · ${l.guests} гостей` : ""}</div>
                </div>
                <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 20, color: col, background: `${col}1a`, flexShrink: 0 }}>{s?.name || "—"}</span>
              </div>); })}
          </div>
        </div>
      ))}
    </div>
  </>);
}


// ---------------------------------------------------------------- Карточка лида (детали)
function CardModal({ C, st, isMobile, lead, stages, people, hallName, items, onClose, onReload, syncCard }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [newItem, setNewItem] = useState("");
  const set = async (patch) => {
    setBusy(true); setErr("");
    try { await updateCrmLead(lead.id, patch); await onReload(); syncCard(lead.id); }
    catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(false); }
  };
  const addItem = async () => {
    const t = newItem.trim(); if (!t || busy) return;
    setBusy(true); setErr("");
    try { await addCrmChecklistItem(lead.id, t); setNewItem(""); await onReload(); }
    catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(false); }
  };
  const toggle = async (it) => { try { await setCrmChecklistDone(it.id, !it.done); await onReload(); } catch (e) { setErr(e?.message || String(e)); } };
  const delItem = async (it) => { try { await deleteCrmChecklistItem(it.id); await onReload(); } catch (e) { setErr(e?.message || String(e)); } };

  return (
    <div style={st.mdOverlay} data-modal="1" onClick={onClose}>
      <div style={{ ...st.mdCard, width: "min(520px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>{lead.name}</div>
          <button style={st.iconBtn} onClick={onClose} aria-label="Закрыть"><X size={17} /></button>
        </div>

        <div style={{ fontSize: 12.5, color: C.sub, marginBottom: 12, display: "flex", gap: 14, flexWrap: "wrap" }}>
          <span>{lead.phone || "—"}</span>
          <span>{[lead.event_type, hallName(lead.hall_id)].filter(Boolean).join(" · ") || "—"}</span>
          <span>{lead.budget ? `${fmt(lead.budget)} TJS` : "—"}</span>
          <span><CalendarDays size={12} style={{ verticalAlign: -2 }} /> {fmtDate(lead.event_date)}</span>
        </div>

        <div style={{ ...st.mdGrid, ...(isMobile ? { gridTemplateColumns: "1fr" } : {}) }}>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Этап (колонка)</span>
            <select style={st.mdSelect} className="fin" value={lead.stage_id || ""} disabled={busy}
              onChange={(e) => set({ stage_id: e.target.value })}>
              {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Ответственный</span>
            <select style={st.mdSelect} className="fin" value={lead.responsible_id || ""} disabled={busy}
              onChange={(e) => set({ responsible_id: e.target.value || null })}>
              <option value="">— не назначен —</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </div>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Срок (следующий шаг)</span>
            <input type="date" style={st.mdInput} className="fin" value={lead.due_date || ""} disabled={busy}
              onChange={(e) => set({ due_date: e.target.value || null })} />
          </div>
        </div>

        {/* Чек-лист */}
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: C.faint, fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
            <ListChecks size={13} /> Чек-лист
          </div>
          {items.map((it) => (
            <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
              <button onClick={() => toggle(it)} className="btn" style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, cursor: "pointer", display: "grid", placeItems: "center", border: `1.5px solid ${it.done ? C.green : C.line}`, background: it.done ? C.green : "transparent", color: C.onAccent }}>
                {it.done && <Check size={13} strokeWidth={3} />}
              </button>
              <span style={{ flex: 1, fontSize: 13, textDecoration: it.done ? "line-through" : "none", color: it.done ? C.faint : C.text }}>{it.text}</span>
              <button onClick={() => delItem(it)} className="btn" style={{ border: "none", background: "transparent", cursor: "pointer", color: C.faint, padding: 0 }} aria-label="Удалить"><Trash2 size={13} /></button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <input value={newItem} onChange={(e) => setNewItem(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addItem()}
              placeholder="Новый пункт…" style={{ ...st.mdInput, flex: 1 }} className="fin" />
            <button style={st.btnGhost} className="btn" onClick={addItem} disabled={busy || !newItem.trim()}><Plus size={14} /></button>
          </div>
        </div>

        {/* Заметка */}
        <div style={{ ...st.reqField, marginTop: 12 }}>
          <span style={st.reqFieldLbl}>Заметка</span>
          <input style={st.mdInput} className="fin" defaultValue={lead.note || ""} placeholder="комментарий…"
            onBlur={(e) => { if ((e.target.value || "") !== (lead.note || "")) set({ note: e.target.value.trim() || null }); }} />
        </div>

        {err && <div role="alert" style={{ ...st.reqError, marginTop: 10 }}><AlertCircle size={14} /> {err}</div>}
        {busy && <div style={{ fontSize: 12, color: C.faint, marginTop: 8 }}><Loader2 size={12} className="spin" style={{ verticalAlign: -2 }} /> сохранение…</div>}
      </div>
    </div>
  );
}


// ---------------------------------------------------------------- Управление колонками воронки
function StageManager({ C, st, stages, onClose, onReload }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [newName, setNewName] = useState("");

  const act = async (fn) => {
    setBusy(true); setErr("");
    try { await fn(); await onReload(); }
    catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(false); }
  };
  const addStage = () => {
    const n = newName.trim(); if (!n) return;
    const color = STAGE_COLORS[stages.length % STAGE_COLORS.length];
    act(async () => { await createCrmStage({ name: n, color, sort: stages.length }); setNewName(""); });
  };
  // обмен sort с соседом
  const moveStage = (i, dir) => {
    const j = i + dir; if (j < 0 || j >= stages.length) return;
    const a = stages[i], b = stages[j];
    act(async () => { await updateCrmStage(a.id, { sort: b.sort }); await updateCrmStage(b.id, { sort: a.sort }); });
  };

  return (
    <div style={st.mdOverlay} data-modal="1" onClick={onClose}>
      <div style={{ ...st.mdCard, width: "min(560px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>Колонки воронки</div>
          <button style={st.iconBtn} onClick={onClose} aria-label="Закрыть"><X size={17} /></button>
        </div>
        <div style={{ fontSize: 12, color: C.sub, marginBottom: 10 }}>Название, цвет, порядок и флаги «выиграна»/«потеряна» (используются для конверсии и броней).</div>

        <div style={{ display: "grid", gap: 6, maxHeight: 360, overflowY: "auto", marginBottom: 12 }}>
          {stages.map((s, i) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 10, background: C.panel2, border: `1px solid ${C.line}` }}>
              <input type="color" value={s.color || "#5b8def"} disabled={busy}
                onChange={(e) => act(() => updateCrmStage(s.id, { color: e.target.value }))}
                style={{ width: 26, height: 26, border: "none", background: "none", padding: 0, cursor: "pointer", flexShrink: 0 }} />
              <input defaultValue={s.name} disabled={busy}
                onBlur={(e) => { if (e.target.value.trim() && e.target.value !== s.name) act(() => updateCrmStage(s.id, { name: e.target.value.trim() })); }}
                style={{ ...st.mdInput, flex: 1, minWidth: 0 }} className="fin" />
              <button className="btn" title="Выиграна" disabled={busy} onClick={() => act(() => updateCrmStage(s.id, { is_won: !s.is_won, is_lost: false }))}
                style={{ ...st.iconBtn, width: 28, height: 28, color: s.is_won ? C.green : C.faint }}><Trophy size={14} /></button>
              <button className="btn" title="Потеряна" disabled={busy} onClick={() => act(() => updateCrmStage(s.id, { is_lost: !s.is_lost, is_won: false }))}
                style={{ ...st.iconBtn, width: 28, height: 28, color: s.is_lost ? C.danger : C.faint }}><XCircle size={14} /></button>
              <button className="btn" disabled={busy || i === 0} onClick={() => moveStage(i, -1)} style={{ ...st.iconBtn, width: 28, height: 28, opacity: i === 0 ? 0.3 : 1 }} aria-label="Вверх"><ArrowUp size={14} /></button>
              <button className="btn" disabled={busy || i === stages.length - 1} onClick={() => moveStage(i, 1)} style={{ ...st.iconBtn, width: 28, height: 28, opacity: i === stages.length - 1 ? 0.3 : 1 }} aria-label="Вниз"><ArrowDown size={14} /></button>
              <button className="btn" title="Архивировать" disabled={busy}
                onClick={() => { if (window.confirm(`Скрыть колонку «${s.name}»? Карточки в ней останутся, перенесите их заранее.`)) act(() => archiveCrmStage(s.id)); }}
                style={{ ...st.iconBtn, width: 28, height: 28, color: C.danger }}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addStage()}
            placeholder="Новая колонка…" style={{ ...st.mdInput, flex: 1 }} className="fin" />
          <button style={{ ...st.btnGreen, whiteSpace: "nowrap" }} className="btn" onClick={addStage} disabled={busy || !newName.trim()}>
            {busy ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Добавить
          </button>
        </div>
        {err && <div role="alert" style={{ ...st.reqError, marginTop: 10 }}><AlertCircle size={14} /> {err}</div>}
      </div>
    </div>
  );
}


// ---------------------------------------------------------------- Форма новой заявки
function LeadForm({ st, isMobile, halls, stages, locationId, onSaved, onError }) {
  const [openForm, setOpenForm] = useState(false);
  const [f, setF] = useState({ name: "", phone: "", event_type: "Свадьба", hall_id: "", event_date: "", guests: "", budget: "" });
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (busy) return;
    onError("");
    if (!f.name.trim()) return onError("Укажите имя клиента/заявки");
    const firstStage = stages[0];
    if (!firstStage) return onError("Нет колонок воронки — добавьте через «Колонки»");
    setBusy(true);
    try {
      await createCrmLead({
        name: f.name.trim(), phone: f.phone.trim() || null, event_type: f.event_type,
        hall_id: f.hall_id || null, location_id: locationId || null,
        event_date: f.event_date || null, guests: Number(f.guests) || 0,
        budget: Number(f.budget) || 0, stage: "new", stage_id: firstStage.id, source: "Вручную",
      });
      setF({ name: "", phone: "", event_type: "Свадьба", hall_id: "", event_date: "", guests: "", budget: "" });
      setOpenForm(false);
      await onSaved("Заявка добавлена в воронку");
    } catch (e) { onError(e?.message || String(e)); }
    finally { setBusy(false); }
  };

  const txt = { ...st.numInput, width: "100%", textAlign: "left" };
  return (
    <section style={{ ...st.fpCard, marginTop: 0, marginBottom: 16 }}>
      {!openForm ? (
        <button style={st.btnGreen} className="btn glass" onClick={() => setOpenForm(true)}><Plus size={15} /> Новая заявка</button>
      ) : (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ ...st.reqField, minWidth: isMobile ? "100%" : 180 }}>
            <span style={st.reqFieldLbl}>Имя клиента</span>
            <input value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} placeholder="Семья…" style={txt} className="amtIn" />
          </label>
          <label style={st.reqField}>
            <span style={st.reqFieldLbl}>Телефон</span>
            <input value={f.phone} onChange={(e) => setF((p) => ({ ...p, phone: e.target.value }))} placeholder="+992…" style={txt} className="amtIn" />
          </label>
          <label style={st.reqField}>
            <span style={st.reqFieldLbl}>Событие</span>
            <select style={st.reqSelect} value={f.event_type} onChange={(e) => setF((p) => ({ ...p, event_type: e.target.value }))}>{EVENTS.map((x) => <option key={x}>{x}</option>)}</select>
          </label>
          <label style={st.reqField}>
            <span style={st.reqFieldLbl}>Зал</span>
            <select style={st.reqSelect} value={f.hall_id} onChange={(e) => setF((p) => ({ ...p, hall_id: e.target.value }))}>
              <option value="">— не выбран —</option>
              {halls.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </label>
          <label style={st.reqField}>
            <span style={st.reqFieldLbl}>Дата</span>
            <input type="date" value={f.event_date} onChange={(e) => setF((p) => ({ ...p, event_date: e.target.value }))} style={txt} className="amtIn fin" />
          </label>
          <label style={st.reqField}>
            <span style={st.reqFieldLbl}>Гостей</span>
            <input type="number" inputMode="numeric" value={f.guests} onChange={(e) => setF((p) => ({ ...p, guests: e.target.value }))} onWheel={(e) => e.target.blur()} placeholder="0" style={{ ...st.numInput, width: "100%" }} className="amtIn" />
          </label>
          <label style={st.reqField}>
            <span style={st.reqFieldLbl}>Бюджет, TJS</span>
            <input type="number" inputMode="decimal" value={f.budget} onChange={(e) => setF((p) => ({ ...p, budget: e.target.value }))} onWheel={(e) => e.target.blur()} placeholder="0" style={{ ...st.numInput, width: "100%" }} className="amtIn" />
          </label>
          <button style={{ ...st.btnGreen, opacity: busy ? 0.7 : 1 }} className="btn glass" onClick={add} disabled={busy}>
            {busy ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} Добавить
          </button>
          <button style={st.btnGhost} className="btn" onClick={() => setOpenForm(false)}><X size={15} /> Отмена</button>
        </div>
      )}
    </section>
  );
}


// ---------------------------------------------------------------- Форма нового клиента
function ClientForm({ st, isMobile, locationId, onSaved, onError }) {
  const [openForm, setOpenForm] = useState(false);
  const [f, setF] = useState({ name: "", phone: "", tag: "Новый", note: "" });
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (busy) return;
    onError("");
    if (!f.name.trim()) return onError("Укажите имя клиента");
    setBusy(true);
    try {
      await createCrmClient({
        name: f.name.trim(), phone: f.phone.trim() || null,
        tag: f.tag || null, note: f.note.trim() || null, location_id: locationId || null,
      });
      setF({ name: "", phone: "", tag: "Новый", note: "" });
      setOpenForm(false);
      await onSaved("Клиент добавлен в базу");
    } catch (e) { onError(e?.message || String(e)); }
    finally { setBusy(false); }
  };

  const txt = { ...st.numInput, width: "100%", textAlign: "left" };
  return (
    <section style={{ ...st.fpCard, marginTop: 0 }}>
      {!openForm ? (
        <button style={st.btnGreen} className="btn glass" onClick={() => setOpenForm(true)}><Plus size={15} /> Новый клиент</button>
      ) : (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ ...st.reqField, minWidth: isMobile ? "100%" : 180 }}>
            <span style={st.reqFieldLbl}>Имя клиента</span>
            <input value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} placeholder="Семья…" style={txt} className="amtIn" />
          </label>
          <label style={st.reqField}>
            <span style={st.reqFieldLbl}>Телефон</span>
            <input value={f.phone} onChange={(e) => setF((p) => ({ ...p, phone: e.target.value }))} placeholder="+992…" style={txt} className="amtIn" />
          </label>
          <label style={st.reqField}>
            <span style={st.reqFieldLbl}>Метка</span>
            <select style={st.reqSelect} value={f.tag} onChange={(e) => setF((p) => ({ ...p, tag: e.target.value }))}>
              {["Новый", "Повторный", "VIP"].map((x) => <option key={x}>{x}</option>)}
            </select>
          </label>
          <label style={{ ...st.reqField, flex: 1, minWidth: 160 }}>
            <span style={st.reqFieldLbl}>Заметка</span>
            <input value={f.note} onChange={(e) => setF((p) => ({ ...p, note: e.target.value }))} placeholder="комментарий…" style={txt} className="amtIn" />
          </label>
          <button style={{ ...st.btnGreen, opacity: busy ? 0.7 : 1 }} className="btn glass" onClick={add} disabled={busy}>
            {busy ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} Добавить
          </button>
          <button style={st.btnGhost} className="btn" onClick={() => setOpenForm(false)}><X size={15} /> Отмена</button>
        </div>
      )}
    </section>
  );
}
