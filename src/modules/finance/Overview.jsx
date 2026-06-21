import { useState, useEffect, useMemo, useCallback } from "react";
import { Loader2, AlertCircle, ArrowUpRight, ArrowDownRight, Wallet, TrendingUp } from "lucide-react";
import { Stat } from "../../components/common";
import { useTheme } from "../../theme/theme";
import { fmt } from "../../utils/format";
import { usePeriod, periodTitle } from "../../lib/PeriodCtx";
import { fetchReportData, fetchFunds, fetchIncomeRefs } from "../../lib/api";


// ---------------------------------------------------------------- OVERVIEW (Сводка владельца)
// Консолидированная картина для собственника: ключевые цифры выбранной недели ФП
// с динамикой к прошлой неделе, балансы фондов, прибыль по точкам. Данные — из
// Реестра через те же выборки, что и Управленческие отчёты; уважает переключатель
// «вся сеть / точка» из шапки.

const expAmount = (r) => -(Number(r.fund_amount ?? r.cash_amount) || 0);
const expLocation = (r) => r.request?.location_id || r.bill?.location_id || null;

export function Overview() {
  const { C, st, isMobile } = useTheme();
  const { period, prevPeriod, loading: periodsLoading, locationId: ctxLocationId, location } = usePeriod();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [data, setData] = useState({ incomes: [], expenses: [] });
  const [funds, setFunds] = useState([]);
  const [locations, setLocations] = useState([]);

  const load = useCallback(async () => {
    if (periodsLoading) return;
    setErr("");
    try {
      const ids = [period?.id, prevPeriod?.id].filter(Boolean);
      const [d, fs, refs] = await Promise.all([
        ids.length ? fetchReportData(ids) : Promise.resolve({ incomes: [], expenses: [] }),
        fetchFunds(),
        fetchIncomeRefs(),
      ]);
      setData(d);
      setFunds(fs.sort((a, b) => a.code.localeCompare(b.code, "ru", { numeric: true })));
      setLocations(refs.locations);
    } catch (e) {
      setErr("Не удалось загрузить сводку: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [period?.id, prevPeriod?.id, periodsLoading]);
  useEffect(() => { load(); }, [load]);

  // КПИ выбранной недели и прошлой (с учётом переключателя точки в шапке)
  const kpi = useMemo(() => {
    const sumInc = (pid) => data.incomes
      .filter((i) => i.period_id === pid && (!ctxLocationId || i.location_id === ctxLocationId))
      .reduce((a, i) => a + (i.is_return ? -i.amount_base : Number(i.amount_base)), 0);
    const expRows = (pid) => data.expenses
      .filter((e) => e.period_id === pid && (!ctxLocationId || expLocation(e) === ctxLocationId));
    const sumExp = (pid) => expRows(pid).reduce((a, e) => a + expAmount(e), 0);
    const fot = (pid) => expRows(pid).filter((e) => e.op_type === "payroll_payment").reduce((a, e) => a + expAmount(e), 0);
    const cur = { inc: sumInc(period?.id), exp: sumExp(period?.id), fot: fot(period?.id) };
    const prev = { inc: sumInc(prevPeriod?.id), exp: sumExp(prevPeriod?.id) };
    cur.profit = cur.inc - cur.exp; prev.profit = prev.inc - prev.exp;
    cur.margin = cur.inc > 0 ? (cur.profit / cur.inc) * 100 : 0;
    return { cur, prev };
  }, [data, ctxLocationId, period?.id, prevPeriod?.id]);

  // Прибыль по точкам за выбранную неделю (всегда по всем точкам — это обзор сети)
  const byLocation = useMemo(() => locations.map((l) => {
    const inc = data.incomes.filter((i) => i.period_id === period?.id && i.location_id === l.id)
      .reduce((a, i) => a + (i.is_return ? -i.amount_base : Number(i.amount_base)), 0);
    const exp = data.expenses.filter((e) => e.period_id === period?.id && expLocation(e) === l.id)
      .reduce((a, e) => a + expAmount(e), 0);
    return { loc: l, inc, exp, profit: inc - exp, margin: inc > 0 ? ((inc - exp) / inc) * 100 : 0 };
  }).filter((x) => x.inc > 0 || x.exp > 0).sort((a, b) => b.profit - a.profit), [locations, data, period?.id]);

  const fundTotal = useMemo(() => funds.reduce((a, f) => a + Number(f.balance || 0), 0), [funds]);

  const delta = (cur, prev) => {
    if (!prev && !cur) return null;
    if (!prev) return { pct: 100, up: cur >= 0 };
    const d = ((cur - prev) / Math.abs(prev)) * 100;
    return { pct: Math.abs(d), up: d >= 0 };
  };
  const Delta = ({ cur, prev }) => {
    const d = delta(cur, prev);
    if (!d) return <span style={{ fontSize: 12, color: C.faint }}>—</span>;
    const col = d.up ? C.money : C.danger;
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 12, fontWeight: 600, color: col }}>
        {d.up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{d.pct.toFixed(0)}%
      </span>
    );
  };

  if (loading || periodsLoading) return <div style={st.empty}><Loader2 size={18} className="spin" /> Загрузка…</div>;

  const { cur, prev } = kpi;
  const fotPct = cur.inc > 0 ? (cur.fot / cur.inc) * 100 : 0;

  return (<>
    <section style={st.hero}>
      <div style={st.heroGlow} />
      <div style={st.heroContent}>
        <div style={st.heroTop}>
          <div>
            <div style={st.heroLabel}>Сводка владельца{location ? ` · ${location.name}` : " · вся сеть"}</div>
            <div style={st.heroTitle}>{period ? periodTitle(period) : "период не создан"}</div>
          </div>
        </div>
        <div style={st.heroStats}>
          <Stat label="Выручка за неделю" value={fmt(cur.inc)} unit="TJS" />
          <Stat label="Расходы за неделю" value={fmt(cur.exp)} unit="TJS" tone="danger" />
          <Stat label="Прибыль" value={fmt(cur.profit)} unit="TJS" tone={cur.profit >= 0 ? "success" : "danger"} />
          <Stat label="Чистая маржа" value={`${cur.margin.toFixed(1)}%`} unit="" />
        </div>
      </div>
    </section>

    {err && <div style={{ ...st.reqError, marginBottom: 14 }}><AlertCircle size={15} /> {err}</div>}

    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, marginBottom: 16 }}>
      <div style={{ ...st.locCard, padding: 16 }}>
        <div style={{ fontSize: 13, color: C.sub, marginBottom: 10 }}>Динамика к прошлой неделе</div>
        {[
          ["Выручка", cur.inc, prev.inc],
          ["Расходы", cur.exp, prev.exp],
          ["Прибыль", cur.profit, prev.profit],
        ].map(([label, c, p]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.line}` }}>
            <span style={{ fontSize: 13 }}>{label}</span>
            <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(c)}</span>
              <Delta cur={c} prev={p} />
            </span>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, fontSize: 12.5, color: C.sub }}>
          <span>ФОТ за неделю</span>
          <b style={{ color: C.text }}>{fmt(cur.fot)} · {fotPct.toFixed(0)}% выручки</b>
        </div>
      </div>

      <div style={{ ...st.locCard, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: C.sub, marginBottom: 10 }}>
          <Wallet size={15} /> Балансы фондов
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.money, marginBottom: 10 }}>
          {fmt(fundTotal)} <span style={{ fontSize: 12, color: C.faint }}>TJS всего</span>
        </div>
        {funds.slice(0, 6).map((f) => (
          <div key={f.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0", borderBottom: `1px solid ${C.line}`, fontSize: 12.5 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <b style={{ color: C.sub }}>{f.code}</b> {f.name}
            </span>
            <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{fmt(Number(f.balance || 0))}</span>
          </div>
        ))}
        {funds.length > 6 && <div style={{ fontSize: 11.5, color: C.faint, marginTop: 8 }}>и ещё {funds.length - 6} — см. вкладку «Фонды»</div>}
      </div>
    </div>

    <section style={{ ...st.locCard, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 14, fontWeight: 800, marginBottom: 12 }}>
        <TrendingUp size={16} color={C.green} /> Прибыль по точкам · {period ? periodTitle(period) : "—"}
      </div>
      {!byLocation.length && <div style={st.empty}>За неделю операций по точкам пока нет</div>}
      {byLocation.map((x) => (
        <div key={x.loc.id} style={{ padding: "10px 0", borderBottom: `1px solid ${C.line}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{x.loc.name}</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: x.profit >= 0 ? C.green : C.danger, fontVariantNumeric: "tabular-nums" }}>
              {x.profit >= 0 ? "+" : "−"}{fmt(Math.abs(x.profit))} <span style={{ fontSize: 11.5, color: C.sub }}>· маржа {x.margin.toFixed(0)}%</span>
            </span>
          </div>
          <div style={{ ...st.bar, marginTop: 8, maxWidth: "100%" }}>
            <div style={{ ...st.barFill, width: `${Math.max(0, Math.min(100, x.margin))}%`, background: x.profit >= 0 ? C.green : C.danger }} />
          </div>
        </div>
      ))}
    </section>
  </>);
}
