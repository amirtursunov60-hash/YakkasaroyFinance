import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Loader2, AlertCircle, TrendingUp, TrendingDown, Banknote, Wallet, Coins, Users, ArrowRight,
} from "lucide-react";
import { BarsChart } from "../../components/charts/BarsChart";
import { Stat } from "../../components/common";
import { useTheme } from "../../theme/theme";
import { fmt, fmtShort } from "../../utils/format";
import { usePeriod, periodTitle, periodTitleShort } from "../../lib/PeriodCtx";
import { fetchReportData, fetchIncomeRefs } from "../../lib/api";
import {
  filterIncomesByLocation, filterExpensesByLocation,
  aggregateByWeek, summarizePeriod, aggregateByLocation,
} from "../../lib/reports";

// ---------------------------------------------------------------- ДАШБОРД СОБСТВЕННИКА
// Сводка по сети за неделю ФП: доход / расход / прибыль / ФОТ + сравнение
// неделя-к-неделе. Поверх отчётных данных (lib/reports.ts, те же, что в Reports).
// Уважает переключатель «вся сеть / точка» из шапки. Тренд — последние недели.

const RANGE = 8; // недель для тренда

// Дельта неделя-к-неделе: стрелка + разница. Для расхода/ФОТ рост — это «хуже»
// (goodUp=false → красный при росте), для дохода/прибыли рост — «лучше».
function Delta({ C, curr, prev, goodUp = true }) {
  const delta = curr - prev;
  if (Math.abs(delta) < 0.01) return <span style={{ fontSize: 11.5, color: C.faint }}>= без изменений</span>;
  const up = delta > 0;
  const good = goodUp ? up : !up;
  const color = good ? C.green : C.danger;
  const pct = prev > 0 ? Math.abs(delta / prev) * 100 : null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11.5, fontWeight: 700, color, whiteSpace: "nowrap" }}>
      {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
      {up ? "+" : "−"}{fmtShort(Math.abs(delta))}
      {pct != null && <span style={{ color: C.faint, fontWeight: 600 }}>· {pct.toFixed(0)}%</span>}
    </span>
  );
}

// Крупная плитка показателя за неделю
function MetricTile({ C, st, icon: Icon, label, value, accent, curr, prev, goodUp }) {
  return (
    <div style={{ ...st.locCard, padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center",
          background: `${accent}1f`, color: accent, flexShrink: 0 }}>
          <Icon size={17} />
        </div>
        <div style={{ fontSize: 12.5, color: C.sub, fontWeight: 600 }}>{label}</div>
      </div>
      <div className="denseNum" style={{ fontSize: 24, fontWeight: 800, color: accent, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>
        {fmt(value)} <span style={{ fontSize: 12, fontWeight: 600, color: C.faint }}>TJS</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Delta C={C} curr={curr} prev={prev} goodUp={goodUp} />
        <span style={{ fontSize: 11, color: C.faint }}>к прошлой неделе</span>
      </div>
    </div>
  );
}

export function OwnerDashboard() {
  const { C, st, isMobile } = useTheme();
  const { periods, period, periodId, prevPeriod, loading: periodsLoading, locationId, location } = usePeriod();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [data, setData] = useState({ incomes: [], expenses: [] });
  const [locations, setLocations] = useState([]);

  // Последние RANGE недель по возрастанию (для тренда), включают текущую и прошлую
  const range = useMemo(
    () => [...periods].sort((a, b) => a.starts_on.localeCompare(b.starts_on)).slice(-RANGE),
    [periods],
  );

  const load = useCallback(async () => {
    if (periodsLoading) return;
    setErr("");
    try {
      const [d, refs] = await Promise.all([
        fetchReportData(range.map((p) => p.id)),
        fetchIncomeRefs(),
      ]);
      setData(d); setLocations(refs.locations);
    } catch (e) {
      setErr("Не удалось загрузить сводку: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [range, periodsLoading]);
  useEffect(() => { load(); }, [load]);

  // Данные с учётом выбранной точки (для плиток и тренда). По точкам — всегда вся сеть.
  const fIncomes = useMemo(() => filterIncomesByLocation(data.incomes, locationId), [data, locationId]);
  const fExpenses = useMemo(() => filterExpensesByLocation(data.expenses, locationId), [data, locationId]);

  const curr = useMemo(() => summarizePeriod(periodId, fIncomes, fExpenses), [periodId, fIncomes, fExpenses]);
  const prev = useMemo(() => summarizePeriod(prevPeriod?.id || null, fIncomes, fExpenses), [prevPeriod, fIncomes, fExpenses]);

  const byWeek = useMemo(() => aggregateByWeek(range, fIncomes, fExpenses), [range, fIncomes, fExpenses]);
  const byLocation = useMemo(
    () => aggregateByLocation(
      locations,
      data.incomes.filter((i) => i.period_id === periodId),
      data.expenses.filter((e) => e.period_id === periodId),
    ),
    [locations, data, periodId],
  );

  const fotShare = curr.inc > 0 ? (curr.fot / curr.inc) * 100 : 0;

  if (loading || periodsLoading) return <div style={st.empty}><Loader2 size={18} className="spin" /> Загрузка…</div>;

  return (<>
    <section style={st.hero}>
      <div style={st.heroGlow} />
      <div style={st.heroContent}>
        <div style={st.heroTop}>
          <div>
            <div style={st.heroLabel}>Сводка собственника · {location ? location.name : "вся сеть Яккасарой"}</div>
            <div style={st.heroTitle}>{period ? periodTitle(period) : "Период не создан — добавьте неделю в шапке"}</div>
          </div>
        </div>
        <div style={st.heroStats}>
          <Stat label="Прибыль недели" value={fmt(curr.profit)} unit="TJS" tone={curr.profit >= 0 ? "success" : "danger"} />
          <Stat label="Маржа" value={`${curr.margin.toFixed(1)}%`} unit="" />
          <Stat label="Доля ФОТ от выручки" value={`${fotShare.toFixed(1)}%`} unit="" />
          <Stat label="Точек с операциями" value={String(byLocation.length)} unit="" />
        </div>
      </div>
    </section>

    {err && <div role="alert" style={{ ...st.reqError, marginBottom: 14 }}><AlertCircle size={15} /> {err}</div>}

    {/* Плитки показателей недели со сравнением */}
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }} className="stagger">
      <MetricTile C={C} st={st} icon={Banknote} label="Доход" accent={C.money} value={curr.inc} curr={curr.inc} prev={prev.inc} goodUp />
      <MetricTile C={C} st={st} icon={Wallet} label="Расход" accent={C.danger} value={curr.exp} curr={curr.exp} prev={prev.exp} goodUp={false} />
      <MetricTile C={C} st={st} icon={Coins} label="Прибыль" accent={C.green} value={curr.profit} curr={curr.profit} prev={prev.profit} goodUp />
      <MetricTile C={C} st={st} icon={Users} label="Зарплата (ФОТ)" accent={C.warning} value={curr.fot} curr={curr.fot} prev={prev.fot} goodUp={false} />
    </div>

    {/* Тренд доход/расход по неделям */}
    <section style={{ ...st.fpCard, marginTop: 16 }}>
      <div style={{ display: "flex", gap: 16, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 14, fontWeight: 800 }}>Тренд · {range.length} нед.</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.sub }}><span style={{ width: 10, height: 10, borderRadius: 4, background: C.green }} /> Доход</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.sub }}><span style={{ width: 10, height: 10, borderRadius: 4, background: C.danger }} /> Расход</span>
      </div>
      {byWeek.some((w) => w.inc || w.exp) ? (<>
        <div style={{ color: C.text }}>
          <BarsChart a={byWeek.map((w) => w.inc)} b={byWeek.map((w) => w.exp)} colorA={C.green} colorB={C.danger} height={isMobile ? 150 : 170} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
          {byWeek.map((w) => <span key={w.period.id} style={{ fontSize: 9.5, color: C.faint }}>{periodTitleShort(w.period)}</span>)}
        </div>
      </>) : <div style={st.empty}>В диапазоне операций пока нет</div>}
    </section>

    {/* Прибыль по точкам за выбранную неделю */}
    <section style={{ ...st.fpCard, marginTop: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>Прибыль по точкам · {period ? periodTitle(period) : "—"}</div>
      <div style={{ fontSize: 11.5, color: C.faint, marginBottom: 12 }}>Сравнение точек сети за неделю ФП — независимо от выбранной точки в шапке</div>
      {!byLocation.length ? (
        <div style={st.empty}>На этой неделе операций по точкам нет</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {byLocation.map((x) => (
            <div key={x.loc.id} style={{ ...st.locCard, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{x.loc.name}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: x.profit >= 0 ? C.green : C.danger, fontVariantNumeric: "tabular-nums" }}>
                  {x.profit >= 0 ? "+" : "−"}{fmt(Math.abs(x.profit))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 12.5, color: C.sub, flexWrap: "wrap" }}>
                <span>Выручка <b style={{ color: C.text }}>{fmt(x.inc)}</b></span>
                <span>Расход <b style={{ color: C.text }}>{fmt(x.exp)}</b></span>
                <span>Маржа <b style={{ color: x.margin >= 15 ? C.green : C.warning }}>{x.margin.toFixed(0)}%</b></span>
              </div>
              <div style={{ ...st.bar, marginTop: 10, maxWidth: "100%" }}>
                <div style={{ ...st.barFill, width: `${Math.max(0, Math.min(100, x.margin))}%`, background: x.profit >= 0 ? C.green : C.danger }} />
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ ...st.vibeNote, marginTop: 14 }}>
        <b style={{ color: C.green }}>Что смотреть собственнику:</b> прибыль и маржа недели по сети и по точкам. Маржа точки
        ниже 15% или доля ФОТ выше нормы — повод разобраться. Детальные отчёты (ДДС, P&L, по фондам) — в модуле «Финансы → Отчёты».
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 6, color: C.sub }}><ArrowRight size={13} /></span>
      </div>
    </section>
  </>);
}
