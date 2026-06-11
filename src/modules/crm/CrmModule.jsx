import { useState } from "react";
import { Search, ChevronRight, CalendarDays, Plus, RotateCcw, X, XCircle } from "lucide-react";
import { Stat } from "../../components/common";
import { BOOKINGS_SEED, CRM_CLIENTS, CRM_NEXT, CRM_STAGES, LEADS_SEED } from "../../data/crm";
import { useTheme } from "../../theme/theme";
import { fmt } from "../../utils/format";


export function CrmModule({ view }) {
  const { C, st } = useTheme();
  const [leads, setLeads] = useState(LEADS_SEED);
  const [open, setOpen] = useState({ new: true, show: true, offer: true, contract: true });
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", event: "Свадьба", hall: "ЛЮКС зал", date: "", budget: "" });
  const [formOpen, setFormOpen] = useState(false);

  const HALLS = ["ВИП зал", "ЛЮКС зал", "Grand Hall Марказ", "Fly Garden", "Фемали 1", "Фемали 2"];
  const EVENTS = ["Свадьба", "Туй", "Оши нахор", "Юбилей", "Корпоратив"];

  const advance = (id) => setLeads((ls) => ls.map((l) => (l.id === id && CRM_NEXT[l.stage] ? { ...l, stage: CRM_NEXT[l.stage] } : l)));
  const lose = (id) => setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, stage: "lost" } : l)));
  const revive = (id) => setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, stage: "new" } : l)));
  const addLead = () => {
    if (!form.name.trim()) return;
    setLeads((ls) => [{ id: Date.now(), ...form, budget: Number(form.budget) || 0, guests: 0, stage: "new", source: "Вручную" }, ...ls]);
    setForm((f) => ({ ...f, name: "", phone: "", date: "", budget: "" }));
    setFormOpen(false);
  };

  const inWork = leads.filter((l) => !["won", "lost"].includes(l.stage));
  const won = leads.filter((l) => l.stage === "won");
  const lost = leads.filter((l) => l.stage === "lost");
  const funnelSum = inWork.reduce((a, l) => a + l.budget, 0);
  const closed = won.length + lost.length;
  const conv = closed ? Math.round((won.length / closed) * 100) : 0;

  const SBadge = ({ stage }) => {
    const m = CRM_STAGES.find((s) => s.key === stage);
    return <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 20, whiteSpace: "nowrap", color: m.color, background: `${m.color}1a` }}>{m.label}</span>;
  };

  const LeadCard = ({ l }) => (
    <div style={{ padding: "13px 0", borderBottom: `1px solid ${C.line}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{l.name}</div>
          <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}>{l.phone} · источник: {l.source}</div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{l.budget ? fmt(l.budget) : "—"} <span style={st.locUnit}>TJS</span></div>
          <div style={{ fontSize: 11, color: C.sub }}>{l.guests ? `${l.guests} гостей` : ""}</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6, fontSize: 12, color: C.sub, flexWrap: "wrap" }}>
        <span>{l.event} · {l.hall}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><CalendarDays size={12} /> {l.date || "дата не выбрана"}</span>
      </div>
      {l.note && <div style={{ fontSize: 11.5, color: C.danger, marginTop: 6 }}>{l.note}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        {CRM_NEXT[l.stage] && (
          <button style={{ ...st.btnGreen, padding: "7px 12px" }} className="btn" onClick={() => advance(l.id)}>
            <ChevronRight size={14} /> {CRM_STAGES.find((s) => s.key === CRM_NEXT[l.stage]).label}
          </button>
        )}
        {!["won", "lost"].includes(l.stage) && (
          <button style={{ ...st.btnGhost, padding: "7px 12px", color: C.danger }} className="btn" onClick={() => lose(l.id)}><XCircle size={14} /> Потеряна</button>
        )}
        {l.stage === "lost" && (
          <button style={{ ...st.btnGhost, padding: "7px 12px" }} className="btn" onClick={() => revive(l.id)}><RotateCcw size={14} /> Вернуть в воронку</button>
        )}
      </div>
    </div>
  );

  // ============ ВОРОНКА ============
  if (view !== "c_clients" && view !== "c_bookings") {
    return (<>
      <section style={st.hero}>
        <div style={st.heroGlow} />
        <div style={st.heroContent}>
          <div style={st.heroTop}>
            <div><div style={st.heroLabel}>CRM · воронка продаж банкетов</div><div style={st.heroTitle}>Июнь — август 2026</div></div>
          </div>
          <div style={st.heroStats}>
            <Stat label="Заявок в работе" value={String(inWork.length)} unit="" />
            <Stat label="Сумма воронки" value={fmt(funnelSum)} unit="TJS" accent />
            <Stat label="Конверсия в банкет" value={`${conv}%`} unit="" />
            <Stat label="Потеряно" value={String(lost.length)} unit="" />
          </div>
        </div>
      </section>

      <section style={{ ...st.fpCard, marginTop: 0, marginBottom: 16 }}>
        {!formOpen ? (
          <button style={st.btnGreen} className="btn" onClick={() => setFormOpen(true)}><Plus size={15} /> Новая заявка</button>
        ) : (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ ...st.reqField, minWidth: 180 }}>
              <span style={st.reqFieldLbl}>Имя клиента</span>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Семья…" style={{ ...st.numInput, width: "100%", textAlign: "left" }} className="amtIn" />
            </label>
            <label style={st.reqField}>
              <span style={st.reqFieldLbl}>Телефон</span>
              <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+992…" style={{ ...st.numInput, width: "100%", textAlign: "left" }} className="amtIn" />
            </label>
            <label style={st.reqField}>
              <span style={st.reqFieldLbl}>Событие</span>
              <select style={st.reqSelect} value={form.event} onChange={(e) => setForm((f) => ({ ...f, event: e.target.value }))}>{EVENTS.map((x) => <option key={x}>{x}</option>)}</select>
            </label>
            <label style={st.reqField}>
              <span style={st.reqFieldLbl}>Зал</span>
              <select style={st.reqSelect} value={form.hall} onChange={(e) => setForm((f) => ({ ...f, hall: e.target.value }))}>{HALLS.map((x) => <option key={x}>{x}</option>)}</select>
            </label>
            <label style={st.reqField}>
              <span style={st.reqFieldLbl}>Дата</span>
              <input value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} placeholder="напр. 12 июл" style={{ ...st.numInput, width: "100%", textAlign: "left" }} className="amtIn" />
            </label>
            <label style={st.reqField}>
              <span style={st.reqFieldLbl}>Бюджет, TJS</span>
              <input type="number" inputMode="decimal" value={form.budget} onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))} onWheel={(e) => e.target.blur()} placeholder="0" style={{ ...st.numInput, width: "100%" }} className="amtIn" />
            </label>
            <button style={st.btnGreen} className="btn" onClick={addLead}><Plus size={15} /> Добавить</button>
            <button style={st.btnGhost} className="btn" onClick={() => setFormOpen(false)}><X size={15} /> Отмена</button>
          </div>
        )}
      </section>

      <div style={st.incList}>
        {CRM_STAGES.map((s) => {
          const items = leads.filter((l) => l.stage === s.key);
          const sum = items.reduce((a, l) => a + l.budget, 0);
          const isOpen = !!open[s.key];
          return (
            <div key={s.key} style={st.locCard}>
              <div style={st.locHead} className="locHead" onClick={() => setOpen((o) => ({ ...o, [s.key]: !o[s.key] }))}>
                <div style={{ ...st.locDot, background: s.color }} />
                <div style={st.locTitle}>
                  <div style={st.locName}>{s.label}</div>
                  <div style={st.locCode}>{items.length} заявок</div>
                </div>
                <div style={st.locRight}>
                  <div style={st.locSum}>{fmt(sum)} <span style={st.locUnit}>TJS</span></div>
                </div>
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
    const TAG_COLOR = { VIP: "#e8911c", "Повторный": "#5bd6c9", "Новый": "#5b8def" };
    const q = query.trim().toLowerCase();
    const shown = CRM_CLIENTS.filter((c) => !q || c.name.toLowerCase().includes(q) || c.phone.includes(q));
    const totalLtv = CRM_CLIENTS.reduce((a, c) => a + c.total, 0);
    return (<>
      <section style={st.hero}>
        <div style={st.heroGlow} />
        <div style={st.heroContent}>
          <div style={st.heroTop}>
            <div><div style={st.heroLabel}>CRM · база клиентов сети</div><div style={st.heroTitle}>Клиенты</div></div>
          </div>
          <div style={st.heroStats}>
            <Stat label="Клиентов в базе" value={String(CRM_CLIENTS.length)} unit="" />
            <Stat label="Принесли всего" value={fmt(totalLtv)} unit="TJS" accent />
            <Stat label="VIP" value={String(CRM_CLIENTS.filter((c) => c.tag === "VIP").length)} unit="" />
            <Stat label="Повторных" value={String(CRM_CLIENTS.filter((c) => c.tag === "Повторный").length)} unit="" />
          </div>
        </div>
      </section>
      <div style={{ ...st.searchWrap, maxWidth: "100%", marginBottom: 14 }}>
        <Search size={16} color={C.faint} />
        <input style={st.search} placeholder="Поиск по имени или телефону…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div style={st.incList}>
        {shown.map((c) => (
          <div key={c.id} style={{ ...st.locCard, padding: "14px 18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14.5, fontWeight: 700 }}>{c.name}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 20, color: TAG_COLOR[c.tag], background: `${TAG_COLOR[c.tag]}1a` }}>{c.tag}</span>
                </div>
                <div style={{ fontSize: 11.5, color: C.faint, marginTop: 3 }}>{c.phone} · последний: {c.last}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{fmt(c.total)} <span style={st.locUnit}>TJS</span></div>
                <div style={{ fontSize: 11, color: C.sub }}>{c.events} банкета(ов)</div>
              </div>
            </div>
          </div>
        ))}
        {shown.length === 0 && <div style={st.empty}>Никого не нашли по запросу «{query}»</div>}
      </div>
    </>);
  }

  // ============ БРОНИ ЗАЛОВ ============
  const B_META = {
    confirmed: { label: "Подтверждена", color: C.green },
    prepaid: { label: "Предоплата", color: "#e8911c" },
    hold: { label: "Ожидает решения", color: "#5b8def" },
    free: { label: "Свободно", color: C.faint },
  };
  const busyCount = BOOKINGS_SEED.flatMap((d) => d.items).filter((i) => i.status !== "free").length;
  return (<>
    <section style={st.hero}>
      <div style={st.heroGlow} />
      <div style={st.heroContent}>
        <div style={st.heroTop}>
          <div><div style={st.heroLabel}>CRM · брони залов по датам</div><div style={st.heroTitle}>Июнь 2026</div></div>
        </div>
        <div style={st.heroStats}>
          <Stat label="Броней в июне" value={String(busyCount)} unit="" accent />
          <Stat label="Гостей суммарно" value={String(BOOKINGS_SEED.flatMap((d) => d.items).reduce((a, i) => a + i.guests, 0))} unit="" />
          <Stat label="Дат с событиями" value={String(BOOKINGS_SEED.length)} unit="" />
        </div>
      </div>
    </section>
    <div style={st.incList}>
      {BOOKINGS_SEED.map((d) => (
        <div key={d.date} style={st.locCard}>
          <div style={{ ...st.locHead, cursor: "default" }}>
            <CalendarDays size={17} color={C.green} />
            <div style={st.locTitle}><div style={st.locName}>{d.date}</div></div>
          </div>
          <div style={st.locBody}>
            {d.items.map((i, idx) => { const m = B_META[i.status]; return (
              <div key={idx} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", borderBottom: `1px solid ${C.line}` }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: m.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{i.hall}</div>
                  <div style={{ fontSize: 11.5, color: i.status === "free" ? C.faint : C.sub }}>{i.client !== "—" ? `${i.client} · ` : ""}{i.event}{i.guests ? ` · ${i.guests} гостей` : ""}</div>
                </div>
                <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 20, color: m.color, background: `${m.color}1a`, flexShrink: 0 }}>{m.label}</span>
              </div>); })}
          </div>
        </div>
      ))}
    </div>
    <div style={st.vibeNote}>
      <b style={{ color: C.green }}>Свободные субботы — упущенный доход:</b> 20 июня свободны ВИП зал и Grand Hall.
      Это задача отделу продаж: предложить скидку на свободные даты тем, кто в воронке на этапе «Смета и КП».
    </div>
  </>);
}
