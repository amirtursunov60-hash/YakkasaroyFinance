import { useState, useMemo, useEffect, useCallback } from "react";
import { ClipboardList, Calculator, CalendarDays, Check, RotateCcw, RotateCw, Lock, Unlock, Ban, ArrowRightLeft, Loader2, AlertCircle, CheckCircle2, X, Landmark, ChevronRight, Scale, Banknote, Wallet, Coins, List, LayoutList } from "lucide-react";
import { Stat, ConfirmModal } from "../../components/common";
import { useTheme } from "../../theme/theme";
import { useScrollLock } from "../../hooks/useScrollLock";
import { fmt } from "../../utils/format";
import { feedbackSuccess, feedbackError } from "../../lib/feedback";
import { cascadeTypeStageBase, calcTypeRulesAmount } from "../../lib/distribution";
import { usePeriod, periodTitle } from "../../lib/PeriodCtx";
import { GlassSegment } from "../../components/ui/glass-segment";
import {
  fetchFunds, fetchDefaultRules,
  fetchPeriodIncome, fetchPeriodDistribution, distributeStage, setPeriodStatus, closePeriod, reopenPeriod, resetDistribution,
  fetchRequests, decideRequest, fetchPeriodOverrides, savePeriodOverrides,
  fetchIncomeTypeRules, fetchIncomeByType, fetchFundFolders, fetchBills,
} from "../../lib/api";
import { ItemCard, reqStatusMeta, RequestStatusChips, requestCounts, matchRequestFilter, RequesterAvatar } from "./Requests";
import { payableTotals } from "./directiveSummary";


// ---------------------------------------------------------------- DIRECTIVE
// Живые данные. Процесс как в прототипе: по каждому этапу «Рассчитать»
// (оранжевый предварительный расчёт) → «Одобрить» (фактическое зачисление
// в фонды через Реестр, зелёное) → «Сброс». Этапы каскадом: база следующего =
// остаток после предыдущего. Внизу: запрет подачи заявок (статус периода
// «на планировании»), закрытие периода Директивой, перенос остатка в фонд.
// Неделя выбирается в шапке приложения (общий PeriodCtx).

const STAGES = [
  { key: "revenue",  title: "Выручка",                 fundsTitle: "Фонды выручки",                icon: Banknote },
  { key: "margin",   title: "Маржинальный доход",      fundsTitle: "Фонды маржинального дохода",    icon: Scale },
  { key: "adjusted", title: "Скорректированный доход", fundsTitle: "Фонды скорректированного дохода", icon: Wallet },
];

const byFundCode = (fundById) => (a, b) =>
  (fundById[a.fund_id]?.code || "").localeCompare(fundById[b.fund_id]?.code || "", "ru", { numeric: true });

export function Directive() {
  const { C, st, isMobile, profile } = useTheme();
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
  const [weekReqs, setWeekReqs] = useState([]);   // заявки недели — рассмотрение в Директиве
  const [bills, setBills] = useState([]);         // счета (одобренные) — для строки «На оплату»
  const [fundRules, setFundRules] = useState({});     // правила по видам дохода { fundId: [rules] }
  const [folders, setFolders] = useState([]);         // папки фондов
  const [incomeByType, setIncomeByType] = useState({}); // факт дохода недели по видам
  const [calcFund, setCalcFund] = useState(null);     // { fund, stage } — модал-калькулятор
  const [confirm, setConfirm] = useState(null);       // { title, message, tone, confirmLabel, resolve } — модал подтверждения

  // Тематическая замена window.confirm: возвращает Promise<boolean>, разрешается
  // при выборе в модале (Подтвердить → true, Отмена/закрытие → false).
  const askConfirm = useCallback((opts) => new Promise((resolve) => {
    setConfirm({ ...opts, resolve });
  }), []);
  const resolveConfirm = useCallback((value) => {
    setConfirm((c) => { c?.resolve(value); return null; });
  }, []);

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

  // Заявки недели (рассмотрение в Директиве) + счета (для строки «На оплату»
  // в итоге ФП). Счета не привязаны к неделе — берём одобренные к выплате.
  const reloadRequests = useCallback(async () => {
    if (!periodId) { setWeekReqs([]); setBills([]); return; }
    try {
      const [reqs, bls] = await Promise.all([fetchRequests(periodId), fetchBills(periodId, null, null)]);
      setWeekReqs(reqs); setBills(bls);
    } catch { /* список заявок/счетов не критичен для распределения */ }
  }, [periodId]);

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
      if (on) await reloadRequests();
    })();
    return () => { on = false; };
  }, [periodId]);                                   // eslint-disable-line react-hooks/exhaustive-deps

  const fundById = useMemo(() => Object.fromEntries(funds.map((f) => [f.id, f])), [funds]);
  const pctOf = (r) => (pcts[r.id] !== undefined ? pcts[r.id] : Number(r.percent ?? 0));

  // «На оплату» — одобренные, но ещё не оплаченные заявки + счета (итог ФП).
  const payable = useMemo(() => payableTotals(weekReqs, bills), [weekReqs, bills]);

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

  // Каскад дохода ПО ВИДАМ через этапы («матрёшка»): на входе каждого этапа доход
  // вида = его остаток после удержаний предыдущих этапов. Калькулятор фонда считает
  // процент именно от этого остатка. Пример (Флай Гарден 10000): выручка 50% → 5000
  // (остаток 5000); маржа 80% → 4000 (остаток 1000); СКД 100% → 1000 (остаток 0).
  const typeStageBase = useMemo(
    () => cascadeTypeStageBase(incomeByType, fundRules),
    [incomeByType, fundRules],
  );

  // -------- действия
  // Рассчитать выбранные галочками фонды (или все, если ничего не отмечено).
  // Фонд с обычным правилом: база × %. Фонд со схемой по видам дохода (ФРС):
  // Σ (факт дохода вида × %) — считается автоматически (пункт 3).
  // Расчёт сумм этапа для выбранных фондов (или всех, если не отмечены):
  // обычный фонд — база × %; фонд «по видам» — Σ остаток вида × % (каскад).
  const computeStageAmounts = (sg, checkedIds) => {
    const set = checkedIds && checkedIds.length ? new Set(checkedIds) : null;
    const out = {};
    sg.rows.forEach((x) => {
      if (!x.fund) return;
      if (set && !set.has(x.fund.id)) return;
      if (x.appr > 0) return; // уже одобренные не пересчитываем
      let amount = 0;
      if (x.typeRules?.length) amount = calcTypeRulesAmount(x.typeRules, typeStageBase[sg.key] || {});
      else if (x.rule) amount = Math.round(sg.base * pctOf(x.rule)) / 100;
      out[x.fund.id] = amount;
    });
    return out;
  };

  const doCalc = (sg, checkedIds) => {
    setBusy(`calc:${sg.key}`);
    setTimeout(() => {
      setCalculated((p) => ({ ...p, [sg.key]: { ...(p[sg.key] || {}), ...computeStageAmounts(sg, checkedIds) } }));
      setBusy(null);
    }, 300);
  };

  // «Одобрить» сразу рассчитывает и одобряет (отдельный «Рассчитать» не обязателен).
  const doApprove = async (sg, checkedIds) => {
    if (busy) return;
    const amounts = computeStageAmounts(sg, checkedIds);
    const allocations = Object.entries(amounts)
      .filter(([, amt]) => amt > 0)
      .map(([fund_id, amount]) => ({ fund_id, amount }));
    if (!allocations.length) { setErr(`${sg.title}: нет фондов для одобрения`); return; }
    setBusy(`appr:${sg.key}`); setErr(""); setDone("");
    try {
      await distributeStage(periodId, sg.key, allocations);
      setCalculated((p) => ({ ...p, [sg.key]: { ...(p[sg.key] || {}), ...amounts } }));
      // правки процентов этого этапа сохраняем как скорректированную схему недели
      try {
        const changed = sg.rows
          .filter((x) => x.rule && pctOf(x.rule) !== Number(x.rule.percent ?? 0))
          .map((x) => ({ ruleId: x.rule.id, percent: pctOf(x.rule) }));
        await savePeriodOverrides(periodId, changed);
      } catch { /* не критично для одобрения */ }
      await Promise.all([reloadPeriodData(), loadRefs()]);
      setDone(`${sg.title}: распределение рассчитано и одобрено`);
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
    if (!(await askConfirm({ title: hasLegacy ? "Сбросить всё распределение" : "Сбросить одобренный этап", message: msg, tone: "danger", confirmLabel: "Сбросить" }))) return;
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
      if (!(await askConfirm({ title: "Открыть неделю заново", message: "Протокол Директивы будет удалён, операции периода снова разрешены.", tone: "danger", confirmLabel: "Открыть неделю" }))) return;
      setBusy("close");
      try {
        await reopenPeriod(periodId);
        await Promise.all([reloadPeriods(true), reloadPeriodData()]);
        setDone("Неделя открыта заново — операции периода разрешены");
      } catch (e) { setErr(e?.message || String(e)); }
      finally { setBusy(null); }
      return;
    }
    if (!(await askConfirm({ title: "Закрыть период ФП", message: "Все операции периода будут заблокированы, протокол Директивы сохранится.", tone: "warning", confirmLabel: "Закрыть период" }))) return;
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

  // Звук на результат любой операции Директивы (этапы, закрытие периода, перенос
  // остатков, калькулятор фонда, запрет подачи) — через появление сообщения.
  useEffect(() => { if (done) feedbackSuccess(); }, [done]);
  useEffect(() => { if (err) feedbackError(); }, [err]);

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

    {err && <div role="alert" style={{ ...st.reqError, marginBottom: 14 }}><AlertCircle size={15} /> {err}</div>}
    {done && <div style={{ ...st.reqSuccess, marginBottom: 14 }}><CheckCircle2 size={15} /> {done}</div>}

    {!rules.length && (
      <div style={{ ...st.locCard, ...st.empty }}>
        Схема распределения не настроена — примените миграции 006–007 (supabase/README.md).
      </div>
    )}

    {stagesView.map((sg) => (
      <LevelCard key={sg.key} sg={sg} C={C} st={st} isMobile={isMobile}
        pctOf={pctOf} setPcts={setPcts} busy={busy} locked={isClosed || !period}
        folders={folders}
        stageFact={typeStageBase[sg.key] || {}}
        onCalc={(ids) => doCalc(sg, ids)} onApprove={(ids) => doApprove(sg, ids)}
        onReset={() => doReset(sg)} onResetApproved={() => doResetApproved(sg)}
        onOpenCalc={(fund) => setCalcFund({ fund, stage: sg })} />
    ))}

    {/* Итог распределения на ФП */}
    <section style={st.fpCard}>
      <div style={st.fpRows}>
        <div style={st.fpRow}><span style={st.fpLabelBold}>Сумма к распределению на ФП</span><span style={st.fpValBold}>{fmt(income)}</span></div>
        <div style={st.fpRow}><span style={st.fpLabel}>Распределено по фондам (Реестр)</span><span style={st.fpVal}>{fmt(approvedTotal)}</span></div>
        <div style={st.fpRow}>
          <span style={st.fpLabel}>На оплату — одобрено к выплате</span>
          <div style={{ ...st.fpVal, textAlign: "right", color: payable.total > 0 ? C.warning : C.text }}
            title="Одобренные, но ещё не оплаченные заявки и счета поставщиков">
            {fmt(payable.total)}
            <div style={{ fontSize: 11, color: C.faint, fontWeight: 500, marginTop: 2 }}>
              заявки {fmt(payable.requests)} · счета {fmt(payable.bills)}
            </div>
          </div>
        </div>
        <div style={{ ...st.fpRow, ...st.fpRemainder }}>
          <span style={st.fpLabelBold}>Остаток нераспределённого</span>
          <span style={{ ...st.fpValBold, color: remainder < -0.01 ? C.danger : C.money }}>{fmt(remainder)}</span>
        </div>
      </div>
      <div style={st.fpActions} className="fpActions">
        <button style={{ ...st.btnGhost, width: "100%", justifyContent: "center", opacity: busy === "block" ? 0.7 : 1 }}
          className="btn" onClick={toggleRequests} disabled={busy || isClosed || !period}>
          {busy === "block" ? <Loader2 size={15} className="spin" />
            : requestsBlocked ? <Lock size={15} /> : <Ban size={15} />}
          {requestsBlocked ? " Подача заявок запрещена" : " Запретить подачу заявок"}
        </button>
        <button style={{ ...st.btnGhost, width: "100%", justifyContent: "center" }} className="btn"
          onClick={() => setTransferOpen(true)} disabled={busy || isClosed || !period || remainder <= 0}>
          <ArrowRightLeft size={15} /> Перенести остатки в фонд
        </button>
      </div>
    </section>

    {/* Заявки недели — рассмотрение прямо в Директиве (одобрение/отклонение/сброс) */}
    <RequestsReview C={C} st={st} isMobile={isMobile} profile={profile}
      requests={weekReqs} funds={funds} periodId={periodId}
      blocked={requestsBlocked}
      onReload={async () => { await Promise.all([reloadRequests(), reloadPeriodData(), loadRefs()]); }} />

    {/* Закрытие периода Директивой — отдельной кнопкой в самом низу */}
    <button style={{ ...(isClosed ? st.btnGhost : st.btnGreen), width: "100%", justifyContent: "center", marginTop: 14, opacity: busy === "close" ? 0.7 : 1 }}
      className="btn" onClick={doToggleClose} disabled={busy || !period}>
      {busy === "close" ? <Loader2 size={15} className="spin" /> : isClosed ? <Unlock size={15} /> : <Lock size={15} />}
      {isClosed ? " Открыть неделю" : " Закрыть период ФП"}
    </button>

    {transferOpen && (
      <TransferModal C={C} st={st} funds={funds} remainder={remainder}
        busy={busy === "transfer"} onClose={() => setTransferOpen(false)} onTransfer={doTransfer} />
    )}
    {calcFund && (
      <FundCalcModal C={C} st={st} isMobile={isMobile} fund={calcFund.fund} stage={calcFund.stage}
        rules={(fundRules[calcFund.fund.id] || []).filter((x) => x.stage === calcFund.stage.key)}
        incomeByType={typeStageBase[calcFund.stage.key] || {}}
        approved={(approvedByStage[calcFund.stage.key] || {})[calcFund.fund.id] || 0}
        busy={busy === `calcappr:${calcFund.fund.id}`} locked={isClosed || !period}
        onClose={() => setCalcFund(null)}
        onApprove={(amount) => doApproveFund(calcFund.fund, calcFund.stage.key, amount)} />
    )}
    {confirm && (
      <ConfirmModal title={confirm.title} message={confirm.message} tone={confirm.tone}
        confirmLabel={confirm.confirmLabel} busy={!!busy}
        onConfirm={() => resolveConfirm(true)} onCancel={() => resolveConfirm(false)} />
    )}
  </>);
}


// ---------------------------------------------------------------- Заявки к рассмотрению (в Директиве)
// Единственное место рассмотрения заявок-ЗРС недели: чипы-фильтры по статусам +
// карточки с инлайн-формой (фонд, сумма, комментарий) и кнопками Одобрить/
// Отклонить/Сброс. Оплата здесь НЕ выполняется — она в разделе «Заявки».
function RequestsReview({ C, st, isMobile, profile, requests, funds, periodId, blocked, onReload }) {
  const ST_META = reqStatusMeta(C);
  const isFinAdmin = ["owner", "fin_director"].includes(profile?.role);

  const [filter, setFilter] = useState("review");   // по умолчанию — «К рассмотрению на ФП»
  const [expanded, setExpanded] = useState({});
  const [view, setView] = useState("detailed");      // «Подробно» (карточки ЗРС) | «Список» (компактно)

  const counts = useMemo(() => requestCounts(requests), [requests]);
  const shown = useMemo(
    () => requests.filter((r) => matchRequestFilter(r, filter)).sort((a, b) => Number(b.number || 0) - Number(a.number || 0)),
    [requests, filter],
  );

  // Действия возвращают строку-успех или бросают ошибку — сообщения показывает
  // сама карточка (RequestReviewControls), не общий блок сверху.
  // Одобрение: фонд-источник + одобренная сумма (отдельно от запрошенной) + комментарий.
  const doApprove = async (item, { fundId, amount, comment }) => {
    if (!fundId) throw new Error("Выберите фонд-источник");
    const amt = Math.round((parseFloat(String(amount).replace(",", ".")) || 0) * 100) / 100;
    if (!amt || amt <= 0) throw new Error("Введите одобренную сумму больше нуля");
    if (!periodId) throw new Error("Нет выбранного периода ФП");
    // Не даём одобрить больше остатка фонда (для базовой валюты TJS).
    const fund = funds.find((f) => f.id === fundId);
    if (fund && item.currency?.is_base && amt > Number(fund.balance || 0)) {
      throw new Error(`Недостаточно средств в фонде ${fund.code} «${fund.name}»: доступно ${fmt(Number(fund.balance))} TJS, требуется ${fmt(amt)}`);
    }
    await decideRequest(item.id, {
      status: "approved", fund_id: fundId, approved_amount: amt,
      comment: comment?.trim() || null, period_id: periodId,
    });
    await onReload();
    return `Заявка №${item.number}: одобрена на ${fmt(amt)} — фонд ${fund?.code || ""}`;
  };

  // Отклонение: комментарий обязателен (как причина).
  const doReject = async (item, { comment }) => {
    if (!comment?.trim()) throw new Error("Укажите причину отклонения в комментарии");
    await decideRequest(item.id, { status: "rejected", rejection_reason: comment.trim(), comment: comment.trim() });
    await onReload();
    return `Заявка №${item.number}: отклонена`;
  };

  // Сброс: вернуть заявку к рассмотрению (отменить решение). Для оплаченных недоступно.
  const doReset = async (item) => {
    await decideRequest(item.id, {
      status: "submitted", decided_by: null, decided_at: null,
      approved_amount: null, rejection_reason: null,
    });
    await onReload();
    return `Заявка №${item.number}: возвращена к рассмотрению`;
  };

  return (
    <section style={st.reqSection}>
      <div style={st.reqSectionHead}>
        <ClipboardList size={18} color={C.green} />
        <h3 style={st.reqSectionTitle}>Заявки к рассмотрению</h3>
        <span style={st.reqSectionSub}>от поста · формат ЗРС · поданные на эту неделю</span>
        {blocked && <span style={st.reqBlockedTag}><Lock size={12} /> Подача закрыта</span>}
        <ViewToggle isMobile={isMobile} view={view} setView={setView} />
      </div>

      <RequestStatusChips C={C} counts={counts} filter={filter} setFilter={setFilter} />

      {shown.length === 0 ? (
        <div style={{ ...st.locCard, ...st.empty }}>
          {requests.length === 0
            ? "На этой неделе заявок нет — они подаются в разделе «Заявки»"
            : filter === "review"
              ? "Заявок к рассмотрению нет — всё обработано"
              : "Нет заявок с таким статусом"}
        </div>
      ) : shown.map((r) => {
        const controls = (
          <RequestReviewControls C={C} st={st} isMobile={isMobile} item={r}
            funds={funds} isFinAdmin={isFinAdmin}
            onApprove={doApprove} onReject={doReject} onReset={doReset} />
        );
        const toggle = () => setExpanded((e) => ({ ...e, [r.id]: !e[r.id] }));
        return view === "list" ? (
          <CompactRequestRow key={r.id} C={C} st={st} item={r} statusMeta={ST_META}
            expanded={!!expanded[r.id]} onToggle={toggle}>
            {controls}
          </CompactRequestRow>
        ) : (
          <ItemCard key={r.id} C={C} st={st} item={r} itemKind="request" hideFund
            isExpanded={!!expanded[r.id]} onToggle={toggle}
            statusMeta={ST_META} profileId={profile?.id} onAttachmentsChanged={onReload}
            avatar={<RequesterAvatar requester={r.requester} size={60} round />}>
            {controls}
          </ItemCard>
        );
      })}
    </section>
  );
}


// ---------------------------------------------------------------- Переключатель вида списка заявок
// «Список» — компактные строки; «Подробно» — карточки с ЗРС (как в ManaJet).
function ViewToggle({ isMobile, view, setView }) {
  return (
    <div style={{ marginLeft: "auto" }}>
      <GlassSegment
        size="sm"
        ariaLabel="Вид списка заявок"
        value={view}
        onChange={setView}
        options={[
          { value: "list", label: isMobile ? undefined : "Список", icon: <List size={13} /> },
          { value: "detailed", label: isMobile ? undefined : "Подробно", icon: <LayoutList size={13} /> },
        ]}
      />
    </div>
  );
}


// ---------------------------------------------------------------- Компактная строка заявки («Список»)
// Слим-строка: аватар · №/статья · пост·заявитель · сумма · статус; по клику
// раскрывает те же контролы рассмотрения (фонд/сумма/Одобрить/Отклонить/Сброс).
function CompactRequestRow({ C, st, item, statusMeta, expanded, onToggle, children }) {
  const m = statusMeta[item.status] || {};
  const amount = Number(item.approved_amount ?? item.planned_amount);
  return (
    <div style={{ ...st.locCard, marginBottom: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer" }}
        className="locHead" onClick={onToggle}>
        <RequesterAvatar requester={item.requester} size={30} round />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            №{item.number} · {item.expense_type ? `${item.expense_type.code || ""} ${item.expense_type.name}` : "—"}
          </div>
          <div style={{ fontSize: 11.5, color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.position ? `${item.position.code} ${item.position.name}` : "пост не указан"}{item.requester ? ` · ${item.requester.full_name}` : ""}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div className="denseNum" style={{ fontWeight: 800, fontSize: 13.5 }}>{fmt(amount)} <span style={st.locUnit}>{item.currency?.code || ""}</span></div>
          <span style={{ ...st.weekTag, marginLeft: 0, color: m.color, background: `${m.color}1a` }}>{m.label}</span>
        </div>
        <span style={{ ...st.locChevron, transform: expanded ? "rotate(90deg)" : "none" }}><ChevronRight size={16} /></span>
      </div>
      {expanded && <div style={{ ...st.locBody, padding: "8px 14px 12px" }}>{children}</div>}
    </div>
  );
}



// ---------------------------------------------------------------- Инлайн-форма рассмотрения заявки
// Внутри развёрнутой карточки: выбор фонда, правка одобряемой суммы и комментарий
// (при рассмотрении) либо итог решения + Оплатить/Сброс (после решения).
function RequestReviewControls({ C, st, isMobile, item, funds, isFinAdmin, onApprove, onReject, onReset }) {
  const isPaid = item.status === "paid";
  const isApproved = item.status === "approved";

  const [fundId, setFundId] = useState(item.fund?.id || "");
  const [amount, setAmount] = useState(String(item.approved_amount ?? item.planned_amount ?? ""));
  const [comment, setComment] = useState(item.comment || "");
  const [localErr, setLocalErr] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const grid2 = { display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 180px", gap: 10 };

  // Любое действие: блокировка, сообщение успеха/ошибки и тряска кнопок — в карточке.
  const triggerShake = () => { setShake(true); setTimeout(() => setShake(false), 600); };
  const act = async (fn) => {
    if (busy) return;
    setBusy(true); setLocalErr(""); setDone("");
    try {
      const msg = await fn();
      if (msg) setDone(msg);
      feedbackSuccess();
    } catch (e) {
      setLocalErr(e?.message || String(e));
      triggerShake();
      feedbackError();
    } finally {
      setBusy(false);
    }
  };

  // Оплаченную заявку не пересматриваем (расход уже проведён в Реестре).
  if (isPaid) {
    return (
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12.5, color: C.sub }}>
        <span>Оплачено: <b style={{ color: C.text }}>{fmt(Number(item.approved_amount ?? item.planned_amount))}</b> {item.currency?.code || ""}</span>
        {item.fund && <span>из фонда <b style={{ color: C.text }}>{item.fund.code}</b></span>}
        {item.comment && <span>· {item.comment}</span>}
      </div>
    );
  }

  // Не финкомитет — только смотрит итог решения, без управляющих полей.
  if (!isFinAdmin) {
    return (
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12.5, color: C.sub }}>
        {isApproved && <span>Одобрено: <b style={{ color: C.text }}>{fmt(Number(item.approved_amount ?? item.planned_amount))}</b> {item.currency?.code || ""}</span>}
        {item.comment && <span>{item.comment}</span>}
      </div>
    );
  }

  // Рассмотрение: фонд + сумма + комментарий. Три кнопки доступны всегда —
  // и на рассмотрении, и для уже одобренной/отклонённой (повторное решение / сброс).
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={grid2}>
        <div style={st.reqField}>
          <span style={st.reqFieldLbl}>Фонд-источник</span>
          <select style={st.mdSelect} className="fin" value={fundId} onChange={(e) => { setFundId(e.target.value); setLocalErr(""); }}>
            <option value="">— выберите —</option>
            {funds.map((fd) => <option key={fd.id} value={fd.id}>{fd.code} — {fd.name} ({fmt(Number(fd.balance))})</option>)}
          </select>
        </div>
        <div style={st.reqField}>
          <span style={st.reqFieldLbl}>Одобрить сумму</span>
          <input style={st.mdInput} className="fin" inputMode="decimal" value={amount}
            onChange={(e) => { setAmount(e.target.value); setLocalErr(""); }} onWheel={(e) => e.target.blur()} />
        </div>
      </div>
      <div style={st.reqField}>
        <span style={st.reqFieldLbl}>Комментарий (при отклонении — обязателен)</span>
        <textarea style={{ ...st.mdInput, minHeight: 56, resize: "vertical", fontFamily: "inherit" }} className="fin"
          placeholder="Комментарий финкомитета…" value={comment} onChange={(e) => setComment(e.target.value)} />
      </div>
      {localErr && (
        <div style={{ ...st.reqError, marginBottom: 0 }}><AlertCircle size={14} /> {localErr}</div>
      )}
      {done && (
        <div style={{ ...st.reqSuccess, marginBottom: 0 }}>
          <CheckCircle2 size={14} /> {done}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }} className={shake ? "shake" : ""}>
        <button style={{ ...st.btnGreen, flex: 1, justifyContent: "center", minWidth: 0 }}
          className="btn" disabled={busy} onClick={() => act(() => onApprove(item, { fundId, amount, comment }))}>
          <Check size={14} /> Одобрить
        </button>
        <button style={{ ...st.btnGhost, color: C.danger, flex: 1, justifyContent: "center", minWidth: 0 }} className="btn" disabled={busy}
          onClick={() => act(() => onReject(item, { comment }))}>
          <Ban size={14} /> Отклонить
        </button>
        <button style={{ ...st.btnGhost, flex: 1, justifyContent: "center", minWidth: 0 }} className="btn" disabled={busy} onClick={() => act(() => onReset(item))}>
          <RotateCcw size={14} /> Сброс
        </button>
      </div>
    </div>
  );
}


// ---------------------------------------------------------------- Этап распределения
// Фонды этапа сгруппированы по папкам (fund_folders) — как в ManaJet.
// Слева у каждого фонда галочка: отмеченные фонды считаются при «Рассчитать»
// (если не отмечено ничего — считаются все). Уже одобренные не пересчитываются.
function LevelCard({ sg, C, st, isMobile, pctOf, setPcts, busy, locked, folders, stageFact, onCalc, onApprove, onReset, onResetApproved, onOpenCalc }) {
  const [openFolders, setOpenFolders] = useState({});
  const [checked, setChecked] = useState(() => new Set());
  const [collapsed, setCollapsed] = useState(true); // по умолчанию этап свёрнут
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

  // Эффективный % фонда от базы этапа: обычный фонд — его правило; фонд «по видам»
  // — доля рассчитанной по каскаду суммы в базе этапа (число, а не «по видам»).
  const pctOfRow = (x) => {
    if (x.typeRules?.length) {
      if (!(sg.base > 0)) return 0;
      return Math.round((calcTypeRulesAmount(x.typeRules, stageFact) / sg.base) * 1000) / 10;
    }
    return x.rule ? Number(pctOf(x.rule)) : 0;
  };

  const cbStyle = { width: 15, height: 15, accentColor: C.green, marginRight: 7, flexShrink: 0, cursor: "pointer" };
  const StageIcon = sg.icon || Banknote; // иконка этапа (Выручка/Маржа/СКД)
  // Колонки. На десктопе видны все шесть. На телефоне всё помещается в экран без
  // горизонтального скролла: по умолчанию (режим "base") — Название · % ·
  // калькулятор · Доступно; кнопкой-стрелкой переключаемся в режим "results" —
  // Название · Рассчитано · Одобрено. Так две колонки «открываются» одной кнопкой.
  // Десктоп — полная таблица; на телефоне строки фондов рендерятся карточками
  // (см. ветку isMobile в FundRow), поэтому колонок всегда полный набор.
  const showBase = true;     // %, калькулятор, Доступно
  const showResults = true;  // Рассчитано, Одобрено
  const GRID = "150px 58px 46px minmax(104px,1fr) 132px 132px";
  const frow6 = { ...st.frow, gridTemplateColumns: GRID, minWidth: 760 };

  // Три кнопки действий. eq — одинаковая ширина (для мобильного ряда mActions).
  const btnEq = { flex: 1, justifyContent: "center", minWidth: 0, padding: "11px 10px" };
  const CalcBtn = ({ eq }) => (
    <button style={{ ...st.btnGhost, ...(eq ? btnEq : {}) }} onClick={() => onCalc([...checked])} className="btn" disabled={!!busy || locked}>
      {calcBusy ? <span className="spin"><RotateCw size={15} /></span> : <Calculator size={15} />} Рассчитать
    </button>
  );
  const ApproveBtn = ({ eq }) => {
    // загорается при наличии рассчитанного ИЛИ когда отмечены галочки (сам рассчитает)
    const ok = !locked && (hasApprovable || checked.size > 0);
    return (
      <button style={{ ...st.btnGreen, ...(eq ? btnEq : {}), opacity: ok ? (busy ? 0.7 : 1) : 0.35, cursor: ok ? "pointer" : "not-allowed" }}
        onClick={() => onApprove([...checked])} className="btn" disabled={!!busy || !ok}>
        {apprBusy ? <span className="spin"><RotateCw size={15} /></span> : <Check size={15} />} Одобрить
      </button>
    );
  };
  const ResetBtn = ({ eq }) => (
    <button style={{ ...st.btnGhost, ...(eq ? btnEq : {}) }} onClick={sg.isApproved ? onResetApproved : onReset} className="btn" disabled={!!busy || locked}>
      {resetBusy ? <span className="spin"><RotateCw size={14} /></span> : <RotateCcw size={14} />} Сброс
    </button>
  );

  const totals = sg.rows.reduce((t, x) => ({
    avail: t.avail + Number(x.fund?.balance || 0), calc: t.calc + x.calc, appr: t.appr + x.appr,
  }), { avail: 0, calc: 0, appr: 0 });

  // Подпись-значение для мобильной карточки фонда
  const MiniVal = ({ label, value, color, bold }) => (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10, color: C.faint, marginBottom: 2 }}>{label}</div>
      <div className="denseNum" style={{ fontSize: 13, fontWeight: bold ? 800 : 600, color: color || C.text, whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );

  // Фонд: на десктопе — строка таблицы, на телефоне — карточка (название без
  // обрезки в заголовке, под ним бар и три значения Доступно/Рассчитано/Одобрено)
  const FundRow = ({ x, child }) => {
    const avail = Number(x.fund?.balance || 0);
    const barVal = x.appr || x.calc;
    const barBase = avail > 0 ? avail : (barVal || 1);
    const fill = barVal > 0 ? Math.min(100, (barVal / barBase) * 100) : 0;
    const hasTypeRules = x.typeRules?.length > 0;
    const rowEditable = !locked && !(x.appr > 0);

    if (isMobile) {
      return (
        <div className="frow" style={{ padding: "12px 12px", borderTop: `1px solid ${C.line}`,
          background: x.appr > 0 ? `${C.money}0d` : "transparent", ...(child ? { paddingLeft: 22 } : {}) }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" style={cbStyle} checked={checked.has(x.fund.id)}
              disabled={!rowEditable} onChange={() => toggleOne(x.fund.id)} />
            <Coins size={14} color={C.money} style={{ flexShrink: 0 }} />
            <span style={st.fundCode}>{x.fund?.code}</span>
            <span style={{ fontWeight: 700, fontSize: 13.5, flex: 1, minWidth: 0 }}>{x.fund?.name}</span>
            {x.fund?.is_restricted && <Lock size={12} color={C.faint} />}
            <span style={{ fontSize: 13, fontWeight: 800, color: C.sub, flexShrink: 0 }}>{pctOfRow(x)}%</span>
            {hasTypeRules && (
              <button style={{ ...st.iconBtn, width: 30, height: 30, borderRadius: 9, padding: 0, color: C.green, flexShrink: 0 }}
                className="btn" disabled={!!busy || locked} title="Распределение по видам дохода (настраивается в «Доходах»)"
                onClick={() => onOpenCalc(x.fund)}><Calculator size={16} /></button>
            )}
          </div>
          <div style={{ ...st.bar, maxWidth: "100%", marginTop: 9 }}>
            <div style={{ ...st.barFill, width: `${fill}%`, background: x.appr ? C.money : C.warning }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 10 }}>
            <MiniVal label="Доступно" value={fmt(avail)} bold />
            <MiniVal label="Рассчитано" value={fmt(x.calc)} color={x.calc ? C.warning : C.faint} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, color: C.faint, marginBottom: 2 }}>Одобрено</div>
              <div className="denseNum" style={{ fontSize: 13, fontWeight: 800, color: x.appr ? C.money : C.faint, whiteSpace: "nowrap" }}>{fmt(x.appr)}</div>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div style={{ ...frow6, ...(child ? { paddingLeft: 14 } : {}) }} className="frow">
        <div style={st.fName}>
          <div style={{ ...st.fundTop, minWidth: 0 }}>
            <input type="checkbox" style={cbStyle} checked={checked.has(x.fund.id)}
              disabled={!rowEditable} onChange={() => toggleOne(x.fund.id)} />
            <Coins size={14} color={C.money} style={{ flexShrink: 0 }} />
            <span style={st.fundCode}>{x.fund?.code}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{x.fund?.name}</span>
            {x.fund?.is_restricted && <Lock size={12} color={C.faint} />}
          </div>
          <div style={st.bar}><div style={{ ...st.barFill, width: `${fill}%`, background: x.appr ? C.money : C.warning }} /></div>
        </div>
        {showBase && (
          <div style={st.fPct}>{pctOfRow(x)}<span style={st.pctSign}>%</span></div>
        )}
        {showBase && (
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
        )}
        {showBase && <div className="denseNum" style={{ ...st.fNum, fontWeight: 700 }}>{fmt(avail)}</div>}
        {showResults && (
          <div className="denseNum" style={{ ...st.fNum, color: x.calc ? C.warning : C.faint, fontWeight: x.calc ? 600 : 400 }}>
            <span className={calcBusy ? "" : x.calc ? "pop" : ""}>{fmt(x.calc)}</span>
          </div>
        )}
        {showResults && (
          <div className="denseNum" style={{ ...st.fNum, color: x.appr ? C.money : C.faint, fontWeight: x.appr ? 700 : 400 }}>
            <span className={x.appr ? "pop" : ""}>{fmt(x.appr)}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={st.cardWrap}>
      <section style={st.card}>
        <div style={{ ...st.cardHead, cursor: "pointer" }} onClick={() => setCollapsed((c) => !c)}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", background: `${C.green}1f`, color: C.green, flexShrink: 0 }}>
              <StageIcon size={17} />
            </div>
            <div style={st.cardTitle}>{sg.title}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <div className="denseNum" style={st.cardTotal}>{fmt(sg.base)} <span style={st.unit}>TJS</span></div>
            <ChevronRight size={18} style={{ transform: collapsed ? "none" : "rotate(90deg)", transition: "transform .2s", color: C.sub, flexShrink: 0 }} />
          </div>
        </div>
        {/* Свёрнутый этап: только выбор всех фондов (итог по этапу — общий блок ниже) */}
        {collapsed && sg.rows.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 16px",
            color: C.sub, fontSize: 12, fontWeight: 600 }}>
            <input type="checkbox" style={cbStyle} checked={allChecked}
              disabled={locked || !selectable.length} onChange={toggleAll} />
            Выбрать все фонды этапа
          </div>
        )}
        {!collapsed && (sg.rows.length === 0 ? <div style={st.empty}>Фонды этого этапа не настроены</div> : (<>
          {isMobile ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 12px",
              borderTop: `1px solid ${C.line}`, color: C.sub, fontSize: 12, fontWeight: 600 }}>
              <input type="checkbox" style={cbStyle} checked={allChecked}
                disabled={locked || !selectable.length} onChange={toggleAll} />
              Выбрать все фонды этапа
            </div>
          ) : (
            <div style={{ ...frow6, ...st.frowHead }}>
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
              <div style={st.fNum}>Рассчитано</div>
              <div style={st.fNum}>Одобрено</div>
            </div>
          )}
          {flat.map((x) => <FundRow key={x.fund?.id || x.rule?.id} x={x} />)}
          {Object.entries(grouped).map(([fid, rows]) => {
            const isOpen = !!openFolders[fid];
            const fsum = rows.reduce((t, x) => ({
              avail: t.avail + Number(x.fund?.balance || 0), calc: t.calc + x.calc, appr: t.appr + x.appr,
              pct: t.pct + pctOfRow(x),
            }), { avail: 0, calc: 0, appr: 0, pct: 0 });
            const gPct = Math.round(fsum.pct * 10) / 10;   // суммарный % группы (число)
            const gBarVal = fsum.appr || fsum.calc;
            const gFill = gBarVal > 0 ? Math.min(100, (gBarVal / (fsum.avail > 0 ? fsum.avail : gBarVal)) * 100) : 0;
            // Выбор всех фондов группы галочкой (только ещё не одобренные)
            const gSel = rows.filter((x) => x.fund && !(x.appr > 0)).map((x) => x.fund.id);
            const gChecked = gSel.length > 0 && gSel.every((id) => checked.has(id));
            const toggleGroup = () => setChecked((s) => {
              const n = new Set(s);
              if (gSel.every((id) => n.has(id))) gSel.forEach((id) => n.delete(id));
              else gSel.forEach((id) => n.add(id));
              return n;
            });
            const PctTag = () => (<>{gPct}<span style={st.pctSign}>%</span></>);
            return (
              <div key={fid}>
                {isMobile ? (
                  <div className="frow" onClick={() => setOpenFolders((o) => ({ ...o, [fid]: !o[fid] }))}
                    style={{ padding: "12px 12px", cursor: "pointer", borderTop: `1px solid ${C.line}`,
                      background: isOpen ? `${C.info}12` : `${C.info}08` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <input type="checkbox" style={cbStyle} checked={gChecked}
                        disabled={locked || !gSel.length}
                        onClick={(e) => e.stopPropagation()} onChange={toggleGroup} />
                      <div style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center",
                        background: `${C.info}22`, color: C.info, flexShrink: 0 }}>
                        <Landmark size={16} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {folderById[fid]?.name || "Группа"}
                        </div>
                        <div style={{ fontSize: 10.5, color: C.faint, marginTop: 1 }}>{rows.length} фонд(ов)</div>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 800, color: C.sub, flexShrink: 0 }}><PctTag /></span>
                      <ChevronRight size={18} style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .2s", color: C.faint, flexShrink: 0 }} />
                    </div>
                    <div style={{ ...st.bar, maxWidth: "100%", marginTop: 9 }}>
                      <div style={{ ...st.barFill, width: `${gFill}%`, background: fsum.appr ? C.money : C.warning }} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 10 }}>
                      <MiniVal label="Доступно" value={fmt(fsum.avail)} bold />
                      <MiniVal label="Рассчитано" value={fmt(fsum.calc)} color={fsum.calc ? C.warning : C.faint} bold />
                      <MiniVal label="Одобрено" value={fmt(fsum.appr)} color={fsum.appr ? C.money : C.faint} bold />
                    </div>
                  </div>
                ) : (
                  <div style={{ ...frow6, cursor: "pointer", background: C.panel2 }} className="frow"
                    onClick={() => setOpenFolders((o) => ({ ...o, [fid]: !o[fid] }))}>
                    <div style={st.fName}>
                      <div style={st.fundTop}>
                        <input type="checkbox" style={cbStyle} checked={gChecked}
                          disabled={locked || !gSel.length}
                          onClick={(e) => e.stopPropagation()} onChange={toggleGroup} />
                        <Landmark size={15} color={C.info} />
                        <b>{folderById[fid]?.name || "Группа"}</b>
                        <span style={{ fontSize: 11, color: C.faint }}>· {rows.length} фонд(ов)</span>
                        <ChevronRight size={14} style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .2s", color: C.faint }} />
                      </div>
                    </div>
                    <div style={st.fPct}><PctTag /></div>
                    <div />
                    <div className="denseNum" style={{ ...st.fNum, fontWeight: 700 }}>{fmt(fsum.avail)}</div>
                    <div className="denseNum" style={{ ...st.fNum, color: fsum.calc ? C.warning : C.faint }}>{fmt(fsum.calc)}</div>
                    <div className="denseNum" style={{ ...st.fNum, color: fsum.appr ? C.money : C.faint, fontWeight: fsum.appr ? 700 : 400 }}>{fmt(fsum.appr)}</div>
                  </div>
                )}
                {isOpen && rows.map((x) => <FundRow key={x.fund?.id} x={x} child />)}
              </div>
            );
          })}
        </>))}
        {/* Итог по этапу — общий блок: виден и в свёрнутом, и в развёрнутом виде */}
        {sg.rows.length > 0 && (isMobile ? (
          <div style={{ ...st.frowTotal, padding: "12px 12px", borderTop: `1px solid ${C.line}` }}>
            <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>Итого по этапу</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <MiniVal label="Доступно" value={fmt(totals.avail)} bold />
              <MiniVal label="Рассчитано" value={fmt(totals.calc)} color={totals.calc ? C.warning : C.faint} bold />
              <div>
                <div style={{ fontSize: 10, color: C.faint, marginBottom: 2 }}>Одобрено</div>
                <div className="denseNum" style={{ fontSize: 13, fontWeight: 800, color: C.money }}>{fmt(totals.appr)}</div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ ...frow6, ...st.frowTotal }}>
            <div style={st.fName}><div style={st.actions}><CalcBtn /><ApproveBtn /><ResetBtn /></div></div>
            <div style={st.fPct} />
            <div />
            <div className="denseNum" style={{ ...st.fNum, fontWeight: 700 }}>{fmt(totals.avail)}</div>
            <div className="denseNum" style={{ ...st.fNum, fontWeight: 700, color: totals.calc ? C.warning : C.faint }}>{fmt(totals.calc)}</div>
            <div className="denseNum" style={{ ...st.fNum, fontWeight: 700, color: C.money }}>
              {fmt(totals.appr)}
            </div>
          </div>
        ))}
        {sg.rows.length > 0 && isMobile && <div style={st.mActions}><CalcBtn eq /><ApproveBtn eq /><ResetBtn eq /></div>}
      </section>
    </div>
  );
}


// ---------------------------------------------------------------- Калькулятор фонда
// Модель ManaJet: распределение в фонд по видам дохода с разными процентами.
// Факт = доход вида за неделю; рассчитано = факт × %; суммы можно поправить.
function FundCalcModal({ C, st, isMobile, fund, stage, rules, incomeByType, approved, busy, locked, onClose, onApprove }) {
  useScrollLock();
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
    <div style={st.mdOverlay} data-modal="1" onClick={onClose}>
      <div style={{ ...st.mdCard, width: "min(560px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>Одобрение · {fund.code} {fund.name}</div>
          <button style={st.iconBtn} onClick={onClose} aria-label="Закрыть"><X size={17} /></button>
        </div>
        <div style={{ fontSize: 12, color: C.sub, marginBottom: 10 }}>
          Этап «{stage.title}» · своя схема по видам дохода
          {approved > 0 && <b style={{ color: C.money }}> · уже одобрено {fmt(approved)}</b>}
        </div>

        {!isMobile && (
          <div style={{ ...st.frow, ...st.frowHead, gridTemplateColumns: "1fr 90px 56px 90px 100px" }}>
            <div style={st.fName}>Вид дохода</div>
            <div style={st.fNum}>Факт</div>
            <div style={st.fPct}>%</div>
            <div style={st.fNum}>Рассчитано</div>
            <div style={st.fNum}>Одобрить</div>
          </div>
        )}
        <div style={{ maxHeight: isMobile ? "none" : 360, overflowY: "auto" }}>
          {rules.map((r) => {
            const fact = incomeByType[r.income_type?.id] || 0;
            const calc = r.percent ? Math.round(fact * Number(r.percent)) / 100 : Number(r.fixed_amount || 0);
            if (isMobile) {
              return (
                <div key={r.id} style={{ padding: "12px 0", borderTop: `1px solid ${C.line}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={st.fundCode}>{r.income_type?.code}</span>
                    <span style={{ fontWeight: 700, fontSize: 13, flex: 1, minWidth: 0 }}>{r.income_type?.name}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.sub }}>{r.percent ? `${Number(r.percent)}%` : "фикс"}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 10, color: C.faint }}>Факт</div>
                      <div className="denseNum" style={{ fontSize: 13, fontWeight: 600 }}>{fmt(fact)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: C.faint }}>Рассчитано</div>
                      <div className="denseNum" style={{ fontSize: 13, fontWeight: 600, color: calc ? C.warning : C.faint }}>{fmt(calc)}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 10, color: C.faint, marginBottom: 3 }}>Одобрить</div>
                    <input type="number" inputMode="decimal" value={vals[r.id]}
                      onChange={(e) => setVals((p) => ({ ...p, [r.id]: e.target.value }))}
                      onWheel={(e) => e.target.blur()}
                      style={{ ...st.pctInput, width: "100%", padding: "10px 12px", fontSize: 14, textAlign: "left" }} />
                  </div>
                </div>
              );
            }
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
        {isMobile ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
            <b style={{ fontSize: 13 }}>Итого одобрить</b>
            <b className="denseNum" style={{ fontSize: 16, color: C.money }}>{fmt(total)}</b>
          </div>
        ) : (
          <div style={{ ...st.frow, ...st.frowTotal, gridTemplateColumns: "1fr 90px 56px 90px 100px" }}>
            <div style={st.fName}><b>Итого</b></div>
            <div style={{ ...st.fNum, fontWeight: 700 }}>{fmt(factTotal)}</div>
            <div style={st.fPct} />
            <div style={st.fNum} />
            <div style={{ ...st.fNum, fontWeight: 800, color: C.money }}>{fmt(total)}</div>
          </div>
        )}

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
  useScrollLock();
  const [fundId, setFundId] = useState(funds.find((f) => f.code === "FD6")?.id || funds[0]?.id || "");
  return (
    <div style={st.mdOverlay} data-modal="1" onClick={onClose}>
      <div style={{ ...st.mdCard, width: "min(420px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>Перенести остаток в фонд</div>
          <button style={st.iconBtn} onClick={onClose} aria-label="Закрыть"><X size={17} /></button>
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
