import { useState, useMemo } from "react";
import { ArrowUpRight, ArrowDownRight, ChevronRight, Plus, TrendingUp } from "lucide-react";
import { StatChart } from "../../components/charts/StatChart";
import { Stat } from "../../components/common";
import { DEPTS } from "../../data/org";
import { STATS_SEED, STAT_STATES } from "../../data/stats";
import { useTheme } from "../../theme/theme";
import { calcState, weekLabels } from "../../utils/stats";


export function StatsModule({ view }) {
  const { C, st } = useTheme();
  const [stats, setStats] = useState(STATS_SEED);
  const [open, setOpen] = useState({ 1: true });
  const [inputs, setInputs] = useState({});
  const labels = useMemo(() => weekLabels(12), []);

  const addValue = (id) => {
    const raw = inputs[id];
    const v = Number(raw);
    if (raw === "" || raw === undefined || Number.isNaN(v)) return;
    setStats((ss) => ss.map((s) => (s.id === id ? { ...s, values: [...s.values.slice(1), v] } : s)));
    setInputs((m) => ({ ...m, [id]: "" }));
  };

  const deltaOf = (s) => {
    const n = s.values.length;
    const last = s.values[n - 1], prev = s.values[n - 2];
    const diff = last - prev;
    const pct = prev !== 0 ? Math.abs((diff / prev) * 100) : 100;
    const good = s.invert ? diff < 0 : diff > 0;
    return { last, prev, diff, pct, good, flat: diff === 0 };
  };

  const summary = useMemo(() => {
    let up = 0, down = 0, danger = 0;
    stats.forEach((s) => {
      const code = calcState(s.values, s.invert);
      if (code === "danger") danger++;
      const d = deltaOf(s);
      if (d.flat) return;
      d.good ? up++ : down++;
    });
    return { up, down, danger };
  }, [stats]);

  const Badge = ({ code }) => {
    const m = STAT_STATES[code];
    return <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 20, whiteSpace: "nowrap", color: m.color, background: `${m.color}1a` }}>{m.label}</span>;
  };

  const Delta = ({ s }) => {
    const d = deltaOf(s);
    if (d.flat) return <span style={{ ...st.trend, color: C.faint, fontSize: 12 }}>—</span>;
    const col = d.good ? C.green : C.danger;
    return (
      <span style={{ ...st.trend, color: col, fontSize: 12 }}>
        {d.diff > 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
        {d.pct.toFixed(1)}%
      </span>
    );
  };

  // ---------- Справочник состояний ----------
  if (view === "s_ref") {
    const REF = [
      { code: "power", text: "Статистика в рекордном диапазоне и продолжает расти. Ничего не меняй — запиши, какие именно действия привели сюда, и закрепи их письменно." },
      { code: "affluence", text: "Крутой устойчивый рост. Экономь, оплати долги, укрепляй то, что дало рост, не трать на пустое." },
      { code: "normal", text: "Лёгкий стабильный рост. Не меняй то, что работает. Ищи, что слегка улучшить, и устраняй мелкие помехи." },
      { code: "emergency", text: "Стагнация или лёгкий спад. Продвигай, меняй действия, экономь. Если за 2–3 недели не выправилось — ужесточай меры." },
      { code: "danger", text: "Резкий спад. Руководитель лично обходит обычный порядок и исправляет ситуацию, затем укрепляет слабое место." },
      { code: "nonexistence", text: "Новый пост или новая статистика. Осмотрись, выясни, что от тебя нужно, и начни это производить и фиксировать." },
    ];
    return (<>
      <div style={st.rSectionHead}><TrendingUp size={18} color={C.green} /><h3 style={st.reqSectionTitle}>Состояния статистик</h3><span style={st.reqSectionSub}>определяются по наклону графика за 4 недели</span></div>
      <div style={st.incList}>
        {REF.map((r) => { const m = STAT_STATES[r.code]; return (
          <div key={r.code} style={{ ...st.locCard, padding: "16px 18px", display: "flex", gap: 14, alignItems: "flex-start" }}>
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: m.color, flexShrink: 0, marginTop: 4 }} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: m.color, marginBottom: 4 }}>{m.label}</div>
              <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.55 }}>{r.text}</div>
            </div>
          </div>); })}
      </div>
    </>);
  }

  // ---------- Общий hero ----------
  const hero = (
    <section style={st.hero}>
      <div style={st.heroGlow} />
      <div style={st.heroContent}>
        <div style={st.heroTop}>
          <div><div style={st.heroLabel}>{view === "s_ico" ? "ИЦО · информационный центр организации" : "Все статистики компании"}</div><div style={st.heroTitle}>Неделя 04–10 июн 2026</div></div>
        </div>
        <div style={st.heroStats}>
          <Stat label="Всего статистик" value={String(stats.length)} unit="" />
          <Stat label="Растут" value={String(summary.up)} unit="" accent />
          <Stat label="Падают" value={String(summary.down)} unit="" />
          <Stat label="В Опасности" value={String(summary.danger)} unit="" />
        </div>
      </div>
    </section>
  );

  // ---------- ИЦО: доска по отделениям ----------
  if (view === "s_ico") {
    return (<>
      {hero}
      {DEPTS.map((dep) => {
        const items = stats.filter((s) => s.dept === dep.code);
        if (items.length === 0) return null;
        return (
          <div key={dep.code} style={{ marginBottom: 24 }}>
            <div style={st.zoneTitle}>Отделение {dep.code} · {dep.name}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: 12 }}>
              {items.map((s) => {
                const code = calcState(s.values, s.invert);
                const m = STAT_STATES[code];
                return (
                  <div key={s.id} style={{ ...st.locCard, padding: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.3 }}>{s.name}</div>
                      <Badge code={code} />
                    </div>
                    <div style={{ fontSize: 11, color: C.faint, marginBottom: 10 }}>{s.owner}</div>
                    <div style={{ color: C.text }}><StatChart values={s.values} color={m.color} height={95} /></div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 8 }}>
                      <span style={{ fontSize: 17, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{s.values[s.values.length - 1].toLocaleString("ru-RU")} <span style={{ fontSize: 11, fontWeight: 600, color: C.sub }}>{s.unit}</span></span>
                      <Delta s={s} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </>);
  }

  // ---------- Все статистики: список с вводом ----------
  return (<>
    {hero}
    <div style={st.incList}>
      {stats.map((s) => {
        const code = calcState(s.values, s.invert);
        const m = STAT_STATES[code];
        const isOpen = !!open[s.id];
        const dep = DEPTS.find((d) => d.code === s.dept);
        return (
          <div key={s.id} style={st.locCard}>
            <div style={st.locHead} className="locHead" onClick={() => setOpen((o) => ({ ...o, [s.id]: !o[s.id] }))}>
              <div style={{ ...st.locDot, background: m.color, borderRadius: "50%" }} />
              <div style={st.locTitle}>
                <div style={st.locName}>{s.name}</div>
                <div style={st.locCode}>Отд. {s.dept} · {dep ? dep.name : ""} · {s.owner}</div>
              </div>
              <div style={st.locRight}>
                <div style={st.locSum}>{s.values[s.values.length - 1].toLocaleString("ru-RU")} <span style={st.locUnit}>{s.unit}</span></div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Delta s={s} /><Badge code={code} /></div>
              </div>
              <span style={{ ...st.locChevron, transform: isOpen ? "rotate(90deg)" : "none" }}><ChevronRight size={18} /></span>
            </div>
            {isOpen && (
              <div style={{ ...st.locBody, padding: "16px 18px" }}>
                <div style={{ color: C.text }}><StatChart values={s.values} color={m.color} height={150} /></div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, marginBottom: 14 }}>
                  {labels.filter((_, i) => i % 2 === 0).map((l) => <span key={l} style={{ fontSize: 9.5, color: C.faint }}>{l}</span>)}
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", paddingTop: 14, borderTop: `1px solid ${C.line}` }}>
                  <label style={st.reqField}>
                    <span style={st.reqFieldLbl}>Значение за новую неделю, {s.unit}</span>
                    <input type="number" inputMode="decimal" value={inputs[s.id] ?? ""} placeholder="0"
                      onChange={(e) => setInputs((mm) => ({ ...mm, [s.id]: e.target.value }))}
                      onWheel={(e) => e.target.blur()}
                      onKeyDown={(e) => e.key === "Enter" && addValue(s.id)}
                      style={{ ...st.numInput, width: "100%" }} className="amtIn" />
                  </label>
                  <button style={st.btnGreen} className="btn" onClick={() => addValue(s.id)}><Plus size={15} /> Внести</button>
                </div>
                <div style={{ fontSize: 11.5, color: C.faint, marginTop: 10 }}>
                  Мин {Math.min(...s.values).toLocaleString("ru-RU")} · Макс {Math.max(...s.values).toLocaleString("ru-RU")} · график пересчитает состояние автоматически
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  </>);
}
