import { useState, useEffect, useMemo, useCallback } from "react";
import { Loader2, AlertCircle, Download } from "lucide-react";
import { BarsChart } from "../../components/charts/BarsChart";
import { Stat } from "../../components/common";
import { useTheme } from "../../theme/theme";
import { fmt } from "../../utils/format";
import { usePeriod, periodTitle, periodTitleShort } from "../../lib/PeriodCtx";
import { fetchReportData, fetchFundFlows, fetchFunds, fetchIncomeRefs, fetchTurnoverSheet, fetchCashAccounts, fetchPostings, fetchChartTurnover } from "../../lib/api";
import { OP_LABELS } from "../../utils/register";
import {
  expenseAmount, expenseLocation, marginPct,
  filterIncomesByLocation, filterExpensesByLocation,
  aggregateByWeek, sumTotals, expensesByType, aggregateByLocation,
} from "../../lib/reports";


// ---------------------------------------------------------------- REPORTS
// Живые данные (ТЗ v2 §4.1.12): ДДС (поступления/выплаты по неделям и
// категориям), P&L с процентом от выручки, сравнение точек (доход/расход/
// прибыль/маржа), ДДС по фондам за выбранную неделю. Диапазон — последние
// 4/8/12 недель ФП. Выгрузка CSV по каждой вкладке.
// Конвенция: суммы — в базовой валюте (TJS), расход = отрицательная
// запись Реестра по оплатам заявок/счетов/ЗП/вне ФП.

const TABS = [
  { key: "dds", label: "ДДС · движение денег" },
  { key: "pnl", label: "P&L · прибыль и убытки" },
  { key: "points", label: "По точкам" },
  { key: "funds", label: "По фондам" },
  { key: "osv", label: "ОСВ · оборотка" },
  { key: "postings", label: "Проводки · журнал" },
];
const JOURNAL_PAGE = 200; // порция журнала проводок на экране
const EXP_LABELS = {
  request_payment: "Оплаты заявок",
  bill_payment: "Оплаты счетов и обязательств",
  payroll_payment: "Зарплата (ФОТ)",
  off_plan: "Траты вне ФП",
};

// Карточка строки ОСВ (фонд/счёт ДС): вход/приход/расход/исход за период.
// Вынесена на уровень модуля — иначе пересоздавалась бы на каждый рендер.
function OsvCard({ C, st, isMobile, title, rows }) {
  return (
    <section style={{ ...st.fpCard, marginTop: 0, marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>{title}</div>
      {!rows.length ? <div style={st.empty}>Нет оборотов за неделю</div> : (
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(320px, 1fr))" }}>
          {rows.map((r) => (
            <div key={r.id} style={{ ...st.locCard, padding: "10px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
                {r.cur && <span style={{ ...st.weekTag, marginLeft: "auto", color: C.sub, background: `${C.sub}1a` }}>{r.cur}</span>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, fontSize: 11.5 }}>
                {[["Вход", r.opening, C.sub], ["Приход", r.inflow, C.money], ["Расход", r.outflow, C.danger], ["Исход", r.closing, C.text]].map(([l, v, col]) => (
                  <div key={l}>
                    <div style={{ color: C.faint, textTransform: "uppercase", letterSpacing: 0.3 }}>{l}</div>
                    <div style={{ fontWeight: 700, color: col, fontVariantNumeric: "tabular-nums" }}>{l === "Расход" && v ? `−${fmt(v)}` : fmt(v)}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function Reports() {
  const { C, st, isMobile } = useTheme();
  const { periods, period, periodId, loading: periodsLoading, locationId: ctxLocationId, location } = usePeriod();
  const [tab, setTab] = useState("dds");
  const [rangeN, setRangeN] = useState(8);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [data, setData] = useState({ incomes: [], expenses: [] });
  const [fundFlows, setFundFlows] = useState({});
  const [funds, setFunds] = useState([]);
  const [locations, setLocations] = useState([]);
  const [cashAccounts, setCashAccounts] = useState([]);
  const [osv, setOsv] = useState({ funds: [], cash: [] });
  // Леджерные выборки (журнал проводок + ОСВ по плану счетов) — проекции
  // всего Реестра, тяжёлые: грузим лениво при открытии вкладки и кэшируем
  // на период; их ошибка не валит остальные вкладки отчётов.
  const [postings, setPostings] = useState([]);
  const [chartOsv, setChartOsv] = useState([]);
  const [ledgerFor, setLedgerFor] = useState(null);   // periodId загруженного леджера
  const [ledgerErr, setLedgerErr] = useState("");
  const [shownN, setShownN] = useState(JOURNAL_PAGE); // порция журнала на экране

  useEffect(() => {
    if (!["osv", "postings"].includes(tab) || !periodId || ledgerFor === periodId) return;
    let cancelled = false;
    (async () => {
      setLedgerErr("");
      try {
        const [ps, ct] = await Promise.all([fetchPostings(periodId), fetchChartTurnover(periodId)]);
        if (cancelled) return;
        setPostings(ps); setChartOsv(ct); setLedgerFor(periodId); setShownN(JOURNAL_PAGE);
      } catch (e) {
        if (!cancelled) setLedgerErr("Не удалось загрузить проводки: " + (e?.message || e));
      }
    })();
    return () => { cancelled = true; };
  }, [tab, periodId, ledgerFor]);

  const ledgerLoading = ["osv", "postings"].includes(tab) && ledgerFor !== periodId && !ledgerErr;
  const postingsTotal = useMemo(() => postings.reduce((a, p) => a + Number(p.amount), 0), [postings]);

  // Последние N недель (по возрастанию для графиков)
  const range = useMemo(
    () => [...periods].sort((a, b) => a.starts_on.localeCompare(b.starts_on)).slice(-rangeN),
    [periods, rangeN],
  );

  const load = useCallback(async () => {
    if (periodsLoading) return;
    setErr("");
    try {
      const [d, ff, fs, refs, ts, ca] = await Promise.all([
        fetchReportData(range.map((p) => p.id)),
        fetchFundFlows(periodId),
        fetchFunds(),
        fetchIncomeRefs(),
        fetchTurnoverSheet(periodId),
        fetchCashAccounts(),
      ]);
      setData(d); setFundFlows(ff);
      setFunds(fs.sort((a, b) => a.code.localeCompare(b.code, "ru", { numeric: true })));
      setLocations(refs.locations);
      setOsv(ts); setCashAccounts(ca);
    } catch (e) {
      setErr("Не удалось загрузить данные отчёта: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [range, periodId, periodsLoading]);
  useEffect(() => { load(); }, [load]);

  // -------- агрегаты (с учётом переключателя «вся сеть / точка»). Чистая логика —
  // в lib/reports.ts (там же unit-тесты), здесь только мемоизация по данным экрана.
  const fIncomes = useMemo(() => filterIncomesByLocation(data.incomes, ctxLocationId), [data, ctxLocationId]);
  const fExpenses = useMemo(() => filterExpensesByLocation(data.expenses, ctxLocationId), [data, ctxLocationId]);

  const byWeek = useMemo(() => aggregateByWeek(range, fIncomes, fExpenses), [range, fIncomes, fExpenses]);
  const totals = useMemo(() => sumTotals(byWeek), [byWeek]);
  const margin = marginPct(totals.inc, totals.exp);
  const expByType = useMemo(() => expensesByType(fExpenses), [fExpenses]);
  const byLocation = useMemo(() => aggregateByLocation(locations, data.incomes, data.expenses), [locations, data]);

  const noLocExp = useMemo(() => data.expenses.filter((e) => !expenseLocation(e))
    .reduce((a, e) => a + expenseAmount(e), 0), [data]);

  // -------- экспорт CSV текущей вкладки
  const exportCsv = () => {
    let head = [], rows = [], name = tab;
    if (tab === "dds" || tab === "pnl") {
      head = ["Неделя", "Поступления", "Выплаты", "Чистый поток"];
      rows = byWeek.map((w) => [periodTitleShort(w.period), w.inc.toFixed(2), w.exp.toFixed(2), w.net.toFixed(2)]);
      rows.push(["ИТОГО", totals.inc.toFixed(2), totals.exp.toFixed(2), (totals.inc - totals.exp).toFixed(2)]);
    } else if (tab === "points") {
      head = ["Точка", "Выручка", "Расходы", "Прибыль", "Маржа %"];
      rows = byLocation.map((x) => [x.loc.name, x.inc.toFixed(2), x.exp.toFixed(2), x.profit.toFixed(2), x.margin.toFixed(1)]);
    } else {
      head = ["Фонд", "Название", "Поступило за неделю", "Списано за неделю", "Текущий баланс"];
      rows = funds.map((f) => {
        const ff = fundFlows[f.id] || { in: 0, out: 0 };
        return [f.code, f.name, ff.in.toFixed(2), ff.out.toFixed(2), Number(f.balance).toFixed(2)];
      });
    }
    if (tab === "osv") {
      head = ["Код", "Счёт", "Сальдо нач.", "Оборот Дт", "Оборот Кт", "Сальдо кон."];
      rows = chartOsv.map((r) => [r.code, r.name, r.opening.toFixed(2), r.debit_turnover.toFixed(2), r.credit_turnover.toFixed(2), r.closing.toFixed(2)]);
    }
    if (tab === "postings") {
      head = ["Дата", "Операция", "Дт", "Дт счёт", "Кт", "Кт счёт", "Сумма", "Комментарий"];
      rows = postings.map((p) => [
        p.posted_on, OP_LABELS[p.op_type] || p.op_type,
        p.debit_code, [p.debit_name, p.debit_sub].filter(Boolean).join(" · "),
        p.credit_code, [p.credit_name, p.credit_sub].filter(Boolean).join(" · "),
        Number(p.amount).toFixed(2), p.comment || "",
      ]);
    }
    const csv = "﻿" + [head, ...rows].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `Отчёт_${name}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (loading || periodsLoading) return <div style={st.empty}><Loader2 size={18} className="spin" /> Загрузка…</div>;

  const rangeLabel = range.length
    ? `${periodTitleShort(range[0])} — ${periodTitleShort(range.at(-1))}`
    : "—";

  return (<>
    <section style={st.hero}>
      <div style={st.heroGlow} />
      <div style={st.heroContent}>
        <div style={st.heroTop}>
          <div>
            <div style={st.heroLabel}>Управленческие отчёты · сеть Яккасарой</div>
            <div style={st.heroTitle}>{range.length} нед. · {rangeLabel}{location ? ` · ${location.name}` : ""}</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select style={{ ...st.reqSelect, padding: "8px 10px", fontSize: 13 }} className="fin"
              value={rangeN} onChange={(e) => setRangeN(Number(e.target.value))}>
              <option value={4}>4 недели</option>
              <option value={8}>8 недель</option>
              <option value={12}>12 недель</option>
            </select>
            <button style={st.btnGhost} className="btn" onClick={exportCsv} title="Экспорт CSV" aria-label="Экспорт CSV">
              <Download size={15} /> {!isMobile && "Экспорт CSV"}
            </button>
          </div>
        </div>
        <div style={st.heroStats}>
          <Stat label={`Поступления · ${range.length} нед.`} value={fmt(totals.inc)} unit="TJS" />
          <Stat label={`Выплаты · ${range.length} нед.`} value={fmt(totals.exp)} unit="TJS" />
          <Stat label="Чистый денежный поток" value={fmt(totals.inc - totals.exp)} unit="TJS" accent />
          <Stat label="Чистая маржа" value={`${margin.toFixed(1)}%`} unit="" />
        </div>
      </div>
    </section>

    {err && <div role="alert" style={{ ...st.reqError, marginBottom: 14 }}><AlertCircle size={15} /> {err}</div>}

    <div style={st.reqTabs}>
      {TABS.map((t) => (
        <button key={t.key} style={{ ...st.reqTab, ...(tab === t.key ? st.reqTabOn : {}) }} onClick={() => setTab(t.key)} className="btn">{t.label}</button>
      ))}
    </div>

    {/* ---------------- ДДС */}
    {tab === "dds" && (<>
      <section style={{ ...st.fpCard, marginTop: 0 }}>
        <div style={{ display: "flex", gap: 16, marginBottom: 10, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.sub }}><span style={{ width: 10, height: 10, borderRadius: 4, background: C.green }} /> Поступления</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.sub }}><span style={{ width: 10, height: 10, borderRadius: 4, background: C.danger }} /> Выплаты</span>
          <span style={{ fontSize: 12, color: C.faint }}>· TJS по неделям ФП</span>
        </div>
        {byWeek.some((w) => w.inc || w.exp) ? (<>
          <div style={{ color: C.text }}>
            <BarsChart a={byWeek.map((w) => w.inc)} b={byWeek.map((w) => w.exp)} colorA={C.green} colorB={C.danger} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
            {byWeek.map((w) => <span key={w.period.id} style={{ fontSize: 9.5, color: C.faint }}>{periodTitleShort(w.period)}</span>)}
          </div>
        </>) : <div style={st.empty}>В выбранном диапазоне операций пока нет</div>}
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: 14, marginTop: 16 }}>
        <div style={{ ...st.locCard, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8, color: C.green }}>Поступления по неделям</div>
          {byWeek.map((w) => (
            <div key={w.period.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.line}`, fontSize: 13 }}>
              <span>{periodTitle(w.period)}</span>
              <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(w.inc)}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, fontSize: 14, fontWeight: 800 }}>
            <span>Итого</span><span style={{ color: C.money }}>{fmt(totals.inc)}</span>
          </div>
        </div>
        <div style={{ ...st.locCard, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8, color: C.danger }}>Выплаты по категориям</div>
          {Object.entries(EXP_LABELS).map(([k, label]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.line}`, fontSize: 13 }}>
              <span style={{ color: k === "off_plan" && expByType[k] ? C.danger : C.text }}>{label}</span>
              <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(expByType[k] || 0)}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, fontSize: 14, fontWeight: 800 }}>
            <span>Итого</span><span style={{ color: C.danger }}>{fmt(totals.exp)}</span>
          </div>
        </div>
      </div>
    </>)}

    {/* ---------------- P&L */}
    {tab === "pnl" && (
      <section style={{ ...st.fpCard, marginTop: 0 }}>
        <div style={{ fontSize: 12, color: C.faint, marginBottom: 12 }}>
          {range.length} недель · {rangeLabel} · TJS · процент от выручки
        </div>
        {(() => {
          const rev = totals.inc;
          const pct = (v) => (rev > 0 ? Math.min(100, Math.round((Math.abs(v) / rev) * 100)) : 0);
          const fot = expByType.payroll_payment || 0;
          const rows = [
            { label: "Выручка", v: rev, bold: true, accent: true },
            { label: "Оплаты заявок", v: -(expByType.request_payment || 0) },
            { label: "Оплаты счетов и обязательств", v: -(expByType.bill_payment || 0) },
            { label: `Зарплата (ФОТ ${rev > 0 ? (fot / rev * 100).toFixed(1) : 0}%)`, v: -fot },
            { label: "Траты вне ФП", v: -(expByType.off_plan || 0) },
            { label: "Итого расходы", v: -totals.exp, bold: true },
            { label: `Прибыль · маржа ${margin.toFixed(1)}%`, v: rev - totals.exp, bold: true, accent: true },
          ];
          return rows.map((r) => (
            <div key={r.label} style={{ padding: "9px 0", borderBottom: `1px solid ${C.line}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: r.bold ? 14.5 : 13.5, fontWeight: r.bold ? 800 : 500 }}>
                <span style={{ color: r.accent ? C.green : C.text }}>{r.label}</span>
                <span style={{ fontVariantNumeric: "tabular-nums", color: r.v < 0 ? C.danger : r.accent ? C.green : C.text }}>
                  {r.v < 0 ? "−" : ""}{fmt(Math.abs(r.v))} <span style={{ fontSize: 11, color: C.faint }}>· {pct(r.v)}%</span>
                </span>
              </div>
              <div style={{ ...st.bar, marginTop: 6, maxWidth: "100%" }}>
                <div style={{ ...st.barFill, width: `${pct(r.v)}%`, background: r.v < 0 ? C.danger : C.green, opacity: r.bold ? 1 : 0.55 }} />
              </div>
            </div>
          ));
        })()}
      </section>
    )}

    {/* ---------------- По точкам */}
    {tab === "points" && (
      <div style={st.incList}>
        {!byLocation.length && <div style={{ ...st.locCard, ...st.empty }}>В выбранном диапазоне нет операций по точкам</div>}
        {byLocation.map((x) => (
          <div key={x.loc.id} style={{ ...st.locCard, padding: "14px 18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>{x.loc.name}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: x.profit >= 0 ? C.green : C.danger, fontVariantNumeric: "tabular-nums" }}>
                {x.profit >= 0 ? "+" : "−"}{fmt(Math.abs(x.profit))} <span style={{ fontSize: 11.5, color: C.sub }}>· маржа {x.margin.toFixed(0)}%</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12.5, color: C.sub, flexWrap: "wrap" }}>
              <span>Выручка <b style={{ color: C.text }}>{fmt(x.inc)}</b></span>
              <span>Расходы <b style={{ color: C.text }}>{fmt(x.exp)}</b></span>
              <span>Доля выручки сети <b style={{ color: C.text }}>{totals.inc > 0 ? (x.inc / totals.inc * 100).toFixed(0) : 0}%</b></span>
            </div>
            <div style={{ ...st.bar, marginTop: 10, maxWidth: "100%" }}>
              <div style={{ ...st.barFill, width: `${Math.max(0, Math.min(100, x.margin))}%`, background: x.profit >= 0 ? C.green : C.danger }} />
            </div>
          </div>
        ))}
        {noLocExp > 0 && (
          <div style={{ ...st.locCard, padding: "12px 18px", fontSize: 12.5, color: C.sub }}>
            Общесетевые выплаты без привязки к точке (ЗП, вне ФП): <b style={{ color: C.text }}>{fmt(noLocExp)}</b> TJS
          </div>
        )}
        <div style={st.vibeNote}>
          <b style={{ color: C.green }}>Что смотреть владельцу:</b> маржа точки ниже 15% — повод разобраться
          в фудкосте и расходах этой точки, а не сети в целом. Сравнивайте недели между собой переключателем диапазона.
        </div>
      </div>
    )}

    {/* ---------------- По фондам */}
    {tab === "funds" && (
      <div style={st.cardWrap}>
        <section style={st.card}>
          <div style={st.cardHead}>
            <div style={st.cardTitle}>ДДС по фондам · {period ? periodTitle(period) : "—"}</div>
            <div style={st.cardTotal}>{fmt(funds.reduce((a, f) => a + Number(f.balance || 0), 0))} <span style={st.unit}>TJS</span></div>
          </div>
          <div style={{ ...st.frow, ...st.frowHead, gridTemplateColumns: isMobile ? "1fr 90px 90px" : "1fr 150px 150px 160px" }}>
            <div style={st.fName}>Фонд</div>
            <div style={st.fNum}>Поступило</div>
            <div style={st.fNum}>Списано</div>
            {!isMobile && <div style={st.fNum}>Баланс сейчас</div>}
          </div>
          {funds.map((f) => {
            const ff = fundFlows[f.id] || { in: 0, out: 0 };
            return (
              <div key={f.id} style={{ ...st.frow, gridTemplateColumns: isMobile ? "1fr 90px 90px" : "1fr 150px 150px 160px" }} className="frow">
                <div style={st.fName}>
                  <div style={st.fundTop}><span style={st.fundCode}>{f.code}</span><span>{f.name}</span></div>
                  {isMobile && <div style={{ fontSize: 11, color: C.faint }}>баланс {fmt(Number(f.balance || 0))}</div>}
                </div>
                <div style={{ ...st.fNum, color: ff.in ? C.money : C.faint }}>{ff.in ? `+${fmt(ff.in)}` : "—"}</div>
                <div style={{ ...st.fNum, color: ff.out ? C.danger : C.faint }}>{ff.out ? `−${fmt(ff.out)}` : "—"}</div>
                {!isMobile && <div style={{ ...st.fNum, fontWeight: 700 }}>{fmt(Number(f.balance || 0))}</div>}
              </div>
            );
          })}
        </section>
      </div>
    )}

    {/* ---------------- ОСВ (оборотно-сальдовая ведомость) */}
    {tab === "osv" && (() => {
      const fundById = Object.fromEntries(funds.map((f) => [f.id, f]));
      const cashById = Object.fromEntries(cashAccounts.map((c) => [c.id, c]));
      // Валюту показываем только если она не базовая (фонд/счёт может быть не в TJS).
      const curCode = (ent) => (ent?.currency && !ent.currency.is_base ? ent.currency.code : "");
      const fundRows = osv.funds
        .map((r) => ({ ...r, label: fundById[r.id] ? `${fundById[r.id].code} · ${fundById[r.id].name}` : "—", cur: curCode(fundById[r.id]), sort: fundById[r.id]?.code || "" }))
        .filter((r) => r.opening || r.inflow || r.outflow || r.closing)
        .sort((a, b) => a.sort.localeCompare(b.sort, "ru", { numeric: true }));
      const cashRows = osv.cash
        .map((r) => ({ ...r, label: cashById[r.id]?.name || "—", cur: curCode(cashById[r.id]) }))
        .filter((r) => r.opening || r.inflow || r.outflow || r.closing)
        .sort((a, b) => a.label.localeCompare(b.label, "ru"));
      return (<>
        <div style={{ fontSize: 12, color: C.faint, marginBottom: 12 }}>
          Оборотно-сальдовая ведомость · {period ? periodTitle(period) : "—"} · вся сеть (консолидированно).
          Суммы — в валюте фонда/счёта (базовая — TJS). Вход — остаток на начало недели, Исход — на конец.
        </div>
        <OsvCard C={C} st={st} isMobile={isMobile} title="Фонды" rows={fundRows} />
        <OsvCard C={C} st={st} isMobile={isMobile} title="Счета ДС" rows={cashRows} />

        {/* ОСВ по плану счетов (Реестр §13): сальдо и обороты Дт/Кт */}
        <section style={{ ...st.fpCard, marginTop: 0, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>По плану счетов</div>
          <div style={{ fontSize: 11.5, color: C.faint, marginBottom: 10 }}>
            Проекция Реестра в двойную запись по правилам проводок. Сальдо: активные счета — по дебету, пассивные — по кредиту.
          </div>
          {ledgerErr && <div role="alert" style={{ ...st.reqError, marginBottom: 10 }}>{ledgerErr}</div>}
          {ledgerLoading ? <div style={st.empty}><Loader2 size={16} className="spin" /> Загрузка…</div>
          : !chartOsv.length ? <div style={st.empty}>Нет оборотов за неделю</div> : (
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(320px, 1fr))" }}>
              {chartOsv.map((r) => {
                // Пассивные счета (обязательства/капитал/доход) живут в кредите:
                // показываем сальдо со стороны, естественной для типа счёта.
                const passive = ["liability", "equity", "income"].includes(r.account_type);
                const bal = (v) => (passive ? -v : v);
                return (
                  <div key={r.code} style={{ ...st.locCard, padding: "10px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                      <span style={{ ...st.fundCode }}>{r.code}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, fontSize: 11.5 }}>
                      {[["Сальдо нач.", bal(r.opening), C.sub], ["Оборот Дт", r.debit_turnover, C.money], ["Оборот Кт", r.credit_turnover, C.danger], ["Сальдо кон.", bal(r.closing), C.text]].map(([l, v, col]) => (
                        <div key={l}>
                          <div style={{ color: C.faint, textTransform: "uppercase", letterSpacing: 0.3 }}>{l}</div>
                          <div style={{ fontWeight: 700, color: col, fontVariantNumeric: "tabular-nums" }}>{fmt(v)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </>);
    })()}

    {/* ---------------- Журнал проводок (двойная запись, Реестр §13) */}
    {tab === "postings" && (<>
      <div style={{ fontSize: 12, color: C.faint, marginBottom: 12 }}>
        Журнал проводок · {period ? periodTitle(period) : "—"} · вся сеть. Проводки — проекция Реестра
        (источника истины) по правилам «тип операции → Дт/Кт»; правила настраиваются во вкладке «Фонды».
      </div>
      {ledgerErr && <div role="alert" style={{ ...st.reqError, marginBottom: 12 }}>{ledgerErr}</div>}
      {ledgerLoading ? <div style={{ ...st.locCard, ...st.empty }}><Loader2 size={16} className="spin" /> Загрузка…</div>
      : !postings.length ? <div style={{ ...st.locCard, ...st.empty }}>Нет проводок за неделю</div> : (
        <section style={{ ...st.fpCard, marginTop: 0 }}>
          {postings.slice(0, shownN).map((p, i) => (
            <div key={`${p.reg_id}-${p.component}`} style={{
              display: "grid", gap: isMobile ? 4 : 10, alignItems: "center",
              gridTemplateColumns: isMobile ? "1fr auto" : "86px minmax(150px, 1.2fr) 1fr 1fr auto",
              padding: "9px 4px", borderTop: i ? `1px solid ${C.line}` : "none", fontSize: 12.5,
            }}>
              {!isMobile && <div style={{ color: C.sub, fontVariantNumeric: "tabular-nums" }}>{new Date(p.posted_on + "T00:00:00").toLocaleDateString("ru")}</div>}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{OP_LABELS[p.op_type] || p.op_type}</div>
                {isMobile && <div style={{ fontSize: 11, color: C.faint }}>{new Date(p.posted_on + "T00:00:00").toLocaleDateString("ru")}</div>}
                {p.comment && <div style={{ fontSize: 11, color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.comment}</div>}
              </div>
              {isMobile ? (
                <div style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{fmt(Number(p.amount))}</div>
              ) : (<>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: C.faint, fontSize: 10.5, textTransform: "uppercase" }}>Дт {p.debit_code}</div>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[p.debit_name, p.debit_sub].filter(Boolean).join(" · ")}</div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: C.faint, fontSize: 10.5, textTransform: "uppercase" }}>Кт {p.credit_code}</div>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[p.credit_name, p.credit_sub].filter(Boolean).join(" · ")}</div>
                </div>
                <div style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{fmt(Number(p.amount))}</div>
              </>)}
              {isMobile && (
                <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10, fontSize: 11, color: C.sub, minWidth: 0 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Дт {p.debit_code} {[p.debit_name, p.debit_sub].filter(Boolean).join(" · ")}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Кт {p.credit_code} {[p.credit_name, p.credit_sub].filter(Boolean).join(" · ")}</span>
                </div>
              )}
            </div>
          ))}
          {postings.length > shownN && (
            <div style={{ textAlign: "center", padding: "10px 0" }}>
              <button className="btn" style={st.btnGhost} onClick={() => setShownN((n) => n + JOURNAL_PAGE)}>
                Показать ещё ({postings.length - shownN})
              </button>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 14, paddingTop: 10, borderTop: `2px solid ${C.line}`, fontSize: 12.5, fontWeight: 800 }}>
            <span style={{ color: C.sub }}>Σ Дт = Σ Кт (все {postings.length})</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(postingsTotal)} TJS</span>
          </div>
        </section>
      )}
    </>)}
  </>);
}
