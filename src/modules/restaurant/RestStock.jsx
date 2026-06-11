import { Package, AlertTriangle } from "lucide-react";
import { STOCK } from "../../data/restaurant";
import { useTheme } from "../../theme/theme";
import { fmt } from "../../utils/format";


export function RestStock() {
  const { C, st } = useTheme();
  const low = STOCK.filter((s) => s.qty < s.min);
  return (<>
    <div style={st.rSectionHead}><Package size={18} color={C.green} /><h3 style={st.reqSectionTitle}>Склад</h3><span style={st.reqSectionSub}>{STOCK.length} позиций{low.length ? ` · ${low.length} заканчивается` : ""}</span></div>
    {low.length > 0 && (
      <div style={st.stockAlert}><AlertTriangle size={16} /> Заканчивается: {low.map((s) => s.name).join(", ")} — пора заказать у поставщика</div>
    )}
    <div style={st.stockList}>
      <div style={{ ...st.stockRow, ...st.stockHead }}>
        <span>Позиция</span><span style={{ textAlign: "right" }}>Остаток</span><span style={{ textAlign: "right" }}>Минимум</span><span style={{ textAlign: "right" }}>Сумма</span>
      </div>
      {STOCK.map((s) => { const lowItem = s.qty < s.min; return (
        <div key={s.id} style={st.stockRow}>
          <span style={st.stockName}>{lowItem && <span style={{ ...st.tableDot, background: C.danger, display: "inline-block", marginRight: 8 }} />}{s.name}</span>
          <span style={{ textAlign: "right", color: lowItem ? C.danger : C.text, fontWeight: lowItem ? 700 : 500, fontVariantNumeric: "tabular-nums" }}>{s.qty} {s.unit}</span>
          <span style={{ textAlign: "right", color: C.faint, fontVariantNumeric: "tabular-nums" }}>{s.min} {s.unit}</span>
          <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(s.qty * s.cost)}</span>
        </div>); })}
    </div>
  </>);
}
