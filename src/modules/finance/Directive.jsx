import { useState, useMemo, useEffect, useCallback } from "react";
import { ClipboardList, Calculator, CalendarDays, Check, RotateCcw, RotateCw, Lock, Unlock, Ban, ArrowRightLeft, Loader2, AlertCircle, CheckCircle2, Folder, FolderOpen, ChevronRight, Zap, Scale, TrendingUp, TrendingDown } from "lucide-react";
import { GlassCard, KpiTile, DenseSurface, GlassButton, GlassModal } from "../../components/glass";
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
  const [prevDist, setPrevDist] = useState([]);   // распределение прошлой недели (для сравнения)
  const [compare, setCompare] = useState(false);  // режим сравнения с прошлой неделей
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
    if (!periodId) { setIncome(0); setPrevIncome(0); setRegRows([]); setPrevDist([]); return; }
    const [inc, pinc, rows, prows] = await Promise.all([
      fetchPeriodIncome(periodId),
      prevPeriod ? fetchPeriodIncome(prevPeriod.id) : Promise.resolve(0),
      fetchPeriodDistribution(periodId),
      prevPeriod ? fetchPeriodDistribution(prevPeriod.id) : Promise.resolve([]),
    ]);
    setIncome(inc); setPrevIncome(pinc); setRegRows(rows); setPrevDist(prows);
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

  // Одобрено прошлой недели по фондам (все этапы) — для колонки сравнения
  const prevByFund = useMemo(() => {
    const m = {};
    prevDist.forEach((r) => { m[r.fund_id] = (m[r.fund_id] || 0) + r.amount; });
    return m;
  }, [prevDist]);
  const prevTotal = useMemo(() => Object.values(prevByFund).reduce((a, v) => a + v, 0), [prevByFund]);
  const canCompare = !!prevPeriod;

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
  // есть ли что одобрять для авто-распределения (фонд этапа без одобрения и с базой)
  const hasUnapproved = useMemo(
    () => income > 0 && stagesView.some((sg) => sg.base > 0.01 && sg.rows.some((x) => x.fund && !(x.appr > 0))),
    [stagesView, income],
  );

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

  // Аллокации этапа для авто-распределения: фонд × % от базы (или Σ по видам
  // дохода для ФРС-фондов). Уже одобренные на этом этапе фонды пропускаются.
  const computeStageAllocations = (stageKey, base) => {
    const apprMap = approvedByStage[stageKey] || {};
    const out = [];
    const seen = new Set();
    rules.filter((r) => r.stage === stageKey).forEach((r) => {
      const fund = fundById[r.fund_id];
      if (!fund || seen.has(fund.id)) return;
      seen.add(fund.id);
      if (apprMap[fund.id] > 0) return;
      const amount = Math.round(base * pctOf(r)) / 100;
      if (amount > 0) out.push({ fund_id: fund.id, amount });
    });
    for (const [fundId, frs] of Object.entries(fundRules)) {
      const stageFrs = frs.filter((x) => x.stage === stageKey);
      if (!stageFrs.length || seen.has(fundId) || apprMap[fundId] > 0) continue;
      const amount = Math.round(stageFrs.reduce((a, r) => {
        const fact = incomeByType[r.income_type?.id] || 0;
        return a + (r.percent != null ? fact * Number(r.percent) / 100 : Number(r.fixed_amount || 0));
      }, 0) * 100) / 100;
      if (amount > 0) { out.push({ fund_id: fundId, amount }); seen.add(fundId); }
    }
    return out;
  };

  // Авто-распределение всех трёх этапов одним действием: каскадом, как вручную
  // (база следующего этапа = остаток после предыдущего). Уже одобренное не трогаем.
  const doAutoAll = async () => {
    if (busy || !period || isClosed) return;
    if (!window.confirm("Рассчитать и одобрить все этапы по схеме недели? Суммы будут зачислены в фонды через Реестр.")) return;
    setBusy("auto"); setErr(""); setDone("");
    try {
      let base = income;
      let anyNew = false;
      for (const meta of STAGES) {
        const apprMap = approvedByStage[meta.key] || {};
        const apprSum = Object.values(apprMap).reduce((a, v) => a + v, 0);
        const allocations = computeStageAllocations(meta.key, base);
        const newSum = allocations.reduce((a, x) => a + x.amount, 0);
        if (allocations.length) { await distributeStage(periodId, meta.key, allocations); anyNew = true; }
        base -= apprSum + newSum;
      }
      await Promise.all([reloadPeriodData(), loadRefs()]);
      setCalculated({});
      setDone(anyNew
        ? "Все этапы рассчитаны и одобрены — суммы зачислены в фонды"
        : "Все этапы уже одобрены — распределять нечего");
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

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
    <GlassCard glow pad={isMobile ? "20px 18px" : "24px 28px"} radius={24} style={{ marginBottom: 18 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={st.heroLabel}>Директива · недельное распределение ФРС</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 5 }}>
          <CalendarDays size={18} color={C.green} />
          <span style={{ ...st.heroTitle, whiteSpace: "normal" }}>{period ? periodTitle(period) : "Период не создан — добавьте неделю в шапке"}</span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        <KpiTile label="Доход на этой неделе" value={fmt(income)} unit="TJS" />
        <KpiTile label="Доступно во всех фондах" value={fmt(fundsTotal)} unit="TJS" accent />
        <KpiTile label="Доход за прошлую неделю" value={fmt(prevIncome)} unit="TJS" />
        <KpiTile label="Одобрено распределение" value={fmt(approvedTotal)} unit="TJS" />
      </div>
    </GlassCard>

    {err && <div style={{ ...st.reqError, marginBottom: 14 }}><AlertCircle size={15} /> {err}</div>}
    {done && <div style={{ ...st.reqError, marginBottom: 14, color: C.green, background: `${C.green}1a`, borderColor: `${C.green}44` }}><CheckCircle2 size={15} /> {done}</div>}

    {!rules.length && (
      <div style={{ ...st.locCard, ...st.empty }}>
        Схема распределения не настроена — примените миграции 006–007 (supabase/README.md).
      </div>
    )}

    {rules.length > 0 && period && (
      <div style={st.dirToolbar} className="dirToolbar">
        <GlassButton variant="primary" onClick={doAutoAll} busy={busy === "auto"}
          disabled={!!busy || isClosed || !hasUnapproved}
          title={isClosed ? "Период закрыт" : hasUnapproved ? "Рассчитать и одобрить все этапы по схеме недели" : "Все этапы уже одобрены"}>
          {busy === "auto" ? <Loader2 size={15} className="spin" /> : <Zap size={15} />}
          {isMobile ? "Одобрить всё" : "Рассчитать и одобрить всё"}
        </GlassButton>
        {canCompare && (
          <GlassButton variant="toggle" active={compare} onClick={() => setCompare((v) => !v)}
            title="Показать суммы фондов за прошлую неделю и динамику">
            <Scale size={15} /> {compare ? "Скрыть сравнение" : "Сравнить с прошлой неделей"}
          </GlassButton>
        )}
      </div>
    )}

    {stagesView.map((sg) => (
      <LevelCard key={sg.key} sg={sg} C={C} st={st} isMobile={isMobile}
        pctOf={pctOf} setPcts={setPcts} busy={busy} locked={isClosed || !period}
        folders={folders} compare={compare && canCompare} prevByFund={prevByFund}
        onCalc={(ids) => doCalc(sg, ids)} onApprove={() => doApprove(sg)}
        onReset={() => doReset(sg)} onResetApproved={() => doResetApproved(sg)}
        onOpenCalc={(fund) => setCalcFund({ fund, stage: sg })} />
    ))}

    {/* Итог распределения на ФП */}
    <GlassCard pad={isMobile ? "18px 18px" : "20px 22px"} radius={22} style={{ marginTop: 18 }}>
      <div style={st.fpRows}>
        <div style={st.fpRow}><span style={st.fpLabelBold}>Сумма к распределению на ФП</span><span className="denseNum" style={st.fpValBold}>{fmt(income)}</span></div>
        <div style={st.fpRow}><span style={st.fpLabel}>Распределено по фондам (Реестр)</span><span className="denseNum" style={st.fpVal}>{fmt(approvedTotal)}</span></div>
        {compare && canCompare && (
          <div style={st.fpRow}>
            <span style={st.fpLabel}>Прошлая неделя · доход / распределено</span>
            <span className="denseNum" style={st.fpVal}>
              {fmt(prevIncome)} / {fmt(prevTotal)}
              <Delta C={C} delta={approvedTotal - prevTotal} />
            </span>
          </div>
        )}
        <div style={{ ...st.fpRow, ...st.fpRemainder }}>
          <span style={st.fpLabelBold}>Остаток нераспределённого</span>
          <span className="denseNum" style={{ ...st.fpValBold, color: remainder < -0.01 ? C.danger : C.green }}>{fmt(remainder)}</span>
        </div>
      </div>
      <div style={st.fpActions} className="fpActions">
        <GlassButton variant={requestsBlocked ? "danger" : "ghost"} onClick={toggleRequests}
          busy={busy === "block"} disabled={!!busy || isClosed || !period}>
          {busy === "block" ? <Loader2 size={15} className="spin" />
            : requestsBlocked ? <Lock size={15} /> : <Ban size={15} />}
          {requestsBlocked ? "Подача заявок запрещена" : "Запретить подачу заявок"}
        </GlassButton>
        <GlassButton variant={isClosed ? "danger" : "primary"} onClick={doToggleClose}
          busy={busy === "close"} disabled={!!busy || !period}>
          {busy === "close" ? <Loader2 size={15} className="spin" /> : isClosed ? <Unlock size={15} /> : <Lock size={15} />}
          {isClosed ? "Открыть неделю" : "Закрыть период ФП"}
        </GlassButton>
        <GlassButton variant="ghost" onClick={() => setTransferOpen(true)}
          disabled={!!busy || isClosed || !period || remainder <= 0}>
          <ArrowRightLeft size={15} /> Перенести остатки в фонд
        </GlassButton>
      </div>
    </GlassCard>

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


// ---------------------------------------------------------------- Дельта неделя-к-неделе
// Стрелка с разницей сумм относительно прошлой недели (зелёный рост / красный спад).
function Delta({ C, delta, small }) {
  if (Math.abs(delta) < 0.01) return <span style={{ marginLeft: 6, fontSize: small ? 10 : 11, color: C.faint }}>=</span>;
  const up = delta > 0;
  return (
    <span style={{ marginLeft: 6, fontSize: small ? 10 : 11, fontWeight: 700, color: up ? C.green : C.danger,
      whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 1, verticalAlign: "middle" }}>
      {up ? <TrendingUp size={small ? 11 : 12} /> : <TrendingDown size={small ? 11 : 12} />}
      {up ? "+" : "−"}{fmt(Math.abs(delta))}
    </span>
  );
}


// ---------------------------------------------------------------- Этап распределения
// Фонды этапа сгруппированы по папкам (fund_folders) — как в ManaJet.
// Слева у каждого фонда галочка: отмеченные фонды считаются при «Рассчитать»
// (если не отмечено ничего — считаются все). Уже одобренные не пересчитываются.
// На телефоне строки таблицы превращаются в карточки (без горизонтального скролла).
function LevelCard({ sg, C, st, isMobile, pctOf, setPcts, busy, locked, folders, compare, prevByFund, onCalc, onApprove, onReset, onResetApproved, onOpenCalc }) {
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
  const showPrev = compare && !!prevByFund;
  const prevOf = (id) => (prevByFund?.[id] || 0);

  const cbStyle = { width: 15, height: 15, accentColor: C.green, marginRight: 7, flexShrink: 0, cursor: "pointer" };
  // Мобайл: строка-данные на плотной поверхности (DenseSurface), не стекло
  const mItem = { padding: "13px 14px", borderTop: `1px solid ${C.line}` };
  // Десктоп: шесть колонок (Название · % · калькулятор · Доступно · Рассчитано ·
  // Одобрено). Колонка «Одобрено» при включённом сравнении дополняется строкой
  // «пр. …» с дельтой к прошлой неделе. На телефоне таблица не используется —
  // строки рендерятся карточками (см. ветку isMobile ниже).
  const GRID6 = "150px 58px 46px minmax(104px,1fr) 132px 132px";
  const frow6 = { ...st.frow, gridTemplateColumns: GRID6, minWidth: 760 };

  const CalcBtn = () => (
    <GlassButton variant="ghost" full={isMobile} onClick={() => onCalc([...checked])} disabled={!!busy || locked}>
      {calcBusy ? <span className="spin"><RotateCw size={15} /></span> : <Calculator size={15} />} Рассчитать
    </GlassButton>
  );
  const ApproveBtn = () => (
    <GlassButton variant="primary" full={isMobile} onClick={onApprove} busy={apprBusy}
      disabled={!!busy || locked || !hasApprovable}>
      {apprBusy ? <span className="spin"><RotateCw size={15} /></span> : <Check size={15} />} Одобрить
    </GlassButton>
  );
  const ResetBtn = () => (
    <GlassButton variant="ghost" full={isMobile} onClick={sg.isApproved ? onResetApproved : onReset} disabled={!!busy || locked}>
      {resetBusy ? <span className="spin"><RotateCw size={14} /></span> : <RotateCcw size={14} />} Сброс
    </GlassButton>
  );

  const totals = sg.rows.reduce((t, x) => ({
    avail: t.avail + Number(x.fund?.balance || 0), calc: t.calc + x.calc, appr: t.appr + x.appr,
    prev: t.prev + prevOf(x.fund?.id),
  }), { avail: 0, calc: 0, appr: 0, prev: 0 });

  // ---- Десктоп: строка-фонд таблицы ----
  const FundRow = ({ x, child }) => {
    const avail = Number(x.fund?.balance || 0);
    const barVal = x.appr || x.calc;
    const barBase = avail > 0 ? avail : (barVal || 1);
    const fill = barVal > 0 ? Math.min(100, (barVal / barBase) * 100) : 0;
    const hasTypeRules = x.typeRules?.length > 0;
    const rowEditable = !locked && !(x.appr > 0);
    const prev = prevOf(x.fund?.id);
    return (
      <div style={{ ...frow6, ...(child ? { paddingLeft: 14 } : {}) }} className="frow">
        <div style={st.fName}>
          <div style={{ ...st.fundTop, minWidth: 0 }}>
            <input type="checkbox" style={cbStyle} checked={checked.has(x.fund.id)}
              disabled={!rowEditable} onChange={() => toggleOne(x.fund.id)} />
            <span style={st.fundCode}>{x.fund?.code}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{x.fund?.name}</span>
            {x.fund?.is_restricted && <Lock size={12} color={C.faint} />}
          </div>
          <div style={st.bar}><div style={{ ...st.barFill, width: `${fill}%`, background: x.appr ? C.green : C.warning }} /></div>
        </div>
        <div style={st.fPct}>
          {x.rule ? <>{pctOf(x.rule)}<span style={st.pctSign}>%</span></>
            : <span style={{ fontSize: 11, color: C.faint }}>по видам</span>}
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
        <div className="denseNum" style={{ ...st.fNum, fontWeight: 700 }}>{fmt(avail)}</div>
        <div className="denseNum" style={{ ...st.fNum, color: x.calc ? C.warning : C.faint, fontWeight: x.calc ? 600 : 400 }}>
          <span className={calcBusy ? "" : x.calc ? "pop" : ""}>{fmt(x.calc)}</span>
        </div>
        <div className="denseNum" style={{ ...st.fNum, color: x.appr ? C.green : C.faint, fontWeight: x.appr ? 700 : 400 }}>
          <span className={x.appr ? "pop" : ""}>{fmt(x.appr)}</span>
          {showPrev && (prev > 0 || x.appr > 0) && (
            <div style={{ fontSize: 10.5, fontWeight: 500, color: C.faint, marginTop: 2 }}>
              пр. {fmt(prev)}<Delta C={C} delta={x.appr - prev} small />
            </div>
          )}
        </div>
      </div>
    );
  };

  // ---- Мобайл: карточка-фонд ----
  const FundCardM = ({ x, child }) => {
    const avail = Number(x.fund?.balance || 0);
    const barVal = x.appr || x.calc;
    const barBase = avail > 0 ? avail : (barVal || 1);
    const fill = barVal > 0 ? Math.min(100, (barVal / barBase) * 100) : 0;
    const hasTypeRules = x.typeRules?.length > 0;
    const rowEditable = !locked && !(x.appr > 0);
    const prev = prevOf(x.fund?.id);
    return (
      <div style={{ ...mItem, ...(child ? { paddingLeft: 28, background: C.rowChild } : {}) }}>
        <div style={st.mTop}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <input type="checkbox" style={{ ...cbStyle, marginRight: 0 }} checked={checked.has(x.fund.id)}
              disabled={!rowEditable} onChange={() => toggleOne(x.fund.id)} />
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
              <span style={st.fundCode}>{x.fund?.code}</span>
              <span style={{ ...st.mName, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.fund?.name}</span>
              {x.fund?.is_restricted && <Lock size={11} color={C.faint} />}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <span style={st.mPct}>{x.rule ? `${pctOf(x.rule)}%` : "по видам"}</span>
            {hasTypeRules && (
              <button style={{ ...st.iconBtn, width: 28, height: 28, borderRadius: 8, padding: 0, color: C.green }}
                className="btn" disabled={!!busy || locked}
                title="Распределение по видам дохода" onClick={() => onOpenCalc(x.fund)}>
                <Calculator size={15} />
              </button>
            )}
          </div>
        </div>
        <div style={{ ...st.bar, maxWidth: "100%", marginBottom: 4 }}>
          <div style={{ ...st.barFill, width: `${fill}%`, background: x.appr ? C.green : C.warning }} />
        </div>
        <div style={st.mRow}><span style={st.mLabel}>Доступно</span><span className="denseNum" style={{ ...st.mVal, fontWeight: 700 }}>{fmt(avail)}</span></div>
        <div style={st.mRow}><span style={st.mLabel}>Рассчитано</span><span className="denseNum" style={{ ...st.mVal, color: x.calc ? C.warning : C.faint }}>{fmt(x.calc)}</span></div>
        <div style={st.mRow}><span style={st.mLabel}>Одобрено</span><span className="denseNum" style={{ ...st.mVal, color: x.appr ? C.green : C.faint, fontWeight: x.appr ? 700 : 400 }}>{fmt(x.appr)}</span></div>
        {showPrev && (prev > 0 || x.appr > 0) && (
          <div style={st.mRow}><span style={st.mLabel}>Прошлая неделя</span>
            <span className="denseNum" style={st.mVal}>{fmt(prev)}<Delta C={C} delta={x.appr - prev} small /></span></div>
        )}
      </div>
    );
  };

  // ---- Мобайл: карточка-папка (сворачиваемая) ----
  const FolderCardM = ({ fid, rows }) => {
    const isOpen = !!openFolders[fid];
    const fsum = rows.reduce((t, x) => ({
      avail: t.avail + Number(x.fund?.balance || 0), calc: t.calc + x.calc, appr: t.appr + x.appr,
    }), { avail: 0, calc: 0, appr: 0 });
    return (
      <div>
        <div style={{ ...mItem, cursor: "pointer", background: C.panel2 }} onClick={() => setOpenFolders((o) => ({ ...o, [fid]: !o[fid] }))}>
          <div style={st.mTop}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              {isOpen ? <FolderOpen size={16} color={C.warning} /> : <Folder size={16} color={C.warning} />}
              <b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{folderById[fid]?.name || "Папка"}</b>
              <span style={{ fontSize: 11, color: C.faint, flexShrink: 0 }}>· {rows.length}</span>
            </div>
            <ChevronRight size={16} style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .2s", color: C.faint, flexShrink: 0 }} />
          </div>
          <div style={st.mRow}><span style={st.mLabel}>Доступно</span><span className="denseNum" style={{ ...st.mVal, fontWeight: 700 }}>{fmt(fsum.avail)}</span></div>
          <div style={st.mRow}><span style={st.mLabel}>Одобрено</span><span className="denseNum" style={{ ...st.mVal, color: fsum.appr ? C.green : C.faint, fontWeight: fsum.appr ? 700 : 400 }}>{fmt(fsum.appr)}</span></div>
        </div>
        {isOpen && rows.map((x) => <FundCardM key={x.fund?.id} x={x} child />)}
      </div>
    );
  };

  const actionBar = (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: isMobile ? "12px" : "14px 16px 16px" }}>
      <CalcBtn /><ApproveBtn /><ResetBtn />
    </div>
  );

  return (
    <GlassCard radius={22} pad={0} style={{ marginBottom: 18 }}>
      <div style={st.cardHead}>
        <div style={st.cardTitle}>{sg.title}</div>
        <div className="denseNum" style={st.cardTotal}>{fmt(sg.base)} <span style={st.unit}>TJS</span></div>
      </div>
      <div style={st.subHead}>
        <span style={st.subHeadTitle}>{sg.fundsTitle}</span>
        <span style={st.subHeadAppr}>Одобрено: <b className="denseNum" style={{ color: C.green }}>{fmt(totals.appr)}</b></span>
      </div>
      {sg.rows.length === 0 ? <div style={st.empty}>Фонды этого этапа не настроены</div> : isMobile ? (<>
        <DenseSurface style={{ margin: "0 12px" }}>
          <div style={st.mSelectAll}>
            <input type="checkbox" style={{ ...cbStyle, marginRight: 0 }} checked={allChecked}
              disabled={locked || !selectable.length} onChange={toggleAll} />
            <span style={{ fontSize: 12.5, color: C.sub }}>Выбрать все фонды</span>
          </div>
          {flat.map((x) => <FundCardM key={x.fund?.id || x.rule?.id} x={x} />)}
          {Object.entries(grouped).map(([fid, rows]) => <FolderCardM key={fid} fid={fid} rows={rows} />)}
          <div style={{ ...mItem, background: C.panel2 }}>
            <div style={st.mRow}><span style={{ ...st.mLabel, fontWeight: 700, color: C.text }}>Итого доступно</span><span className="denseNum" style={{ ...st.mVal, fontWeight: 700 }}>{fmt(totals.avail)}</span></div>
            <div style={st.mRow}><span style={st.mLabel}>Рассчитано</span><span className="denseNum" style={{ ...st.mVal, fontWeight: 700, color: totals.calc ? C.warning : C.faint }}>{fmt(totals.calc)}</span></div>
            <div style={st.mRow}><span style={st.mLabel}>Одобрено</span><span className="denseNum" style={{ ...st.mVal, fontWeight: 700, color: C.green }}>{fmt(totals.appr)}</span></div>
            {showPrev && (totals.prev > 0 || totals.appr > 0) && (
              <div style={st.mRow}><span style={st.mLabel}>Прошлая неделя</span><span className="denseNum" style={st.mVal}>{fmt(totals.prev)}<Delta C={C} delta={totals.appr - totals.prev} small /></span></div>
            )}
          </div>
        </DenseSurface>
        {actionBar}
      </>) : (<>
        <DenseSurface style={{ margin: "0 16px", overflowX: "auto" }}>
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
                  <div className="denseNum" style={{ ...st.fNum, fontWeight: 700 }}>{fmt(fsum.avail)}</div>
                  <div className="denseNum" style={{ ...st.fNum, color: fsum.calc ? C.warning : C.faint }}>{fmt(fsum.calc)}</div>
                  <div className="denseNum" style={{ ...st.fNum, color: fsum.appr ? C.green : C.faint, fontWeight: fsum.appr ? 700 : 400 }}>{fmt(fsum.appr)}</div>
                </div>
                {isOpen && rows.map((x) => <FundRow key={x.fund?.id} x={x} child />)}
              </div>
            );
          })}
          <div style={{ ...frow6, ...st.frowTotal }}>
            <div style={st.fName}><b style={{ alignSelf: "center" }}>Итого</b></div>
            <div style={st.fPct} />
            <div />
            <div className="denseNum" style={{ ...st.fNum, fontWeight: 700 }}>{fmt(totals.avail)}</div>
            <div className="denseNum" style={{ ...st.fNum, fontWeight: 700, color: totals.calc ? C.warning : C.faint }}>{fmt(totals.calc)}</div>
            <div className="denseNum" style={{ ...st.fNum, fontWeight: 700, color: C.green }}>
              {fmt(totals.appr)}
              {showPrev && (totals.prev > 0 || totals.appr > 0) && (
                <div style={{ fontSize: 10.5, fontWeight: 500, color: C.faint, marginTop: 2 }}>
                  пр. {fmt(totals.prev)}<Delta C={C} delta={totals.appr - totals.prev} small />
                </div>
              )}
            </div>
          </div>
        </DenseSurface>
        {actionBar}
      </>)}
    </GlassCard>
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
    <GlassModal width={560} onClose={onClose}
      title={`Одобрение · ${fund.code} ${fund.name}`}
      subtitle={<>Этап «{stage.title}» · своя схема по видам дохода
        {approved > 0 && <b style={{ color: C.green }}> · уже одобрено {fmt(approved)}</b>}</>}
      footer={<>
        <GlassButton variant="ghost" onClick={onClose}>Отмена</GlassButton>
        <GlassButton variant="primary" busy={busy} disabled={busy || locked || total <= 0 || approved > 0}
          title={approved > 0 ? "Фонд уже одобрен на этом этапе — сбросьте этап для повтора" : ""}
          onClick={() => onApprove(Math.round(total * 100) / 100)}>
          {busy ? <Loader2 size={15} className="spin" /> : <Check size={15} />} Одобрить {fmt(total)}
        </GlassButton>
      </>}>
      <DenseSurface>
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
                <div className="denseNum" style={{ ...st.fNum, fontSize: 12.5 }}>{fmt(fact)}</div>
                <div style={{ ...st.fPct, fontSize: 12 }}>{r.percent ? `${Number(r.percent)}%` : "фикс"}</div>
                <div className="denseNum" style={{ ...st.fNum, fontSize: 12.5, color: calc ? C.warning : C.faint }}>{fmt(calc)}</div>
                <div style={{ textAlign: "right" }}>
                  <input type="number" inputMode="decimal" value={vals[r.id]}
                    onChange={(e) => setVals((p) => ({ ...p, [r.id]: e.target.value }))}
                    onWheel={(e) => e.target.blur()}
                    className="denseNum" style={{ ...st.pctInput, width: 90, padding: "6px 8px", fontSize: 12.5 }} />
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ ...st.frow, ...st.frowTotal, gridTemplateColumns: "1fr 90px 56px 90px 100px" }}>
          <div style={st.fName}><b>Итого</b></div>
          <div className="denseNum" style={{ ...st.fNum, fontWeight: 700 }}>{fmt(factTotal)}</div>
          <div style={st.fPct} />
          <div style={st.fNum} />
          <div className="denseNum" style={{ ...st.fNum, fontWeight: 800, color: C.green }}>{fmt(total)}</div>
        </div>
      </DenseSurface>
    </GlassModal>
  );
}


// ---------------------------------------------------------------- Перенос остатка в фонд
function TransferModal({ C, st, funds, remainder, busy, onClose, onTransfer }) {
  const [fundId, setFundId] = useState(funds.find((f) => f.code === "FD6")?.id || funds[0]?.id || "");
  return (
    <GlassModal width={420} onClose={onClose} title="Перенести остаток в фонд"
      footer={<>
        <GlassButton variant="ghost" onClick={onClose}>Отмена</GlassButton>
        <GlassButton variant="primary" busy={busy} onClick={() => onTransfer(fundId)} disabled={busy || !fundId}>
          {busy ? <Loader2 size={15} className="spin" /> : <ArrowRightLeft size={15} />} Перенести
        </GlassButton>
      </>}>
      <div style={{ ...st.reqField, marginBottom: 12 }}>
        <span style={st.reqFieldLbl}>Сумма остатка</span>
        <div className="denseNum" style={{ fontSize: 22, fontWeight: 800 }}>
          {fmt(remainder)} <span style={st.locUnit}>TJS</span>
        </div>
      </div>
      <div style={st.reqField}>
        <span style={st.reqFieldLbl}>Фонд-получатель</span>
        <select style={st.mdSelect} className="fin" value={fundId} onChange={(e) => setFundId(e.target.value)}>
          {funds.map((f) => <option key={f.id} value={f.id}>{f.code} — {f.name}</option>)}
        </select>
      </div>
    </GlassModal>
  );
}
