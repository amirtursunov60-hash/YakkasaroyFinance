import { useState, useEffect, useCallback } from "react";
import {
  Search, ChevronRight, CalendarDays, Plus, RotateCcw, X, XCircle,
  Loader2, AlertCircle, CheckCircle2,
} from "lucide-react";
import { Stat } from "../../components/common";
import { useTheme } from "../../theme/theme";
import { usePeriod } from "../../lib/PeriodCtx";
import { fmt } from "../../utils/format";
import {
  fetchCrmLeads, fetchCrmClients, fetchCrmHalls, createCrmLead,
  setCrmLeadStage, createCrmClient,
} from "../../lib/api";

// Этапы воронки банкетов (домен ХМС/CRM — справочная конфигурация)
const CRM_STAGES = [
  { key: "new", label: "Новая заявка", color: "#5b8def" },
  { key: "show", label: "Показ зала", color: "#9c6ade" },
  { key: "offer", label: "Смета и КП", color: "#e8911c" },
  { key: "contract", label: "Договор и предоплата", color: "#5bd6c9" },
  { key: "won", label: "Банкет проведён", color: "#1fd65f" },
  { key: "lost", label: "Потеряна", color: "#ff6b5e" },
];
const CRM_NEXT = { new: "show", show: "offer", offer: "contract", contract: "won" };
const EVENTS = ["Свадьба", "Туй", "Оши нахор", "Юбилей", "Корпоратив"];

const fmtDate = (iso) => iso ? new Date(iso + "T00:00:00").toLocaleDateString("ru-RU", { day: "2-digit", month: "short" }) : "дата не выбрана";

export function CrmModule({ view }) {
  const { C, st, isMobile } = useTheme();
  const { locationId } = usePeriod();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(null);
  const [leads, setLeads] = useState([]);
  const [clients, setClients] = useState([]);
  const [halls, setHalls] = useState([]);
  const [open, setOpen] = useState({ new: true, show: true, offer: true, contract: true });
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setErr("");
    try {
      const [ls, cs, hs] = await Promise.all([fetchCrmLeads(), fetchCrmClients(), fetchCrmHalls()]);
      setLeads(ls); setClients(cs); setHalls(hs);
    } catch (e) {
      setErr("Не удалось загрузить CRM: " + (e?.message || e));
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const hallName = (id) => halls.find((h) => h.id === id)?.name || "";

  const move = async (lead, stage) => {
    setBusy(`mv:${lead.id}`); setErr(""); setDone("");
    try { await setCrmLeadStage(lead.id, stage); await load(); }
    catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  if (loading) return <div style={st.empty}><Loader2 size={18} className="spin" /> Загрузка…</div>;

  const banners = (<>
    {err && <div role="alert" style={{ ...st.reqError, marginBottom: 14 }}><AlertCircle size={15} /> {err}</div>}
    {done && <div style={{ ...st.reqSuccess, marginBottom: 14 }}><CheckCircle2 size={15} /> {done}</div>}
  </>);

  // ============ ВОРОНКА ============
  if (view !== "c_clients" && view !== "c_bookings") {
    const inWork = leads.filter((l) => !["won", "lost"].includes(l.stage));
    const won = leads.filter((l) => l.stage === "won");
    const lost = leads.filter((l) => l.stage === "lost");
    const funnelSum = inWork.reduce((a, l) => a + Number(l.budget || 0), 0);
    const closed = won.length + lost.length;
    const conv = closed ? Math.round((won.length / closed) * 100) : 0;

    const LeadCard = ({ l }) => (
      <div style={{ padding: "13px 0", borderBottom: `1px solid ${C.line}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{l.name}</div>
            <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}>{l.phone || "—"}{l.source ? ` · источник: ${l.source}` : ""}</div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{l.budget ? fmt(l.budget) : "—"} <span style={st.locUnit}>TJS</span></div>
            <div style={{ fontSize: 11, color: C.sub }}>{l.guests ? `${l.guests} гостей` : ""}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6, fontSize: 12, color: C.sub, flexWrap: "wrap" }}>
          <span>{[l.event_type, hallName(l.hall_id)].filter(Boolean).join(" · ") || "—"}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><CalendarDays size={12} /> {fmtDate(l.event_date)}</span>
        </div>
        {l.note && <div style={{ fontSize: 11.5, color: C.danger, marginTop: 6 }}>{l.note}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {CRM_NEXT[l.stage] && (
            <button style={{ ...st.btnGreen, padding: "7px 12px" }} className="btn glass" disabled={!!busy} onClick={() => move(l, CRM_NEXT[l.stage])}>
              {busy === `mv:${l.id}` ? <Loader2 size={14} className="spin" /> : <ChevronRight size={14} />} {CRM_STAGES.find((s) => s.key === CRM_NEXT[l.stage]).label}
            </button>
          )}
          {!["won", "lost"].includes(l.stage) && (
            <button style={{ ...st.btnGhost, padding: "7px 12px", color: C.danger }} className="btn" disabled={!!busy} onClick={() => move(l, "lost")}><XCircle size={14} /> Потеряна</button>
          )}
          {l.stage === "lost" && (
            <button style={{ ...st.btnGhost, padding: "7px 12px" }} className="btn" disabled={!!busy} onClick={() => move(l, "new")}><RotateCcw size={14} /> Вернуть в воронку</button>
          )}
        </div>
      </div>
    );

    return (<>
      <section style={st.hero}>
        <div style={st.heroGlow} />
        <div style={st.heroContent}>
          <div style={st.heroTop}>
            <div><div style={st.heroLabel}>CRM · воронка продаж банкетов</div><div style={st.heroTitle}>Воронка</div></div>
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

      <LeadForm st={st} isMobile={isMobile} halls={halls} locationId={locationId}
        onSaved={async (msg) => { await load(); setDone(msg); }} onError={setErr} />

      <div style={st.incList}>
        {CRM_STAGES.map((s) => {
          const items = leads.filter((l) => l.stage === s.key);
          const sum = items.reduce((a, l) => a + Number(l.budget || 0), 0);
          const isOpen = !!open[s.key];
          return (
            <div key={s.key} style={st.locCard}>
              <div style={st.locHead} className="locHead" onClick={() => setOpen((o) => ({ ...o, [s.key]: !o[s.key] }))}>
                <div style={{ ...st.locDot, background: s.color }} />
                <div style={st.locTitle}>
                  <div style={st.locName}>{s.label}</div>
                  <div style={st.locCode}>{items.length} заявок</div>
                </div>
                <div style={st.locRight}><div style={st.locSum}>{fmt(sum)} <span style={st.locUnit}>TJS</span></div></div>
                <span style={{ ...st.locChevron, transform: isOpen ? "rotate(90deg)" : "none" }}><ChevronRight size={18} /></span>
              </div>
              {isOpen && items.length > 0 && (
                <div style={{ ...st.locBody, padding: "4px 18px" }}>
                  {items.map((l) => <LeadCard key={l.id} l={l} />)}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={st.vibeNote}>
        <b style={{ color: C.green }}>Где теряются деньги:</b> самый дорогой провал — между «Сметой» и «Договором».
        Правило: КП отправлено — звонок через 24 часа, не жди, пока клиент «подумает» у конкурента.
      </div>
    </>);
  }

  // ============ БАЗА КЛИЕНТОВ ============
  if (view === "c_clients") {
    const TAG_COLOR = { VIP: C.warning, "Повторный": C.teal, "Новый": C.info };
    // Агрегаты по клиенту из проведённых банкетов (won-заявки с client_id)
    const agg = {};
    for (const l of leads) {
      if (!l.client_id || l.stage !== "won") continue;
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
  const B_META = {
    confirmed: { label: "Подтверждена", color: C.green },
    prepaid: { label: "Предоплата", color: C.warning },
    hold: { label: "Ожидает решения", color: C.info },
  };
  const STAGE_TO_STATUS = { won: "confirmed", contract: "prepaid", offer: "hold", show: "hold" };
  const bookingLeads = leads.filter((l) => l.hall_id && l.event_date && STAGE_TO_STATUS[l.stage]);
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
    {dates.length === 0 && <div style={st.empty}>Броней пока нет — заявки с залом и датой на этапе «Смета и КП» и далее попадут сюда</div>}
    <div style={st.incList}>
      {dates.map((d) => (
        <div key={d} style={st.locCard}>
          <div style={{ ...st.locHead, cursor: "default" }}>
            <CalendarDays size={17} color={C.green} />
            <div style={st.locTitle}><div style={st.locName}>{new Date(d + "T00:00:00").toLocaleDateString("ru-RU", { day: "2-digit", month: "long", weekday: "long" })}</div></div>
          </div>
          <div style={st.locBody}>
            {byDate[d].map((l) => { const m = B_META[STAGE_TO_STATUS[l.stage]]; return (
              <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", borderBottom: `1px solid ${C.line}` }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: m.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{hallName(l.hall_id)}</div>
                  <div style={{ fontSize: 11.5, color: C.sub }}>{l.name} · {l.event_type || "—"}{l.guests ? ` · ${l.guests} гостей` : ""}</div>
                </div>
                <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 20, color: m.color, background: `${m.color}1a`, flexShrink: 0 }}>{m.label}</span>
              </div>); })}
          </div>
        </div>
      ))}
    </div>
  </>);
}


// ---------------------------------------------------------------- Форма новой заявки
function LeadForm({ st, isMobile, halls, locationId, onSaved, onError }) {
  const [openForm, setOpenForm] = useState(false);
  const [f, setF] = useState({ name: "", phone: "", event_type: "Свадьба", hall_id: "", event_date: "", guests: "", budget: "" });
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (busy) return;
    onError("");
    if (!f.name.trim()) return onError("Укажите имя клиента/заявки");
    setBusy(true);
    try {
      await createCrmLead({
        name: f.name.trim(), phone: f.phone.trim() || null, event_type: f.event_type,
        hall_id: f.hall_id || null, location_id: locationId || null,
        event_date: f.event_date || null, guests: Number(f.guests) || 0,
        budget: Number(f.budget) || 0, stage: "new", source: "Вручную",
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
