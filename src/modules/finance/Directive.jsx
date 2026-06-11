import { useState, useMemo, useEffect, useCallback } from "react";
import { ClipboardList, ChevronDown, CalendarDays, Check, CheckCircle2, RotateCcw, Lock, Loader2, AlertCircle, Plus } from "lucide-react";
import { Stat } from "../../components/common";
import { useTheme } from "../../theme/theme";
import { fmt } from "../../utils/format";
import {
  weekBounds, getPeriodFor, fetchPeriods, fetchFunds, fetchDefaultRules,
  fetchPeriodIncome, fetchPeriodDistribution, runDistribution, closePeriod,
} from "../../lib/api";


// ---------------------------------------------------------------- DIRECTIVE
// Живые данные: недельное распределение дохода периода по фондам в 3 этапа
// (схема по умолчанию из distribution_rules), проведение в Реестр и закрытие
// периода — через серверные функции fp_run_distribution / fp_close_period.

const MON = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const STAGES = [
  { key: "revenue",  title: "Выручка",                 fundsTitle: "Фонды выручки" },
  { key: "margin",   title: "Маржинальный доход",      fundsTitle: "Фонды маржинального дохода" },
  { key: "adjusted", title: "Скорректированный доход", fundsTitle: "Фонды скорректированного дохода" },
];
const STATUS_LABEL = { open: "открыт", planning: "на планировании", closed: "закрыт" };

const periodTitle = (p) => {
  const s = new Date(p.starts_on + "T00:00:00"), e = new Date(p.ends_on + "T00:00:00");
  return `${s.getDate()} ${MON[s.getMonth()]} – ${e.getDate()} ${MON[e.getMonth()]} ${e.getFullYear()}`;
};

export function Directive() {
  const { C, st, isMobile } = useTheme();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [periods, setPeriods] = useState([]);
  const [funds, setFunds] = useState([]);
  const [rules, setRules] = useState([]);
  const [periodId, setPeriodId] = useState(null);
  const [income, setIncome] = useState(0);
  const [dist, setDist] = useState({});          // { fund_id: сумма } — факт из Реестра
  const [pcts, setPcts] = useState({});          // правка процентов: { ruleId: число }
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(null);        // 'run' | 'close' | 'create' | null
  const [done, setDone] = useState("");          // сообщение об успехе

  const period = periods.find((p) => p.id === periodId) || null;
  const isClosed = period?.status === "closed";
  const distributed = Object.keys(dist).length > 0;

  // Первичная загрузка справочников и списка периодов
  const loadBase = useCallback(async () => {
    setErr("");
    try {
      const [ps, fs, rs] = await Promise.all([fetchPeriods(), fetchFunds(), fetchDefaultRules()]);
      const cmp = (a, b) => a.code.localeCompare(b.code, "ru", { numeric: true });
      setPeriods(ps); setFunds(fs.sort(cmp)); setRules(rs);
      if (!periodId) {
        const todayStart = weekBounds(new Date()).start;
        const cur = ps.find((p) => p.starts_on === `${todayStart.getFullYear()}-${String(todayStart.getMonth() + 1).padStart(2, "0")}-${String(todayStart.getDate()).padStart(2, "0")}`);
        setPeriodId(cur?.id || ps[0]?.id || null);
      }
    } catch (e) {
      setErr("Не удалось загрузить данные: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [periodId]);
  useEffect(() => { loadBase(); }, []);          // eslint-disable-line react-hooks/exhaustive-deps

  // Данные выбранного периода
  useEffect(() => {
    if (!periodId) { setIncome(0); setDist({}); return; }
    let on = true;
    (async () => {
      try {
        const [inc, d] = await Promise.all([fetchPeriodIncome(periodId), fetchPeriodDistribution(periodId)]);
        if (on) { setIncome(inc); setDist(d); setPcts({}); setDone(""); }
      } catch (e) { if (on) setErr("Не удалось загрузить период: " + (e?.message || e)); }
    })();
    return () => { on = false; };
  }, [periodId]);

  const fundById = useMemo(() => Object.fromEntries(funds.map((f) => [f.id, f])), [funds]);
  const pctOf = (r) => (pcts[r.id] !== undefined ? pcts[r.id] : Number(r.percent ?? 0));

  // Каскад этапов: выручка → маржинальный → скорректированный.
  // База этапа = остаток после распределения предыдущего.
  const stages = useMemo(() => {
    let base = income;
    return STAGES.map((sMeta) => {
      const stageRules = rules
        .filter((r) => r.stage === sMeta.key)
        .sort((a, b) => (fundById[a.fund_id]?.code || "").localeCompare(fundById[b.fund_id]?.code || "", "ru", { numeric: true }));
      const rows = stageRules.map((r) => ({
        rule: r,
        fund: fundById[r.fund_id],
        // сумма этапа с округлением до сомони с дирамами (2 знака)
        amount: distributed ? 0 : Math.round(base * pctOf(r)) / 100,
      }));
      const sum = rows.reduce((a, x) => a + x.amount, 0);
      const stage = { ...sMeta, base, rows, sum };
      base = base - sum;
      return stage;
    });
  }, [rules, fundById, income, pcts, distributed]);

  const plannedTotal = stages.reduce((a, s) => a + s.sum, 0);
  const remainder = income - plannedTotal;
  const distributedTotal = useMemo(() => Object.values(dist).reduce((a, v) => a + v, 0), [dist]);
  const fundsTotal = useMemo(() => funds.reduce((a, f) => a + Number(f.balance || 0), 0), [funds]);

  // Создать период текущей недели, если его ещё нет
  const currentExists = useMemo(() => {
    const s = weekBounds(new Date()).start;
    const iso = `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, "0")}-${String(s.getDate()).padStart(2, "0")}`;
    return periods.some((p) => p.starts_on === iso);
  }, [periods]);

  const createCurrent = async () => {
    setBusy("create"); setErr("");
    try {
      const p = await getPeriodFor(new Date(), { create: true });
      if (!p) throw new Error("Нет прав на создание периода");
      await loadBase();
      setPeriodId(p.id);
      setPickerOpen(false);
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  const protocolJson = () => ({
    income,
    allocations: stages.flatMap((s) => s.rows
      .filter((x) => x.amount > 0)
      .map((x) => ({ stage: s.key, fund: x.fund?.code, name: x.fund?.name, percent: pctOf(x.rule), amount: x.amount }))),
  });

  const doRun = async () => {
    if (busy) return;
    setBusy("run"); setErr(""); setDone("");
    try {
      const allocations = stages.flatMap((s) => s.rows
        .filter((x) => x.amount > 0)
        .map((x) => ({ fund_id: x.rule.fund_id, amount: x.amount })));
      await runDistribution(periodId, allocations);
      const [d, fs] = await Promise.all([fetchPeriodDistribution(periodId), fetchFunds()]);
      setDist(d); setFunds(fs.sort((a, b) => a.code.localeCompare(b.code, "ru", { numeric: true })));
      setDone("Распределение проведено — суммы зачислены в фонды через Реестр");
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  const doClose = async () => {
    if (busy) return;
    setBusy("close"); setErr(""); setDone("");
    try {
      await closePeriod(periodId, protocolJson());
      await loadBase();
      setDone("Период закрыт, протокол Директивы сохранён");
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  if (loading) return <div style={st.empty}><Loader2 size={18} className="spin" /> Загрузка…</div>;

  return (<>
    <section style={st.hero}>
      <div style={st.heroGlow} />
      <div style={st.heroContent}>
        <div style={st.heroTop}>
          <div>
            <div style={st.heroLabel}>Директива · недельное распределение ФРС</div>
            <div style={st.weekPickerWrap}>
              <button style={st.weekBtn} className="btn" onClick={() => setPickerOpen((v) => !v)}>
                <CalendarDays size={18} />
                <span style={st.heroTitle}>{period ? periodTitle(period) : "Период не создан"}</span>
                <ChevronDown size={16} style={{ transform: pickerOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
              </button>
              {pickerOpen && (<>
                <div style={st.weekOverlay} onClick={() => setPickerOpen(false)} />
                <div style={st.weekMenu}>
                  <div style={st.weekMenuHead}>Периоды ФП</div>
                  {!currentExists && (
                    <button style={st.weekOption} className="weekOpt" onClick={createCurrent} disabled={busy === "create"}>
                      <span style={{ color: C.green, display: "inline-flex", alignItems: "center", gap: 7 }}>
                        {busy === "create" ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Создать текущую неделю
                      </span>
                    </button>
                  )}
                  {periods.map((p) => (
                    <button key={p.id} style={{ ...st.weekOption, ...(p.id === periodId ? st.weekOptionOn : {}) }} className="weekOpt"
                      onClick={() => { setPeriodId(p.id); setPickerOpen(false); }}>
                      <span>{periodTitle(p)}</span>
                      {p.status === "closed"
                        ? <span style={{ ...st.weekTag, color: C.danger, background: `${C.danger}1a` }}>закрыт</span>
                        : <span style={st.weekTag}>{STATUS_LABEL[p.status]}</span>}
                      {p.id === periodId && <Check size={15} color={C.green} />}
                    </button>
                  ))}
                  {!periods.length && <div style={st.empty}>Периодов пока нет</div>}
                </div>
              </>)}
            </div>
          </div>
        </div>
        <div style={st.heroStats}>
          <Stat label="Доход периода" value={fmt(income)} unit="TJS" />
          <Stat label="Доступно во всех фондах" value={fmt(fundsTotal)} unit="TJS" accent />
          <Stat label={distributed ? "Распределено по фондам" : "К распределению по схеме"} value={fmt(distributed ? distributedTotal : plannedTotal)} unit="TJS" />
          <Stat label="Статус периода" value={period ? STATUS_LABEL[period.status] : "—"} unit="" />
        </div>
      </div>
    </section>

    {err && <div style={{ ...st.reqError, marginBottom: 14 }}><AlertCircle size={15} /> {err}</div>}
    {done && <div style={{ ...st.reqError, marginBottom: 14, color: C.green, background: `${C.green}1a`, borderColor: `${C.green}44` }}><CheckCircle2 size={15} /> {done}</div>}

    {!rules.length && (
      <div style={{ ...st.locCard, ...st.empty }}>
        Схема распределения не настроена — примените миграцию 006 (supabase/README.md).
      </div>
    )}

    {stages.map((sg) => (
      <div key={sg.key} style={st.cardWrap}>
        <section style={st.card}>
          <div style={st.cardHead}>
            <div style={st.cardTitle}>{sg.title}</div>
            <div style={st.cardTotal}>{fmt(sg.base)} <span style={st.unit}>TJS</span></div>
          </div>
          <div style={st.subHead}>
            <span style={st.subHeadTitle}>{sg.fundsTitle}</span>
            <span style={st.subHeadAppr}>{distributed ? "Зачислено фактически" : <>Будет зачислено: <b style={{ color: C.green }}>{fmt(sg.sum)}</b></>}</span>
          </div>
          {sg.rows.length === 0 ? <div style={st.empty}>Фонды этого этапа не настроены</div> : (<>
            <div style={{ ...st.frow, ...st.frowHead }}>
              <div style={st.fName}>Фонд</div><div style={st.fPct}>%</div>
              <div style={st.fNum}>Доступно</div><div style={st.fNum}>{distributed ? "Зачислено" : "Будет зачислено"}</div><div style={st.fNum} />
            </div>
            {sg.rows.map((x) => {
              const actual = dist[x.rule.fund_id] || 0;
              const val = distributed ? actual : x.amount;
              return (
                <div key={x.rule.id} style={st.frow} className="frow">
                  <div style={st.fName}>
                    <div style={st.fundTop}>
                      <span style={st.fundCode}>{x.fund?.code}</span><span>{x.fund?.name}</span>
                      {x.fund?.is_restricted && <Lock size={12} color={C.faint} />}
                    </div>
                  </div>
                  <div style={st.fPct}>
                    {distributed || isClosed
                      ? <>{pctOf(x.rule)}<span style={st.pctSign}>%</span></>
                      : (<>
                        <input style={st.pctInput} className="pctIn" type="number" inputMode="decimal"
                          value={pctOf(x.rule)}
                          onChange={(e) => setPcts((p) => ({ ...p, [x.rule.id]: e.target.value === "" ? 0 : Number(e.target.value) }))}
                          onWheel={(e) => e.target.blur()} />
                        <span style={st.pctSign}>%</span>
                      </>)}
                  </div>
                  <div style={{ ...st.fNum, fontWeight: 700 }}>{fmt(Number(x.fund?.balance || 0))}</div>
                  <div style={{ ...st.fNum, color: val ? C.green : C.faint, fontWeight: val ? 700 : 400 }}>{fmt(val)}</div>
                  <div style={st.fNum} />
                </div>
              );
            })}
            <div style={{ ...st.frow, ...st.frowTotal }}>
              <div style={st.fName}><b>Итого этап</b></div>
              <div style={st.fPct} />
              <div style={{ ...st.fNum, fontWeight: 700 }}>{fmt(sg.rows.reduce((a, x) => a + Number(x.fund?.balance || 0), 0))}</div>
              <div style={{ ...st.fNum, fontWeight: 700, color: C.green }}>
                {fmt(distributed ? sg.rows.reduce((a, x) => a + (dist[x.rule.fund_id] || 0), 0) : sg.sum)}
              </div>
              <div style={st.fNum} />
            </div>
          </>)}
        </section>
      </div>
    ))}

    {/* Итог распределения и закрытие периода */}
    <section style={st.fpCard}>
      <div style={st.fpRows}>
        <div style={st.fpRow}><span style={st.fpLabelBold}>Доход периода к распределению</span><span style={st.fpValBold}>{fmt(income)}</span></div>
        <div style={st.fpRow}>
          <span style={st.fpLabel}>{distributed ? "Распределено по фондам (Реестр)" : "Будет распределено по схеме"}</span>
          <span style={st.fpVal}>{fmt(distributed ? distributedTotal : plannedTotal)}</span>
        </div>
        <div style={{ ...st.fpRow, ...st.fpRemainder }}>
          <span style={st.fpLabelBold}>Остаток нераспределённого</span>
          <span style={{ ...st.fpValBold, color: C.green }}>{fmt(income - (distributed ? distributedTotal : plannedTotal))}</span>
        </div>
      </div>
      <div style={st.fpActions} className="fpActions">
        {!distributed && !isClosed && (
          <button style={{ ...st.fpBtn, ...st.fpBtnPrimary, opacity: busy ? 0.7 : 1 }} className="btn fpBtn"
            onClick={doRun} disabled={busy || !period || income <= 0}>
            {busy === "run" ? <Loader2 size={15} className="spin" /> : <Check size={15} />} Провести распределение
          </button>
        )}
        {distributed && !isClosed && (
          <span style={{ ...st.fpBtn, ...st.fpBtnGhost, cursor: "default" }}><CheckCircle2 size={15} color={C.green} /> Распределение проведено</span>
        )}
        <button style={{ ...st.fpBtn, ...(isClosed ? st.fpBtnClosed : st.fpBtnDanger), opacity: busy ? 0.7 : 1 }} className="btn fpBtn"
          onClick={doClose} disabled={busy || !period || isClosed}>
          {busy === "close" ? <Loader2 size={15} className="spin" /> : isClosed ? <Check size={15} /> : <Lock size={15} />}
          {isClosed ? " Период ФП закрыт" : " Закрыть период ФП"}
        </button>
        {!period && (
          <button style={{ ...st.fpBtn, ...st.fpBtnGhost }} className="btn fpBtn" onClick={createCurrent} disabled={busy === "create"}>
            {busy === "create" ? <Loader2 size={15} className="spin" /> : <RotateCcw size={15} />} Создать период текущей недели
          </button>
        )}
      </div>
    </section>

    {/* Заявки — появятся после реализации подачи в Личном кабинете */}
    <section style={st.reqSection}>
      <div style={st.reqSectionHead}>
        <ClipboardList size={18} color={C.green} />
        <h3 style={st.reqSectionTitle}>Заявки к рассмотрению</h3>
        <span style={st.reqSectionSub}>Финкомитет одобряет или отклоняет</span>
      </div>
      <div style={{ ...st.locCard, ...st.empty }}>
        Заявок пока нет. Подача заявок (от поста, в формате ЗРС) появится в Личном кабинете —
        после этого они будут рассматриваться здесь.
      </div>
    </section>
  </>);
}
