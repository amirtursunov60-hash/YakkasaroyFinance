import { useState, useEffect, useCallback, useMemo } from "react";
import { Check, Banknote, AlertTriangle, Loader2, AlertCircle, CheckCircle2, Plus, X, Ban, ChevronRight, Repeat, FileText, Pencil, ListChecks, RotateCcw } from "lucide-react";
import { Stat, ConfirmModal } from "../../components/common";
import { useTheme } from "../../theme/theme";
import { useScrollLock } from "../../hooks/useScrollLock";
import { useActionFeedback } from "../../hooks/useActionFeedback";
import { fmt } from "../../utils/format";
import { usePeriod, periodTitle } from "../../lib/PeriodCtx";
import { AttachmentsBlock } from "../../components/AttachmentsBlock";
import {
  fetchBills, insertBill, updateBill, decideBill, payBill, createCounterparty,
  fetchExpenseTypes, fetchIncomeRefs, fetchFunds, fetchCounterparties,
  fetchBillPayments, reverseBillPayment,
} from "../../lib/api";
import { BILL_FILTERS, billMatchesFilter, billFilterCounts } from "./billFilters";


// ---------------------------------------------------------------- BILLS
// Общий экран входящих счетов (ТЗ v2 §4.1.6) с РАЗДЕЛЬНЫМИ периодами
// одобрения и оплаты. Используется двумя разделами (kind):
//  - supply     «Счета поставщиков» — продукты и хозтовары;
//  - obligation «Обязательства» — оборудование, услуги, ремонт.
// Повторяющиеся счета дублируются кнопкой «Повторить». Оплата — fp_pay_bill.

const shortPeriod = (p) => p ? `${p.starts_on.slice(8, 10)}.${p.starts_on.slice(5, 7)}–${p.ends_on.slice(8, 10)}.${p.ends_on.slice(5, 7)}` : null;

export function BillsScreen({ kind, ui }) {
  const { C, st, isMobile, profile } = useTheme();
  // Статусы счёта — семантические токены; «на планировании» — категориальный акцент.
  const ST_META = {
    submitted: { label: "подан",            color: C.info },
    planning:  { label: "на планировании",  color: C.violet },
    approved:  { label: "одобрен",          color: C.warning },
    rejected:  { label: "отклонён",         color: C.danger },
    paid:      { label: "оплачен",          color: C.success },
  };
  const { period, periodId, loading: periodsLoading, locationId: ctxLocationId } = usePeriod();
  const isFinAdmin = ["owner", "fin_director"].includes(profile?.role);
  const canPay = isFinAdmin || profile?.role === "accountant";
  const canSubmit = ["owner", "fin_director", "accountant", "location_manager", "ops_director"].includes(profile?.role);
  // Доработки (редактор, лента оплат, отмена, моб. кнопка) — только для «Счета
  // поставщиков»; «Обязательства» оставлены как есть (решение заказчика).
  const isSupply = kind === "supply";

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  useActionFeedback(done, err);
  const [bills, setBills] = useState([]);
  const [types, setTypes] = useState([]);
  const [refs, setRefs] = useState(null);
  const [funds, setFunds] = useState([]);
  const [counterparties, setCounterparties] = useState([]);
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [prefill, setPrefill] = useState(null);   // для «Повторить»
  const [editBill, setEditBill] = useState(null); // счёт в режиме редактирования (свой на рассмотрении)
  const [decide, setDecide] = useState(null);     // { bill, action }
  const [payments, setPayments] = useState([]);   // оплаты счетов из Реестра — лента внизу (только supply)
  const [cancelBill, setCancelBill] = useState(null); // строка оплаты для отмены (подтверждение)
  const [cancelErr, setCancelErr] = useState(""); // ошибка отмены — показывается в модалке
  const [busy, setBusy] = useState(null);

  const loadStatic = useCallback(async () => {
    setErr("");
    try {
      const [tps, refData, fs, cps] = await Promise.all([
        fetchExpenseTypes(), fetchIncomeRefs(), fetchFunds(), fetchCounterparties(),
      ]);
      setTypes(tps); setRefs(refData); setCounterparties(cps);
      setFunds(fs.sort((a, b) => a.code.localeCompare(b.code, "ru", { numeric: true })));
    } catch (e) {
      setErr("Не удалось загрузить справочники: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { loadStatic(); }, [loadStatic]);

  const loadBills = useCallback(async () => {
    try {
      const [bls, pays] = await Promise.all([
        fetchBills(periodId, kind, ctxLocationId),
        isSupply ? fetchBillPayments(kind, ctxLocationId, { periodId }).catch(() => []) : Promise.resolve([]),
      ]);
      setBills(bls); setPayments(pays);
    }
    catch (e) { setErr("Не удалось загрузить счета: " + (e?.message || e)); }
  }, [periodId, kind, ctxLocationId, isSupply]);
  useEffect(() => { if (!periodsLoading) loadBills(); }, [loadBills, periodsLoading]);

  // Кто может править счёт: свой — пока «подан»; финкомитет — любой поданный.
  // Совпадает с RLS supplier_bills (bills_update). Только для «Счета поставщиков».
  const canEditBill = (b) => isSupply && b.status === "submitted"
    && (isFinAdmin || b.created_by === profile.id);
  const openNewBill = () => { setErr(""); setPrefill(null); setShowForm(true); };
  const openCancelBill = (row) => { setCancelErr(""); setCancelBill(row); };

  // Отмена оплаты счёта: компенсирующая запись Реестра, счёт → «одобрен».
  // Ошибку показываем в модалке (лента внизу, верхний баннер оттуда не виден).
  const doCancelPayment = async (row) => {
    if (busy) return;
    setBusy("cancelPay"); setCancelErr(""); setDone("");
    try {
      await reverseBillPayment(row.id);
      await loadBills();
      setCancelBill(null);
      setDone(`Оплата счёта №${row.bill?.number ?? ""} отменена — деньги возвращены, счёт снова одобрен`);
    } catch (e) { setCancelErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  // дерево статей → листья для формы
  const groups = useMemo(() => {
    const byParent = {};
    types.forEach((t) => { (byParent[t.parent_id || "root"] ??= []).push(t); });
    const cmp = (a, b) => (a.code || a.name).localeCompare(b.code || b.name, "ru", { numeric: true });
    Object.values(byParent).forEach((arr) => arr.sort(cmp));
    const attach = (t) => ({ ...t, children: (byParent[t.id] || []).map(attach) });
    const tree = (byParent.root || []).map(attach);
    return tree.map((root) => {
      const leaves = [];
      const walk = (n) => { if (!n.children.length) leaves.push(n); else n.children.forEach(walk); };
      walk(root);
      return { root, leaves };
    }).filter((g) => g.leaves.length);
  }, [types]);

  const sums = useMemo(() => {
    const toPay = bills.filter((b) => ["submitted", "planning", "approved"].includes(b.status));
    const today = new Date().toISOString().slice(0, 10);
    const overdue = toPay.filter((b) => b.due_on && b.due_on < today);
    const paid = bills.filter((b) => b.status === "paid");
    return {
      toPay: toPay.reduce((a, b) => a + Number(b.amount), 0),
      overdue: overdue.reduce((a, b) => a + Number(b.amount), 0),
      overdueN: overdue.length,
      paid: paid.reduce((a, b) => a + Number(b.amount), 0),
    };
  }, [bills]);

  const doDecide = async ({ bill, action, fundId, reason, accountId }) => {
    if (busy) return;
    setBusy("decide"); setErr(""); setDone("");
    try {
      if (action === "approve") {
        if (!fundId) throw new Error("Выберите фонд-источник");
        if (!periodId) throw new Error("Нет выбранного периода ФП");
        await decideBill(bill.id, { status: "approved", fund_id: fundId, period_approved_id: periodId });
        setDone(`Счёт №${bill.number} одобрен — период одобрения: ${period ? periodTitle(period) : ""}`);
      } else if (action === "reject") {
        if (!reason?.trim()) throw new Error("Укажите причину отклонения");
        await decideBill(bill.id, { status: "rejected", rejection_reason: reason.trim() });
        setDone(`Счёт №${bill.number} отклонён`);
      } else if (action === "pay") {
        if (!accountId) throw new Error("Выберите счёт ДС");
        if (!periodId) throw new Error("Нет выбранного периода ФП");
        await payBill(bill.id, accountId, periodId);
        setDone(`Счёт №${bill.number} оплачен — период оплаты: ${period ? periodTitle(period) : ""}`);
      }
      await loadBills();
      setDecide(null);
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  const repeat = (bill) => {
    setPrefill({
      number: bill.number, counterpartyId: bill.counterparty?.id || bill.counterparty_id,
      typeId: bill.expense_type_id, locationId: bill.location?.id || bill.location_id,
      amount: String(bill.amount), currencyId: bill.currency?.id,
      isRecurring: true, comment: bill.comment || "",
    });
    setShowForm(true);
  };

  const today = new Date().toISOString().slice(0, 10);
  const filterCounts = useMemo(() => billFilterCounts(bills, today), [bills, today]);
  const filtered = bills.filter((b) => billMatchesFilter(b, filter, today));
  // Цвет чипа-фильтра: статусы — из ST_META, «Просрочено» — danger, «Все» — бренд.
  const filterColor = (key) => key === "overdue" ? C.danger : key === "all" ? C.green : (ST_META[key]?.color || C.sub);

  if (loading || periodsLoading) return <div style={st.empty}><Loader2 size={18} className="spin" /> Загрузка…</div>;

  return (<>
    <section style={st.hero}>
      <div style={st.heroGlow} />
      <div style={st.heroContent}>
        <div style={st.heroTop}>
          <div>
            <div style={st.heroLabel}>{ui.heroLabel}</div>
            <div style={st.heroTitle}>{period ? periodTitle(period) : "Период не создан"}</div>
          </div>
          {/* На телефоне в разделе «Счета поставщиков» кнопка вынесена вниз, под
              показатели (в шапке не помещалась). В «Обязательствах» — как было. */}
          {canSubmit && !(isMobile && isSupply) && (
            <button style={st.btnGreen} className="btn" onClick={openNewBill}>
              <Plus size={15} /> {isMobile ? "Счёт" : ui.addBtn}
            </button>
          )}
        </div>
        <div style={st.heroStats}>
          <Stat label="К оплате" value={fmt(sums.toPay)} unit="TJS" accent />
          <Stat label="Просрочено" value={fmt(sums.overdue)} unit="TJS" />
          <Stat label="Оплачено за неделю" value={fmt(sums.paid)} unit="TJS" />
          {!isSupply && <Stat label="Счетов" value={String(bills.length)} unit="" />}
        </div>
        {canSubmit && isMobile && isSupply && (
          <button style={{ ...st.btnGreen, width: "100%", justifyContent: "center", marginTop: 18 }}
            className="btn" onClick={openNewBill}>
            <Plus size={15} /> {ui.addBtn}
          </button>
        )}
      </div>
    </section>

    {err && <div role="alert" style={{ ...st.reqError, marginBottom: 14 }}><AlertCircle size={15} /> {err}</div>}
    {done && <div style={{ ...st.reqSuccess, marginBottom: 14 }}><CheckCircle2 size={15} /> {done}</div>}
    {sums.overdue > 0 && (
      <div style={st.stockAlert}><AlertTriangle size={16} /> Просрочено {sums.overdueN} счёт(ов) на {fmt(sums.overdue)} TJS — портятся отношения и условия поставщиков</div>
    )}

    <div className="chiptray" style={{ marginBottom: 12 }}>
      {BILL_FILTERS.map(({ key, label }) => {
        const active = filter === key;
        const col = filterColor(key);
        return (
          <button key={key} className="btn"
            style={{
              flexShrink: 0, border: "none", cursor: "pointer", fontFamily: "inherit",
              padding: "6px 13px", borderRadius: 99, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
              color: active ? "#04130a" : col, background: active ? col : "transparent",
            }}
            onClick={() => setFilter(key)}>
            {label} · {filterCounts[key]}
          </button>
        );
      })}
    </div>

    {!filtered.length && (
      <div style={{ ...st.dataCard, ...st.empty }}>
        {bills.length ? "Нет счетов с этим статусом" : ui.emptyText}
      </div>
    )}

    {filtered.map((b) => {
      const m = ST_META[b.status] || {};
      const isExp = !!expanded[b.id];
      const isOverdue = b.due_on && b.due_on < today && !["paid", "rejected"].includes(b.status);
      return (
        <div key={b.id} style={{ ...st.dataCard, marginBottom: 10 }}>
          <div style={{ ...st.locHead, cursor: "pointer" }} className="locHead"
            onClick={() => setExpanded((e) => ({ ...e, [b.id]: !e[b.id] }))}>
            <div style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", flexShrink: 0, background: `${(isOverdue ? C.danger : m.color)}22`, color: isOverdue ? C.danger : m.color }}><FileText size={17} /></div>
            <div style={st.locTitle}>
              <div style={st.locName}>
                №{b.number} · {b.counterparty?.name || "—"}
                {b.is_recurring && <Repeat size={12} style={{ marginLeft: 6, verticalAlign: -1 }} color={C.faint} />}
              </div>
              <div style={st.locCode}>
                {b.expense_type ? `${b.expense_type.code || ""} ${b.expense_type.name}` : ""}
                {b.location ? ` · ${b.location.name}` : ""}
                {b.due_on ? ` · срок ${new Date(b.due_on + "T00:00:00").toLocaleDateString("ru")}` : ""}
                {isOverdue && <b style={{ color: C.danger }}> · просрочен</b>}
              </div>
            </div>
            <div style={st.locRight}>
              <div style={st.locSum}>{fmt(Number(b.amount))} <span style={st.locUnit}>{b.currency?.code || ""}</span></div>
              <span style={{ ...st.weekTag, marginLeft: 0, color: m.color, background: `${m.color}1a` }}>{m.label}</span>
            </div>
            <span style={{ ...st.locChevron, transform: isExp ? "rotate(90deg)" : "none" }}><ChevronRight size={18} /></span>
          </div>

          {isExp && (
            <div style={st.locBody}>
              <div style={{ display: "grid", gap: 10, padding: "4px 2px 8px" }}>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12.5, color: C.sub }}>
                  <span>Дата счёта: <b style={{ color: C.text }}>{new Date(b.issued_on + "T00:00:00").toLocaleDateString("ru")}</b></span>
                  {b.fund && <span>Фонд: <b style={{ color: C.text }}>{b.fund.code} {b.fund.name}</b></span>}
                  {b.approved_period && <span>Период одобрения: <b style={{ color: C.text }}>{shortPeriod(b.approved_period)}</b></span>}
                  {b.paid_period && <span>Период оплаты: <b style={{ color: C.text }}>{shortPeriod(b.paid_period)}</b></span>}
                </div>
                {b.comment && <div style={{ fontSize: 13 }}>{b.comment}</div>}
                <AttachmentsBlock kind="bill" parentId={b.id} attachments={b.attachments}
                  canUpload={canSubmit && !["rejected"].includes(b.status)} profileId={profile.id} onChanged={loadBills} />
                {b.status === "rejected" && b.rejection_reason && (
                  <div style={{ color: C.danger, fontSize: 13 }}>Причина отклонения: {b.rejection_reason}</div>
                )}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {isFinAdmin && b.status === "submitted" && (<>
                    <button style={st.btnGreen} className="btn" disabled={!!busy} onClick={() => setDecide({ bill: b, action: "approve" })}>
                      <Check size={14} /> Одобрить
                    </button>
                    <button style={{ ...st.btnGhost, color: C.danger }} className="btn" disabled={!!busy} onClick={() => setDecide({ bill: b, action: "reject" })}>
                      <Ban size={14} /> Отклонить
                    </button>
                  </>)}
                  {canEditBill(b) && (
                    <button style={st.btnGhost} className="btn" disabled={!!busy} onClick={() => { setErr(""); setEditBill(b); }}
                      title="Изменить счёт — пока он на рассмотрении">
                      <Pencil size={14} /> Изменить
                    </button>
                  )}
                  {canPay && b.status === "approved" && (
                    <button style={st.btnGreen} className="btn" disabled={!!busy} onClick={() => setDecide({ bill: b, action: "pay" })}>
                      <Banknote size={14} /> Оплатить
                    </button>
                  )}
                  {canSubmit && b.is_recurring && b.status === "paid" && (
                    <button style={st.btnGhost} className="btn" disabled={!!busy} onClick={() => repeat(b)}>
                      <Repeat size={14} /> Повторить счёт
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      );
    })}

    {/* Операции со счетами — лента оплат из Реестра выбранной недели (только
        «Счета поставщиков»). Счёт попадает в Реестр только при оплате. */}
    {isSupply && (
      <BillOpsLog C={C} st={st} isMobile={isMobile} payments={payments}
        canCancel={canPay} busy={busy === "cancelPay"} onCancel={openCancelBill} />
    )}

    {cancelBill && (
      <ConfirmModal title="Отменить оплату счёта"
        message={`Оплата счёта №${cancelBill.bill?.number ?? ""} будет отменена: деньги вернутся в фонд и на счёт ДС, счёт снова станет «одобрен». Запись в Реестре сохранится (добавится компенсирующая).`}
        error={cancelErr} tone="danger" confirmLabel="Отменить оплату" busy={busy === "cancelPay"}
        onConfirm={() => doCancelPayment(cancelBill)} onCancel={() => { setCancelBill(null); setCancelErr(""); }} />
    )}

    {(showForm || editBill) && refs && (
      <BillForm st={st} isMobile={isMobile} profile={profile} kind={kind} ui={ui}
        groups={groups} refs={refs} funds={funds} counterparties={counterparties}
        prefill={prefill} editItem={editBill}
        onCounterpartiesChanged={async () => setCounterparties(await fetchCounterparties())}
        onClose={() => { setShowForm(false); setEditBill(null); }}
        onSaved={() => {
          const wasEdit = !!editBill;
          setShowForm(false); setEditBill(null); loadBills();
          setDone(wasEdit ? "Счёт обновлён" : "Счёт добавлен — ожидает одобрения финкомитетом");
        }} />
    )}
    {decide && (
      <BillDecideModal C={C} st={st} decide={decide} funds={funds} accounts={refs?.accounts || []}
        busy={busy === "decide"} onClose={() => setDecide(null)} onConfirm={doDecide} />
    )}
  </>);
}


// ---------------------------------------------------------------- Операции со счетами (лента оплат)
// Внизу вкладки «Счета поставщиков»: лента оплат счетов из Реестра
// (op_type='bill_payment') выбранной недели + отмена оплаты. Вид — как лента Реестра.
function BillOpsLog({ C, st, isMobile, payments, canCancel, busy, onCancel }) {
  const reversedIds = useMemo(
    () => new Set(payments.filter((p) => p.reverses_id != null).map((p) => String(p.reverses_id))),
    [payments],
  );
  return (
    <section style={st.reqSection}>
      <div style={st.reqSectionHead}>
        <ListChecks size={18} color={C.green} />
        <h3 style={st.reqSectionTitle}>Операции со счетами</h3>
        <span style={st.reqSectionSub}>оплаты счетов из Реестра · выбранная неделя</span>
      </div>
      {!payments.length ? (
        <div style={{ ...st.dataCard, ...st.empty }}><ListChecks size={18} /> На этой неделе оплат по счетам нет</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 6 }} className="stagger">
          {payments.map((r) => {
            const isReversal = r.reverses_id != null;
            const isReversed = reversedIds.has(String(r.id));
            const periodClosed = r.period?.status === "closed";
            const tone = isReversal ? C.info : C.warning;
            const v = Number(r.cash_amount ?? r.fund_amount) || 0;
            const desc = [
              r.bill?.number ? `Счёт №${r.bill.number}` : null,
              r.bill?.counterparty?.name,
              r.bill?.expense_type ? `${r.bill.expense_type.code || ""} ${r.bill.expense_type.name}`.trim() : null,
              r.fund ? `${r.fund.code} ${r.fund.name}` : null,
              r.cash_account?.name,
            ].filter(Boolean).join(" · ") || "—";
            const showCancel = canCancel && !isReversal && !isReversed && !periodClosed;
            const showClosedHint = canCancel && !isReversal && !isReversed && periodClosed;
            return (
              <div key={r.id} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                borderRadius: 12, background: C.solid2, border: `1px solid ${C.line}`,
                opacity: isReversed ? 0.6 : 1, flexWrap: isMobile ? "wrap" : "nowrap",
              }} className="frow">
                <span style={{ fontSize: 11, color: C.faint, width: 88, flexShrink: 0 }}>
                  {new Date(r.created_at).toLocaleString("ru", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
                <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 20, whiteSpace: "nowrap", color: tone, background: `${tone}1a`, flexShrink: 0 }}>
                  {isReversal ? "Отмена оплаты" : "Оплата счёта"}
                </span>
                <div style={{ flex: 1, minWidth: isMobile ? "100%" : 0, fontSize: 12.5, color: C.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", order: isMobile ? 5 : 0, textDecoration: isReversed ? "line-through" : "none" }}>
                  {desc}{isReversed ? " · отменена" : ""}
                </div>
                {!isMobile && r.creator && (
                  <span style={{ fontSize: 11, color: C.faint, flexShrink: 0 }}>{r.creator.full_name}</span>
                )}
                <span style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums", fontSize: 14, color: v >= 0 ? C.money : C.danger, flexShrink: 0, marginLeft: "auto" }}>
                  {v >= 0 ? "+" : ""}{fmt(v)}
                </span>
                {showCancel && (
                  <button style={{ ...st.btnGhost, color: C.danger, padding: "7px 10px", flexShrink: 0 }}
                    className="btn" disabled={!!busy} onClick={() => onCancel(r)}
                    title="Отменить оплату — вернуть деньги и счёт в «одобрен»">
                    <RotateCcw size={14} /> {isMobile ? "" : "Отменить"}
                  </button>
                )}
                {showClosedHint && (
                  <span style={{ fontSize: 11, color: C.faint, flexShrink: 0, whiteSpace: "nowrap" }}
                    title="Неделя оплаты закрыта — откройте её в Директиве, чтобы отменить оплату">
                    неделя закрыта
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}


// ---------------------------------------------------------------- Форма счёта
const Field = ({ st, label, full, children }) => (
  <div style={{ ...st.reqField, ...(full ? st.mdFull : {}) }}>
    <span style={st.reqFieldLbl}>{label}</span>
    {children}
  </div>
);

function BillForm({ st, isMobile, profile, kind, ui, groups, refs, funds, counterparties, prefill, editItem, onCounterpartiesChanged, onClose, onSaved }) {
  useScrollLock();
  const isEdit = !!editItem;   // правка существующего счёта (иначе — подача нового)
  const baseCur = refs.currencies.find((c) => c.is_base) || refs.currencies[0];
  const today = new Date().toISOString().slice(0, 10);
  // Правка: поля из самого счёта. Копирование/новый: из prefill/пусто.
  const [f, setF] = useState({
    number: editItem?.number || prefill?.number || "",
    counterpartyId: editItem?.counterparty_id || prefill?.counterpartyId || "",
    typeId: editItem?.expense_type_id || prefill?.typeId || "",
    locationId: editItem?.location_id || prefill?.locationId || "",
    amount: editItem ? String(editItem.amount) : (prefill?.amount || ""),
    currencyId: editItem?.currency?.id || prefill?.currencyId || baseCur?.id || "",
    issuedOn: editItem?.issued_on || today,
    dueOn: editItem?.due_on || "",
    fundId: editItem?.fund?.id || "",
    isRecurring: editItem ? !!editItem.is_recurring : (prefill?.isRecurring || false),
    comment: editItem?.comment || prefill?.comment || "",
  });
  const [newSupplier, setNewSupplier] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e?.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e }));

  const addSupplier = async () => {
    if (busy || !newSupplier.trim()) return;
    setBusy(true); setErr("");
    try {
      const cp = await createCounterparty(newSupplier.trim());
      await onCounterpartiesChanged();
      setF((p) => ({ ...p, counterpartyId: cp.id }));
      setNewSupplier("");
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    if (busy) return;
    setErr("");
    const amount = parseFloat(String(f.amount).replace(",", "."));
    if (!f.number.trim()) return setErr("Укажите номер счёта");
    if (!f.counterpartyId) return setErr(ui.cpRequired);
    if (!f.typeId) return setErr("Выберите статью расхода");
    if (!f.locationId) return setErr("Выберите точку");
    if (!amount || amount <= 0) return setErr("Введите сумму больше нуля");
    setBusy(true);
    try {
      const payload = {
        number: f.number.trim(), counterparty_id: f.counterpartyId,
        expense_type_id: f.typeId, location_id: f.locationId,
        amount, currency_id: f.currencyId,
        issued_on: f.issuedOn, due_on: f.dueOn || null, fund_id: f.fundId || null,
        is_recurring: f.isRecurring, comment: f.comment.trim() || null,
      };
      if (isEdit) {
        await updateBill(editItem.id, payload);
      } else {
        await insertBill({ ...payload, kind, status: "submitted", created_by: profile.id });
      }
      onSaved();
    } catch (e) {
      const msg = e?.message || String(e);
      setErr(msg.includes("row-level security")
        ? (isEdit ? "Нет прав на правку: менять счёт можно, пока он на рассмотрении." : "Нет прав на добавление счёта по этой точке.")
        : msg);
      setBusy(false);
    }
  };

  return (
    <div style={st.mdOverlay} data-modal="1" onClick={onClose}>
      <div style={st.mdCard} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>{isEdit ? `Изменить счёт №${editItem.number}` : ui.formTitle}</div>
          <button style={st.iconBtn} onClick={onClose} aria-label="Закрыть"><X size={17} /></button>
        </div>

        <div style={{ ...st.mdGrid, ...(isMobile ? { gridTemplateColumns: "1fr" } : {}) }}>
          <Field st={st} label="Номер счёта">
            <input style={st.mdInput} className="fin" placeholder="СФ-123" autoFocus
              value={f.number} onChange={set("number")} />
          </Field>
          <Field st={st} label="Дата счёта">
            <input style={st.mdInput} className="fin" type="date" value={f.issuedOn} onChange={set("issuedOn")} />
          </Field>

          <Field st={st} label={ui.cpLabel} full>
            <select style={st.mdSelect} className="fin" value={f.counterpartyId} onChange={set("counterpartyId")}>
              <option value="">— выберите —</option>
              {counterparties.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <input style={{ ...st.mdInput, flex: 1 }} className="fin" placeholder={ui.newCpPlaceholder}
                value={newSupplier} onChange={(e) => setNewSupplier(e.target.value)} />
              <button style={{ ...st.btnGhost, whiteSpace: "nowrap" }} className="btn" onClick={addSupplier} disabled={busy || !newSupplier.trim()}>
                <Plus size={14} /> Добавить
              </button>
            </div>
          </Field>

          <Field st={st} label="Статья расхода (РД)" full>
            <select style={st.mdSelect} className="fin" value={f.typeId} onChange={set("typeId")}>
              <option value="">— выберите —</option>
              {groups.map((g) => (
                <optgroup key={g.root.id} label={`${g.root.code || ""} ${g.root.name}`}>
                  {g.leaves.map((l) => <option key={l.id} value={l.id}>{l.code ? `${l.code} · ` : ""}{l.name}</option>)}
                </optgroup>
              ))}
            </select>
          </Field>

          <Field st={st} label="Сумма">
            <input style={st.mdInput} className="fin" inputMode="decimal" placeholder="0.00"
              value={f.amount} onChange={set("amount")} />
          </Field>
          <Field st={st} label="Валюта">
            <select style={st.mdSelect} className="fin" value={f.currencyId} onChange={set("currencyId")}>
              {refs.currencies.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </select>
          </Field>

          <Field st={st} label="Точка">
            <select style={st.mdSelect} className="fin" value={f.locationId} onChange={set("locationId")}>
              <option value="">— выберите —</option>
              {refs.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
          <Field st={st} label="Срок оплаты">
            <input style={st.mdInput} className="fin" type="date" value={f.dueOn} onChange={set("dueOn")} />
          </Field>

          <Field st={st} label="Фонд-источник (предложение)" full>
            <select style={st.mdSelect} className="fin" value={f.fundId} onChange={set("fundId")}>
              <option value="">—</option>
              {funds.map((fd) => <option key={fd.id} value={fd.id}>{fd.code} — {fd.name} ({fmt(Number(fd.balance))})</option>)}
            </select>
          </Field>

          <Field st={st} label="Комментарий" full>
            <input style={st.mdInput} className="fin" placeholder="За что счёт, примечание…"
              value={f.comment} onChange={set("comment")} />
          </Field>

          <label style={{ ...st.mdCheck, ...st.mdFull }}>
            <input type="checkbox" checked={f.isRecurring} onChange={set("isRecurring")} />
            {ui.recurringLabel}
          </label>
        </div>

        {err && <div role="alert" style={st.reqError}><AlertCircle size={15} /> {err}</div>}

        <div style={st.mdActions}>
          <button style={st.btnGhost} className="btn" onClick={onClose}>Отмена</button>
          <button style={{ ...st.btnGreen, opacity: busy ? 0.7 : 1 }} className="btn" onClick={submit} disabled={busy}>
            {busy ? <Loader2 size={15} className="spin" /> : isEdit ? <Check size={15} /> : <FileText size={15} />} {isEdit ? "Сохранить" : "Подать счёт"}
          </button>
        </div>
      </div>
    </div>
  );
}


// ---------------------------------------------------------------- Одобрение / отклонение / оплата
function BillDecideModal({ C, st, decide, funds, accounts, busy, onClose, onConfirm }) {
  useScrollLock();
  const { bill, action } = decide;
  const [fundId, setFundId] = useState(bill.fund?.id || "");
  const [reason, setReason] = useState("");
  const [accountId, setAccountId] = useState("");
  const titles = { approve: "Одобрить счёт", reject: "Отклонить счёт", pay: "Оплатить счёт" };
  const accs = accounts.filter((a) => a.currency_id === bill.currency?.id);

  return (
    <div style={st.mdOverlay} data-modal="1" onClick={onClose}>
      <div style={{ ...st.mdCard, width: "min(440px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>{titles[action]} №{bill.number}</div>
          <button style={st.iconBtn} onClick={onClose} aria-label="Закрыть"><X size={17} /></button>
        </div>

        <div style={{ ...st.reqField, marginBottom: 12 }}>
          <span style={st.reqFieldLbl}>{bill.counterparty?.name}</span>
          <div style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
            {fmt(Number(bill.amount))} <span style={st.locUnit}>{bill.currency?.code}</span>
          </div>
        </div>

        {action === "approve" && (
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Фонд-источник</span>
            <select style={st.mdSelect} className="fin" value={fundId} onChange={(e) => setFundId(e.target.value)}>
              <option value="">— выберите —</option>
              {funds.map((fd) => <option key={fd.id} value={fd.id}>{fd.code} — {fd.name} ({fmt(Number(fd.balance))})</option>)}
            </select>
          </div>
        )}
        {action === "reject" && (
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Причина отклонения</span>
            <textarea style={{ ...st.mdInput, minHeight: 64, resize: "vertical", fontFamily: "inherit" }} className="fin"
              value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        )}
        {action === "pay" && (
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Счёт ДС — откуда платим</span>
            <select style={st.mdSelect} className="fin" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">{accs.length ? "— выберите —" : "Нет счетов в валюте счёта"}</option>
              {accs.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}

        <div style={st.mdActions}>
          <button style={st.btnGhost} className="btn" onClick={onClose}>Отмена</button>
          <button style={{ ...(action === "reject" ? { ...st.btnGhost, color: C.danger } : st.btnGreen), opacity: busy ? 0.7 : 1 }} className="btn"
            disabled={busy} onClick={() => onConfirm({ bill, action, fundId, reason, accountId })}>
            {busy ? <Loader2 size={15} className="spin" /> : action === "pay" ? <Banknote size={15} /> : action === "reject" ? <Ban size={15} /> : <Check size={15} />}
            {" "}{titles[action].split(" ")[0]}
          </button>
        </div>
      </div>
    </div>
  );
}
