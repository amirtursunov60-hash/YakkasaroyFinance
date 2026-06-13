import { useState, useMemo, useEffect, useCallback } from "react";
import { ClipboardList, Calculator, CalendarDays, Check, RotateCcw, RotateCw, Lock, Unlock, Ban, ArrowRightLeft, Loader2, AlertCircle, CheckCircle2, X, Folder, FolderOpen, ChevronRight } from "lucide-react";
import { Stat } from "../../components/common";
import { useTheme } from "../../theme/theme";
import { fmt } from "../../utils/format";
import { usePeriod, periodTitle } from "../../lib/PeriodCtx";
import {
  fetchFunds, fetchDefaultRules,
  fetchPeriodIncome, fetchPeriodDistribution, distributeStage, setPeriodStatus, closePeriod, reopenPeriod, resetDistribution,
  fetchRequests, fetchBills, fetchPeriodOverrides, savePeriodOverrides,
  fetchIncomeTypeRules, fetchIncomeByType, fetchFundFolders,
} from "../../lib/api";


// ---------------------------------------------------------------- DIRECTIVE
// Живые данные. Процесс как в прототипе: по каждому этапу «Рассчитать»
// (оранжевый предварительный расчёт) → «Одобрить» (фактическое зачисление
// в фонды через Реестр, зелёное) → «Сброс». Этапы каскадом: база следующего =
// остаток после предыдущего. Внизу: запрет подачи заявок (статус периода
// «на планировании»), закрытие периода Директивой, перенос остатка в фонд.
// Неделя выбирается в шапке приложения (общий PeriodCtx).

const STAGES = [
  { key: "revenue",  title: "Выручка",                 fundsTitle: "Фонды выручки" },
  { key: "margin",   title: "Маржинальный доход",      fundsTitle: "Фонды маржинального дохода" },
  { key: "adjusted", title: "Скорректированный доход", fundsTitle: "Фонды скорректированного дохода" },
];

const byFundCode = (fundById) => (a, b) =>
  (fundById[a.fund_id]?.code || "").localeCompare(fundById[b.fund_id]?.code || "", "ru", { numeric: true });

export function Directive() {
  const { C, st, isMobile } = useTheme();
  const { period, periodId, prevPeriod, loading: periodsLoading, reload: reloadPeriods } = usePeriod();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const [funds, setFunds] = useState([]);
  const [rules, setRules] = useState([]);
  const [income, setIncome] = useState(0);
  const [prevIncome, setPrevIncome] = useState(0);
  const [regRows, setRegRows] = useState([]);     // распределение из Реестра
  const [calculated, setCalculated] = useState({}); // { stage: { fund_id: сумма } }
  const [pcts, setPcts] = useState({});             // правки процентов { ruleId: число }
  const [busy, setBusy] = useState(null);           // 'block'|'close'|'transfer'|`calc:х`|`appr:х`
  const [transferOpen, setTransferOpen] = useState(false);
  const [pending, setPending] = useState({ reqs: [], bills: [] }); // к рассмотрению
  const [fundRules, setFundRules] = useState({});     // правила по видам дохода { fundId: [rules] }
  const [folders, setFolders] = useState([]);         // папки фондов
  const [incomeByType, setIncomeByType] = useState({}); // факт дохода недели по видам
  const [calcFund, setCalcFund] = useState(null);     // { fund, stage } — модал-калькулятор

  const isClosed = period?.status === "closed";
  const requestsBlocked = period?.status === "planning";

  // -------- загрузка справочников (фонды, правила схемы)
  const loadRefs = useCallback(async () => {
    setErr("");
    try {
      const [fs, rs, fr, fl] = await Promise.all([
        fetchFunds(), fetchDefaultRules(), fetchIncomeTypeRules(), fetchFundFolders(),
      ]);
      setFunds(fs.sort((a, b) => a.code.localeCompare(b.code, "ru", { numeric: true })));
      setRules(rs); setFundRules(fr); setFolders(fl);
    } catch (e) {
      setErr("Не удалось загрузить данные: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { loadRefs(); }, [loadRefs]);

  const reloadPeriodData = useCallback(async () => {
    if (!periodId) { setIncome(0); setPrevIncome(0); setRegRows([]); return; }
    const [inc, pinc, rows] = await Promise.all([
      fetchPeriodIncome(periodId),
      prevPeriod ? fetchPeriodIncome(prevPeriod.id) : Promise.resolve(0),
      fetchPeriodDistribution(periodId),
    ]);
    setIncome(inc); setPrevIncome(pinc); setRegRows(rows);
  }, [periodId, prevPeriod]);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        if (on) {
          await reloadPeriodData();
          // скорректированная схема недели (ТЗ §4.1.3) — сохранённые правки процентов
          const [ov, ibt] = await Promise.all([
            periodId ? fetchPeriodOverrides(periodId) : {},
            periodId ? fetchIncomeByType(periodId) : {},
          ]);
          setCalculated({}); setPcts(ov); setIncomeByType(ibt); setDone("");
        }
      }
      catch (e) { if (on) setErr("Не удалось загрузить период: " + (e?.message || e)); }
      try {
        const [reqs, bills] = await Promise.all([fetchRequests(periodId), fetchBills(periodId)]);
        if (on) setPending({
          reqs: reqs.filter((r) => ["submitted", "planning"].includes(r.status)),
          bills: bills.filter((b) => ["submitted", "planning"].includes(b.status)),
        });
      } catch { /* сводка заявок не критична для Директивы */ }
    })();
    return () => { on = false; };
  }, [periodId]);                                   // eslint-disable-line react-hooks/exhaustive-deps

  const fundById = useMemo(() => Object.fromEntries(funds.map((f) => [f.id, f])), [funds]);
  const pctOf = (r) => (pcts[r.id] !== undefined ? pcts[r.id] : Number(r.percent ?? 0));

  // -------- одобренное по этапам из Реестра.
  // Перенесённые остатки (stage:remainder) и легаси-строки без этапа показываем
  // в колонке «Одобрено» в строке фонда на его этапе. stageSources помнит, из
  // каких меток Реестра собран этап — чтобы «Сброс» удалял и перенесённый остаток.
  const { approvedByStage, stageSources } = useMemo(() => {
    const m = { revenue: {}, margin: {}, adjusted: {}, remainder: {} };
    const src = { revenue: new Set(), margin: new Set(), adjusted: new Set() };
    const misc = [];
    regRows.forEach((r) => {
      if (r.stage && r.stage !== "remainder" && m[r.stage]) {
        m[r.stage][r.fund_id] = (m[r.stage][r.fund_id] || 0) + r.amount;
        src[r.stage].add(r.stage);
      } else misc.push(r);
    });
    misc.forEach((r) => {
      const sg = STAGES.find((s) => rules.some((rule) => rule.stage === s.key && rule.fund_id === r.fund_id));
      const key = sg ? sg.key : "remainder";
      m[key][r.fund_id] = (m[key][r.fund_id] || 0) + r.amount;
      if (sg) src[sg.key].add(r.stage === "remainder" ? "remainder" : "legacy");
    });
    return { approvedByStage: m, stageSources: src };
  }, [regRows, rules]);

  // -------- этапы каскадом. Строки этапа: фонды из схемы по умолчанию +
  // фонды со своими схемами по видам дохода (ManaJet: дочерние фонды в папках,
  // у каждого — калькулятор). typeRules у строки включает калькулятор.
  const stagesView = useMemo(() => {
    let base = income;
    return STAGES.map((meta) => {
      const stageRules = rules.filter((r) => r.stage === meta.key).sort(byFundCode(fundById));
      const appr = approvedByStage[meta.key] || {};
      const calc = calculated[meta.key] || {};
      const rows = stageRules.map((r) => ({
        rule: r, fund: fundById[r.fund_id],
        calc: calc[r.fund_id] || 0,
        appr: appr[r.fund_id] || 0,
        typeRules: (fundRules[r.fund_id] || []).filter((x) => x.stage === meta.key),
      }));
      // фонды только со схемой по видам дохода (без правила по умолчанию)
      for (const [fundId, frs] of Object.entries(fundRules)) {
        const stageFrs = frs.filter((x) => x.stage === meta.key);
        if (!stageFrs.length || rows.some((x) => x.fund?.id === fundId)) continue;
        const fund = fundById[fundId];
        if (!fund) continue;
        rows.push({ rule: null, fund, calc: 0, appr: appr[fundId] || 0, typeRules: stageFrs });
      }
      rows.sort((a, b) => (a.fund?.code || "").localeCompare(b.fund?.code || "", "ru", { numeric: true }));
      const isApproved = rows.some((x) => x.appr > 0);
      const sumCalc = rows.reduce((a, x) => a + x.calc, 0);
      const sumAppr = rows.reduce((a, x) => a + x.appr, 0);
      const view = { ...meta, base, rows, sumCalc, sumAppr, isApproved, sources: stageSources[meta.key] };
      base -= sumAppr + rows.reduce((a, x) => a + (x.appr > 0 ? 0 : x.calc), 0);
      return view;
    });
  }, [rules, fundRules, fundById, income, calculated, approvedByStage, stageSources]);

  const approvedTotal = useMemo(
    () => Object.values(approvedByStage).reduce((a, m) => a + Object.values(m).reduce((s, v) => s + v, 0), 0),
    [approvedByStage],
  );
  const remainder = income - approvedTotal;
  const fundsTotal = useMemo(() => funds.reduce((a, f) => a + Number(f.balance || 0), 0), [funds]);

  // -------- действия
  // Рассчитать выбранные галочками фонды (или все, если ничего не отмечено).
  // Фонд с обычным правилом: база × %. Фонд со схемой по видам дохода (ФРС):
  // Σ (факт дохода вида × %) — считается автоматически (пункт 3).
  const doCalc = (sg, checkedIds) => {
    const set = checkedIds && checkedIds.length ? new Set(checkedIds) : null;
    setBusy(`calc:${sg.key}`);
    setTimeout(() => {
      setCalculated((p) => {
        const stageCalc = { ...(p[sg.key] || {}) };
        sg.rows.forEach((x) => {
          if (!x.fund) return;
          if (set && !set.has(x.fund.id)) return;
          if (x.appr > 0) return; // уже одобренные не пересчитываем
          let amount = 0;
          if (x.rule) {
            amount = Math.round(sg.base * pctOf(x.rule)) / 100;
          } else if (x.typeRules?.length) {
            amount = x.typeRules.reduce((a, r) => {
              const fact = incomeByType[r.income_type?.id] || 0;
              return a + (r.percent != null ? fact * Number(r.percent) / 100 : Number(r.fixed_amount || 0));
            }, 0);
            amount = Math.round(amount * 100) / 100;
          }
          stageCalc[x.fund.id] = amount;
        });
        return { ...p, [sg.key]: stageCalc };
      });
      setBusy(null);
    }, 300);
  };

  const doApprove = async (sg) => {
    if (busy) return;
    const calc = calculated[sg.key] || {};
    // одобряем только рассчитанные и ещё не одобренные фонды
    const allocations = sg.rows
      .filter((x) => x.fund && (calc[x.fund.id] || 0) > 0 && !(x.appr > 0))
      .map((x) => ({ fund_id: x.fund.id, amount: calc[x.fund.id] }));
    if (!allocations.length) { setErr(`${sg.title}: сначала нажмите «Рассчитать»`); return; }
    setBusy(`appr:${sg.key}`); setErr(""); setDone("");
    try {
      await distributeStage(periodId, sg.key, allocations);
      // правки процентов этого этапа сохраняем как скорректированную схему недели
      try {
        const changed = sg.rows
          .filter((x) => x.rule && pctOf(x.rule) !== Number(x.rule.percent ?? 0))
          .map((x) => ({ ruleId: x.rule.id, percent: pctOf(x.rule) }));
        await savePeriodOverrides(periodId, changed);
      } catch { /* не критично для одобрения */ }
      await Promise.all([reloadPeriodData(), loadRefs()]);
      // «Рассчитано» НЕ очищаем — суммы остаются видны рядом с «Одобрено» (пункт 1)
      setDone(`${sg.title}: распределение одобрено и зачислено в фонды`);
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  const doReset = (sg) => setCalculated((p) => ({ ...p, [sg.key]: {} }));

  // Сброс уже одобренного этапа: суммы списываются из фондов (удаление из Реестра).
  // Если в этап попал перенесённый остаток (stage:remainder) — сбрасывается и он.
  // Старые распределения без метки этапа сбрасываются только целиком.
  const doResetApproved = async (sg) => {
    if (busy) return;
    const hasLegacy = regRows.some((r) => !r.stage);
    const hasRemainder = sg.sources?.has("remainder");
    const msg = hasLegacy
      ? "Это распределение проведено без разбивки по этапам — будет сброшено ВСЁ распределение периода, суммы спишутся из фондов. Продолжить?"
      : `Сбросить одобренный этап «${sg.title}»${hasRemainder ? " (включая перенесённый остаток)" : ""}? Суммы будут списаны из фондов.`;
    if (!window.confirm(msg)) return;
    setBusy(`reset:${sg.key}`); setErr(""); setDone("");
    try {
      if (hasLegacy) await resetDistribution(periodId, "all");
      else {
        if (sg.sources?.has(sg.key)) await resetDistribution(periodId, sg.key);
        if (hasRemainder) await resetDistribution(periodId, "remainder");
      }
      await Promise.all([reloadPeriodData(), loadRefs()]);
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
      await reloadPeriods(true);
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
        await Promise.all([reloadPeriods(true), reloadPeriodData()]);
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
      await Promise.all([reloadPeriods(true), reloadPeriodData()]);
      setDone("Период закрыт, протокол Директивы сохранён. Следующая неделя создана — выберите её в шапке.");
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  // Одобрение фонда из калькулятора по видам дохода
  const doApproveFund = async (fund, stageKey, amount) => {
    if (busy) return;
    setBusy(`calcappr:${fund.id}`); setErr(""); setDone("");
    try {
      await distributeStage(periodId, stageKey, [{ fund_id: fund.id, amount }]);
      await Promise.all([reloadPeriodData(), loadRefs()]);
      setCalcFund(null);
      setDone(`${fund.code} ${fund.name}: одобрено ${fmt(amount)} TJS`);
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  const doTransfer = async (fundId) => {
    if (busy) return;
    setBusy("transfer"); setErr(""); setDone("");
    try {
      await distributeStage(periodId, "remainder", [{ fund_id: fundId, amount: Math.round(remainder * 100) / 100 }]);
      await Promise.all([reloadPeriodData(), loadRefs()]);
      setTransferOpen(false);
      setDone(`Остаток ${fmt(remainder)} перенесён в фонд ${fundById[fundId]?.code}`);
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  if (loading || periodsLoading) return <div style={st.empty}><Loader2 size={18} className="spin" /> Загрузка…</div>;

  return (<>
    <section style={st.hero}>
      <div style={st.heroGlow} />
      <div style={st.heroContent}>
        <div style={st.heroTop}>
          <div>
            <div style={st.heroLabel}>Директива · недельное распределение ФРС</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
              <CalendarDays size={18} color={C.green} />
              <span style={st.heroTitle}>{period ? periodTitle(period) : "Период не создан — добавьте неделю в шапке"}</span>
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
        folders={folders}
        onCalc={(ids) => doCalc(sg, ids)} onApprove={() => doApprove(sg)}
        onReset={() => doReset(sg)} onResetApproved={() => doResetApproved(sg)}
        onOpenCalc={(fund) => setCalcFund({ fund, stage: sg })} />
    ))}

    {/* Итог распределения на ФП */}
    <section style={st.fpCard}>
      <div style={st.fpRows}>
        <div style={st.fpRow}><span style={st.fpLabelBold}>Сумма к распределению на ФП</span><span style={st.fpValBold}>{fmt(income)}</span></div>
        <div style={st.fpRow}><span style={st.fpLabel}>Распределено по фондам (Реестр)</span><span style={st.fpVal}>{fmt(approvedTotal)}</span></div>
        <div style={{ ...st.fpRow, ...st.fpRemainder }}>
          <span style={st.fpLabelBold}>Остаток нераспределённого</span>
          <span style={{ ...st.fpValBold, color: remainder < -0.01 ? C.danger : C.green }}>{fmt(remainder)}</span>
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
      {pending.reqs.length === 0 && pending.bills.length === 0 ? (
        <div style={{ ...st.locCard, ...st.empty }}>
          К рассмотрению ничего нет. Заявки подаются в «Расходах», счета — в «Счетах поставщиков»;
          одобрение и оплата — в разделе «Заявки».
        </div>
      ) : (
        <div style={{ ...st.locCard, padding: "14px 18px" }}>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13.5 }}>
            {pending.bills.length > 0 && (
              <span>Счета поставщиков (приоритет): <b style={{ color: C.warning }}>{pending.bills.length}</b> на <b>{fmt(pending.bills.reduce((a, b) => a + Number(b.amount), 0))}</b> TJS</span>
            )}
            {pending.reqs.length > 0 && (
              <span>Заявки от постов: <b style={{ color: C.warning }}>{pending.reqs.length}</b> на <b>{fmt(pending.reqs.reduce((a, r) => a + Number(r.planned_amount), 0))}</b> TJS</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: C.faint, marginTop: 6 }}>
            Рассмотрение и оплата — в разделе «Заявки» (меню Финансовое планирование).
          </div>
        </div>
      )}
    </section>

    {transferOpen && (
      <TransferModal C={C} st={st} funds={funds} remainder={remainder}
        busy={busy === "transfer"} onClose={() => setTransferOpen(false)} onTransfer={doTransfer} />
    )}
    {calcFund && (
      <FundCalcModal C={C} st={st} fund={calcFund.fund} stage={calcFund.stage}
        rules={(fundRules[calcFund.fund.id] || []).filter((x) => x.stage === calcFund.stage.key)}
        incomeByType={incomeByType}
        approved={(approvedByStage[calcFund.stage.key] || {})[calcFund.fund.id] || 0}
        busy={busy === `calcappr:${calcFund.fund.id}`} locked={isClosed || !period}
        onClose={() => setCalcFund(null)}
        onApprove={(amount) => doApproveFund(calcFund.fund, calcFund.stage.key, amount)} />
    )}
  </>);
}


// ---------------------------------------------------------------- Этап распределения
// Фонды этапа сгруппированы по папкам (fund_folders) — как в ManaJet.
// Слева у каждого фонда галочка: отмеченные фонды считаются при «Рассчитать»
// (если не отмечено ничего — считаются все). Уже одобренные не пересчитываются.
function LevelCard({ sg, C, st, isMobile, pctOf, setPcts, busy, locked, folders, onCalc, onApprove, onReset, onResetApproved, onOpenCalc }) {
  const [openFolders, setOpenFolders] = useState({});
  const [checked, setChecked] = useState(() => new Set());
  const calcBusy = busy === `calc:${sg.key}`;
  const apprBusy = busy === `appr:${sg.key}`;
  const resetBusy = busy === `reset:${sg.key}`;

  const folderById = Object.fromEntries(folders.map((f) => [f.id, f]));
  const flat = sg.rows.filter((x) => !x.fund?.folder_id);
  const grouped = {};
  sg.rows.filter((x) => x.fund?.folder_id).forEach((x) => {
    (grouped[x.fund.folder_id] ??= []).push(x);
  });

  // фонды, доступные для выбора галочкой (ещё не одобренные)
  const selectable = sg.rows.filter((x) => x.fund && !(x.appr > 0)).map((x) => x.fund.id);
  const allChecked = selectable.length > 0 && selectable.every((id) => checked.has(id));
  const toggleOne = (id) => setChecked((s) => {
    const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });
  const toggleAll = () => setChecked(allChecked ? new Set() : new Set(selectable));
  const hasApprovable = sg.rows.some((x) => x.calc > 0 && !(x.appr > 0));

  const cbStyle = { width: 15, height: 15, accentColor: C.green, marginRight: 7, flexShrink: 0, cursor: "pointer" };
  // Шесть колонок. На телефоне видимую часть экрана занимают первые четыре —
  // Название · % · калькулятор · Доступно. Ширины «Название» (166px), % и
  // калькулятора фиксированы (как было раньше — колонку названия не растягиваем),
  // а «Доступно» тянется к правому краю с комфортным полем справа (~29px от
  // края экрана): calc(100vw − 286px), где 286 = отступы слева до сетки
  // (main моб. 8 + рамка карточки 1 + паддинг строки 8 = 17) + Название (166) +
  // % (42) + калькулятор (32) + поле справа (29). Константа завязана на боковой
  // паддинг main на телефоне (8px) — при его изменении пересчитать здесь.
  // На поле справа заходит пустой левый край колонки «Рассчитано» (число в ней
  // прижато вправо) — визуально это и есть отступ.
  // minWidth:max-content держит ленту шире экрана (иначе прокрутки не будет).
  const GRID6 = isMobile
    ? "166px 42px 32px calc(100vw - 286px) 120px 120px"
    : "150px 58px 46px minmax(104px,1fr) 132px 132px";
  const frow6 = { ...st.frow, gridTemplateColumns: GRID6,
    minWidth: isMobile ? "max-content" : 760, ...(isMobile ? { padding: "12px 8px" } : {}) };

  const CalcBtn = () => (
    <button style={st.btnGhost} onClick={() => onCalc([...checked])} className="btn" disabled={!!busy || locked}>
      {calcBusy ? <span className="spin"><RotateCw size={15} /></span> : <Calculator size={15} />} Рассчитать
    </button>
  );
  const ApproveBtn = () => {
    const ok = !locked && hasApprovable;
    return (
      <button style={{ ...st.btnGreen, opacity: ok ? (busy ? 0.7 : 1) : 0.35, cursor: ok ? "pointer" : "not-allowed" }}
        onClick={onApprove} className="btn" disabled={!!busy || !ok}>
        {apprBusy ? <span className="spin"><RotateCw size={15} /></span> : <Check size={15} />} Одобрить
      </button>
    );
  };
  const ResetBtn = () => (
    <button style={st.btnGhost} onClick={sg.isApproved ? onResetApproved : onReset} className="btn" disabled={!!busy || locked}>
      {resetBusy ? <span className="spin"><RotateCw size={14} /></span> : <RotateCcw size={14} />} Сброс
    </button>
  );

  const totals = sg.rows.reduce((t, x) => ({
    avail: t.avail + Number(x.fund?.balance || 0), calc: t.calc + x.calc, appr: t.appr + x.appr,
  }), { avail: 0, calc: 0, appr: 0 });

  const FundRow = ({ x, child }) => {
    const avail = Number(x.fund?.balance || 0);
    const barVal = x.appr || x.calc;
    const barBase = avail > 0 ? avail : (barVal || 1);
    const fill = barVal > 0 ? Math.min(100, (barVal / barBase) * 100) : 0;
    const hasTypeRules = x.typeRules?.length > 0;
    const rowEditable = !locked && !(x.appr > 0);
    return (
      <div style={{ ...frow6, ...(child ? { paddingLeft: 14 } : {}) }} className="frow">
        <div style={st.fName}>
          <div style={st.fundTop}>
            <input type="checkbox" style={cbStyle} checked={checked.has(x.fund.id)}
              disabled={!rowEditable} onChange={() => toggleOne(x.fund.id)} />
            <span style={st.fundCode}>{x.fund?.code}</span><span>{x.fund?.name}</span>
            {x.fund?.is_restricted && <Lock size={12} color={C.faint} />}
          </div>
          <div style={st.bar}><div style={{ ...st.barFill, width: `${fill}%`, background: x.appr ? C.green : C.warning }} /></div>
        </div>
        <div style={st.fPct}>
          {x.rule ? <>{pctOf(x.rule)}<span style={st.pctSign}>%</span></>
            : <span style={{ fontSize: 11, color: C.faint }}>{isMobile ? "—" : "по видам"}</span>}
        </div>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-start", alignSelf: "start" }}>
          <button style={{ ...st.iconBtn, width: 26, height: 26, borderRadius: 8, padding: 0,
              color: hasTypeRules ? C.green : C.faint,
              opacity: hasTypeRules ? 1 : 0.4, cursor: hasTypeRules ? "pointer" : "default" }}
            className="btn" disabled={!hasTypeRules || !!busy || locked}
            title={hasTypeRules ? "Распределение по видам дохода (настраивается в «Доходах»)" : "Схема по видам дохода не настроена — задайте её в разделе «Доходы»"}
            onClick={() => hasTypeRules && onOpenCalc(x.fund)}>
            <Calculator size={15} />
          </button>
        </div>
        <div style={{ ...st.fNum, fontWeight: 700 }}>{fmt(avail)}</div>
        <div style={{ ...st.fNum, color: x.calc ? C.warning : C.faint, fontWeight: x.calc ? 600 : 400 }}>
          <span className={calcBusy ? "" : x.calc ? "pop" : ""}>{fmt(x.calc)}</span>
        </div>
        <div style={{ ...st.fNum, color: x.appr ? C.green : C.faint, fontWeight: x.appr ? 700 : 400 }}>
          <span className={x.appr ? "pop" : ""}>{fmt(x.appr)}</span>
        </div>
      </div>
    );
  };

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
          <div style={{ ...frow6, ...st.frowHead, ...(isMobile ? { padding: "11px 8px" } : {}) }}>
            <div style={st.fName}>
              <div style={st.fundTop}>
                <input type="checkbox" style={cbStyle} checked={allChecked}
                  disabled={locked || !selectable.length} onChange={toggleAll} />
                Название
              </div>
            </div>
            <div style={st.fPct}>%</div>
            <div />
            <div style={st.fNum}>Доступно</div>
            <div style={st.fNum}>Рассчитано</div><div style={st.fNum}>Одобрено</div>
          </div>
          {flat.map((x) => <FundRow key={x.fund?.id || x.rule?.id} x={x} />)}
          {Object.entries(grouped).map(([fid, rows]) => {
            const isOpen = !!openFolders[fid];
            const fsum = rows.reduce((t, x) => ({
              avail: t.avail + Number(x.fund?.balance || 0), calc: t.calc + x.calc, appr: t.appr + x.appr,
            }), { avail: 0, calc: 0, appr: 0 });
            return (
              <div key={fid}>
                <div style={{ ...frow6, cursor: "pointer", background: C.panel2 }} className="frow"
                  onClick={() => setOpenFolders((o) => ({ ...o, [fid]: !o[fid] }))}>
                  <div style={st.fName}>
                    <div style={st.fundTop}>
                      {isOpen ? <FolderOpen size={15} color={C.warning} /> : <Folder size={15} color={C.warning} />}
                      <b>{folderById[fid]?.name || "Папка"}</b>
                      <span style={{ fontSize: 11, color: C.faint }}>· {rows.length} фонд(ов)</span>
                      <ChevronRight size={14} style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .2s", color: C.faint }} />
                    </div>
                  </div>
                  <div style={st.fPct} />
                  <div />
                  <div style={{ ...st.fNum, fontWeight: 700 }}>{fmt(fsum.avail)}</div>
                  <div style={{ ...st.fNum, color: fsum.calc ? C.warning : C.faint }}>{fmt(fsum.calc)}</div>
                  <div style={{ ...st.fNum, color: fsum.appr ? C.green : C.faint, fontWeight: fsum.appr ? 700 : 400 }}>{fmt(fsum.appr)}</div>
                </div>
                {isOpen && rows.map((x) => <FundRow key={x.fund?.id} x={x} child />)}
              </div>
            );
          })}
          <div style={{ ...frow6, ...st.frowTotal }}>
            {isMobile ? <div style={st.fName}><b>Итого</b></div> : (
              <div style={st.fName}><div style={st.actions}><CalcBtn /><ApproveBtn /><ResetBtn /></div></div>
            )}
            <div style={st.fPct} />
            <div />
            <div style={{ ...st.fNum, fontWeight: 700 }}>{fmt(totals.avail)}</div>
            <div style={{ ...st.fNum, fontWeight: 700, color: totals.calc ? C.warning : C.faint }}>{fmt(totals.calc)}</div>
            <div style={{ ...st.fNum, fontWeight: 700, color: C.green }}>{fmt(totals.appr)}</div>
          </div>
          {isMobile && <div style={st.mActions}><CalcBtn /><ApproveBtn /><ResetBtn /></div>}
        </>)}
      </section>
    </div>
  );
}


// ---------------------------------------------------------------- Калькулятор фонда
// Модель ManaJet: распределение в фонд по видам дохода с разными процентами.
// Факт = доход вида за неделю; рассчитано = факт × %; суммы можно поправить.
function FundCalcModal({ C, st, fund, stage, rules, incomeByType, approved, busy, locked, onClose, onApprove }) {
  const [vals, setVals] = useState(() => Object.fromEntries(
    rules.map((r) => {
      const fact = incomeByType[r.income_type?.id] || 0;
      const calc = r.percent ? Math.round(fact * Number(r.percent)) / 100 : Number(r.fixed_amount || 0);
      return [r.id, String(Math.max(0, calc))];
    })));
  const num = (v) => parseFloat(String(v).replace(",", ".")) || 0;
  const total = rules.reduce((a, r) => a + num(vals[r.id]), 0);
  const factTotal = rules.reduce((a, r) => a + (incomeByType[r.income_type?.id] || 0), 0);

  return (
    <div style={st.mdOverlay} onClick={onClose}>
      <div style={{ ...st.mdCard, width: "min(560px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>Одобрение · {fund.code} {fund.name}</div>
          <button style={st.iconBtn} onClick={onClose}><X size={17} /></button>
        </div>
        <div style={{ fontSize: 12, color: C.sub, marginBottom: 10 }}>
          Этап «{stage.title}» · своя схема по видам дохода
          {approved > 0 && <b style={{ color: C.green }}> · уже одобрено {fmt(approved)}</b>}
        </div>

        <div style={{ ...st.frow, ...st.frowHead, gridTemplateColumns: "1fr 90px 56px 90px 100px" }}>
          <div style={st.fName}>Вид дохода</div>
          <div style={st.fNum}>Факт</div>
          <div style={st.fPct}>%</div>
          <div style={st.fNum}>Рассчитано</div>
          <div style={st.fNum}>Одобрить</div>
        </div>
        <div style={{ maxHeight: 360, overflowY: "auto" }}>
          {rules.map((r) => {
            const fact = incomeByType[r.income_type?.id] || 0;
            const calc = r.percent ? Math.round(fact * Number(r.percent)) / 100 : Number(r.fixed_amount || 0);
            return (
              <div key={r.id} style={{ ...st.frow, gridTemplateColumns: "1fr 90px 56px 90px 100px", alignItems: "center" }} className="frow">
                <div style={{ ...st.fName, fontSize: 12.5 }}>
                  <span style={st.fundCode}>{r.income_type?.code}</span> {r.income_type?.name}
                </div>
                <div style={{ ...st.fNum, fontSize: 12.5 }}>{fmt(fact)}</div>
                <div style={{ ...st.fPct, fontSize: 12 }}>{r.percent ? `${Number(r.percent)}%` : "фикс"}</div>
                <div style={{ ...st.fNum, fontSize: 12.5, color: calc ? C.warning : C.faint }}>{fmt(calc)}</div>
                <div style={{ textAlign: "right" }}>
                  <input type="number" inputMode="decimal" value={vals[r.id]}
                    onChange={(e) => setVals((p) => ({ ...p, [r.id]: e.target.value }))}
                    onWheel={(e) => e.target.blur()}
                    style={{ ...st.pctInput, width: 90, padding: "6px 8px", fontSize: 12.5 }} />
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ ...st.frow, ...st.frowTotal, gridTemplateColumns: "1fr 90px 56px 90px 100px" }}>
          <div style={st.fName}><b>Итого</b></div>
          <div style={{ ...st.fNum, fontWeight: 700 }}>{fmt(factTotal)}</div>
          <div style={st.fPct} />
          <div style={st.fNum} />
          <div style={{ ...st.fNum, fontWeight: 800, color: C.green }}>{fmt(total)}</div>
        </div>

        <div style={st.mdActions}>
          <button style={st.btnGhost} className="btn" onClick={onClose}>Отмена</button>
          <button style={{ ...st.btnGreen, opacity: busy ? 0.7 : 1 }} className="btn"
            disabled={busy || locked || total <= 0 || approved > 0}
            title={approved > 0 ? "Фонд уже одобрен на этом этапе — сбросьте этап для повтора" : ""}
            onClick={() => onApprove(Math.round(total * 100) / 100)}>
            {busy ? <Loader2 size={15} className="spin" /> : <Check size={15} />} Одобрить {fmt(total)}
          </button>
        </div>
      </div>
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
