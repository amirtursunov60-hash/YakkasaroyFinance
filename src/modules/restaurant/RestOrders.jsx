import { useState } from "react";
import { Plus } from "lucide-react";
import { ORDERS_SEED } from "../../data/restaurant";
import { useTheme } from "../../theme/theme";
import { fmt } from "../../utils/format";


// ============================================================ РЕСТОРАН

export function RestOrders() {
  const { C, st } = useTheme();
  const [orders, setOrders] = useState(ORDERS_SEED);
  const FLOW = { new: "cooking", cooking: "ready", ready: "served" };
  const META = {
    new: { label: "Новый", color: "#5b8def", next: "Принять на кухню" },
    cooking: { label: "Готовится", color: "#e8911c", next: "Готово" },
    ready: { label: "Готово", color: C.green, next: "Подать" },
    served: { label: "Подано", color: C.sub, next: null },
  };
  const advance = (id) => setOrders((os) => os.map((o) => (o.id === id && FLOW[o.status] ? { ...o, status: FLOW[o.status] } : o)));
  const active = orders.filter((o) => o.status !== "served");
  const dayTotal = orders.reduce((a, o) => a + o.sum, 0);

  return (<>
    <section style={st.incHero}>
      <div style={st.incHeroGlow} />
      <div style={st.incHeroInner}>
        <div>
          <div style={st.incHeroLabel}>Активные заказы · смена 10 июн</div>
          <div style={st.incHeroValue}>{active.length} <span style={st.incHeroUnit}>в работе</span></div>
          <div style={st.incHeroSub}>Выручка по заказам за день: <b style={{ color: C.green }}>{fmt(dayTotal)} TJS</b></div>
        </div>
        <button style={st.btnGreen} className="btn"><Plus size={15} /> Новый заказ</button>
      </div>
    </section>

    <div style={st.ordGrid}>
      {orders.map((o) => { const m = META[o.status]; return (
        <div key={o.id} style={{ ...st.ordCard, opacity: o.status === "served" ? 0.6 : 1 }}>
          <div style={st.ordTop}>
            <div><div style={st.ordTable}>{o.table}</div><div style={st.ordMeta}>№{o.id} · {o.waiter} · {o.time}</div></div>
            <span style={{ ...st.ordBadge, color: m.color, background: `${m.color}1a` }}>{m.label}</span>
          </div>
          <div style={st.ordItems}>
            {o.items.map((it, i) => <div key={i} style={st.ordItem}><span>{it.n}</span><span style={st.ordQty}>×{it.q}</span></div>)}
          </div>
          <div style={st.ordFoot}>
            <span style={st.ordSum}>{fmt(o.sum)} TJS</span>
            {m.next && <button style={{ ...st.btnGreen, padding: "8px 13px" }} className="btn" onClick={() => advance(o.id)}>{m.next}</button>}
          </div>
        </div>); })}
    </div>
  </>);
}
