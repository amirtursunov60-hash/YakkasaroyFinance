import { useState, useEffect, useCallback, useMemo } from "react";
import { Banknote, Save, AlertTriangle, Loader2, AlertCircle, CheckCircle2, Plus, X, List, Landmark, CreditCard, Wifi, Pencil, Archive, ArchiveRestore } from "lucide-react";
import { Stat } from "../../components/common";
import { Modal } from "../../components/Modal";
import { useTheme } from "../../theme/theme";
import { useScrollLock } from "../../hooks/useScrollLock";
import { useActionFeedback } from "../../hooks/useActionFeedback";
import { fmt } from "../../utils/format";
import { usePeriod, periodTitle } from "../../lib/PeriodCtx";
import { ArrowRightLeft } from "lucide-react";
import { opLabel } from "../../utils/register";
import { CASH_FLOW_ROLE_LABELS } from "../../lib/constants";
import { buildControlSum } from "./controlSum";
import {
  fetchCashAccounts, createCashAccount, updateCashAccount, setCashAccountArchived,
  fetchReconciliations, saveReconciliations, fetchAccountStatement, fetchIncomeRefs,
  cashTransfer, fetchControlSum, fetchTurnoverSheet,
} from "../../lib/api";


// ---------------------------------------------------------------- CONTROL
// Живые данные (ТЗ v2 §4.1.8) + доработка по образцу ManaJet (02.07.2026):
// счета ДС с расчётным остатком из Реестра, движение за выбранную неделю
// (вход/приход/расход/исход — RPC fp_turnover_sheet), сверка бухгалтером
// (снимок факт/расчёт), группировка «Приходные/Расходные» (система расчётных
// счетов ФП), редактирование/архив счёта, «Контрольная сумма» (fp_control_sum).
// Конвенция Реестра: суммы операций и балансы счетов — в базовой валюте (TJS).

const TYPE_META = {
  cash:      { label: "касса",     icon: Banknote },
  bank:      { label: "банк",      icon: Landmark },
  card:      { label: "карта",     icon: CreditCard },
  acquiring: { label: "эквайринг", icon: Wifi },
};
const GROUP_LABELS = { incoming: "Приходные счета", outgoing: "Расходные счета", none: "Без классификации" };

// Квадратная мини-кнопка действия в строке счёта (единый вид mobile/desktop).
function RowIconBtn({ st, size, title, disabled, onClick, children }) {
  return (
    <button style={{ ...st.iconBtn, width: size, height: size, borderRadius: 8, flexShrink: 0 }}
      className="btn" title={title} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

export function Control() {
  const { C, st, isMobile, profile } = useTheme();
  const { period, periodId, loading: periodsLoading, locationId: ctxLocationId } = usePeriod();
  const canEdit = ["owner", "fin_director", "accountant"].includes(profile?.role);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  useActionFeedback(done, err);
  const [accounts, setAccounts] = useState([]);
  const [withArchived, setWithArchived] = useState(false);
  const [recons, setRecons] = useState({});
  const [values, setValues] = useState({});      // ввод факта { accountId: строка }
  const [turnover, setTurnover] = useState({});  // { accountId: {opening, inflow, outflow, closing} }
  const [ctlSum, setCtlSum] = useState(null);    // ControlSumView | null
  const [ctlErr, setCtlErr] = useState("");
  const [busy, setBusy] = useState(null);
  const [statement, setStatement] = useState(null); // { account, rows, allTime }
  const [showAdd, setShowAdd] = useState(false);
  const [editAccount, setEditAccount] = useState(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [refs, setRefs] = useState(null);

  const load = useCallback(async () => {
    setErr("");
    try {
      setAccounts(await fetchCashAccounts({ withArchived }));
    } catch (e) {
      setErr("Не удалось загрузить счета: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [withArchived]);
  useEffect(() => { load(); }, [load]);

  // Справочники (валюты/точки) не зависят от тумблера архива — грузим один раз.
  useEffect(() => {
    (async () => {
      try { setRefs(await fetchIncomeRefs()); }
      catch (e) { setErr("Не удалось загрузить справочники: " + (e?.message || e)); }
    })();
  }, []);

  // Сверки выбранной недели → предзаполняем «факт»; движение за неделю и
  // контрольная сумма — из Реестра (read-only RPC). Три независимых запроса —
  // параллельно; guard `on` защищает от гонки при быстрой смене недель.
  useEffect(() => {
    if (periodsLoading) return;
    let on = true;
    (async () => {
      const [recRes, tvRes, csRes] = await Promise.allSettled([
        fetchReconciliations(periodId),
        fetchTurnoverSheet(periodId),
        canEdit ? fetchControlSum(periodId) : Promise.resolve(null),
      ]);
      if (!on) return;
      if (recRes.status === "fulfilled") {
        setRecons(recRes.value);
        setValues(Object.fromEntries(Object.entries(recRes.value).map(([accId, row]) => [accId, String(row.actual_balance)])));
        setDone("");
      } else setErr("Не удалось загрузить сверки: " + (recRes.reason?.message || recRes.reason));
      if (tvRes.status === "fulfilled") {
        setTurnover(Object.fromEntries(tvRes.value.cash.map((r) => [r.id, r])));
      } else {
        // Без движения «Расчёт» откатывается на live-баланс — это неверно для
        // прошлых недель, поэтому ошибку показываем, а не глотаем.
        setTurnover({});
        setErr("Не удалось загрузить движение за неделю: " + (tvRes.reason?.message || tvRes.reason));
      }
      if (canEdit) {
        if (csRes.status === "fulfilled") { setCtlSum(csRes.value ? buildControlSum(csRes.value) : null); setCtlErr(""); }
        else { setCtlSum(null); setCtlErr(csRes.reason?.message || String(csRes.reason)); }
      }
    })();
    return () => { on = false; };
  }, [periodId, periodsLoading, canEdit]);

  const shownAccounts = useMemo(
    () => ctxLocationId ? accounts.filter((a) => a.location_id === ctxLocationId || !a.location_id) : accounts,
    [accounts, ctxLocationId]);

  // Расчётный остаток: на конец выбранной недели (Реестр до конца недели N);
  // пока движение не загружено — live-баланс (для текущей недели они равны).
  const calcOf = useCallback(
    (a) => turnover[a.id] ? turnover[a.id].closing : Number(a.balance) || 0,
    [turnover]);

  // Группировка «Приходные/Расходные» (папки М1/Д1 у ManaJet) — появляется,
  // как только хотя бы у одного счёта задана классификация.
  const groups = useMemo(() => {
    if (!shownAccounts.some((a) => a.flow_role)) return [{ key: "all", label: null, items: shownAccounts }];
    const g = { incoming: [], outgoing: [], none: [] };
    for (const a of shownAccounts) g[a.flow_role || "none"].push(a);
    return ["incoming", "outgoing", "none"]
      .filter((k) => g[k].length)
      .map((k) => ({ key: k, label: GROUP_LABELS[k], items: g[k] }));
  }, [shownAccounts]);

  // Итоги и сверка — только по активным счетам: архивные показываются
  // справочно (тумблер «С архивом») и не должны раздувать «Итого».
  const activeAccounts = useMemo(() => shownAccounts.filter((a) => !a.is_archived), [shownAccounts]);

  const totals = useMemo(() => {
    let calc = 0, fact = 0, entered = 0;
    for (const a of activeAccounts) {
      calc += calcOf(a);
      const v = values[a.id];
      if (v !== undefined && v !== "") { fact += Number(v) || 0; entered++; }
    }
    return { calc, fact, entered, diff: fact - (entered ? calc : 0) };
  }, [activeAccounts, values, calcOf]);
  const anyEntered = totals.entered > 0;
  const allEntered = totals.entered === activeAccounts.length && activeAccounts.length > 0;
  const diffTotal = allEntered ? totals.fact - totals.calc : null;

  const save = async () => {
    if (busy) return;
    if (!periodId) { setErr("Нет выбранного периода ФП — добавьте неделю в шапке"); return; }
    const rows = activeAccounts
      .filter((a) => values[a.id] !== undefined && values[a.id] !== "")
      .map((a) => ({
        cash_account_id: a.id, period_id: periodId,
        actual_balance: Number(values[a.id]) || 0,
        system_balance: calcOf(a),
        created_by: profile.id,
      }));
    if (!rows.length) { setErr("Введите фактические остатки хотя бы по одному счёту"); return; }
    setBusy("save"); setErr(""); setDone("");
    try {
      await saveReconciliations(rows);
      setRecons(await fetchReconciliations(periodId));
      setDone(`Сверка сохранена: ${rows.length} счёт(ов) за неделю ${period ? periodTitle(period) : ""}`);
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  const openStatement = async (account, allTime = false) => {
    setBusy(`stmt:${account.id}`); setErr("");
    try {
      const rows = await fetchAccountStatement(account.id, allTime ? null : periodId);
      setStatement({ account, rows, allTime });
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  if (loading || periodsLoading) return <div style={st.empty}><Loader2 size={18} className="spin" /> Загрузка…</div>;

  // minmax(0,…) — чтобы колонка-имя могла сжиматься уже своего контента
  // (иначе на телефоне строка не влезает в ширину экрана). minWidth строки
  // на мобайле сбрасываем, на десктопе расширяем под колонки движения.
  const GRID = isMobile
    ? "minmax(0,1fr) 105px 120px"
    : "minmax(0,1.3fr) 105px 105px 105px 120px 150px 110px 88px";
  const frowFit = isMobile ? { minWidth: 0 } : { minWidth: 990 };

  const renderRow = (a) => {
    const Icon = TYPE_META[a.type]?.icon || Banknote;
    const tv = turnover[a.id];
    const calc = calcOf(a);
    const v = values[a.id] === undefined || values[a.id] === "" ? null : Number(values[a.id]) || 0;
    const d = v === null ? null : v - calc;
    const ok = d !== null && Math.abs(d) < 0.01;
    const saved = recons[a.id];
    return (
      <div key={a.id} style={{ ...st.frow, gridTemplateColumns: GRID, ...frowFit, opacity: a.is_archived ? 0.55 : 1 }} className="frow">
        <div style={st.fName}>
          <div style={st.fundTop}>
            <Icon size={15} color={C.green} />
            <span>{a.name}</span>
            {a.is_archived && <span style={{ fontSize: 10.5, color: C.faint, border: `1px solid ${C.line}`, borderRadius: 6, padding: "1px 5px", flexShrink: 0 }}>в архиве</span>}
            {saved && <CheckCircle2 size={13} color={ok || (saved && Math.abs(Number(saved.difference)) < 0.01) ? C.green : C.danger} />}
            {/* «Подробно» (выписка) и карандаш прямо в строке на телефоне */}
            {isMobile && (
              <span style={{ display: "flex", gap: 6, marginLeft: "auto", flexShrink: 0 }}>
                {canEdit && (
                  <RowIconBtn st={st} size={28} title="Редактировать счёт" onClick={() => setEditAccount(a)}>
                    <Pencil size={13} />
                  </RowIconBtn>
                )}
                <RowIconBtn st={st} size={28} title="Выписка по счёту" disabled={!!busy} onClick={() => openStatement(a)}>
                  {busy === `stmt:${a.id}` ? <Loader2 size={13} className="spin" /> : <List size={13} />}
                </RowIconBtn>
              </span>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}>
            {TYPE_META[a.type]?.label}
            {a.location ? ` · ${a.location.name}` : ""}
            {a.currency?.code && !a.currency?.is_base ? ` · ${a.currency.code}` : ""}
            {isMobile && tv && <span> · нач {fmt(tv.opening)} · +{fmt(tv.inflow)} · −{fmt(tv.outflow)}</span>}
            {isMobile && d !== null && <span style={{ color: ok ? C.green : C.danger, fontWeight: 700 }}> · {ok ? "✓ сходится" : fmt(d)}</span>}
          </div>
        </div>
        {!isMobile && <div style={{ ...st.fNum, color: C.faint }}>{tv ? fmt(tv.opening) : "—"}</div>}
        {!isMobile && <div style={{ ...st.fNum, color: tv && tv.inflow ? C.green : C.faint }}>{tv ? (tv.inflow ? `+${fmt(tv.inflow)}` : "0") : "—"}</div>}
        {!isMobile && <div style={{ ...st.fNum, color: tv && tv.outflow ? C.danger : C.faint }}>{tv ? (tv.outflow ? `−${fmt(tv.outflow)}` : "0") : "—"}</div>}
        <div style={{ ...st.fNum, color: C.sub, fontWeight: 600 }}>{fmt(calc)}</div>
        <div style={{ textAlign: "right" }}>
          <input type="number" value={values[a.id] ?? ""} disabled={!canEdit || a.is_archived}
            onChange={(e) => { setValues((p) => ({ ...p, [a.id]: e.target.value })); setDone(""); }}
            placeholder="0" style={{ ...st.numInput, width: isMobile ? 105 : 150 }} />
        </div>
        {!isMobile && (
          <div style={{ ...st.fNum, fontWeight: 700, color: d === null ? C.faint : ok ? C.green : C.danger }}>
            {d === null ? "—" : ok ? "✓ сходится" : fmt(d)}
          </div>
        )}
        {!isMobile && (
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            {canEdit && (
              <RowIconBtn st={st} size={30} title="Редактировать счёт" onClick={() => setEditAccount(a)}>
                <Pencil size={14} />
              </RowIconBtn>
            )}
            <RowIconBtn st={st} size={30} title="Выписка по счёту" disabled={!!busy} onClick={() => openStatement(a)}>
              {busy === `stmt:${a.id}` ? <Loader2 size={14} className="spin" /> : <List size={14} />}
            </RowIconBtn>
          </div>
        )}
      </div>
    );
  };

  return (<>
    <section style={st.hero}>
      <div style={st.heroGlow} />
      <div style={st.heroContent}>
        <div style={st.heroTop}>
          <div>
            <div style={st.heroLabel}>Контроль средств · сверка факта с расчётом системы</div>
            <div style={st.heroTitle}>{period ? periodTitle(period) : "Период не создан"}</div>
          </div>
        </div>
        <div style={st.heroStats}>
          <Stat label="Расчёт системы (Реестр)" value={fmt(totals.calc)} unit="TJS" accent />
          <Stat label="Факт (введено)" value={anyEntered ? fmt(totals.fact) : "—"} unit={anyEntered ? "TJS" : ""} />
          <Stat label="Расхождение" value={diffTotal === null ? "—" : fmt(diffTotal)} unit={diffTotal === null ? "" : "TJS"}
            tone={diffTotal === null ? undefined : Math.abs(diffTotal) < 0.01 ? "success" : "danger"} />
          <Stat label="Сверено счетов" value={`${Object.keys(recons).length} / ${activeAccounts.length}`} unit="" />
        </div>
      </div>
    </section>

    {err && <div role="alert" style={{ ...st.reqError, marginBottom: 14 }}><AlertCircle size={15} /> {err}</div>}
    {done && <div style={{ ...st.reqSuccess, marginBottom: 14 }}><CheckCircle2 size={15} /> {done}</div>}
    {diffTotal !== null && Math.abs(diffTotal) > 0.01 && (
      <div style={st.stockAlert}><AlertTriangle size={16} /> Расхождение {fmt(diffTotal)} TJS между фактом и расчётом — проверьте кассы и неучтённые операции</div>
    )}

    <div style={st.cardWrap}>
      <section style={st.card}>
        <div style={{ ...st.cardHead, flexWrap: "wrap", gap: 8 }}>
          <div style={st.cardTitle}>Остатки по счетам</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {canEdit && (
              <button style={{ ...st.btnGhost, ...(withArchived ? { borderColor: C.green, color: C.green } : {}) }}
                className="btn" title="Показывать архивные счета" onClick={() => setWithArchived((v) => !v)}>
                <Archive size={15} /> {!isMobile && "С архивом"}
              </button>
            )}
            {canEdit && (
              <button style={st.btnGhost} className="btn" onClick={() => setShowTransfer(true)}>
                <ArrowRightLeft size={15} /> {!isMobile && "Переместить ДС"}
              </button>
            )}
            {canEdit && (
              <button style={st.btnGhost} className="btn" onClick={() => setShowAdd(true)}>
                <Plus size={15} /> {!isMobile && "Добавить счёт"}
              </button>
            )}
            {canEdit && (
              <button style={{ ...st.btnGreen, opacity: busy === "save" ? 0.7 : 1 }} className="btn" onClick={save} disabled={!!busy}>
                {busy === "save" ? <Loader2 size={15} className="spin" /> : <Save size={15} />} Сохранить сверку
              </button>
            )}
          </div>
        </div>

        {!shownAccounts.length && <div style={st.empty}>Счетов ДС пока нет — добавьте кассу или банковский счёт</div>}
        {shownAccounts.length > 0 && (<>
          <div style={{ ...st.frow, ...st.frowHead, gridTemplateColumns: GRID, ...frowFit }}>
            <div style={st.fName}>Счёт / касса</div>
            {!isMobile && <div style={st.fNum}>На начало</div>}
            {!isMobile && <div style={st.fNum}>Приход</div>}
            {!isMobile && <div style={st.fNum}>Расход</div>}
            <div style={st.fNum}>{isMobile ? "Расчёт" : "Расчёт на конец"}</div>
            <div style={st.fNum}>Факт</div>
            {!isMobile && <div style={st.fNum}>Расхождение</div>}
            {!isMobile && <div style={st.fNum} />}
          </div>
          {groups.map((g) => (
            <div key={g.key}>
              {g.label && (
                <div style={{ padding: "9px 12px 4px", fontSize: 11.5, fontWeight: 700, letterSpacing: 0.4,
                    textTransform: "uppercase", color: C.faint }}>
                  {g.label} · {g.items.length}
                </div>
              )}
              {g.items.map(renderRow)}
            </div>
          ))}
          <div style={{ ...st.frow, ...st.frowTotal, gridTemplateColumns: GRID, ...frowFit }}>
            <div style={st.fName}><b>Итого (TJS)</b></div>
            {!isMobile && <div style={st.fNum} />}
            {!isMobile && <div style={st.fNum} />}
            {!isMobile && <div style={st.fNum} />}
            <div style={{ ...st.fNum, fontWeight: 700, color: C.sub }}>{fmt(totals.calc)}</div>
            <div style={{ ...st.fNum, fontWeight: 800, color: C.money, fontSize: 16 }}>{anyEntered ? fmt(totals.fact) : "—"}</div>
            {!isMobile && (
              <div style={{ ...st.fNum, fontWeight: 800, color: diffTotal === null ? C.faint : Math.abs(diffTotal) < 0.01 ? C.green : C.danger }}>
                {diffTotal === null ? "—" : fmt(diffTotal)}
              </div>
            )}
            {!isMobile && <div />}
          </div>
        </>)}
      </section>
    </div>

    {/* Контрольная сумма — всегда по всей сети (RPC не делит по точкам),
        поэтому при выбранной точке в шапке блок прячем, чтобы цифры на экране
        не расходились с отфильтрованной таблицей. */}
    {canEdit && periodId && !ctxLocationId && (
      <ControlSumCard C={C} st={st} isMobile={isMobile} ctlSum={ctlSum} ctlErr={ctlErr} period={period} />
    )}

    <div style={st.vibeNote}>
      <b style={{ color: C.green }}>Принцип:</b> «чтобы ни одна копейка не пропала». Расчётный остаток система
      ведёт сама по Реестру (доходы на счёт − оплаты со счёта). Бухгалтер вводит фактические остатки на конец
      недели — сверка сохраняется снимком за период, расхождение — сигнал проверить кассу.
    </div>

    {statement && (
      <StatementModal C={C} st={st} statement={statement} period={period}
        onAllTime={() => openStatement(statement.account, true)}
        onClose={() => setStatement(null)} />
    )}
    {showAdd && refs && (
      <AccountFormModal st={st} refs={refs}
        onClose={() => setShowAdd(false)}
        onSaved={async () => { setShowAdd(false); await load(); setDone("Счёт ДС добавлен"); }} />
    )}
    {editAccount && refs && (
      <AccountFormModal st={st} refs={refs} account={editAccount}
        onClose={() => setEditAccount(null)}
        onSaved={async (msg) => { setEditAccount(null); await load(); setDone(msg || "Счёт обновлён"); }} />
    )}
    {showTransfer && (
      <CashTransferModal st={st} accounts={accounts.filter((a) => !a.is_archived)} periodId={periodId}
        onClose={() => setShowTransfer(false)}
        onSaved={async (msg) => { setShowTransfer(false); await load(); setDone(msg); }} />
    )}
  </>);
}


// ---------------------------------------------------------------- Контрольная сумма
// Уравнение ФП (образец — ManaJet): деньги на счетах = нераспределённые доходы
// + фонды (доступно + одобренные невыплаченные заявки/счета). Разница ≠ 0 —
// сигнал: внеплановые траты, корректировки, ручные операции фондов.
function ControlSumCard({ C, st, isMobile, ctlSum, ctlErr, period }) {
  const row = (label, value, { bold, indent, tone } = {}) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
        padding: isMobile ? "8px 0" : "9px 0", borderBottom: `1px solid ${C.line}`,
        paddingLeft: indent ? 18 : 0 }}>
      <div style={{ fontSize: bold ? 13.5 : 13, fontWeight: bold ? 800 : 500, color: indent ? C.sub : C.text }}>{label}</div>
      <div style={{ fontWeight: bold ? 800 : 650, fontVariantNumeric: "tabular-nums", fontSize: bold ? 15 : 13.5,
          color: tone === "danger" ? C.danger : tone === "success" ? C.green : bold ? C.money : C.text, flexShrink: 0 }}>
        {fmt(value)}
      </div>
    </div>
  );
  return (
    <div style={st.cardWrap}>
      <section style={st.card}>
        <div style={{ ...st.cardHead, flexWrap: "wrap", gap: 8 }}>
          <div style={st.cardTitle}>Контрольная сумма</div>
          <div style={{ fontSize: 11.5, color: C.faint }}>
            вся сеть · на конец недели {period ? periodTitle(period) : "—"}
          </div>
        </div>
        {!ctlSum && (
          <div style={st.empty}>
            {ctlErr ? "Контрольная сумма недоступна — требуется обновление БД (fp_control_sum)" : <><Loader2 size={16} className="spin" /> Расчёт…</>}
          </div>
        )}
        {ctlSum && (<>
          <div>
            {row("Деньги на счетах ДС", ctlSum.cashTotal, { bold: true })}
            {row("Нераспределённые доходы", ctlSum.incomesUndistributed)}
            {/* Обязательства (заявки/счета) — текущее состояние, а не снимок недели:
                для закрытых недель раскладку «доступно/обязательства» не показываем,
                чтобы не смешивать исторические фонды с сегодняшними обязательствами. */}
            {period?.status === "closed" ? (
              row("Фонды (на конец недели)", ctlSum.fundsTotal)
            ) : (<>
              {row("Фонды: доступно", ctlSum.fundsAvailable)}
              {row("Невыплаченные заявки (одобренные)", ctlSum.requestsUnpaid, { indent: true })}
              {row("Невыплаченные счета поставщиков", ctlSum.billsUnpaid, { indent: true })}
            </>)}
            {row("Итого должно быть на счетах", ctlSum.total, { bold: true })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 10,
              padding: "10px 12px", borderRadius: 10,
              background: ctlSum.matches ? `${C.green}14` : `${C.danger}14`,
              border: `1px solid ${ctlSum.matches ? `${C.green}44` : `${C.danger}44`}` }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: ctlSum.matches ? C.green : C.danger }}>
              {ctlSum.matches ? "✓ Сходится" : "Разница"}
            </div>
            <div style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums", fontSize: 15,
                color: ctlSum.matches ? C.green : C.danger }}>
              {fmt(ctlSum.difference)}
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: C.faint, marginTop: 10, lineHeight: 1.5 }}>
            Уравнение ФП: деньги на счетах = нераспределённые доходы + фонды (доступно + невыплаченные
            обязательства). Разница ≠ 0 — были движения мимо распределения: внеплановые траты,
            корректировки или ручные операции фондов. Невыплаченные заявки и счета — по текущему состоянию.
          </div>
        </>)}
      </section>
    </div>
  );
}


// ---------------------------------------------------------------- Перемещение ДС (инкассация)
function CashTransferModal({ st, accounts, periodId, onClose, onSaved }) {
  const [from, setFrom] = useState(accounts[0]?.id || "");
  const [to, setTo] = useState(accounts[1]?.id || "");
  const [amount, setAmount] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fromAcc = accounts.find((a) => a.id === from);

  const submit = async () => {
    if (busy) return;
    setErr("");
    const a = parseFloat(String(amount).replace(",", ".")) || 0;
    if (a <= 0) return setErr("Введите сумму больше нуля");
    if (!from || !to || from === to) return setErr("Выберите два разных счёта");
    if (!periodId) return setErr("Нет выбранного периода ФП");
    setBusy(true);
    try {
      await cashTransfer(from, to, a, periodId, comment.trim() || null);
      onSaved(`Перемещено ${fmt(a)} TJS: ${fromAcc?.name} → ${accounts.find((x) => x.id === to)?.name}`);
    } catch (e) { setErr(e?.message || String(e)); setBusy(false); }
  };

  return (
    <Modal title="Перемещение между счетами ДС" width={420} onClose={onClose}>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Откуда · остаток {fmt(Number(fromAcc?.balance || 0))}</span>
            <select style={st.mdSelect} className="fin" value={from} onChange={(e) => setFrom(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Куда</span>
            <select style={st.mdSelect} className="fin" value={to} onChange={(e) => setTo(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Сумма, TJS</span>
            <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
              onWheel={(e) => e.target.blur()} style={{ ...st.numInput, width: "100%" }} autoFocus />
          </div>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Комментарий</span>
            <input style={st.mdInput} className="fin" placeholder="Инкассация…"
              value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>
        </div>
        {err && <div role="alert" style={st.reqError}><AlertCircle size={15} /> {err}</div>}
        <div style={st.mdActions}>
          <button style={st.btnGhost} className="btn" onClick={onClose}>Отмена</button>
          <button style={{ ...st.btnGreen, opacity: busy ? 0.7 : 1 }} className="btn" onClick={submit} disabled={busy}>
            {busy ? <Loader2 size={15} className="spin" /> : <ArrowRightLeft size={15} />} Переместить
          </button>
        </div>
    </Modal>
  );
}


// ---------------------------------------------------------------- Выписка по счёту
function StatementModal({ C, st, statement, period, onAllTime, onClose }) {
  useScrollLock();
  const { account, rows, allTime } = statement;
  return (
    <div style={st.mdOverlay} data-modal="1" onClick={onClose}>
      <div style={{ ...st.mdCard, width: "min(560px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>{account.name} · выписка</div>
          <button style={st.iconBtn} onClick={onClose} aria-label="Закрыть"><X size={17} /></button>
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
            const amt = Number(r.cash_amount) || 0;
            const offPlan = r.op_type === "off_plan";
            return (
              <div key={r.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
                padding: "9px 12px", borderRadius: 12, background: offPlan ? `${C.danger}14` : C.panel2 || C.bg,
                border: `1px solid ${offPlan ? `${C.danger}44` : C.line}`,
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: offPlan ? C.danger : C.text }}>
                    {opLabel(r.op_type)}
                    {r.counterparty ? ` · ${r.counterparty.name}` : ""}
                  </div>
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


// ---------------------------------------------------------------- Счёт ДС: создание и редактирование
// Один модал на обе операции (account == null → создание). Валюта задаётся
// только при создании: записи Реестра уже сделаны в валюте счёта.
function AccountFormModal({ st, refs, account, onClose, onSaved }) {
  const { C } = useTheme();
  const isEdit = !!account;
  const baseCur = refs.currencies.find((c) => c.is_base) || refs.currencies[0];
  const [f, setF] = useState({
    name: account?.name || "",
    type: account?.type || "cash",
    locationId: account?.location_id || "",
    currencyId: baseCur?.id || "",
    flowRole: account?.flow_role || "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (busy) return;
    setErr("");
    if (!f.name.trim()) return setErr("Введите название счёта");
    setBusy(true);
    try {
      if (isEdit) {
        await updateCashAccount(account.id, { name: f.name.trim(), type: f.type, locationId: f.locationId, flowRole: f.flowRole });
        onSaved("Счёт обновлён");
      } else {
        await createCashAccount({ name: f.name.trim(), type: f.type, locationId: f.locationId, currencyId: f.currencyId, flowRole: f.flowRole });
        onSaved();
      }
    } catch (e) { setErr(e?.message || String(e)); setBusy(false); }
  };

  const toggleArchive = async () => {
    if (busy) return;
    // Счёт с деньгами архивировать нельзя (инвариант держит и триггер БД):
    // остаток «исчез» бы из списка, оставаясь в Реестре и контрольной сумме.
    if (!account.is_archived && Math.abs(Number(account.balance) || 0) > 0.005) {
      return setErr(`На счёте остаток ${fmt(Number(account.balance))} — сначала переместите деньги («Переместить ДС»)`);
    }
    setBusy(true); setErr("");
    try {
      await setCashAccountArchived(account.id, !account.is_archived);
      onSaved(account.is_archived ? "Счёт возвращён из архива" : "Счёт перемещён в архив");
    } catch (e) { setErr(e?.message || String(e)); setBusy(false); }
  };

  return (
    <Modal title={isEdit ? "Счёт ДС · редактирование" : "Новый счёт ДС"} width={420} onClose={onClose}>
      <div style={{ display: "grid", gap: 10 }}>
        <div style={st.reqField}>
          <span style={st.reqFieldLbl}>Название</span>
          <input style={st.mdInput} className="fin" placeholder="Касса Душанбе" autoFocus
            value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} />
        </div>
        <div style={st.reqField}>
          <span style={st.reqFieldLbl}>Тип</span>
          <select style={st.mdSelect} className="fin" value={f.type} onChange={(e) => setF((p) => ({ ...p, type: e.target.value }))}>
            {Object.entries(TYPE_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
          </select>
        </div>
        <div style={st.reqField}>
          <span style={st.reqFieldLbl}>Классификация (система расчётных счетов)</span>
          <select style={st.mdSelect} className="fin" value={f.flowRole} onChange={(e) => setF((p) => ({ ...p, flowRole: e.target.value }))}>
            <option value="">— без классификации —</option>
            {Object.entries(CASH_FLOW_ROLE_LABELS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </div>
        <div style={st.reqField}>
          <span style={st.reqFieldLbl}>Точка</span>
          <select style={st.mdSelect} className="fin" value={f.locationId} onChange={(e) => setF((p) => ({ ...p, locationId: e.target.value }))}>
            <option value="">— вся сеть —</option>
            {refs.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        {!isEdit && (
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Валюта</span>
            <select style={st.mdSelect} className="fin" value={f.currencyId} onChange={(e) => setF((p) => ({ ...p, currencyId: e.target.value }))}>
              {refs.currencies.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </select>
          </div>
        )}
        {isEdit && (
          <div style={{ fontSize: 11.5, color: C.faint }}>
            Валюта: {account.currency?.code || "—"} (не меняется — операции Реестра уже сделаны в ней).
            Баланс ведут триггеры Реестра.
          </div>
        )}
      </div>
      {err && <div role="alert" style={st.reqError}><AlertCircle size={15} /> {err}</div>}
      <div style={{ ...st.mdActions, flexWrap: "wrap" }}>
        {isEdit && (
          <button style={{ ...st.btnGhost, marginRight: "auto", color: account.is_archived ? C.green : C.danger }}
            className="btn" onClick={toggleArchive} disabled={busy}>
            {account.is_archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
            {account.is_archived ? "Из архива" : "В архив"}
          </button>
        )}
        <button style={st.btnGhost} className="btn" onClick={onClose}>Отмена</button>
        <button style={{ ...st.btnGreen, opacity: busy ? 0.7 : 1 }} className="btn" onClick={submit} disabled={busy}>
          {busy ? <Loader2 size={15} className="spin" /> : isEdit ? <Save size={15} /> : <Plus size={15} />}
          {isEdit ? "Сохранить" : "Добавить"}
        </button>
      </div>
    </Modal>
  );
}
