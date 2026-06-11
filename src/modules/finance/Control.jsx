import { useState } from "react";
import { Banknote, Save, AlertTriangle } from "lucide-react";
import { Stat } from "../../components/common";
import { CONTROL_INIT } from "../../data/finance";
import { useTheme } from "../../theme/theme";
import { fmt } from "../../utils/format";

export function Control() {
  const { C, st } = useTheme();
  const [rows, setRows] = useState(CONTROL_INIT);
  const [saved, setSaved] = useState(false);
  const tjs = rows.filter((r) => r.cur === "TJS");
  const total = tjs.reduce((a, r) => a + (Number(r.value) || 0), 0);
  const totalCalc = tjs.reduce((a, r) => a + r.calc, 0);
  const totalUsd = rows.filter((r) => r.cur === "USD").reduce((a, r) => a + (Number(r.value) || 0), 0);
  const anyEntered = rows.some((r) => r.value !== "");
  const diffTotal = total - totalCalc;
  const setVal = (id, v) => { setRows((rs) => rs.map((r) => (r.id === id ? { ...r, value: v } : r))); setSaved(false); };
  const GRID = "1fr 70px 150px 180px 150px";
  return (<>
    <section style={st.hero}>
      <div style={st.heroGlow} />
      <div style={st.heroContent}>
        <div style={st.heroTop}>
          <div><div style={st.heroLabel}>Контроль средств · сверка факта с расчётом системы</div><div style={st.heroTitle}>На 11 июн 2026</div></div>
        </div>
        <div style={st.heroStats}>
          <Stat label="Факт (введено), TJS" value={fmt(total)} unit="TJS" accent />
          <Stat label="Расчёт системы, TJS" value={fmt(totalCalc)} unit="TJS" />
          <Stat label="Расхождение" value={anyEntered ? fmt(diffTotal) : "—"} unit={anyEntered ? "TJS" : ""} />
          <Stat label="Итого в долларах" value={fmt(totalUsd)} unit="USD" />
        </div>
      </div>
    </section>
    {anyEntered && Math.abs(diffTotal) > 0.01 && (
      <div style={st.stockAlert}><AlertTriangle size={16} /> Расхождение {fmt(diffTotal)} TJS между фактом и расчётом — проверьте кассы и неучтённые операции</div>
    )}
    <div style={st.cardWrap}>
    <section style={st.card}>
      <div style={st.cardHead}><div style={st.cardTitle}>Остатки по счетам</div>
        <button style={{ ...st.btnGreen, opacity: saved ? 0.6 : 1 }} className="btn" onClick={() => setSaved(true)}>
          <Save size={15} /> {saved ? "Сохранено" : "Сохранить"}</button>
      </div>
      <div style={{ ...st.frow, ...st.frowHead, gridTemplateColumns: GRID }}>
        <div style={st.fName}>Счёт / касса</div><div style={st.fPct}>Валюта</div><div style={st.fNum}>Расчёт системы</div><div style={st.fNum}>Факт (введите)</div><div style={st.fNum}>Расхождение</div>
      </div>
      {rows.map((r) => {
        const v = r.value === "" ? null : Number(r.value) || 0;
        const d = v === null ? null : v - r.calc;
        const ok = d !== null && Math.abs(d) < 0.01;
        return (
        <div key={r.id} style={{ ...st.frow, gridTemplateColumns: GRID }} className="frow">
          <div style={st.fName}><div style={st.fundTop}><Banknote size={15} color={C.green} /><span>{r.name}</span></div></div>
          <div style={st.fPct}>{r.cur}</div>
          <div style={{ ...st.fNum, color: C.sub }}>{fmt(r.calc)}</div>
          <div style={{ textAlign: "right" }}>
            <input type="number" value={r.value} onChange={(e) => setVal(r.id, e.target.value)} placeholder="0" style={{ ...st.numInput, width: 150 }} />
          </div>
          <div style={{ ...st.fNum, fontWeight: 700, color: d === null ? C.faint : ok ? C.green : C.danger }}>
            {d === null ? "—" : ok ? "✓ сходится" : fmt(d)}
          </div>
        </div>); })}
      <div style={{ ...st.frow, ...st.frowTotal, gridTemplateColumns: GRID }}>
        <div style={st.fName}><b>Итого по сомони</b></div><div style={st.fPct} />
        <div style={{ ...st.fNum, fontWeight: 700, color: C.sub }}>{fmt(totalCalc)}</div>
        <div style={{ ...st.fNum, fontWeight: 800, color: C.green, fontSize: 16 }}>{fmt(total)}</div>
        <div style={{ ...st.fNum, fontWeight: 800, color: anyEntered ? (Math.abs(diffTotal) < 0.01 ? C.green : C.danger) : C.faint }}>{anyEntered ? fmt(diffTotal) : "—"}</div>
      </div>
    </section>
    </div>
    <div style={st.vibeNote}>
      <b style={{ color: C.green }}>Принцип ManaJet:</b> «чтобы ни одна копейка не пропала». Бухгалтер вводит фактические остатки,
      система сравнивает их с расчётом по доходам, фондам и оплатам. Расхождение — сигнал проверить кассу.
      Сейчас расчётные цифры демонстрационные; в боевой версии их будет считать сервер из реальных операций.
    </div>
  </>);
}
