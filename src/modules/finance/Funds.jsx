import { useState, useEffect, useCallback, useMemo } from "react";
import { RotateCcw, Ban, ArrowRightLeft, Clock, Lock, Loader2, AlertCircle, CheckCircle2, Plus, X, List, Folder, FolderOpen, ChevronRight } from "lucide-react";
import { Stat } from "../../components/common";
import { useTheme } from "../../theme/theme";
import { fmt } from "../../utils/format";
import { usePeriod, periodTitle } from "../../lib/PeriodCtx";
import {
  fetchFunds, fetchDefaultRules, fetchIncomeRefs, createFund,
  fetchFundOps, fundTransfer, fundLoan, fundLoanReturn, fetchFundStatement,
  fetchFundFolders, createFundFolder,
} from "../../lib/api";


// ---------------------------------------------------------------- FUNDS
// Живые данные (ТЗ v2 §4.1.4): балансы фондов — производная Реестра,
// операции перемещение / заём с возвратом — серверные функции с парными
// записями Реестра (pair_id). Закрытые фонды (is_restricted) видны по списку
// доступа fund_access (RLS). Суммы — в базовой валюте (TJS).

const STAGE_LABEL = { revenue: "Выручка", margin: "Маржинальный", adjusted: "Скорректированный" };
const OP_LABELS = {
  income: "Доход", income_return: "Возврат дохода", distribution: "Распределение",
  request_payment: "Оплата заявки", bill_payment: "Оплата счёта", payroll_payment: "Выплата ЗП", fund_transfer: "Перемещение",
  fund_loan: "Заём", fund_loan_return: "Возврат займа", fx_exchange: "Обмен валют",
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
  const [rules, setRules] = useState([]);
  const [ops, setOps] = useState([]);
  const [busy, setBusy] = useState(null);
  const [statement, setStatement] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [refs, setRefs] = useState(null);
  const [returning, setReturning] = useState(null); // { op } для частичного возврата
  const [folders, setFolders] = useState([]);
  const [openFolders, setOpenFolders] = useState({});

  // форма операции
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amt, setAmt] = useState("");
  const [kind, setKind] = useState("move"); // move | loan
  const [comment, setComment] = useState("");

  const load = useCallback(async () => {
    setErr("");
    try {
      const [fs, rs, opData, refData, fl] = await Promise.all([
        fetchFunds(), fetchDefaultRules(), fetchFundOps(), fetchIncomeRefs(),
        fetchFundFolders(),
      ]);
      const sorted = fs.sort((a, b) => a.code.localeCompare(b.code, "ru", { numeric: true }));
      setFunds(sorted); setRules(rs); setOps(opData); setRefs(refData);
      setFolders(fl);
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
  // Этапы пополнения фонда по правилам схемы (этап — свойство правила, не фонда)
  const stagesOf = useMemo(() => {
    const m = {};
    rules.forEach((r) => { (m[r.fund_id] ??= new Set()).add(STAGE_LABEL[r.stage] || r.stage); });
    return m;
  }, [rules]);

  const total = useMemo(() => funds.reduce((a, f) => a + Number(f.balance || 0), 0), [funds]);
  const working = funds.filter((f) => f.kind === "working");
  const saving = funds.filter((f) => f.kind === "accumulative");
  const openLoans = ops.filter((o) => o.opType === "fund_loan" && o.returned < o.amount);

  const doTransfer = async () => {
    if (busy) return;
    const a = parseFloat(String(amt).replace(",", "."));
    setErr(""); setDone("");
    if (!a || a <= 0) return setErr("Укажите сумму больше нуля");
    if (!from || !to || from === to) return setErr("Выберите два разных фонда");
    if (!periodId) return setErr("Нет выбранного периода ФП — добавьте неделю в шапке");
    setBusy("op");
    try {
      if (kind === "move") await fundTransfer(from, to, a, periodId, comment.trim() || null);
      else await fundLoan(from, to, a, periodId, comment.trim() || null);
      await load();
      setAmt(""); setComment("");
      setDone(`${kind === "move" ? "Перемещено" : "Выдан заём"}: ${fmt(a)} TJS · ${nameOf(from)} → ${nameOf(to)}`);
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  const doReturn = async (op, amount) => {
    if (busy) return;
    setErr(""); setDone("");
    if (!periodId) return setErr("Нет выбранного периода ФП");
    setBusy(`ret:${op.id}`);
    try {
      await fundLoanReturn(op.id, amount, periodId, null);
      await load();
      setReturning(null);
      setDone(`Возврат займа: ${fmt(amount)} TJS · ${nameOf(op.toFundId)} → ${nameOf(op.fromFundId)}`);
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  const openStatement = async (fund, allTime = false) => {
    setBusy(`stmt:${fund.id}`); setErr("");
    try {
      const rows = await fetchFundStatement(fund.id, allTime ? null : periodId);
      setStatement({ fund, rows, allTime });
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  if (loading || periodsLoading) return <div style={st.empty}><Loader2 size={18} className="spin" /> Загрузка…</div>;

  const selStyle = { ...st.reqSelect, minWidth: isMobile ? "100%" : 200 };
  const typeBadge = (kind) => ({
    fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 20, whiteSpace: "nowrap",
    color: kind === "working" ? C.green : C.info,
    background: kind === "working" ? `${C.green}1a` : `${C.info}1a`,
  });
  const GRID = isMobile ? "1fr 120px" : "1fr 190px 130px 150px 90px";

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
          <Stat label="Всего в фондах" value={fmt(total)} unit="TJS" accent />
          <Stat label="Рабочих фондов" value={String(working.length)} unit="" />
          <Stat label="Накопительных" value={String(saving.length)} unit="" />
          <Stat label="Открытых займов" value={String(openLoans.length)} unit="" />
        </div>
      </div>
    </section>

    {err && <div style={{ ...st.reqError, marginBottom: 14 }}><AlertCircle size={15} /> {err}</div>}
    {done && <div style={{ ...st.reqError, marginBottom: 14, color: C.green, background: `${C.green}1a`, borderColor: `${C.green}44` }}><CheckCircle2 size={15} /> {done}</div>}

    {/* Операция: перемещение / заём */}
    {isFinAdmin && (
      <section style={st.fpCard}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <ArrowRightLeft size={18} color={C.green} />
          <h3 style={st.reqSectionTitle}>Операция между фондами</h3>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={st.reqField}>
            <span style={st.reqFieldLbl}>Тип операции</span>
            <select style={selStyle} className="fin" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="move">Перемещение</option>
              <option value="loan">Заём (с возвратом)</option>
            </select>
          </label>
          <label style={st.reqField}>
            <span style={st.reqFieldLbl}>Из фонда · доступно {fmt(Number(fundById[from]?.balance || 0))}</span>
            <select style={selStyle} className="fin" value={from} onChange={(e) => setFrom(e.target.value)}>
              {funds.map((f) => <option key={f.id} value={f.id}>{f.code} — {f.name}</option>)}
            </select>
          </label>
          <label style={st.reqField}>
            <span style={st.reqFieldLbl}>В фонд</span>
            <select style={selStyle} className="fin" value={to} onChange={(e) => setTo(e.target.value)}>
              {funds.map((f) => <option key={f.id} value={f.id}>{f.code} — {f.name}</option>)}
            </select>
          </label>
          <label style={st.reqField}>
            <span style={st.reqFieldLbl}>Сумма, TJS</span>
            <input type="number" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)}
              onWheel={(e) => e.target.blur()} placeholder="0" style={{ ...st.numInput, width: "100%" }} className="amtIn" />
          </label>
          <label style={{ ...st.reqField, flex: 1, minWidth: 160 }}>
            <span style={st.reqFieldLbl}>Комментарий</span>
            <input style={st.mdInput} className="fin" placeholder="Назначение…"
              value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
          <button style={{ ...st.btnGreen, opacity: busy === "op" ? 0.7 : 1 }} className="btn" onClick={doTransfer} disabled={!!busy}>
            {busy === "op" ? <Loader2 size={15} className="spin" /> : <ArrowRightLeft size={15} />}
            {kind === "move" ? " Переместить" : " Одолжить"}
          </button>
        </div>
      </section>
    )}

    {/* Список фондов */}
    <div style={{ ...st.cardWrap, marginTop: 18 }}>
      <section style={st.card}>
        <div style={st.cardHead}>
          <div style={st.cardTitle}>Остатки по фондам</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {isFinAdmin && (
              <button style={st.btnGhost} className="btn" onClick={() => setShowAdd(true)}>
                <Plus size={15} /> {!isMobile && "Новый фонд"}
              </button>
            )}
            <div style={st.cardTotal}>{fmt(total)} <span style={st.unit}>TJS</span></div>
          </div>
        </div>
        <div style={{ ...st.frow, ...st.frowHead, gridTemplateColumns: GRID }}>
          <div style={st.fName}>Фонд</div>
          {!isMobile && <div style={st.fPct}>Этап распределения</div>}
          {!isMobile && <div style={st.fPct}>Тип</div>}
          <div style={st.fNum}>Доступно</div>
          {!isMobile && <div style={st.fNum} />}
        </div>
        {[...funds.filter((f) => !f.folder_id),
          ...Object.entries(funds.filter((f) => f.folder_id).reduce((m, f) => { (m[f.folder_id] ??= []).push(f); return m; }, {}))
            .flatMap(([fid, children]) => [{ __folder: fid, children }, ...(openFolders[fid] ? children.map((c) => ({ ...c, __child: true })) : [])]),
        ].map((f) => f.__folder ? (
          <div key={"folder" + f.__folder} style={{ ...st.frow, gridTemplateColumns: GRID, cursor: "pointer", background: C.panel2 }} className="frow"
            onClick={() => setOpenFolders((o) => ({ ...o, [f.__folder]: !o[f.__folder] }))}>
            <div style={st.fName}>
              <div style={st.fundTop}>
                {openFolders[f.__folder] ? <FolderOpen size={15} color={C.warning} /> : <Folder size={15} color={C.warning} />}
                <b>{folders.find((x) => x.id === f.__folder)?.name || "Папка"}</b>
                <span style={{ fontSize: 11, color: C.faint }}>· {f.children.length} фонд(ов)</span>
                <ChevronRight size={14} style={{ transform: openFolders[f.__folder] ? "rotate(90deg)" : "none", transition: "transform .2s", color: C.faint }} />
              </div>
            </div>
            {!isMobile && <div style={st.fPct} />}
            {!isMobile && <div style={st.fPct} />}
            <div style={{ ...st.fNum, fontWeight: 700 }}>{fmt(f.children.reduce((a, c) => a + Number(c.balance || 0), 0))}</div>
            {!isMobile && <div />}
          </div>
        ) : (
          <div key={f.id} style={{ ...st.frow, gridTemplateColumns: GRID, ...(f.__child ? { paddingLeft: 26 } : {}) }} className="frow">
            <div style={st.fName}>
              <div style={st.fundTop}>
                <span style={st.fundCode}>{f.code}</span>
                <span>{f.name}</span>
                {f.is_restricted && <Lock size={12} color={C.faint} />}
              </div>
              {isMobile && (
                <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>
                  {[...(stagesOf[f.id] || [])].join(" + ") || "—"} · {f.kind === "working" ? "рабочий" : "накопительный"}
                </div>
              )}
            </div>
            {!isMobile && <div style={{ ...st.fPct, fontSize: 12 }}>{[...(stagesOf[f.id] || [])].join(" + ") || "—"}</div>}
            {!isMobile && <div style={st.fPct}><span style={typeBadge(f.kind)}>{f.kind === "working" ? "рабочий" : "накопительный"}</span></div>}
            <div style={{ ...st.fNum, fontWeight: 700 }}>{fmt(Number(f.balance || 0))}</div>
            {!isMobile && (
              <div style={{ textAlign: "right" }}>
                <button style={{ ...st.btnGhost, padding: "6px 10px", fontSize: 12 }} className="btn"
                  disabled={!!busy} onClick={() => openStatement(f)}>
                  {busy === `stmt:${f.id}` ? <Loader2 size={13} className="spin" /> : <List size={13} />} Подробно
                </button>
              </div>
            )}
          </div>
        ))}
        {isMobile && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
            {funds.map((f) => (
              <button key={f.id} style={{ ...st.btnGhost, padding: "6px 10px", fontSize: 12 }} className="btn"
                disabled={!!busy} onClick={() => openStatement(f)}>
                <List size={13} /> {f.code}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>

    {/* История операций между фондами */}
    <section style={{ ...st.fpCard, marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <Clock size={18} color={C.green} />
        <h3 style={st.reqSectionTitle}>Перемещения и займы</h3>
        <span style={st.reqSectionSub}>из Реестра</span>
      </div>
      {ops.length === 0 ? (
        <div style={st.empty}>Операций пока нет — переместите средства между фондами выше</div>
      ) : ops.map((op) => {
        const isLoan = op.opType === "fund_loan";
        const isReturn = op.opType === "fund_loan_return";
        const outstanding = isLoan ? op.amount - op.returned : 0;
        const badgeColor = isLoan ? C.warning : isReturn ? C.info : C.green;
        return (
          <div key={op.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 4px", borderBottom: `1px solid ${C.line}`, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11.5, color: C.faint, flexShrink: 0, width: 86 }}>
              {new Date(op.createdAt).toLocaleString("ru", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </span>
            <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 20, whiteSpace: "nowrap", color: badgeColor, background: `${badgeColor}1a` }}>
              {OP_LABELS[op.opType]}
            </span>
            <span style={{ fontSize: 13, flex: 1, minWidth: 180 }}>
              {nameOf(op.fromFundId)} → {nameOf(op.toFundId)}
              {op.comment ? <span style={{ color: C.faint }}> · {op.comment}</span> : ""}
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(op.amount)}</span>
            {isLoan && outstanding > 0.009 && isFinAdmin && (
              <button style={st.btnGhost} className="btn" disabled={!!busy} onClick={() => setReturning(op)}>
                {busy === `ret:${op.id}` ? <Loader2 size={13} className="spin" /> : <RotateCcw size={13} />}
                {" "}Вернуть{op.returned > 0 ? ` (ост. ${fmt(outstanding)})` : ""}
              </button>
            )}
            {isLoan && outstanding <= 0.009 && (
              <span style={{ fontSize: 11.5, fontWeight: 700, color: C.sub }}>возвращён</span>
            )}
          </div>
        );
      })}
    </section>

    {statement && (
      <FundStatementModal C={C} st={st} statement={statement} period={period}
        onAllTime={() => openStatement(statement.fund, true)}
        onClose={() => setStatement(null)} />
    )}
    {returning && (
      <ReturnModal C={C} st={st} op={returning} nameOf={nameOf}
        busy={busy === `ret:${returning.id}`}
        onClose={() => setReturning(null)} onConfirm={doReturn} />
    )}
    {showAdd && refs && (
      <AddFundModal C={C} st={st} refs={refs} folders={folders}
        onClose={() => setShowAdd(false)}
        onSaved={async () => { setShowAdd(false); await load(); setDone("Фонд создан"); }} />
    )}
  </>);
}


// ---------------------------------------------------------------- Выписка по фонду
function FundStatementModal({ C, st, statement, period, onAllTime, onClose }) {
  const { fund, rows, allTime } = statement;
  return (
    <div style={st.mdOverlay} onClick={onClose}>
      <div style={{ ...st.mdCard, width: "min(560px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>{fund.code} {fund.name} · выписка</div>
          <button style={st.iconBtn} onClick={onClose}><X size={17} /></button>
        </div>
        <div style={{ fontSize: 12.5, color: C.sub, marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span>{allTime ? "Последние операции (все периоды)" : `Неделя ${period ? periodTitle(period) : "—"}`}</span>
          {!allTime && (
            <button style={{ ...st.btnGhost, padding: "5px 10px", fontSize: 12 }} className="btn" onClick={onAllTime}>
              Показать все
            </button>
          )}
        </div>
        {!rows.length && <div style={st.empty}>Операций нет</div>}
        <div style={{ maxHeight: 420, overflowY: "auto", display: "grid", gap: 6 }}>
          {rows.map((r) => {
            const amt = Number(r.fund_amount) || 0;
            return (
              <div key={r.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
                padding: "9px 12px", borderRadius: 10, background: C.panel2, border: `1px solid ${C.line}`,
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{OP_LABELS[r.op_type] || r.op_type}</div>
                  <div style={{ fontSize: 11.5, color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {new Date(r.created_at).toLocaleString("ru", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    {r.comment ? ` · ${r.comment}` : ""}
                  </div>
                </div>
                <div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: amt >= 0 ? C.green : C.danger, flexShrink: 0 }}>
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


// ---------------------------------------------------------------- Возврат займа
function ReturnModal({ C, st, op, nameOf, busy, onClose, onConfirm }) {
  const outstanding = op.amount - op.returned;
  const [val, setVal] = useState(String(outstanding));
  const a = parseFloat(String(val).replace(",", ".")) || 0;
  return (
    <div style={st.mdOverlay} onClick={onClose}>
      <div style={{ ...st.mdCard, width: "min(420px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>Возврат займа</div>
          <button style={st.iconBtn} onClick={onClose}><X size={17} /></button>
        </div>
        <div style={{ fontSize: 13, color: C.sub, marginBottom: 12 }}>
          {nameOf(op.toFundId)} → {nameOf(op.fromFundId)} · к возврату <b style={{ color: C.text }}>{fmt(outstanding)}</b> TJS
        </div>
        <div style={st.reqField}>
          <span style={st.reqFieldLbl}>Сумма возврата (можно частично)</span>
          <input type="number" inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)}
            onWheel={(e) => e.target.blur()} style={{ ...st.numInput, width: "100%" }} autoFocus />
        </div>
        <div style={st.mdActions}>
          <button style={st.btnGhost} className="btn" onClick={onClose}>Отмена</button>
          <button style={{ ...st.btnGreen, opacity: busy ? 0.7 : 1 }} className="btn"
            disabled={busy || a <= 0 || a > outstanding + 0.009} onClick={() => onConfirm(op, a)}>
            {busy ? <Loader2 size={15} className="spin" /> : <RotateCcw size={15} />} Вернуть
          </button>
        </div>
      </div>
    </div>
  );
}


// ---------------------------------------------------------------- Новый фонд
function AddFundModal({ C, st, refs, folders, onClose, onSaved }) {
  const baseCur = refs.currencies.find((c) => c.is_base) || refs.currencies[0];
  const [f, setF] = useState({ code: "", name: "", kind: "working", isRestricted: false, locationId: "", folderId: "" });
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
      await createFund({
        code: f.code.trim(), name: f.name.trim(), kind: f.kind,
        isRestricted: f.isRestricted, locationId: f.locationId, currencyId: baseCur.id, folderId,
      });
      onSaved();
    } catch (e) {
      const msg = e?.message || String(e);
      setErr(msg.includes("duplicate") ? "Фонд с таким кодом уже существует" : msg);
      setBusy(false);
    }
  };

  return (
    <div style={st.mdOverlay} onClick={onClose}>
      <div style={{ ...st.mdCard, width: "min(420px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>Новый фонд</div>
          <button style={st.iconBtn} onClick={onClose}><X size={17} /></button>
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Код</span>
            <input style={st.mdInput} className="fin" placeholder="FD10" autoFocus
              value={f.code} onChange={(e) => setF((p) => ({ ...p, code: e.target.value }))} />
          </div>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Название</span>
            <input style={st.mdInput} className="fin" placeholder="Фонд развития…"
              value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} />
          </div>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Тип</span>
            <select style={st.mdSelect} className="fin" value={f.kind} onChange={(e) => setF((p) => ({ ...p, kind: e.target.value }))}>
              <option value="working">рабочий</option>
              <option value="accumulative">накопительный</option>
            </select>
          </div>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Точка</span>
            <select style={st.mdSelect} className="fin" value={f.locationId} onChange={(e) => setF((p) => ({ ...p, locationId: e.target.value }))}>
              <option value="">— вся сеть —</option>
              {refs.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Папка (как ФД5 «Фонд учредителей»)</span>
            <select style={st.mdSelect} className="fin" value={f.folderId} onChange={(e) => setF((p) => ({ ...p, folderId: e.target.value }))}>
              <option value="">— без папки —</option>
              {folders.map((fl) => <option key={fl.id} value={fl.id}>{fl.name}</option>)}
            </select>
            <input style={{ ...st.mdInput, marginTop: 6 }} className="fin" placeholder="…или новая папка"
              value={newFolder} onChange={(e) => setNewFolder(e.target.value)} />
          </div>
          <label style={st.mdCheck}>
            <input type="checkbox" checked={f.isRestricted}
              onChange={(e) => setF((p) => ({ ...p, isRestricted: e.target.checked }))} />
            Закрытый фонд (доступ по персональному списку)
          </label>
        </div>
        {err && <div style={st.reqError}><AlertCircle size={15} /> {err}</div>}
        <div style={st.mdActions}>
          <button style={st.btnGhost} className="btn" onClick={onClose}>Отмена</button>
          <button style={{ ...st.btnGreen, opacity: busy ? 0.7 : 1 }} className="btn" onClick={submit} disabled={busy}>
            {busy ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} Создать
          </button>
        </div>
      </div>
    </div>
  );
}
