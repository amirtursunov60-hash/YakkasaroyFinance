import { useState } from "react";
import { Banknote } from "lucide-react";
import { Stat } from "../../components/common";
import { CLIENT_INVOICES } from "../../data/crm";
import { useTheme } from "../../theme/theme";
import { fmt } from "../../utils/format";


export function Clients() {
  const { C, st } = useTheme();
  const [rows, setRows] = useState(CLIENT_INVOICES);
  const statusOf = (r) => (r.paid >= r.amount ? "paid" : r.paid > 0 ? "partial" : "sent");
  const META = {
    sent: { label: "Выставлен", color: "#5b8def" },
    partial: { label: "Предоплата", color: "#e8911c" },
    paid: { label: "Оплачен полностью", color: C.green },
  };
  const acceptRest = (id) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, paid: r.amount } : r)));
  const sums = {
    billed: rows.reduce((a, r) => a + r.amount, 0),
    received: rows.reduce((a, r) => a + r.paid, 0),
  };
  const debt = sums.billed - sums.received;
  return (<>
    <section style={st.hero}>
      <div style={st.heroGlow} />
      <div style={st.heroContent}>
        <div style={st.heroTop}>
          <div><div style={st.heroLabel}>Счета клиентам · банкеты и мероприятия</div><div style={st.heroTitle}>Июнь 2026</div></div>
        </div>
        <div style={st.heroStats}>
          <Stat label="Выставлено" value={fmt(sums.billed)} unit="TJS" />
          <Stat label="Получено" value={fmt(sums.received)} unit="TJS" accent />
          <Stat label="Осталось собрать" value={fmt(debt)} unit="TJS" />
          <Stat label="Банкетов в работе" value={String(rows.length)} unit="" />
        </div>
      </div>
    </section>
    <div style={st.incList}>
      {rows.map((r) => {
        const code = statusOf(r); const m = META[code];
        const rest = r.amount - r.paid;
        const pct = Math.min(100, Math.round((r.paid / r.amount) * 100));
        return (
          <div key={r.id} style={{ ...st.locCard, padding: "14px 18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700 }}>{r.client}</div>
                <div style={{ fontSize: 11.5, color: C.faint, marginTop: 3 }}>{r.event} · дата банкета {r.date}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{fmt(r.amount)} <span style={st.locUnit}>TJS</span></div>
                <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 20, color: m.color, background: `${m.color}1a` }}>{m.label}</span>
              </div>
            </div>
            <div style={{ ...st.bar, marginTop: 12 }}><div style={{ ...st.barFill, width: `${pct}%`, background: m.color }} /></div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: C.sub }}>оплачено {fmt(r.paid)} · {pct}%{rest > 0 ? ` · остаток ${fmt(rest)}` : ""}</span>
              {rest > 0 && <button style={st.btnGreen} className="btn" onClick={() => acceptRest(r.id)}><Banknote size={14} /> Принять доплату {fmt(rest)}</button>}
            </div>
          </div>
        );
      })}
    </div>
    <div style={st.vibeNote}>
      <b style={{ color: C.green }}>Правило банкетов:</b> предоплата фиксирует дату, остаток принимается не позднее дня мероприятия.
      Дебиторка по банкетам — самые лёгкие деньги к потере, держи её на нуле.
    </div>
  </>);
}
