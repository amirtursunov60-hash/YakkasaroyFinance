import { useState, useEffect, useCallback, useMemo } from "react";
import {
  RotateCcw, ArrowRightLeft, Clock, Lock, Loader2, AlertCircle, CheckCircle2,
  Plus, X, List, ChevronRight, Pencil, Archive, ArrowDownToLine,
  ArrowUpFromLine, HandCoins, Boxes,
} from "lucide-react";
import { Stat } from "../../components/common";
import { useTheme } from "../../theme/theme";
import { useScrollLock } from "../../hooks/useScrollLock";
import { fmt } from "../../utils/format";
import { usePeriod, periodTitle } from "../../lib/PeriodCtx";
import {
  fetchFunds, fetchIncomeRefs, createFund, updateFund, archiveFund,
  fetchFundDebts, fetchFundCommitments, fetchFundJournal, fetchFundLoans,
  fundTransfer, fundLoan, fundLoanReturn, fundIncome, fundReturn,
  fetchFundStatement, fetchFundFolders, createFundFolder, updateFundFolder,
  archiveFundFolder, fetchFolderStatement, reverseFundOp,
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
  const [funds, setFunds] = useState([]);
  const [commitments, setCommitments] = useState({});
  const [debts, setDebts] = useState({});
  const [journal, setJournal] = useState([]);
  const [busy, setBusy] = useState(null);
  const [statement, setStatement] = useState(null);
  const [editing, setEditing] = useState(null); // фонд для редактирования | "new"
  const [editingFolder, setEditingFolder] = useState(null); // папка | "new"
  const [refs, setRefs] = useState(null);
  const [loansOf, setLoansOf] = useState(null); // { fund, rows } для клика по «Долгу»
  const [folders, setFolders] = useState([]);
  const [openFolders, setOpenFolders] = useState({});

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

  const doArchive = async (fund) => {
    setBusy(`arch:${fund.id}`); setErr(""); setDone("");
    try {
      await archiveFund(fund.id);
      await load();
      setEditing(null);
      setDone(`Фонд ${fund.code} архивирован`);
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
  const availColor = (v) => v < -0.009 ? C.danger : C.money;

  // строки списка: сначала фонды без секции, потом секции с детьми
  const rows = [
    ...funds.filter((f) => !f.folder_id).map((f) => ({ fund: f })),
    ...Object.entries(funds.filter((f) => f.folder_id).reduce((m, f) => { (m[f.folder_id] ??= []).push(f); return m; }, {}))
      .flatMap(([fid, children]) => [
        { section: fid, children },
        ...(openFolders[fid] ? children.map((c) => ({ fund: c, child: true })) : []),
      ]),
  ];

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
          <Stat label="Всего доступно" value={fmt(totals.available)} unit="TJS" accent />
          <Stat label="К оплате (остаток)" value={fmt(totals.remaining)} unit="TJS" />
          <Stat label="Сальдо долгов" value={debtLabel(totals.debt)} unit="TJS" />
          <Stat label="Фондов" value={String(funds.length)} unit="" />
        </div>
      </div>
    </section>

    {err && <div style={{ ...st.reqError, marginBottom: 14 }}><AlertCircle size={15} /> {err}</div>}
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

    {/* Список фондов — карточки */}
    <div style={{ ...st.cardWrap, marginTop: 18 }}>
      <section style={st.card}>
        <div style={st.cardHead}>
          <div style={st.cardTitle}>Фонды</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {isFinAdmin && (
              <button style={st.btnGhost} className="btn" onClick={() => setEditing("new")}>
                <Plus size={15} /> {!isMobile && "Новый фонд"}
              </button>
            )}
            <div style={st.cardTotal}>{fmt(totals.available)} <span style={st.unit}>TJS</span></div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(300px, 1fr))" }}>
          {rows.map((r) => r.section ? (() => {
            const folder = folders.find((x) => x.id === r.section) || { id: r.section, name: "Раздел" };
            const sub = r.children.reduce((acc, c) => { const mm = metrics(c); acc.remaining += mm.remaining; acc.available += mm.available; acc.debt += mm.debt; return acc; }, { remaining: 0, available: 0, debt: 0 });
            return (
              <FolderCard key={"sec" + r.section} C={C} st={st} folder={folder} sub={sub} childCount={r.children.length}
                color={colorOf(folder)} debtColor={debtColor} debtLabel={debtLabel} availColor={availColor}
                open={openFolders[r.section]} isFinAdmin={isFinAdmin} busy={busy}
                onToggle={() => setOpenFolders((o) => ({ ...o, [r.section]: !o[r.section] }))}
                onStatement={() => openFolderStatement(folder)} onEdit={() => setEditingFolder(folder)}
                onArchive={() => doArchiveFolder(folder)} />
            );
          })() : (
            <FundCard key={r.fund.id} C={C} st={st} fund={r.fund} m={metrics(r.fund)}
              color={colorOf(r.fund)} typeBadge={typeBadge} debtColor={debtColor} debtLabel={debtLabel} availColor={availColor}
              isFinAdmin={isFinAdmin} busy={busy}
              onStatement={() => openStatement(r.fund)} onEdit={() => setEditing(r.fund)}
              onLoans={() => openLoans(r.fund)} onArchive={() => doArchive(r.fund)} />
          ))}
        </div>

        {/* Итого — три столбца, выровнены под столбцы карточек (отступ слева как у цвет-метки) */}
        <div style={{ marginTop: 16, paddingTop: 14, paddingBottom: 10, paddingLeft: 16, paddingRight: 14, borderTop: `2px solid ${C.line}` }}>
          <div style={{ fontSize: 11, color: C.faint, textTransform: "uppercase", letterSpacing: 0.3, fontWeight: 700, marginBottom: 8 }}>Всего по фондам</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: isMobile ? 6 : 8, fontVariantNumeric: "tabular-nums" }}>
            {[["Остаток", fmt(totals.remaining), C.sub], ["Доступно", fmt(totals.available), availColor(totals.available)], ["Долг", debtLabel(totals.debt), debtColor(totals.debt)]].map(([l, v, col]) => (
              <div key={l} style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10, color: C.faint, textTransform: "uppercase" }}>{l}</div>
                <div style={{ fontSize: isMobile ? 12.5 : 15, fontWeight: 800, color: col, lineHeight: 1.2, wordBreak: "break-word" }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
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
  </>);
}


// ---------------------------------------------------------------- Карточка фонда
function FundCard({ C, st, fund: f, m, color, typeBadge, debtColor, debtLabel, availColor, isFinAdmin, busy, onStatement, onEdit, onLoans, onArchive }) {
  const [confirmArch, setConfirmArch] = useState(false);
  const mini = (label, value, opts = {}) => (
    <div style={{ minWidth: 0, ...(opts.onClick && f && m.debt !== 0 ? { cursor: "pointer" } : {}) }} onClick={opts.onClick}>
      <div style={{ fontSize: 10, color: C.faint, textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ fontSize: opts.big ? 15 : 13.5, fontWeight: opts.big ? 800 : 700, color: opts.color || C.text, fontVariantNumeric: "tabular-nums", lineHeight: 1.2, wordBreak: "break-word" }}>
        {opts.loading ? <Loader2 size={13} className="spin" /> : value}
      </div>
    </div>
  );
  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 10,
      padding: "13px 14px 13px 16px", borderRadius: 14, background: C.panel2, border: `1px solid ${C.line}`, overflow: "hidden" }}>
      <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: color }} />
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={st.fundCode}>{f.code}</span>
          <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
          {f.is_private && <Lock size={12} color={C.faint} style={{ flexShrink: 0, marginLeft: "auto" }} />}
        </div>
        <div style={{ fontSize: 11, color: C.faint, marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span>{STAGE_LABEL[f.stage] || "этап не задан"}</span>
          <span style={typeBadge(f.kind)}>{f.kind === "working" ? "рабочий" : "накопительный"}</span>
          {f.no_transfer && <span style={{ fontSize: 10, fontWeight: 700, color: C.warning, background: `${C.warning}1a`, padding: "2px 7px", borderRadius: 20 }}>без перемещения</span>}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, padding: "10px 0", borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }}>
        {mini("Остаток", fmt(m.remaining), { color: C.sub })}
        {mini("Доступно", fmt(m.available), { color: availColor(m.available), big: true })}
        {mini("Долг", debtLabel(m.debt), { color: debtColor(m.debt), onClick: m.debt !== 0 ? onLoans : undefined, loading: busy === `loans:${f.id}` })}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button style={{ ...st.btnGhost, flex: 1, justifyContent: "center", padding: "7px 8px", fontSize: 12 }} className="btn" disabled={!!busy} onClick={onStatement}>
          {busy === `stmt:${f.id}` ? <Loader2 size={13} className="spin" /> : <List size={13} />} Подробно
        </button>
        {isFinAdmin && (
          <button style={{ ...st.btnGhost, flex: 1, justifyContent: "center", padding: "7px 8px", fontSize: 12 }} className="btn" onClick={onEdit}>
            <Pencil size={13} /> Изменить
          </button>
        )}
        {isFinAdmin && (
          confirmArch ? (
            <button style={{ ...st.btnGhost, flex: 1.4, justifyContent: "center", padding: "7px 8px", fontSize: 12, color: C.danger, borderColor: `${C.danger}55` }} className="btn"
              disabled={busy === `arch:${f.id}`} onClick={onArchive}>
              {busy === `arch:${f.id}` ? <Loader2 size={13} className="spin" /> : <Archive size={13} />} Точно?
            </button>
          ) : (
            <button style={{ ...st.btnGhost, justifyContent: "center", padding: "7px 9px", fontSize: 12, color: C.danger }} className="btn"
              onClick={() => setConfirmArch(true)} title="Архивировать">
              <Archive size={13} />
            </button>
          )
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
    <div style={st.mdOverlay} onClick={onClose}>
      <div style={{ ...st.mdCard, width: "min(560px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>{title}</div>
          <button style={st.iconBtn} onClick={onClose}><X size={17} /></button>
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
    <div style={st.mdOverlay} onClick={onClose}>
      <div style={{ ...st.mdCard, width: "min(520px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>{fund.code} · займы</div>
          <button style={st.iconBtn} onClick={onClose}><X size={17} /></button>
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


// ---------------------------------------------------------------- Карточка папки (раздела)
function FolderCard({ C, st, folder, sub, childCount, color, debtColor, debtLabel, availColor, open, isFinAdmin, busy, onToggle, onStatement, onEdit, onArchive }) {
  const [confirmArch, setConfirmArch] = useState(false);
  const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
  const mini = (label, value, col) => (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10, color: C.faint, textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: col || C.text, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
    </div>
  );
  return (
    <div onClick={onToggle} style={{ gridColumn: "1 / -1", position: "relative", display: "flex", flexDirection: "column", gap: 10,
      padding: "14px 16px 14px 20px", borderRadius: 16,
      background: `linear-gradient(135deg, ${color}26, ${C.panel} 70%)`,
      border: `1px solid ${color}55`, boxShadow: `0 2px 12px ${C.shadow}`, cursor: "pointer", overflow: "hidden" }}>
      <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 6, background: color }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <ChevronRight size={17} style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .2s", color, flexShrink: 0 }} />
        <span style={{ display: "inline-flex", padding: 5, borderRadius: 9, background: `${color}2e`, color, flexShrink: 0 }}><Boxes size={15} /></span>
        <b style={{ textTransform: "uppercase", fontSize: 13, letterSpacing: 0.4 }}>{folder.name}</b>
        <span style={{ fontSize: 11, color: C.faint }}>· {childCount} фонд(ов)</span>
        {folder.description && <span style={{ fontSize: 11, color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>· {folder.description}</span>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, padding: "10px 0", borderTop: `1px solid ${color}33`, borderBottom: `1px solid ${color}33` }}>
        {mini("Остаток", fmt(sub.remaining), C.sub)}
        {mini("Доступно", fmt(sub.available), availColor(sub.available))}
        {mini("Долг", debtLabel(sub.debt), debtColor(sub.debt))}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button style={{ ...st.btnGhost, flex: 1, justifyContent: "center", padding: "7px 8px", fontSize: 12 }} className="btn" disabled={!!busy} onClick={stop(onStatement)}>
          {busy === `stmt:${folder.id}` ? <Loader2 size={13} className="spin" /> : <List size={13} />} Подробно
        </button>
        {isFinAdmin && (
          <button style={{ ...st.btnGhost, flex: 1, justifyContent: "center", padding: "7px 8px", fontSize: 12 }} className="btn" onClick={stop(onEdit)}>
            <Pencil size={13} /> Изменить
          </button>
        )}
        {isFinAdmin && (
          confirmArch ? (
            <button style={{ ...st.btnGhost, flex: 1.4, justifyContent: "center", padding: "7px 8px", fontSize: 12, color: C.danger, borderColor: `${C.danger}55` }} className="btn"
              disabled={busy === `arch:${folder.id}`} onClick={stop(onArchive)}>
              {busy === `arch:${folder.id}` ? <Loader2 size={13} className="spin" /> : <Archive size={13} />} Точно?
            </button>
          ) : (
            <button style={{ ...st.btnGhost, justifyContent: "center", padding: "7px 9px", fontSize: 12, color: C.danger }} className="btn"
              onClick={stop(() => setConfirmArch(true))} title="Архивировать раздел">
              <Archive size={13} />
            </button>
          )
        )}
      </div>
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
    <div style={st.mdOverlay} onClick={onClose}>
      <div style={{ ...st.mdCard, width: "min(420px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>{isEdit ? "Редактировать раздел" : "Новый раздел"}</div>
          <button style={st.iconBtn} onClick={onClose}><X size={17} /></button>
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
        {err && <div style={st.reqError}><AlertCircle size={15} /> {err}</div>}
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
    <div style={st.mdOverlay} onClick={onClose}>
      <div style={{ ...st.mdCard, width: "min(460px, 100%)", maxHeight: "92vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>{isEdit ? `Редактировать ${fund.code}` : "Новый фонд"}</div>
          <button style={st.iconBtn} onClick={onClose}><X size={17} /></button>
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
        {err && <div style={st.reqError}><AlertCircle size={15} /> {err}</div>}
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
