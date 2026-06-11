import { useState, useMemo } from "react";
import { Check } from "lucide-react";
import { Stat } from "../../components/common";
import { PAYROLL_SEED, STATE_COEF } from "../../data/payroll";
import { STAT_STATES } from "../../data/stats";
import { useTheme } from "../../theme/theme";
import { fmt } from "../../utils/format";


export function Payroll() {
  const { C, st } = useTheme();
  const [fot, setFot] = useState(14000);
  const [rows, setRows] = useState(PAYROLL_SEED);
  const [closed, setClosed] = useState(false);

  const effOf = (r) => r.points * (STATE_COEF[r.state] || 1);
  const totalEff = useMemo(() => rows.reduce((a, r) => a + effOf(r), 0), [rows]);
  const totalBase = useMemo(() => rows.reduce((a, r) => a + r.points, 0), [rows]);
  const pointCost = totalEff > 0 ? (Number(fot) || 0) / totalEff : 0;
  const salaryOf = (r) => effOf(r) * pointCost;

  const setPoints = (id, v) => { setRows((rs) => rs.map((r) => (r.id === id ? { ...r, points: v === "" ? "" : Math.max(0, Number(v) || 0) } : r))); setClosed(false); };
  const setState = (id, v) => { setRows((rs) => rs.map((r) => (r.id === id ? { ...r, state: v } : r))); setClosed(false); };

  const top = useMemo(() => [...rows].sort((a, b) => salaryOf(b) - salaryOf(a))[0], [rows, pointCost]);

  return (<>
    <section style={st.hero}>
      <div style={st.heroGlow} />
      <div style={st.heroContent}>
        <div style={st.heroTop}>
          <div><div style={st.heroLabel}>Расчёт зарплаты · безокладная система по баллам</div><div style={st.heroTitle}>Неделя 04–10 июн 2026</div></div>
        </div>
        <div style={st.heroStats}>
          <Stat label="ФОТ недели (из ФД3)" value={fmt(Number(fot) || 0)} unit="TJS" accent />
          <Stat label="Сумма эфф. баллов" value={totalEff.toFixed(1)} unit={`из ${totalBase}`} />
          <Stat label="Стоимость балла" value={fmt(pointCost)} unit="TJS" />
          <Stat label="Сотрудников" value={String(rows.length)} unit="" />
        </div>
      </div>
    </section>

    <section style={{ ...st.fpCard, marginTop: 0, marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ ...st.reqField, maxWidth: 240 }}>
          <span style={st.reqFieldLbl}>ФОТ недели, TJS (одобрен Директивой из ФД3)</span>
          <input type="number" inputMode="decimal" value={fot}
            onChange={(e) => { setFot(e.target.value); setClosed(false); }}
            onWheel={(e) => e.target.blur()} style={{ ...st.numInput, width: "100%" }} className="amtIn" />
        </label>
        <button style={{ ...st.btnGreen, opacity: closed ? 0.6 : 1 }} className="btn" onClick={() => setClosed(true)}>
          <Check size={15} /> {closed ? "Расчёт закрыт" : "Закрыть расчёт недели"}
        </button>
      </div>
      <div style={{ fontSize: 12, color: C.sub, marginTop: 12, lineHeight: 1.6 }}>
        Меняй ФОТ, баллы или состояние статистики — зарплаты пересчитываются мгновенно.
        Сумма выплат <b style={{ color: C.green }}>всегда равна ФОТ</b>: система не может потратить больше, чем компания заработала.
      </div>
    </section>

    <div style={st.cardWrap}>
      <section style={st.card}>
        <div style={st.cardHead}>
          <div style={st.cardTitle}>Сотрудники и баллы</div>
          <div style={st.cardTotal}>1 балл = {fmt(pointCost)} <span style={st.unit}>TJS</span></div>
        </div>
        <div style={{ ...st.frow, ...st.frowHead, gridTemplateColumns: "minmax(190px,1fr) 90px 210px 110px 130px" }}>
          <div style={st.fName}>Сотрудник</div><div style={st.fPct}>Баллы</div><div style={st.fPct}>Состояние статистики</div><div style={st.fNum}>Эфф. баллы</div><div style={st.fNum}>ЗП недели</div>
        </div>
        {rows.map((r) => {
          const sm = STAT_STATES[r.state];
          const coef = STATE_COEF[r.state] || 1;
          return (
            <div key={r.id} style={{ ...st.frow, gridTemplateColumns: "minmax(190px,1fr) 90px 210px 110px 130px", alignItems: "center" }} className="frow">
              <div style={st.fName}>
                <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.3 }}>{r.name}</div>
                <div style={{ fontSize: 11, color: C.faint }}>{r.post} · отд. {r.dept}</div>
              </div>
              <div>
                <input type="number" inputMode="decimal" value={r.points}
                  onChange={(e) => setPoints(r.id, e.target.value)}
                  onWheel={(e) => e.target.blur()}
                  style={{ ...st.pctInput, width: 62, padding: "6px 8px", fontSize: 13.5 }} className="amtIn" />
              </div>
              <div>
                <select style={{ ...st.reqSelect, padding: "7px 9px", fontSize: 12, color: sm.color, fontWeight: 700 }} value={r.state} onChange={(e) => setState(r.id, e.target.value)}>
                  {Object.keys(STATE_COEF).map((k) => (
                    <option key={k} value={k}>{STAT_STATES[k].label} · ×{STATE_COEF[k]}</option>
                  ))}
                </select>
              </div>
              <div style={{ ...st.fNum, color: coef > 1 ? C.green : coef < 1 ? C.danger : C.sub, fontWeight: 600 }}>{effOf(r).toFixed(1)}</div>
              <div style={{ ...st.fNum, fontWeight: 800, fontSize: 15 }}>{fmt(salaryOf(r))}</div>
            </div>
          );
        })}
        <div style={{ ...st.frow, ...st.frowTotal, gridTemplateColumns: "minmax(190px,1fr) 90px 210px 110px 130px" }}>
          <div style={st.fName}><b>Итого к выплате</b></div>
          <div style={{ ...st.fPct, fontWeight: 700 }}>{totalBase}</div>
          <div />
          <div style={{ ...st.fNum, fontWeight: 700 }}>{totalEff.toFixed(1)}</div>
          <div style={{ ...st.fNum, fontWeight: 800, color: C.green, fontSize: 16 }}>{fmt(rows.reduce((a, r) => a + salaryOf(r), 0))}</div>
        </div>
      </section>
    </div>

    <div style={st.vibeNote}>
      <b style={{ color: C.green }}>Как это работает:</b> у каждого поста — базовые баллы (вес должности).
      Состояние статистики поста умножает их: Власть ×1.3, Опасность ×0.7. Получается, что
      {top ? <> сейчас больше всех зарабатывает <b style={{ color: C.text }}>{top.name}</b> — не потому что «оклад выше», а потому что статистика растёт.</> : null}
      {" "}Сотрудник с падающей статистикой получает меньше автоматически — без неприятных разговоров: формула одна для всех.
    </div>
  </>);
}
