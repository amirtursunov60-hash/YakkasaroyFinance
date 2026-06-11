import { useState } from "react";
import { CalendarDays, Check, Banknote, AlertTriangle } from "lucide-react";
import { Stat } from "../../components/common";
import { SUPPLIER_INVOICES } from "../../data/crm";
import { useTheme } from "../../theme/theme";
import { fmt } from "../../utils/format";


export function Suppliers() {
  const { C, st } = useTheme();
  const [rows, setRows] = useState(SUPPLIER_INVOICES);
  const [filter, setFilter] = useState("unpaid");
  const META = {
    new: { label: "Новый", color: "#5b8def" },
    approved: { label: "Одобрен к оплате", color: "#e8911c" },
    overdue: { label: "Просрочен", color: C.danger },
    paid: { label: "Оплачен", color: C.green },
  };
  const approve = (id) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: "approved" } : r)));
  const pay = (id) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: "paid" } : r)));
  const unpaid = rows.filter((r) => r.status !== "paid");
  const sums = {
    toPay: unpaid.reduce((a, r) => a + r.amount, 0),
    overdue: rows.filter((r) => r.status === "overdue").reduce((a, r) => a + r.amount, 0),
    paid: rows.filter((r) => r.status === "paid").reduce((a, r) => a + r.amount, 0),
  };
  const TABS = [
    { key: "unpaid", label: "К оплате", n: unpaid.length },
    { key: "overdue", label: "Просроченные", n: rows.filter((r) => r.status === "overdue").length },
    { key: "paid", label: "Оплаченные", n: rows.filter((r) => r.status === "paid").length },
    { key: "all", label: "Все", n: rows.length },
  ];
  const shown = rows.filter((r) => filter === "all" ? true : filter === "unpaid" ? r.status !== "paid" : r.status === filter);
  return (<>
    <section style={st.hero}>
      <div style={st.heroGlow} />
      <div style={st.heroContent}>
        <div style={st.heroTop}>
          <div><div style={st.heroLabel}>Счета поставщиков · входящие счета на оплату</div><div style={st.heroTitle}>Июнь 2026</div></div>
        </div>
        <div style={st.heroStats}>
          <Stat label="К оплате" value={fmt(sums.toPay)} unit="TJS" accent />
          <Stat label="Просрочено" value={fmt(sums.overdue)} unit="TJS" />
          <Stat label="Оплачено за месяц" value={fmt(sums.paid)} unit="TJS" />
          <Stat label="Счетов" value={String(rows.length)} unit="" />
        </div>
      </div>
    </section>
    {sums.overdue > 0 && (
      <div style={st.stockAlert}><AlertTriangle size={16} /> Есть просроченные счета на {fmt(sums.overdue)} TJS — портится отношение поставщика и условия</div>
    )}
    <div style={st.reqTabs}>
      {TABS.map((t) => (
        <button key={t.key} style={{ ...st.reqTab, ...(filter === t.key ? st.reqTabOn : {}) }} onClick={() => setFilter(t.key)} className="btn">
          {t.label} <span style={st.reqTabN}>{t.n}</span>
        </button>
      ))}
    </div>
    <div style={st.incList}>
      {shown.map((r) => { const m = META[r.status]; return (
        <div key={r.id} style={{ ...st.locCard, padding: "14px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>{r.supplier}</div>
              <div style={{ fontSize: 11.5, color: C.faint, marginTop: 3 }}>Счёт {r.number} от {r.date} · {r.kind} · {r.point}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{fmt(r.amount)} <span style={st.locUnit}>TJS</span></div>
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 20, color: m.color, background: `${m.color}1a` }}>{m.label}</span>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, gap: 10, flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: r.status === "overdue" ? C.danger : C.sub }}>
              <CalendarDays size={13} /> оплатить до {r.due}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              {r.status === "new" && <button style={st.btnGhost} className="btn" onClick={() => approve(r.id)}><Check size={14} /> Одобрить</button>}
              {r.status !== "paid" && <button style={st.btnGreen} className="btn" onClick={() => pay(r.id)}><Banknote size={14} /> Оплатить</button>}
            </div>
          </div>
        </div>); })}
      {shown.length === 0 && <div style={st.empty}>Счетов в этом списке нет</div>}
    </div>
  </>);
}
