import { useState, useMemo } from "react";
import { BarsChart } from "../../components/charts/BarsChart";
import { Stat } from "../../components/common";
import { DDS_CATS, DDS_IN, DDS_OUT, PNL_ROWS, POINTS_PNL } from "../../data/reports";
import { useTheme } from "../../theme/theme";
import { fmt } from "../../utils/format";
import { weekLabels } from "../../utils/stats";


export function Reports() {
  const { C, st } = useTheme();
  const [tab, setTab] = useState("dds");
  const labels = useMemo(() => weekLabels(8), []);
  const TABS = [
    { key: "dds", label: "ДДС · движение денег" },
    { key: "pnl", label: "P&L · прибыль и убытки" },
    { key: "points", label: "По точкам" },
  ];
  const ddsIn = DDS_IN.reduce((a, b) => a + b, 0);
  const ddsOut = DDS_OUT.reduce((a, b) => a + b, 0);
  const net = ddsIn - ddsOut;
  const revenue = PNL_ROWS[0].v;
  const pctOf = (v) => Math.round((Math.abs(v) / revenue) * 100);

  return (<>
    <section style={st.hero}>
      <div style={st.heroGlow} />
      <div style={st.heroContent}>
        <div style={st.heroTop}>
          <div><div style={st.heroLabel}>Управленческие отчёты · сеть Яккасарой</div><div style={st.heroTitle}>Май — июнь 2026</div></div>
        </div>
        <div style={st.heroStats}>
          <Stat label="Поступления 8 нед." value={fmt(ddsIn)} unit="тыс." />
          <Stat label="Выплаты 8 нед." value={fmt(ddsOut)} unit="тыс." />
          <Stat label="Чистый денежный поток" value={fmt(net)} unit="тыс." accent />
          <Stat label="Чистая маржа (май)" value={`${(674 / 4856 * 100).toFixed(1)}%`} unit="" />
        </div>
      </div>
    </section>

    <div style={st.reqTabs}>
      {TABS.map((t) => (
        <button key={t.key} style={{ ...st.reqTab, ...(tab === t.key ? st.reqTabOn : {}) }} onClick={() => setTab(t.key)} className="btn">{t.label}</button>
      ))}
    </div>

    {tab === "dds" && (<>
      <section style={{ ...st.fpCard, marginTop: 0 }}>
        <div style={{ display: "flex", gap: 16, marginBottom: 10, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.sub }}><span style={{ width: 10, height: 10, borderRadius: 3, background: C.green }} /> Поступления</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.sub }}><span style={{ width: 10, height: 10, borderRadius: 3, background: C.danger }} /> Выплаты</span>
          <span style={{ fontSize: 12, color: C.faint }}>· тыс. TJS по неделям</span>
        </div>
        <div style={{ color: C.text }}><BarsChart a={DDS_IN} b={DDS_OUT} colorA={C.green} colorB={C.danger} /></div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
          {labels.map((l) => <span key={l} style={{ fontSize: 9.5, color: C.faint }}>{l}</span>)}
        </div>
      </section>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: 14, marginTop: 16 }}>
        <div style={{ ...st.locCard, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8, color: C.green }}>Поступления · май</div>
          {DDS_CATS.income.map((r) => (
            <div key={r.label} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.line}`, fontSize: 13 }}>
              <span>{r.label}</span><span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{r.v.toLocaleString("ru-RU")}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, fontSize: 14, fontWeight: 800 }}>
            <span>Итого</span><span style={{ color: C.green }}>{DDS_CATS.income.reduce((a, r) => a + r.v, 0).toLocaleString("ru-RU")} тыс.</span>
          </div>
        </div>
        <div style={{ ...st.locCard, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8, color: C.danger }}>Выплаты · май</div>
          {DDS_CATS.outcome.map((r) => (
            <div key={r.label} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.line}`, fontSize: 13 }}>
              <span>{r.label}</span><span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{r.v.toLocaleString("ru-RU")}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, fontSize: 14, fontWeight: 800 }}>
            <span>Итого</span><span style={{ color: C.danger }}>{DDS_CATS.outcome.reduce((a, r) => a + r.v, 0).toLocaleString("ru-RU")} тыс.</span>
          </div>
        </div>
      </div>
    </>)}

    {tab === "pnl" && (
      <section style={{ ...st.fpCard, marginTop: 0 }}>
        <div style={{ fontSize: 12, color: C.faint, marginBottom: 12 }}>Май 2026 · тыс. TJS · процент от выручки</div>
        {PNL_ROWS.map((r) => (
          <div key={r.label} style={{ padding: "9px 0", borderBottom: `1px solid ${C.line}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: r.bold ? 14.5 : 13.5, fontWeight: r.bold ? 800 : 500 }}>
              <span style={{ color: r.accent ? C.green : C.text }}>{r.label}</span>
              <span style={{ fontVariantNumeric: "tabular-nums", color: r.v < 0 ? C.danger : r.accent ? C.green : C.text }}>
                {r.v < 0 ? "−" : ""}{Math.abs(r.v).toLocaleString("ru-RU")} <span style={{ fontSize: 11, color: C.faint }}>· {pctOf(r.v)}%</span>
              </span>
            </div>
            <div style={{ ...st.bar, marginTop: 6, maxWidth: "100%" }}>
              <div style={{ ...st.barFill, width: `${pctOf(r.v)}%`, background: r.v < 0 ? C.danger : C.green, opacity: r.bold ? 1 : 0.55 }} />
            </div>
          </div>
        ))}
      </section>
    )}

    {tab === "points" && (
      <div style={st.incList}>
        {POINTS_PNL.map((p) => {
          const profit = p.rev - p.exp;
          const margin = Math.round((profit / p.rev) * 100);
          return (
            <div key={p.name} style={{ ...st.locCard, padding: "14px 18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontSize: 14.5, fontWeight: 700 }}>{p.name}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: C.green, fontVariantNumeric: "tabular-nums" }}>+{profit.toLocaleString("ru-RU")} тыс. <span style={{ fontSize: 11.5, color: C.sub }}>· маржа {margin}%</span></div>
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12.5, color: C.sub, flexWrap: "wrap" }}>
                <span>Выручка <b style={{ color: C.text }}>{p.rev.toLocaleString("ru-RU")}</b></span>
                <span>Расходы <b style={{ color: C.text }}>{p.exp.toLocaleString("ru-RU")}</b></span>
              </div>
              <div style={{ ...st.bar, marginTop: 10, maxWidth: "100%" }}><div style={{ ...st.barFill, width: `${margin}%` }} /></div>
            </div>
          );
        })}
        <div style={st.vibeNote}>
          <b style={{ color: C.green }}>Что смотреть владельцу:</b> маржа точки ниже 15% — повод разобраться в фудкосте и ФОТ этой точки,
          а не сети в целом. Кейтринг даёт лучшую маржу при минимальных вложениях — кандидат на масштабирование.
        </div>
      </div>
    )}
  </>);
}
