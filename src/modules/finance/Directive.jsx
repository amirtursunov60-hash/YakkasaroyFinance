import { useState, useMemo, useEffect, useCallback } from "react";
import { ClipboardList, Calculator, ChevronDown, CalendarDays, Check, RotateCcw, RotateCw, Lock, Unlock, Ban, ArrowRightLeft, Loader2, AlertCircle, CheckCircle2, Plus, X } from "lucide-react";
import { Stat } from "../../components/common";
import { useTheme } from "../../theme/theme";
import { fmt } from "../../utils/format";
import {
  weekBounds, isoDate, getPeriodFor, fetchPeriods, fetchFunds, fetchDefaultRules,
  fetchPeriodIncome, fetchPeriodDistribution, distributeStage, setPeriodStatus, closePeriod, reopenPeriod, resetDistribution,
} from "../../lib/api";


// ---------------------------------------------------------------- DIRECTIVE
// Живые данные. Процесс как в прототипе: по каждому этапу «Рассчитать»
// (оранжевый предварительный расчёт) → «Одобрить» (фактическое зачисление
// в фонды через Реестр, зелёное) → «Сброс». Этапы каскадом: база следующего =
// остаток после предыдущего. Внизу: запрет подачи заявок (статус периода
// «на планировании»), закрытие периода Директивой, перенос остатка в фонд.

const MON = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const STAGES = [
  { key: "revenue",  title: "Выручка",                 fundsTitle: "Фонды выручки" },
  { key: "margin",   title: "Маржинальный доход",      fundsTitle: "Фонды маржинального дохода" },
  { key: "adjusted", title: "Скорректированный доход", fundsTitle: "Фонды скорректированного дохода" },
];
const STATUS_LABEL = { open: "открыт", planning: "на планировании", closed: "закрыт" };
const ORANGE = "#e8911c";

const periodTitle = (p) => {
  const s = new Date(p.starts_on + "T00:00:00"), e = new Date(p.ends_on + "T00:00:00");
  return `${s.getDate()} ${MON[s.getMonth()]} – ${e.getDate()} ${MON[e.getMonth()]} ${e.getFullYear()}`;
};
const byFundCode = (fundById) => (a, b) =>
  (fundById[a.fund_id]?.code || "").localeCompare(fundById[b.fund_id]?.code || "", "ru", { numeric: true });

export function Directive() {
  const { C, st, isMobile } = useTheme();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const [periods, setPeriods] = useState([]);
  const [funds, setFunds] = useState([]);
  const [rules, setRules] = useState([]);
  const [periodId, setPeriodId] = useState(null);
  const [income, setIncome] = useState(0);
  const [prevIncome, setPrevIncome] = useState(0);
  const [regRows, setRegRows] = useState([]);     // распределение из Реестра
  const [calculated, setCalculated] = useState({}); // { stage: { fund_id: сумма } }
  const [pcts, setPcts] = useState({});             // правки процентов { ruleId: число }
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(null);           // 'create'|'block'|'close'|'transfer'|`calc:х`|`appr:х`
  const [transferOpen, setTransferOpen] = useState(false);

  const period = periods.find((p) => p.id === periodId) || null;
  const isClosed = period?.status === "closed";
  const requestsBlocked = period?.status === "planning";

  // -------- загрузка
  const loadBase = useCallback(async (keepPeriod) => {
    setErr("");
    try {
      const [ps, fs, rs] = await Promise.all([fetchPeriods(), fetchFunds(), fetchDefaultRules()]);
      setPeriods(ps);
      setFunds(fs.sort((a, b) => a.code.localeCompare(b.code, "ru", { numeric: true })));
      setRules(rs);
      if (!keepPeriod) {
        const curIso = isoDate(weekBounds(new Date()).start);
        const cur = ps.find((p) => p.starts_on === curIso);
        setPeriodId((id) => id || cur?.id || ps[0]?.id || null);
      }
    } catch (e) {
      setErr("Не удалось загрузить данные: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { loadBase(); }, [loadBase]);

  const reloadPeriodData = useCallback(async () => {
    if (!periodId) { setIncome(0); setPrevIncome(0); setRegRows([]); return; }
    const prev = periods.find((p) => p.starts_on < (period?.starts_on || "")) || null;
    const [inc, pinc, rows] = await Promise.all([
      fetchPeriodIncome(periodId),
      prev ? fetchPeriodIncome(prev.id) : Promise.resolve(0),
      fetchPeriodDistribution(periodId),
    ]);
    setIncome(inc); setPrevIncome(pinc); setRegRows(rows);
  }, [periodId, periods, period]);

  useEffect(() => {
    let on = true;
    (async () => {
      try { if (on) { await reloadPeriodData(); setCalculated({}); setPcts({}); setDone(""); } }
      catch (e) { if (on) setErr("Не удалось загрузить период: " + (e?.message || e)); }
    })();
    return () => { on = false; };
  }, [periodId]);                                   // eslint-disable-line react-hooks/exhaustive-deps

  const fundById = useMemo(() => Object.fromEntries(funds.map((f) => [f.id, f])), [funds]);
  const pctOf = (r) => (pcts[r.id] !== undefined ? pcts[r.id] : Number(r.percent ?? 0));

  // -------- одобренное по этапам из Реестра (легаси-строки без этапа — в первый подходящий)
  const approvedByStage = useMemo(() => {
    const m = { revenue: {}, margin: {}, adjusted: {}, remainder: {} };
    const legacy = [];
    regRows.forEach((r) => {
      if (r.stage && m[r.stage]) m[r.stage][r.fund_id] = (m[r.stage][r.fund_id] || 0) + r.amount;
      else legacy.push(r);
    });
    legacy.forEach((r) => {
      const sg = STAGES.find((s) => rules.some((rule) => rule.stage === s.key && rule.fund_id === r.fund_id));
      const key = sg ? sg.key : "remainder";
      m[key][r.fund_id] = (m[key][r.fund_id] || 0) + r.amount;
    });
    return m;
  }, [regRows, rules]);

  // -------- этапы каскадом
  const stagesView = useMemo(() => {
    let base = income;
    return STAGES.map((meta) => {
      const stageRules = rules.filter((r) => r.stage === meta.key).sort(byFundCode(fundById));
      const appr = approvedByStage[meta.key] || {};
      const isApproved = Object.keys(appr).length > 0;
      const calc = calculated[meta.key] || {};
      const rows = stageRules.map((r) => ({
        rule: r, fund: fundById[r.fund_id],
        calc: calc[r.fund_id] || 0,
        appr: appr[r.fund_id] || 0,
      }));
      const sumCalc = rows.reduce((a, x) => a + x.calc, 0);
      const sumAppr = rows.reduce((a, x) => a + x.appr, 0);
      const view = { ...meta, base, rows, sumCalc, sumAppr, isApproved };
      base -= isApproved ? sumAppr : sumCalc;
      return view;
    });
  }, [rules, fundById, income, calculated, approvedByStage]);

  const approvedTotal = useMemo(
    () => Object.values(approvedByStage).reduce((a, m) => a + Object.values(m).reduce((s, v) => s + v, 0), 0),
    [approvedByStage],
  );
  const remainder = income - approvedTotal;
  const fundsTotal = useMemo(() => funds.reduce((a, f) => a + Number(f.balance || 0), 0), [funds]);

  // -------- действия
  const doCalc = (sg) => {
    setBusy(`calc:${sg.key}`);
    // лёгкая задержка, чтобы анимация расчёта читалась, как в прототипе
    setTimeout(() => {
      setCalculated((p) => ({
        ...p,
        [sg.key]: Object.fromEntries(sg.rows.map((x) => [x.rule.fund_id, Math.round(sg.base * pctOf(x.rule)) / 100])),
      }));
      setBusy(null);
    }, 400);
  };

  const doApprove = async (sg) => {
    if (busy) return;
    const calc = calculated[sg.key] || {};
    const allocations = Object.entries(calc).filter(([, v]) => v > 0).map(([fund_id, amount]) => ({ fund_id, amount }));
    if (!allocations.length) { setErr(`${sg.title}: сначала нажмите «Рассчитать»`); return; }
    setBusy(`appr:${sg.key}`); setErr(""); setDone("");
    try {
      await distributeStage(periodId, sg.key, allocations);
      await Promise.all([reloadPeriodData(), loadBase(true)]);
      setCalculated((p) => ({ ...p, [sg.key]: {} }));
      setDone(`${sg.title}: распределение одобрено и зачислено в фонды`);
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  const doReset = (sg) => setCalculated((p) => ({ ...p, [sg.key]: {} }));

  // Сброс уже одобренного этапа: суммы списываются из фондов (удаление из Реестра).
  // Старые распределения без метки этапа сбрасываются только целиком.
  const doResetApproved = async (sg) => {
    if (busy) return;
    const hasLegacy = regRows.some((r) => !r.stage);
    const msg = hasLegacy
      ? "Это распределение проведено без разбивки по этапам — будет сброшено ВСЁ распределение периода, суммы спишутся из фондов. Продолжить?"
      : `Сбросить одобренный этап «${sg.title}»? Суммы будут списаны из фондов.`;
    if (!window.confirm(msg)) return;
    setBusy(`reset:${sg.key}`); setErr(""); setDone("");
    try {
      await resetDistribution(periodId, hasLegacy ? "all" : sg.key);
      await Promise.all([reloadPeriodData(), loadBase(true)]);
      setCalculated({});
      setDone(hasLegacy ? "Распределение периода сброшено — можно рассчитать и одобрить заново" : `${sg.title}: одобрение сброшено`);
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  const toggleRequests = async () => {
    if (busy || !period || isClosed) return;
    setBusy("block"); setErr("");
    try {
      await setPeriodStatus(periodId, requestsBlocked ? "open" : "planning");
      await loadBase(true);
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  // Переключатель: закрытая неделя открывается обратно, открытая — закрывается
  const doToggleClose = async () => {
    if (busy || !period) return;
    setErr(""); setDone("");
    if (isClosed) {
      if (!window.confirm("Открыть неделю заново? Протокол Директивы будет удалён, операции периода снова разрешены.")) return;
      setBusy("close");
      try {
        await reopenPeriod(periodId);
        await Promise.all([loadBase(true), reloadPeriodData()]);
        setDone("Неделя открыта заново — операции периода разрешены");
      } catch (e) { setErr(e?.message || String(e)); }
      finally { setBusy(null); }
      return;
    }
    if (!window.confirm("Закрыть период ФП? Все операции периода будут заблокированы, протокол Директивы сохранится.")) return;
    setBusy("close");
    try {
      const protocol = {
        income,
        allocations: regRows.map((r) => ({
          stage: r.stage, fund: fundById[r.fund_id]?.code, name: fundById[r.fund_id]?.name, amount: r.amount,
        })),
        remainder,
      };
      await closePeriod(periodId, protocol);
      await Promise.all([loadBase(true), reloadPeriodData()]);
      setDone("Период закрыт, протокол Директивы сохранён. Следующая неделя создана — выберите её в списке периодов.");
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  const doTransfer = async (fundId) => {
    if (busy) return;
    setBusy("transfer"); setErr(""); setDone("");
    try {
      await distributeStage(periodId, "remainder", [{ fund_id: fundId, amount: Math.round(remainder * 100) / 100 }]);
      await Promise.all([reloadPeriodData(), loadBase(true)]);
      setTransferOpen(false);
      setDone(`Остаток ${fmt(remainder)} перенесён в фонд ${fundById[fundId]?.code}`);
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  const createCurrent = async () => {
    setBusy("create"); setErr("");
    try {
      const p = await getPeriodFor(new Date(), { create: true });
      if (!p) throw new Error("Нет прав на создание периода");
      await loadBase(true);
      setPeriodId(p.id);
      setPickerOpen(false);
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  const currentExists = useMemo(
    () => periods.some((p) => p.starts_on === isoDate(weekBounds(new Date()).start)),
    [periods],
  );

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
          <Stat label="Доход на этой неделе" value={fmt(income)} unit="TJS" />
          <Stat label="Доступно во всех фондах" value={fmt(fundsTotal)} unit="TJS" accent />
          <Stat label="Доход за прошлую неделю" value={fmt(prevIncome)} unit="TJS" />
          <Stat label="Одобрено распределение" value={fmt(approvedTotal)} unit="TJS" />
        </div>
      </div>
    </section>

    {err && <div style={{ ...st.reqError, marginBottom: 14 }}><AlertCircle size={15} /> {err}</div>}
    {done && <div style={{ ...st.reqError, marginBottom: 14, color: C.green, background: `${C.green}1a`, borderColor: `${C.green}44` }}><CheckCircle2 size={15} /> {done}</div>}

    {!rules.length && (
      <div style={{ ...st.locCard, ...st.empty }}>
        Схема распределения не настроена — примените миграции 006–007 (supabase/README.md).
      </div>
    )}

    {stagesView.map((sg) => (
      <LevelCard key={sg.key} sg={sg} C={C} st={st} isMobile={isMobile}
        pctOf={pctOf} setPcts={setPcts} busy={busy} locked={isClosed || !period}
        onCalc={() => doCalc(sg)} onApprove={() => doApprove(sg)}
        onReset={() => doReset(sg)} onResetApproved={() => doResetApproved(sg)} />
    ))}

    {/* Итог распределения на ФП */}
    <section style={st.fpCard}>
      <div style={st.fpRows}>
        <div style={st.fpRow}><span style={st.fpLabelBold}>Сумма к распределению на ФП</span><span style={st.fpValBold}>{fmt(income)}</span></div>
        <div style={st.fpRow}><span style={st.fpLabel}>Распределено по фондам (Реестр)</span><span style={st.fpVal}>{fmt(approvedTotal)}</span></div>
        <div style={{ ...st.fpRow, ...st.fpRemainder }}>
          <span style={st.fpLabelBold}>Остаток нераспределённого</span>
          <span style={{ ...st.fpValBold, color: C.green }}>{fmt(remainder)}</span>
        </div>
      </div>
      <div style={st.fpActions} className="fpActions">
        <button style={{ ...st.fpBtn, ...(requestsBlocked ? st.fpBtnDanger : st.fpBtnGhost), opacity: busy === "block" ? 0.7 : 1 }}
          className="btn fpBtn" onClick={toggleRequests} disabled={busy || isClosed || !period}>
          {busy === "block" ? <Loader2 size={15} className="spin" />
            : requestsBlocked ? <Lock size={15} /> : <Ban size={15} />}
          {requestsBlocked ? " Подача заявок запрещена" : " Запретить подачу заявок"}
        </button>
        <button style={{ ...st.fpBtn, ...(isClosed ? st.fpBtnDanger : st.fpBtnPrimary), opacity: busy === "close" ? 0.7 : 1 }}
          className="btn fpBtn" onClick={doToggleClose} disabled={busy || !period}>
          {busy === "close" ? <Loader2 size={15} className="spin" /> : isClosed ? <Unlock size={15} /> : <Lock size={15} />}
          {isClosed ? " Открыть неделю" : " Закрыть период ФП"}
        </button>
        <button style={{ ...st.fpBtn, ...st.fpBtnGhost }} className="btn fpBtn"
          onClick={() => setTransferOpen(true)} disabled={busy || isClosed || !period || remainder <= 0}>
          <ArrowRightLeft size={15} /> Перенести остатки в фонд
        </button>
      </div>
    </section>

    {/* Заявки — появятся после реализации подачи в Личном кабинете */}
    <section style={st.reqSection}>
      <div style={st.reqSectionHead}>
        <ClipboardList size={18} color={C.green} />
        <h3 style={st.reqSectionTitle}>Заявки к рассмотрению</h3>
        <span style={st.reqSectionSub}>Финкомитет одобряет или отклоняет</span>
        {requestsBlocked && <span style={st.reqBlockedTag}><Lock size={12} /> Подача закрыта</span>}
      </div>
      <div style={{ ...st.locCard, ...st.empty }}>
        Заявок пока нет. Подача заявок (от поста, в формате ЗРС) появится в Личном кабинете —
        после этого они будут рассматриваться здесь.
      </div>
    </section>

    {transferOpen && (
      <TransferModal C={C} st={st} funds={funds} remainder={remainder}
        busy={busy === "transfer"} onClose={() => setTransferOpen(false)} onTransfer={doTransfer} />
    )}
  </>);
}


// ---------------------------------------------------------------- Этап распределения
function LevelCard({ sg, C, st, isMobile, pctOf, setPcts, busy, locked, onCalc, onApprove, onReset, onResetApproved }) {
  const calcBusy = busy === `calc:${sg.key}`;
  const apprBusy = busy === `appr:${sg.key}`;
  const resetBusy = busy === `reset:${sg.key}`;
  const editable = !sg.isApproved && !locked;

  const CalcBtn = () => (
    <button style={st.btnGhost} onClick={onCalc} className="btn" disabled={!!busy || !editable}>
      {calcBusy ? <span className="spin"><RotateCw size={15} /></span> : <Calculator size={15} />} Рассчитать
    </button>
  );
  const ApproveBtn = () => (
    <button style={{ ...st.btnGreen, opacity: editable ? (busy ? 0.7 : 1) : 0.35, cursor: editable ? "pointer" : "not-allowed" }}
      onClick={onApprove} className="btn" disabled={!!busy || !editable}>
      {apprBusy ? <span className="spin"><RotateCw size={15} /></span> : <Check size={15} />} Одобрить
    </button>
  );
  // Сброс: до одобрения чистит расчёт, после одобрения — списывает из фондов
  const ResetBtn = () => (
    <button style={st.btnGhost} onClick={sg.isApproved ? onResetApproved : onReset} className="btn" disabled={!!busy || locked}>
      {resetBusy ? <span className="spin"><RotateCw size={14} /></span> : <RotateCcw size={14} />} Сброс
    </button>
  );

  const totals = sg.rows.reduce((t, x) => ({
    avail: t.avail + Number(x.fund?.balance || 0), calc: t.calc + x.calc, appr: t.appr + x.appr,
  }), { avail: 0, calc: 0, appr: 0 });

  return (
    <div style={st.cardWrap}>
      <section style={st.card}>
        <div style={st.cardHead}>
          <div style={st.cardTitle}>{sg.title}</div>
          <div style={st.cardTotal}>{fmt(sg.base)} <span style={st.unit}>TJS</span></div>
        </div>
        <div style={st.subHead}>
          <span style={st.subHeadTitle}>{sg.fundsTitle}</span>
          <span style={st.subHeadAppr}>Одобрено: <b style={{ color: C.green }}>{fmt(totals.appr)}</b></span>
        </div>
        {sg.rows.length === 0 ? <div style={st.empty}>Фонды этого этапа не настроены</div> : (<>
          <div style={{ ...st.frow, ...st.frowHead }}>
            <div style={st.fName}>Название</div><div style={st.fPct}>%</div>
            <div style={st.fNum}>Доступно</div><div style={st.fNum}>Рассчитано</div><div style={st.fNum}>Одобрено</div>
          </div>
          {sg.rows.map((x) => {
            const avail = Number(x.fund?.balance || 0);
            const barVal = x.appr || x.calc;
            const barBase = avail > 0 ? avail : (barVal || 1);
            const fill = barVal > 0 ? Math.min(100, (barVal / barBase) * 100) : 0;
            return (
              <div key={x.rule.id} style={st.frow} className="frow">
                <div style={st.fName}>
                  <div style={st.fundTop}>
                    <span style={st.fundCode}>{x.fund?.code}</span><span>{x.fund?.name}</span>
                    {x.fund?.is_restricted && <Lock size={12} color={C.faint} />}
                  </div>
                  <div style={st.bar}><div style={{ ...st.barFill, width: `${fill}%`, background: x.appr ? C.green : ORANGE }} /></div>
                </div>
                <div style={st.fPct}>
                  {editable ? (<>
                    <input style={st.pctInput} className="pctIn" type="number" inputMode="decimal"
                      value={pctOf(x.rule)}
                      onChange={(e) => setPcts((p) => ({ ...p, [x.rule.id]: e.target.value === "" ? 0 : Number(e.target.value) }))}
                      onWheel={(e) => e.target.blur()} />
                    <span style={st.pctSign}>%</span>
                  </>) : (<>{pctOf(x.rule)}<span style={st.pctSign}>%</span></>)}
                </div>
                <div style={{ ...st.fNum, fontWeight: 700 }}>{fmt(avail)}</div>
                <div style={{ ...st.fNum, color: x.calc ? ORANGE : C.faint, fontWeight: x.calc ? 600 : 400 }}>
                  <span className={calcBusy ? "" : x.calc ? "pop" : ""}>{fmt(x.calc)}</span>
                </div>
                <div style={{ ...st.fNum, color: x.appr ? C.green : C.faint, fontWeight: x.appr ? 700 : 400 }}>
                  <span className={x.appr ? "pop" : ""}>{fmt(x.appr)}</span>
                </div>
              </div>
            );
          })}
          <div style={{ ...st.frow, ...st.frowTotal }}>
            {isMobile ? <div style={st.fName}><b>Итого</b></div> : (
              <div style={st.fName}><div style={st.actions}><CalcBtn /><ApproveBtn /><ResetBtn /></div></div>
            )}
            <div style={st.fPct} />
            <div style={{ ...st.fNum, fontWeight: 700 }}>{fmt(totals.avail)}</div>
            <div style={{ ...st.fNum, fontWeight: 700, color: totals.calc ? ORANGE : C.faint }}>{fmt(totals.calc)}</div>
            <div style={{ ...st.fNum, fontWeight: 700, color: C.green }}>{fmt(totals.appr)}</div>
          </div>
          {isMobile && <div style={st.mActions}><CalcBtn /><ApproveBtn /><ResetBtn /></div>}
        </>)}
      </section>
    </div>
  );
}


// ---------------------------------------------------------------- Перенос остатка в фонд
function TransferModal({ C, st, funds, remainder, busy, onClose, onTransfer }) {
  const [fundId, setFundId] = useState(funds.find((f) => f.code === "FD6")?.id || funds[0]?.id || "");
  return (
    <div style={st.mdOverlay} onClick={onClose}>
      <div style={{ ...st.mdCard, width: "min(420px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>Перенести остаток в фонд</div>
          <button style={st.iconBtn} onClick={onClose}><X size={17} /></button>
        </div>
        <div style={{ ...st.reqField, marginBottom: 12 }}>
          <span style={st.reqFieldLbl}>Сумма остатка</span>
          <div style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
            {fmt(remainder)} <span style={st.locUnit}>TJS</span>
          </div>
        </div>
        <div style={st.reqField}>
          <span style={st.reqFieldLbl}>Фонд-получатель</span>
          <select style={st.mdSelect} className="fin" value={fundId} onChange={(e) => setFundId(e.target.value)}>
            {funds.map((f) => <option key={f.id} value={f.id}>{f.code} — {f.name}</option>)}
          </select>
        </div>
        <div style={st.mdActions}>
          <button style={st.btnGhost} className="btn" onClick={onClose}>Отмена</button>
          <button style={{ ...st.btnGreen, opacity: busy ? 0.7 : 1 }} className="btn"
            onClick={() => onTransfer(fundId)} disabled={busy || !fundId}>
            {busy ? <Loader2 size={15} className="spin" /> : <ArrowRightLeft size={15} />} Перенести
          </button>
        </div>
      </div>
    </div>
  );
}
