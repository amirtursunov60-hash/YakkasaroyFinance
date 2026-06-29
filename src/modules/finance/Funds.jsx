import { useState, useEffect, useCallback, useMemo } from "react";
import {
  RotateCcw, ArrowRightLeft, Clock, Lock, Loader2, AlertCircle, CheckCircle2,
  Plus, X, List, ChevronRight, Pencil, Archive, ArrowDownToLine,
  ArrowUpFromLine, HandCoins, Layers, FileText, Trash2,
} from "lucide-react";
import { Stat } from "../../components/common";
import { fundDeletePlan } from "./fundDelete";
import { useTheme } from "../../theme/theme";
import { useScrollLock } from "../../hooks/useScrollLock";
import { useActionFeedback } from "../../hooks/useActionFeedback";
import { fmt } from "../../utils/format";
import { usePeriod, periodTitle } from "../../lib/PeriodCtx";
import { PaymentTypesManager } from "./PaymentTypesManager";
import { CurrenciesManager, ExchangeRatesManager } from "./CurrencyManager";
import { ChartAccountsManager } from "./ChartAccountsManager";
import {
  fetchFunds, fetchIncomeRefs, createFund, updateFund, archiveFund, triggerMjImportRefs,
  fetchFundDebts, fetchFundCommitments, fetchFundJournal, fetchFundLoans,
  fundTransfer, fundLoan, fundLoanReturn, fundIncome, fundReturn,
  fetchFundStatement, fetchFundFolders, createFundFolder, updateFundFolder,
  archiveFundFolder, fetchFolderStatement, reverseFundOp, fetchPeriodBalances,
} from "../../lib/api";

// ---------------------------------------------------------------- FUNDS
// Вкладка «Фонды» (docs/funds-spec.md). Колонки: Остаток (одобренное-неоплаченное)
// · Доступно (свободные деньги) · Долг (сальдо займов: − фонду должны, + фонд
// должен). Балансы — производная Реестра, движения — серверные RPC. Суммы — TJS.

const STAGE_LABEL = { revenue: "Выручка", margin: "Маржинальный", adjusted: "Скорректированный" };
const STAGE_OPTS = [
  { v: "", l: "— не задан —" },
  { v: "revenue", l: "Выручка" },
  { v: "margin", l: "Маржинальный доход" },
  { v: "adjusted", l: "Скорректированный доход" },
];
// Готовые цвета-метки фонда (docs/funds-spec.md §10) — работают в обеих темах.
// Пресеты цвета фонда — из брендовой палитры (совпадает с C.chartPalette);
// фонды хранят выбранный цвет конкретным hex, поэтому пресеты статичны.
const FUND_COLORS = ["#3ddc84", "#5b8def", "#e8911c", "#ff6b5e", "#9c6ade", "#5bd6c9", "#d6c14a", "#d64ad6"];

// Сетка строки фонда внутри карточки раздела (десктоп):
// Название · Доступно · К оплате · Долги · действия. На телефоне — карточки.
const FUND_GRID = {
  display: "grid", gridTemplateColumns: "minmax(150px,1fr) 110px 110px 96px 132px",
  alignItems: "center", gap: 10, padding: "11px 18px",
};

const OP_LABELS = {
  income: "Доход", income_return: "Возврат дохода", distribution: "Распределение",
  request_payment: "Оплата заявки", bill_payment: "Оплата счёта", payroll_payment: "Выплата ЗП",
  fund_transfer: "Перемещение", fund_loan: "Заём", fund_loan_return: "Возврат займа",
  fund_income: "Приход", fund_return: "Возврат", fx_exchange: "Обмен валют",
  cash_transfer: "Перемещение ДС", off_plan: "Вне ФП", adjustment: "Корректировка",
};

export function Funds() {
  const { C, st, isMobile, profile } = useTheme();
  const { period, periodId, loading: periodsLoading } = usePeriod();
  const isFinAdmin = ["owner", "fin_director"].includes(profile?.role);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  useActionFeedback(done, err);
  const [funds, setFunds] = useState([]);
  const [commitments, setCommitments] = useState({});
  const [debts, setDebts] = useState({});
  const [journal, setJournal] = useState([]);
  const [busy, setBusy] = useState(null);
  const [statement, setStatement] = useState(null);
  const [editing, setEditing] = useState(null); // фонд для редактирования | "new"
  const [editingFolder, setEditingFolder] = useState(null); // папка | "new"
  const [deleting, setDeleting] = useState(null); // фонд, который удаляем (модал)
  const [refs, setRefs] = useState(null);
  const [loansOf, setLoansOf] = useState(null); // { fund, rows } для клика по «Долгу»
  const [folders, setFolders] = useState([]);
  const [openFolders, setOpenFolders] = useState({});
  const [periodBal, setPeriodBal] = useState(null);   // { [fund_id]: остаток на конец выбранной недели }

  // форма операции
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amt, setAmt] = useState("");
  const [kind, setKind] = useState("move"); // move | loan | income | return
  const [comment, setComment] = useState("");

  const load = useCallback(async () => {
    setErr("");
    try {
      const [fs, comm, dbt, jr, refData, fl] = await Promise.all([
        fetchFunds(), fetchFundCommitments(), fetchFundDebts(), fetchFundJournal(),
        fetchIncomeRefs(), fetchFundFolders(),
      ]);
      const sorted = fs.sort((a, b) => a.code.localeCompare(b.code, "ru", { numeric: true }));
      setFunds(sorted); setCommitments(comm); setDebts(dbt); setJournal(jr);
      setRefs(refData); setFolders(fl);
      setFrom((f) => f || sorted.find((x) => x.code === "FD6")?.id || sorted[0]?.id || "");
      setTo((t) => t || sorted.find((x) => x.code === "FD3")?.id || sorted[1]?.id || "");
    } catch (e) {
      setErr("Не удалось загрузить фонды: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Остатки фондов на конец выбранной недели (накопленный итог из Реестра).
  // Перезагружается при смене недели в шапке и после операций (journal меняется).
  useEffect(() => {
    let on = true;
    if (!periodId) { setPeriodBal(null); return; }
    setPeriodBal(null);
    fetchPeriodBalances(periodId)
      .then((b) => { if (on) setPeriodBal(b.funds); })
      .catch(() => { if (on) setPeriodBal(null); });
    return () => { on = false; };
  }, [periodId, journal]);

  // Импорт справочников ManaJet (фонды/виды дохода/статьи/статистики) в наши таблицы
  const importRefs = async () => {
    setBusy("import"); setErr(""); setDone("");
    try {
      const r = await triggerMjImportRefs();
      if (r && r.ok === false) throw new Error(r.error || "ошибка импорта");
      const f = r?.entities?.funds;
      setDone("Справочники ManaJet импортированы" + (f && f.ok != null ? ` (фондов: ${f.ok})` : ""));
      await load();
    } catch (e) {
      setErr("Импорт из ManaJet не удался: " + (e?.message || e));
    } finally { setBusy(null); }
  };

  const fundById = useMemo(() => Object.fromEntries(funds.map((f) => [f.id, f])), [funds]);
  const nameOf = (id) => { const f = fundById[id]; return f ? `${f.code} — ${f.name}` : "?"; };

  // Производные метрики фонда: Остаток / Доступно / Долг
  const metrics = useCallback((f) => {
    const remaining = Number(commitments[f.id] || 0);
    const available = Number(f.balance || 0) - remaining;
    const debt = Number(debts[f.id] || 0);
    return { remaining, available, debt };
  }, [commitments, debts]);

  const totals = useMemo(() => funds.reduce((a, f) => {
    const m = metrics(f);
    a.available += m.available; a.remaining += m.remaining; a.debt += m.debt;
    return a;
  }, { available: 0, remaining: 0, debt: 0 }), [funds, metrics]);

  const colorOf = (f) => f.color || FUND_COLORS[[...(f.code || f.name || "?")].reduce((a, c) => a + c.charCodeAt(0), 0) % FUND_COLORS.length];
  const availableOf = (id) => { const f = fundById[id]; return f ? metrics(f).available : 0; };

  const doOperation = async () => {
    if (busy) return;
    const a = parseFloat(String(amt).replace(",", "."));
    setErr(""); setDone("");
    if (!a || a <= 0) return setErr("Укажите сумму больше нуля");
    if (!comment.trim()) return setErr("Комментарий обязателен");
    if (!periodId) return setErr("Нет выбранного периода ФП — добавьте неделю в шапке");
    const twoFunds = kind === "move" || kind === "loan";
    if (twoFunds && (!from || !to || from === to)) return setErr("Выберите два разных фонда");
    if ((kind === "move" || kind === "loan" || kind === "return") && a > availableOf(from) + 0.009)
      return setErr(`Доступно только ${fmt(availableOf(from))} TJS`);
    if (kind === "income" && !to) return setErr("Выберите фонд");
    setBusy("op");
    try {
      const c = comment.trim();
      if (kind === "move") await fundTransfer(from, to, a, periodId, c);
      else if (kind === "loan") await fundLoan(from, to, a, periodId, c);
      else if (kind === "income") await fundIncome(to, a, periodId, c);
      else if (kind === "return") await fundReturn(from, a, periodId, c);
      await load();
      setAmt(""); setComment("");
      const labels = { move: "Перемещено", loan: "Выдан заём", income: "Оприходовано", return: "Изъято" };
      const where = kind === "income" ? nameOf(to) : kind === "return" ? nameOf(from) : `${nameOf(from)} → ${nameOf(to)}`;
      setDone(`${labels[kind]}: ${fmt(a)} TJS · ${where}`);
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  const openStatement = async (fund, allTime = false) => {
    setBusy(`stmt:${fund.id}`); setErr("");
    try {
      const rows = await fetchFundStatement(fund.id, allTime ? null : periodId);
      setStatement({ kind: "fund", entity: fund, title: `${fund.code} ${fund.name} · выписка`, rows, allTime });
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  const openFolderStatement = async (folder, allTime = false) => {
    setBusy(`stmt:${folder.id}`); setErr("");
    try {
      const rows = await fetchFolderStatement(folder.id, allTime ? null : periodId);
      setStatement({ kind: "folder", entity: folder, title: `${folder.name} · сводная выписка`, rows, allTime });
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  const doReverse = async (op) => {
    setBusy(`rev:${op.id}`); setErr(""); setDone("");
    try {
      await reverseFundOp(op.id);
      await load();
      setDone("Операция откачена — деньги возвращены в исходный фонд");
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  const doArchiveFolder = async (folder) => {
    setBusy(`arch:${folder.id}`); setErr(""); setDone("");
    try {
      await archiveFundFolder(folder.id);
      await load();
      setDone(`Раздел «${folder.name}» архивирован (фонды сохранены)`);
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  const openLoans = async (fund) => {
    setBusy(`loans:${fund.id}`); setErr("");
    try {
      const rows = await fetchFundLoans(fund.id);
      setLoansOf({ fund, rows });
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  const doReturnLoan = async (op, amount) => {
    setBusy(`ret:${op.id}`); setErr(""); setDone("");
    if (!periodId) { setBusy(null); return setErr("Нет выбранного периода ФП"); }
    try {
      await fundLoanReturn(op.id, amount, periodId, null);
      await load();
      setLoansOf(null);
      setDone(`Возврат займа: ${fmt(amount)} TJS · ${nameOf(op.toFundId)} → ${nameOf(op.fromFundId)}`);
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  // «Удаление» фонда = слияние + архив (docs/funds-spec.md). Реестр неизменяем:
  // историю не двигаем; денежный остаток переносим в фонд-приёмник новой
  // операцией (fp_fund_transfer), затем фонд архивируется. Фонды с незакрытыми
  // займами/обязательствами на этом этапе не удаляются (см. fundDeletePlan).
  const doDelete = async (fund, targetId) => {
    setBusy(`del:${fund.id}`); setErr(""); setDone("");
    try {
      const m = metrics(fund);
      const transfer = Math.round(m.available * 100) / 100;
      if (transfer > 0.005) {
        if (!targetId) throw new Error("Выберите фонд, куда перенести остаток");
        if (!periodId) throw new Error("Нет открытой недели ФП для переноса остатка — добавьте неделю в шапке");
        await fundTransfer(fund.id, targetId, transfer, periodId, `Перенос остатка при удалении фонда ${fund.code} — ${fund.name}`);
      }
      await archiveFund(fund.id);
      await load();
      setDeleting(null);
      setDone(`Фонд ${fund.code} удалён${transfer > 0.005 ? ` · остаток ${fmt(transfer)} TJS перенесён в ${nameOf(targetId)}` : ""}. История в Реестре сохранена.`);
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  if (loading || periodsLoading) return <div style={st.empty}><Loader2 size={18} className="spin" /> Загрузка…</div>;

  const selStyle = { ...st.reqSelect, minWidth: isMobile ? "100%" : 190 };
  const typeBadge = (k) => ({
    fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 20, whiteSpace: "nowrap",
    color: k === "working" ? C.green : C.info, background: k === "working" ? `${C.green}1a` : `${C.info}1a`,
  });
  const twoFunds = kind === "move" || kind === "loan";

  // Долг: − фонду должны (хорошо, зелёный money), + фонд должен (danger)
  const debtColor = (d) => d < -0.009 ? C.money : d > 0.009 ? C.danger : C.faint;
  const debtLabel = (d) => d === 0 ? "—" : (d > 0 ? "+" : "") + fmt(d);
  // Доступно: отрицательное (одобрено больше, чем есть) — тревога, красным
  const availColor = (v) => v < -0.009 ? C.danger : C.info;

  // Группировка для карточек разделов (как папки во вкладке «Доходы»):
  // разделы с фондами + отдельная группа «Без раздела» для фондов без папки.
  const subOf = (list) => list.reduce((acc, c) => { const mm = metrics(c); acc.remaining += mm.remaining; acc.available += mm.available; acc.debt += mm.debt; return acc; }, { remaining: 0, available: 0, debt: 0 });
  const flatFunds = funds.filter((f) => !f.folder_id);
  const flatSub = subOf(flatFunds);
  const folderGroups = Object.entries(
    funds.filter((f) => f.folder_id).reduce((m, f) => { (m[f.folder_id] ??= []).push(f); return m; }, {}),
  ).map(([fid, children]) => ({
    folder: folders.find((x) => x.id === fid) || { id: fid, name: "Раздел" },
    children, sub: subOf(children),
  }));

  return (<>
    <section style={st.hero}>
      <div style={st.heroGlow} />
      <div style={st.heroContent}>
        <div style={st.heroTop}>
          <div>
            <div style={st.heroLabel}>Фонды · запасы средств по целям</div>
            <div style={st.heroTitle}>{period ? periodTitle(period) : "Период не создан"}</div>
          </div>
        </div>
        <div style={st.heroStats}>
          <Stat label="Всего доступно" value={fmt(totals.available)} unit="TJS" tone="info" />
          <Stat label="К оплате (остаток)" value={fmt(totals.remaining)} unit="TJS" />
          <Stat label="Сальдо долгов" value={debtLabel(totals.debt)} unit="TJS" />
          <Stat label="Фондов" value={String(funds.length)} unit="" />
        </div>
      </div>
    </section>

    {err && <div role="alert" style={{ ...st.reqError, marginBottom: 14 }}><AlertCircle size={15} /> {err}</div>}
    {done && <div style={{ ...st.reqSuccess, marginBottom: 14 }}><CheckCircle2 size={15} /> {done}</div>}

    {/* Операция с фондами: перемещение / заём / приход / возврат */}
    {isFinAdmin && (
      <section style={st.fpCard}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <ArrowRightLeft size={18} color={C.green} />
          <h3 style={st.reqSectionTitle}>Операция с фондами</h3>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={st.reqField}>
            <span style={st.reqFieldLbl}>Тип операции</span>
            <select style={selStyle} className="fin" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="move">Перемещение</option>
              <option value="loan">Заём (с возвратом)</option>
              <option value="income">Приход</option>
              <option value="return">Возврат (изъятие)</option>
            </select>
          </label>
          {(twoFunds || kind === "return") && (
            <label style={st.reqField}>
              <span style={st.reqFieldLbl}>{kind === "loan" ? "Кредитор" : "Из фонда"} · доступно {fmt(availableOf(from))}</span>
              <select style={selStyle} className="fin" value={from} onChange={(e) => setFrom(e.target.value)}>
                {funds.map((f) => <option key={f.id} value={f.id}>{f.code} — {f.name}</option>)}
              </select>
            </label>
          )}
          {(twoFunds || kind === "income") && (
            <label style={st.reqField}>
              <span style={st.reqFieldLbl}>{kind === "loan" ? "Заёмщик" : "В фонд"}</span>
              <select style={selStyle} className="fin" value={to} onChange={(e) => setTo(e.target.value)}>
                {funds.map((f) => <option key={f.id} value={f.id}>{f.code} — {f.name}</option>)}
              </select>
            </label>
          )}
          <label style={st.reqField}>
            <span style={st.reqFieldLbl}>Сумма, TJS</span>
            <input type="number" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)}
              onWheel={(e) => e.target.blur()} placeholder="0" style={{ ...st.numInput, width: "100%" }} className="amtIn" />
          </label>
          <label style={{ ...st.reqField, flex: 1, minWidth: 160 }}>
            <span style={st.reqFieldLbl}>Комментарий (обязательно)</span>
            <input style={st.mdInput} className="fin" placeholder="Назначение…"
              value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
          <button style={{ ...st.btnGreen, opacity: busy === "op" ? 0.7 : 1 }} className="btn" onClick={doOperation} disabled={!!busy}>
            {busy === "op" ? <Loader2 size={15} className="spin" />
              : kind === "income" ? <ArrowDownToLine size={15} />
              : kind === "return" ? <ArrowUpFromLine size={15} />
              : kind === "loan" ? <HandCoins size={15} /> : <ArrowRightLeft size={15} />}
            {kind === "move" ? " Переместить" : kind === "loan" ? " Одолжить" : kind === "income" ? " Оприходовать" : " Изъять"}
          </button>
        </div>
      </section>
    )}

    {/* Список фондов — карточки разделов (как папки во вкладке «Доходы») */}
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", margin: "18px 2px 12px" }}>
      <div style={{ fontSize: 15, fontWeight: 800 }}>Фонды</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {isFinAdmin && (
          <button style={{ ...st.btnGhost, opacity: busy === "import" ? 0.7 : 1 }} className="btn" disabled={!!busy} onClick={importRefs} title="Импортировать фонды, статьи, виды дохода и статистики из ManaJet">
            {busy === "import" ? <Loader2 size={15} className="spin" /> : <ArrowDownToLine size={15} />} {!isMobile && "Импорт из ManaJet"}
          </button>
        )}
        {isFinAdmin && (
          <button style={st.btnGhost} className="btn" onClick={() => setEditing("new")}>
            <Plus size={15} /> {!isMobile && "Новый фонд"}
          </button>
        )}
        <div style={st.cardTotal}>{fmt(totals.available)} <span style={st.unit}>TJS</span></div>
      </div>
    </div>

    <div style={st.incList} className="stagger">
      {folderGroups.map((g, i) => {
        const fundRows = g.children.map((f) => (
          <FundRow key={f.id} C={C} st={st} isMobile={isMobile} grid={FUND_GRID} fund={f} m={metrics(f)}
            color={colorOf(f)} typeBadge={typeBadge} debtColor={debtColor} debtLabel={debtLabel} availColor={availColor}
            isFinAdmin={isFinAdmin} busy={busy}
            periodBalance={periodBal ? (periodBal[f.id] || 0) : undefined} periodEnd={period?.ends_on}
            onStatement={() => openStatement(f)} onEdit={() => setEditing(f)}
            onLoans={() => openLoans(f)} onDelete={() => setDeleting(f)} />
        ));
        return (
          <FundFolderCard key={g.folder.id} C={C} st={st} isMobile={isMobile} folder={g.folder} sub={g.sub} childCount={g.children.length}
            color={C.chartPalette[i % C.chartPalette.length]} debtLabel={debtLabel}
            open={!!openFolders[g.folder.id]} isFinAdmin={isFinAdmin} busy={busy}
            onToggle={() => setOpenFolders((o) => ({ ...o, [g.folder.id]: !o[g.folder.id] }))}
            onStatement={() => openFolderStatement(g.folder)} onEdit={() => setEditingFolder(g.folder)}
            onArchive={() => doArchiveFolder(g.folder)}>
            {fundRows}
          </FundFolderCard>
        );
      })}
      {flatFunds.length > 0 && (
        <FundFolderCard key="__none" C={C} st={st} isMobile={isMobile} pseudo
          folder={{ id: "__none", name: "Без раздела" }} sub={flatSub} childCount={flatFunds.length}
          color={C.sub} debtLabel={debtLabel}
          open={openFolders.__none !== false} isFinAdmin={isFinAdmin} busy={busy}
          onToggle={() => setOpenFolders((o) => ({ ...o, __none: o.__none === false }))}>
          {flatFunds.map((f) => (
            <FundRow key={f.id} C={C} st={st} isMobile={isMobile} grid={FUND_GRID} fund={f} m={metrics(f)}
              color={colorOf(f)} typeBadge={typeBadge} debtColor={debtColor} debtLabel={debtLabel} availColor={availColor}
              isFinAdmin={isFinAdmin} busy={busy}
              periodBalance={periodBal ? (periodBal[f.id] || 0) : undefined} periodEnd={period?.ends_on}
              onStatement={() => openStatement(f)} onEdit={() => setEditing(f)}
              onLoans={() => openLoans(f)} onDelete={() => setDeleting(f)} />
          ))}
        </FundFolderCard>
      )}
    </div>

    {/* Итого по фондам */}
    <div style={{ ...st.dataCard, marginTop: 14, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: C.faint, textTransform: "uppercase", letterSpacing: 0.3, fontWeight: 700, marginBottom: 8 }}>Всего по фондам</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: isMobile ? 6 : 8, fontVariantNumeric: "tabular-nums" }}>
        {[["Доступно", fmt(totals.available), availColor(totals.available)], ["К оплате", fmt(totals.remaining), C.sub], ["Долги", debtLabel(totals.debt), debtColor(totals.debt)]].map(([l, v, col]) => (
          <div key={l} style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, color: C.faint, textTransform: "uppercase" }}>{l}</div>
            <div style={{ fontSize: isMobile ? 12.5 : 15, fontWeight: 800, color: col, lineHeight: 1.2, wordBreak: "break-word" }}>{v}</div>
          </div>
        ))}
      </div>
    </div>

    {/* Журнал всех операций по фондам */}
    <section style={{ ...st.fpCard, marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <Clock size={18} color={C.green} />
        <h3 style={st.reqSectionTitle}>Операции с фондами</h3>
        <span style={st.reqSectionSub}>из Реестра</span>
      </div>
      {journal.length === 0 ? (
        <div style={st.empty}>Операций пока нет</div>
      ) : journal.map((op) => {
        const src = op.fromFund || op.fund;
        const et = op.expenseType;
        const info = [
          op.docNumber ? `Заявка/счёт №${op.docNumber}` : null,
          op.counterparty, op.paymentType, op.comment,
        ].filter(Boolean).join(" · ");
        const amtColor = op.signed ? (op.amount >= 0 ? C.money : C.danger) : C.sub;
        const amtText = op.signed ? `${op.amount >= 0 ? "+" : ""}${fmt(op.amount)}` : fmt(op.amount);
        return (
          <div key={op.id} style={{ display: "flex", gap: 12, padding: "11px 4px", borderBottom: `1px solid ${C.line}`, alignItems: "flex-start" }}>
            <span style={{ fontSize: 11.5, color: C.faint, flexShrink: 0, width: 60, paddingTop: 2 }}>
              {new Date(op.createdAt).toLocaleString("ru", { day: "2-digit", month: "2-digit" })}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 20, whiteSpace: "nowrap", color: C.info, background: `${C.info}1a` }}>
                  {OP_LABELS[op.opType] || op.opType}
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>
                  {src ? src.code : "—"}{op.toFund ? <span style={{ color: C.faint, fontWeight: 400 }}> → {op.toFund.code}</span> : ""}
                </span>
              </div>
              {et && <div style={{ fontSize: 11.5, color: C.sub, marginTop: 2 }}>{[et.code, et.name].filter(Boolean).join(" ")}</div>}
              {info && <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis" }}>{info}</div>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: amtColor, whiteSpace: "nowrap" }}>{amtText}</span>
              {isFinAdmin && op.reversible && (
                <button style={{ ...st.btnGhost, padding: "4px 8px", fontSize: 11.5, color: C.danger, borderColor: `${C.danger}44` }} className="btn"
                  disabled={!!busy} onClick={() => doReverse(op)} title="Откатить — вернуть деньги в исходный фонд">
                  {busy === `rev:${op.id}` ? <Loader2 size={12} className="spin" /> : <RotateCcw size={12} />} Откатить
                </button>
              )}
            </div>
          </div>
        );
      })}
    </section>

    {/* Справочник способов оплаты (Фонды §8) — CRUD для фин-админов */}
    {isFinAdmin && <PaymentTypesManager />}
    {isFinAdmin && <CurrenciesManager />}
    {isFinAdmin && <ExchangeRatesManager />}
    {isFinAdmin && <ChartAccountsManager />}

    {statement && (
      <FundStatementModal C={C} st={st} statement={statement} period={period}
        onAllTime={() => statement.kind === "folder" ? openFolderStatement(statement.entity, true) : openStatement(statement.entity, true)}
        onClose={() => setStatement(null)} />
    )}
    {loansOf && (
      <FundLoansModal C={C} st={st} data={loansOf} nameOf={nameOf} isFinAdmin={isFinAdmin}
        busy={busy} onReturn={doReturnLoan} onClose={() => setLoansOf(null)} />
    )}
    {editing && refs && (
      <FundFormModal C={C} st={st} refs={refs} folders={folders}
        fund={editing === "new" ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={async (msg) => { setEditing(null); await load(); setDone(msg); }} />
    )}
    {editingFolder && (
      <FolderFormModal C={C} st={st} folder={editingFolder === "new" ? null : editingFolder}
        onClose={() => setEditingFolder(null)}
        onSaved={async (msg) => { setEditingFolder(null); await load(); setDone(msg); }} />
    )}
    {deleting && (
      <DeleteFundModal C={C} st={st} isMobile={isMobile} fund={deleting} m={metrics(deleting)}
        funds={funds} busy={busy === `del:${deleting.id}`}
        onClose={() => setDeleting(null)} onDelete={(targetId) => doDelete(deleting, targetId)} />
    )}
  </>);
}

// ---------------------------------------------------------------- Удаление фонда (слияние + архив)
// Реестр неизменяем: историю не двигаем. Денежный остаток переносим в фонд-
// приёмник новой операцией, затем фонд архивируется. Фонды с незакрытыми
// займами/обязательствами удалять нельзя (см. fundDeletePlan).
function DeleteFundModal({ C, st, isMobile, fund, m, funds, busy, onClose, onDelete }) {
  useScrollLock();
  const plan = fundDeletePlan({ balance: Number(fund.balance || 0), debt: m.debt, commitments: m.remaining });
  const targets = funds.filter((f) => f.id !== fund.id);
  const [targetId, setTargetId] = useState("");

  return (
    <div style={st.mdOverlay} data-modal="1" onClick={onClose}>
      <div style={{ ...st.mdCard, width: "min(520px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>Удалить фонд</div>
          <button style={st.iconBtn} onClick={onClose} aria-label="Закрыть"><X size={17} /></button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, fontSize: 14 }}>
          <span style={st.fundCode}>{fund.code}</span>
          <span style={{ fontWeight: 700 }}>{fund.name}</span>
        </div>

        {!plan.deletable ? (
          <>
            <div role="alert" style={{ ...st.reqError, alignItems: "flex-start", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 700 }}>
                <AlertCircle size={15} style={{ flexShrink: 0 }} /> Этот фонд пока нельзя удалить:
              </div>
              {plan.blockers.map((b, i) => <div key={i} style={{ paddingLeft: 22 }}>• {b}</div>)}
            </div>
            <div style={st.mdActions}>
              <button style={st.btnGhost} className="btn" onClick={onClose}>Понятно</button>
            </div>
          </>
        ) : (
          <>
            {plan.needsTransfer ? (
              <>
                <div style={{ fontSize: 12.5, color: C.sub, marginBottom: 10 }}>
                  У фонда есть остаток <b style={{ color: C.info }}>{fmt(m.available)} TJS</b>. Выберите фонд, куда его перенести — операция уйдёт в Реестр, история удаляемого фонда сохранится.
                </div>
                <label style={{ display: "block", marginBottom: 6, fontSize: 12, color: C.faint }}>Фонд-приёмник остатка</label>
                <select style={{ ...st.reqSelect, width: "100%" }} className="fin" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                  <option value="">— выберите фонд —</option>
                  {targets.map((f) => <option key={f.id} value={f.id}>{f.code} — {f.name}</option>)}
                </select>
              </>
            ) : (
              <div style={{ fontSize: 12.5, color: C.sub, marginBottom: 10 }}>
                Фонд пуст (нет остатка, долгов и обязательств) — он будет удалён. История операций в Реестре сохранится.
              </div>
            )}
            <div style={{ ...st.mdActions, ...(isMobile ? { flexDirection: "column" } : {}) }}>
              <button style={st.btnGhost} className="btn" onClick={onClose} disabled={busy}>Отмена</button>
              <button
                style={{ ...st.btnGhost, color: C.danger, borderColor: `${C.danger}55`,
                  opacity: (busy || (plan.needsTransfer && !targetId)) ? 0.6 : 1 }}
                className="btn" disabled={busy || (plan.needsTransfer && !targetId)}
                onClick={() => onDelete(targetId)}>
                {busy ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
                {plan.needsTransfer ? " Перенести остаток и удалить" : " Удалить фонд"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


// ---------------------------------------------------------------- Карточка фонда
function FundRow({ C, st, isMobile, grid, child, fund: f, m, color, typeBadge, debtColor, debtLabel, availColor, isFinAdmin, busy, periodBalance, periodEnd, onStatement, onEdit, onLoans, onDelete }) {
  // -------- Телефон: строка-карточка внутри списка (как в «Директиве») --------
  if (isMobile) {
    const ab = { ...st.iconBtn, width: 30, height: 30, borderRadius: 9, padding: 0, flexShrink: 0 };
    const mini = (label, value, col, oc) => (
      <div style={{ minWidth: 0, ...(oc ? { cursor: "pointer" } : {}) }} onClick={oc}>
        <div style={{ fontSize: 10, color: C.faint, marginBottom: 2 }}>{label}</div>
        <div className="denseNum" style={{ fontSize: 13, fontWeight: 700, color: col || C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
      </div>
    );
    return (
      <div className="frow" style={{ padding: "12px 14px", borderTop: `1px solid ${C.line}`, ...(child ? { paddingLeft: 24 } : {}) }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 26, height: 26, borderRadius: 8, display: "grid", placeItems: "center", flexShrink: 0, background: `${color}22`, color }}><FileText size={15} /></span>
          <span style={st.fundCode}>{f.code}</span>
          <span style={{ fontWeight: 700, fontSize: 13.5, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
          {f.is_private && <Lock size={12} color={C.faint} style={{ flexShrink: 0 }} />}
          <button style={ab} className="btn" disabled={!!busy} title="Подробно" onClick={onStatement}>
            {busy === `stmt:${f.id}` ? <Loader2 size={14} className="spin" /> : <List size={15} />}
          </button>
          {isFinAdmin && <button style={ab} className="btn" title="Изменить" onClick={onEdit}><Pencil size={14} /></button>}
          {isFinAdmin && (
            <button style={{ ...ab, color: C.danger }} className="btn" title="Удалить фонд (с переносом остатка)"
              disabled={busy === `del:${f.id}`} onClick={onDelete}>
              {busy === `del:${f.id}` ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
            </button>
          )}
        </div>
        <div style={{ fontSize: 11, color: C.faint, marginTop: 7, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span>{STAGE_LABEL[f.stage] || "этап не задан"}</span>
          <span style={typeBadge(f.kind)}>{f.kind === "working" ? "рабочий" : "накопительный"}</span>
          {f.no_transfer && <span style={{ fontSize: 10, fontWeight: 700, color: C.warning, background: `${C.warning}1a`, padding: "2px 7px", borderRadius: 20 }}>без перемещения</span>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 9 }}>
          {mini("Доступно", fmt(m.available), availColor(m.available))}
          {mini("К оплате", fmt(m.remaining), C.sub)}
          {mini("Долги", busy === `loans:${f.id}` ? "…" : debtLabel(m.debt), debtColor(m.debt), m.debt !== 0 ? onLoans : undefined)}
        </div>
        {periodBalance !== undefined && (
          <div style={{ fontSize: 11, color: C.faint, display: "flex", justifyContent: "space-between", gap: 8, marginTop: 8 }}>
            <span>На конец недели{periodEnd ? ` ${new Date(periodEnd + "T00:00:00").toLocaleDateString("ru-RU", { day: "2-digit", month: "short" })}` : ""}</span>
            <b style={{ color: C.sub, fontVariantNumeric: "tabular-nums" }}>{fmt(periodBalance)}</b>
          </div>
        )}
      </div>
    );
  }

  // -------- Десктоп: строка таблицы (как в «Директиве») --------
  const iconBtn = { ...st.iconBtn, width: 30, height: 30, borderRadius: 9, padding: 0, flexShrink: 0 };
  return (
    <div style={{ ...grid, borderTop: `1px solid ${C.line}` }} className="frow">
      <div style={{ minWidth: 0, ...(child ? { paddingLeft: 14 } : {}) }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ width: 26, height: 26, borderRadius: 8, display: "grid", placeItems: "center", flexShrink: 0, background: `${color}22`, color }}><FileText size={15} /></span>
          <span style={st.fundCode}>{f.code}</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, fontWeight: 600 }}>{f.name}</span>
          {f.is_private && <Lock size={12} color={C.faint} style={{ flexShrink: 0 }} />}
        </div>
        <div style={{ fontSize: 11, color: C.faint, marginTop: 3, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span>{STAGE_LABEL[f.stage] || "этап не задан"}</span>
          <span style={typeBadge(f.kind)}>{f.kind === "working" ? "рабочий" : "накопительный"}</span>
          {f.no_transfer && <span style={{ fontSize: 10, fontWeight: 700, color: C.warning, background: `${C.warning}1a`, padding: "2px 7px", borderRadius: 20 }}>без перемещения</span>}
        </div>
      </div>
      <div className="denseNum" style={{ ...st.fNum, fontWeight: 800, color: availColor(m.available) }}>{fmt(m.available)}</div>
      <div className="denseNum" style={{ ...st.fNum, color: C.sub }}>{fmt(m.remaining)}</div>
      <div className="denseNum" style={{ ...st.fNum, color: debtColor(m.debt), cursor: m.debt !== 0 ? "pointer" : "default" }}
        title={m.debt !== 0 ? "Показать займы" : undefined} onClick={m.debt !== 0 ? onLoans : undefined}>
        {busy === `loans:${f.id}` ? <Loader2 size={13} className="spin" /> : debtLabel(m.debt)}
      </div>
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
        <button style={iconBtn} className="btn" disabled={!!busy} title="Подробно" onClick={onStatement}>
          {busy === `stmt:${f.id}` ? <Loader2 size={14} className="spin" /> : <List size={15} />}
        </button>
        {isFinAdmin && (
          <button style={iconBtn} className="btn" title="Изменить" onClick={onEdit}><Pencil size={14} /></button>
        )}
        {isFinAdmin && (
          <button style={{ ...iconBtn, color: C.danger }} className="btn" title="Удалить фонд (с переносом остатка)"
            disabled={busy === `del:${f.id}`} onClick={onDelete}>
            {busy === `del:${f.id}` ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
          </button>
        )}
      </div>
    </div>
  );
}


// ---------------------------------------------------------------- Выписка по фонду
function FundStatementModal({ C, st, statement, period, onAllTime, onClose }) {
  useScrollLock();
  const { rows, allTime, title } = statement;
  return (
    <div style={st.mdOverlay} data-modal="1" onClick={onClose}>
      <div style={{ ...st.mdCard, width: "min(560px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>{title}</div>
          <button style={st.iconBtn} onClick={onClose} aria-label="Закрыть"><X size={17} /></button>
        </div>
        <div style={{ fontSize: 12.5, color: C.sub, marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span>{allTime ? "Последние операции (все периоды)" : `Неделя ${period ? periodTitle(period) : "—"}`}</span>
          {!allTime && (
            <button style={{ ...st.btnGhost, padding: "5px 10px", fontSize: 12 }} className="btn" onClick={onAllTime}>Показать все</button>
          )}
        </div>
        {!rows.length && <div style={st.empty}>Операций нет</div>}
        <div style={{ maxHeight: 420, overflowY: "auto", display: "grid", gap: 6 }}>
          {rows.map((r) => {
            const amt = Number(r.fund_amount) || 0;
            return (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 12, background: C.panel2, border: `1px solid ${C.line}` }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, display: "flex", gap: 6, alignItems: "center" }}>
                    {r.fund?.code && <span style={{ fontSize: 11, fontWeight: 700, color: C.money, fontFamily: "var(--mono, monospace)" }}>{r.fund.code}</span>}
                    {OP_LABELS[r.op_type] || r.op_type}
                  </div>
                  <div style={{ fontSize: 11.5, color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {new Date(r.created_at).toLocaleString("ru", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    {r.comment ? ` · ${r.comment}` : ""}
                  </div>
                </div>
                <div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: amt >= 0 ? C.money : C.danger, flexShrink: 0 }}>
                  {amt >= 0 ? "+" : ""}{fmt(amt)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}


// ---------------------------------------------------------------- Займы фонда (клик по «Долгу»)
function FundLoansModal({ C, st, data, nameOf, isFinAdmin, busy, onReturn, onClose }) {
  useScrollLock();
  const { fund, rows } = data;
  const [ret, setRet] = useState(null); // { op, val }
  return (
    <div style={st.mdOverlay} data-modal="1" onClick={onClose}>
      <div style={{ ...st.mdCard, width: "min(520px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>{fund.code} · займы</div>
          <button style={st.iconBtn} onClick={onClose} aria-label="Закрыть"><X size={17} /></button>
        </div>
        <div style={{ fontSize: 12.5, color: C.sub, marginBottom: 12 }}>
          «−» фонду должны (кредитор) · «+» фонд должен (заёмщик)
        </div>
        {!rows.length && <div style={st.empty}>Займов нет</div>}
        <div style={{ display: "grid", gap: 8 }}>
          {rows.map((op) => {
            const isLender = op.role === "lender";
            return (
              <div key={op.id} style={{ padding: "10px 12px", borderRadius: 12, background: C.panel2, border: `1px solid ${C.line}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ fontSize: 13 }}>
                    {nameOf(op.fromFundId)} → {nameOf(op.toFundId)}
                    {op.comment ? <span style={{ color: C.faint }}> · {op.comment}</span> : ""}
                  </div>
                  <div style={{ fontWeight: 700, color: isLender ? C.money : C.danger }}>
                    {isLender ? "−" : "+"}{fmt(op.outstanding)}
                  </div>
                </div>
                {op.outstanding > 0.009 && isLender && isFinAdmin && (
                  ret?.op?.id === op.id ? (
                    <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <input type="number" inputMode="decimal" value={ret.val} autoFocus
                        onChange={(e) => setRet({ op, val: e.target.value })}
                        onWheel={(e) => e.target.blur()} style={{ ...st.numInput, width: 140 }} />
                      <button style={{ ...st.btnGreen, padding: "7px 12px" }} className="btn"
                        disabled={busy === `ret:${op.id}`}
                        onClick={() => { const a = parseFloat(String(ret.val).replace(",", ".")) || 0; if (a > 0 && a <= op.outstanding + 0.009) onReturn(op, a); }}>
                        {busy === `ret:${op.id}` ? <Loader2 size={14} className="spin" /> : <RotateCcw size={14} />} Вернуть
                      </button>
                      <button style={{ ...st.btnGhost, padding: "7px 10px" }} className="btn" onClick={() => setRet(null)}>Отмена</button>
                    </div>
                  ) : (
                    <button style={{ ...st.btnGhost, padding: "6px 10px", fontSize: 12, marginTop: 8 }} className="btn"
                      onClick={() => setRet({ op, val: String(op.outstanding) })}>
                      <RotateCcw size={13} /> Вернуть заём
                    </button>
                  )
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}


// ---------------------------------------------------------------- Карточка раздела (как папка в «Доходах»)
function FundFolderCard({ C, st, isMobile, folder, pseudo, sub, childCount, color, debtLabel, open, isFinAdmin, busy, onToggle, onStatement, onEdit, onArchive, children }) {
  const [confirmArch, setConfirmArch] = useState(false);
  const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
  const hb = { ...st.iconBtn, padding: 4, flexShrink: 0 };
  // Действия раздела: выписка / изменить / архив (реальный раздел; «Без раздела» — без действий)
  const actions = !pseudo && (
    <>
      <button style={{ ...hb, color: C.faint }} className="btn" title="Подробно" disabled={!!busy} onClick={stop(onStatement)}>
        {busy === `stmt:${folder.id}` ? <Loader2 size={15} className="spin" /> : <List size={16} />}
      </button>
      {isFinAdmin && <button style={{ ...hb, color: C.faint }} className="btn" title="Изменить" onClick={stop(onEdit)}><Pencil size={15} /></button>}
      {isFinAdmin && (confirmArch
        ? <button style={{ ...hb, width: "auto", padding: "2px 8px", color: C.danger, fontSize: 12 }} className="btn" disabled={busy === `arch:${folder.id}`} onClick={stop(onArchive)}>{busy === `arch:${folder.id}` ? <Loader2 size={13} className="spin" /> : "Точно?"}</button>
        : <button style={{ ...hb, color: C.danger }} className="btn" title="Архивировать раздел" onClick={stop(() => setConfirmArch(true))}><Archive size={15} /></button>)}
    </>
  );
  return (
    <div style={st.dataCard}>
      <div style={st.locHead} className="locHead" onClick={onToggle}>
        <div style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", flexShrink: 0, background: `${color}22`, color }}>
          <Layers size={18} />
        </div>
        <div style={st.locTitle}>
          <div style={st.locName}>{folder.name}</div>
          <div style={st.locCode}>{childCount} фонд(ов){sub.debt ? ` · долги ${debtLabel(sub.debt)}` : ""}</div>
        </div>
        <div style={st.locRight}>
          <div style={st.locSum}>{fmt(sub.available)} <span style={st.locUnit}>TJS</span></div>
          <div style={{ fontSize: 11.5, color: C.sub, whiteSpace: "nowrap" }}>к оплате {fmt(sub.remaining)}</div>
        </div>
        {!isMobile && actions}
        <span style={{ ...st.locChevron, transform: open ? "rotate(90deg)" : "none" }}><ChevronRight size={18} /></span>
      </div>

      {open && (
        <div style={st.locBody}>
          {isMobile && !pseudo && (
            <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderTop: `1px solid ${C.line}` }}>{actions}</div>
          )}
          {!isMobile && (
            <div style={{ ...FUND_GRID, ...st.frowHead, padding: "8px 18px" }}>
              <div>Фонд</div>
              <div style={{ textAlign: "right" }}>Доступно</div>
              <div style={{ textAlign: "right" }}>К оплате</div>
              <div style={{ textAlign: "right" }}>Долги</div>
              <div />
            </div>
          )}
          {children}
        </div>
      )}
    </div>
  );
}


// ---------------------------------------------------------------- Новый / Редактировать раздел
function FolderFormModal({ C, st, folder, onClose, onSaved }) {
  useScrollLock();
  const isEdit = !!folder;
  const [f, setF] = useState({ name: folder?.name || "", color: folder?.color || FUND_COLORS[0], description: folder?.description || "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (busy) return;
    setErr("");
    if (!f.name.trim()) return setErr("Укажите название раздела");
    setBusy(true);
    try {
      const payload = { name: f.name.trim(), color: f.color, description: f.description.trim() };
      if (isEdit) { await updateFundFolder(folder.id, payload); onSaved("Раздел обновлён"); }
      else { await createFundFolder(payload.name, payload); onSaved("Раздел создан"); }
    } catch (e) { setErr(e?.message || String(e)); setBusy(false); }
  };

  return (
    <div style={st.mdOverlay} data-modal="1" onClick={onClose}>
      <div style={{ ...st.mdCard, width: "min(420px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>{isEdit ? "Редактировать раздел" : "Новый раздел"}</div>
          <button style={st.iconBtn} onClick={onClose} aria-label="Закрыть"><X size={17} /></button>
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Название</span>
            <input style={st.mdInput} className="fin" placeholder="Фонд учредителей…" autoFocus
              value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} />
          </div>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Описание</span>
            <input style={st.mdInput} className="fin" placeholder="Назначение раздела…"
              value={f.description} onChange={(e) => setF((p) => ({ ...p, description: e.target.value }))} />
          </div>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Цвет-метка</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {FUND_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setF((p) => ({ ...p, color: c }))}
                  style={{ width: 26, height: 26, borderRadius: "50%", background: c, cursor: "pointer",
                    border: f.color === c ? `3px solid ${C.text}` : `2px solid ${C.line}` }} />
              ))}
            </div>
          </div>
        </div>
        {err && <div role="alert" style={st.reqError}><AlertCircle size={15} /> {err}</div>}
        <div style={st.mdActions}>
          <button style={st.btnGhost} className="btn" onClick={onClose}>Отмена</button>
          <button style={{ ...st.btnGreen, opacity: busy ? 0.7 : 1 }} className="btn" onClick={submit} disabled={busy}>
            {busy ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} {isEdit ? "Сохранить" : "Создать"}
          </button>
        </div>
      </div>
    </div>
  );
}


// ---------------------------------------------------------------- Новый / Редактировать фонд
function FundFormModal({ C, st, refs, folders, fund, onClose, onSaved }) {
  useScrollLock();
  const isEdit = !!fund;
  const baseCur = refs.currencies.find((c) => c.is_base) || refs.currencies[0];
  const [f, setF] = useState({
    code: fund?.code || "", name: fund?.name || "", description: fund?.description || "",
    kind: fund?.kind || "working", stage: fund?.stage || "", color: fund?.color || FUND_COLORS[0],
    isPrivate: fund?.is_private || false, noTransfer: fund?.no_transfer || false,
    locationId: fund?.location_id || "", folderId: fund?.folder_id || "",
  });
  const [newFolder, setNewFolder] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (busy) return;
    setErr("");
    if (!f.code.trim() || !f.name.trim()) return setErr("Укажите код (например FD10) и название фонда");
    setBusy(true);
    try {
      let folderId = f.folderId;
      if (newFolder.trim()) folderId = (await createFundFolder(newFolder.trim())).id;
      const payload = {
        code: f.code.trim(), name: f.name.trim(), description: f.description.trim(),
        kind: f.kind, stage: f.stage || null, color: f.color,
        isPrivate: f.isPrivate, noTransfer: f.noTransfer,
        locationId: f.locationId, folderId,
      };
      if (isEdit) { await updateFund(fund.id, payload); onSaved("Фонд обновлён"); }
      else { await createFund({ ...payload, currencyId: baseCur.id }); onSaved("Фонд создан"); }
    } catch (e) {
      const msg = e?.message || String(e);
      setErr(msg.includes("duplicate") ? "Фонд с таким кодом уже существует" : msg);
      setBusy(false);
    }
  };

  return (
    <div style={st.mdOverlay} data-modal="1" onClick={onClose}>
      <div style={{ ...st.mdCard, width: "min(460px, 100%)", maxHeight: "92vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>{isEdit ? `Редактировать ${fund.code}` : "Новый фонд"}</div>
          <button style={st.iconBtn} onClick={onClose} aria-label="Закрыть"><X size={17} /></button>
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ ...st.reqField, flex: "0 0 120px" }}>
              <span style={st.reqFieldLbl}>Код</span>
              <input style={st.mdInput} className="fin" placeholder="FD10" autoFocus
                value={f.code} onChange={(e) => setF((p) => ({ ...p, code: e.target.value }))} />
            </div>
            <div style={{ ...st.reqField, flex: 1, minWidth: 160 }}>
              <span style={st.reqFieldLbl}>Название</span>
              <input style={st.mdInput} className="fin" placeholder="Фонд развития…"
                value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} />
            </div>
          </div>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Описание</span>
            <input style={st.mdInput} className="fin" placeholder="Назначение фонда…"
              value={f.description} onChange={(e) => setF((p) => ({ ...p, description: e.target.value }))} />
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ ...st.reqField, flex: 1, minWidth: 150 }}>
              <span style={st.reqFieldLbl}>Этап распределения</span>
              <select style={st.mdSelect} className="fin" value={f.stage} onChange={(e) => setF((p) => ({ ...p, stage: e.target.value }))}>
                {STAGE_OPTS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
            <div style={{ ...st.reqField, flex: 1, minWidth: 150 }}>
              <span style={st.reqFieldLbl}>Тип</span>
              <select style={st.mdSelect} className="fin" value={f.kind} onChange={(e) => setF((p) => ({ ...p, kind: e.target.value }))}>
                <option value="working">рабочий</option>
                <option value="accumulative">накопительный (нельзя оплачивать)</option>
              </select>
            </div>
          </div>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Цвет-метка</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {FUND_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setF((p) => ({ ...p, color: c }))}
                  style={{ width: 26, height: 26, borderRadius: "50%", background: c, cursor: "pointer",
                    border: f.color === c ? `3px solid ${C.text}` : `2px solid ${C.line}` }} />
              ))}
            </div>
          </div>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Точка</span>
            <select style={st.mdSelect} className="fin" value={f.locationId} onChange={(e) => setF((p) => ({ ...p, locationId: e.target.value }))}>
              <option value="">— вся сеть —</option>
              {refs.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Раздел (группа фондов)</span>
            <select style={st.mdSelect} className="fin" value={f.folderId} onChange={(e) => setF((p) => ({ ...p, folderId: e.target.value }))}>
              <option value="">— без раздела —</option>
              {folders.map((fl) => <option key={fl.id} value={fl.id}>{fl.name}</option>)}
            </select>
            <input style={{ ...st.mdInput, marginTop: 6 }} className="fin" placeholder="…или новый раздел"
              value={newFolder} onChange={(e) => setNewFolder(e.target.value)} />
          </div>
          <label style={st.mdCheck}>
            <input type="checkbox" checked={f.isPrivate} onChange={(e) => setF((p) => ({ ...p, isPrivate: e.target.checked }))} />
            Приватный фонд (виден только владельцу и финдиректору)
          </label>
          <label style={st.mdCheck}>
            <input type="checkbox" checked={f.noTransfer} onChange={(e) => setF((p) => ({ ...p, noTransfer: e.target.checked }))} />
            Запрет перемещения (нельзя вручную перемещать/изымать средства)
          </label>
        </div>
        {err && <div role="alert" style={st.reqError}><AlertCircle size={15} /> {err}</div>}
        <div style={st.mdActions}>
          <button style={st.btnGhost} className="btn" onClick={onClose}>Отмена</button>
          <button style={{ ...st.btnGreen, opacity: busy ? 0.7 : 1 }} className="btn" onClick={submit} disabled={busy}>
            {busy ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} {isEdit ? "Сохранить" : "Создать"}
          </button>
        </div>
      </div>
    </div>
  );
}
