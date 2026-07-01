import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Banknote, Loader2, AlertCircle, CheckCircle2, Plus, X, Ban, ChevronRight, CalendarDays, PartyPopper, Receipt, Undo2, Printer, AlertTriangle, ListChecks } from "lucide-react";
import { Stat } from "../../components/common";
import { AttachmentsBlock } from "../../components/AttachmentsBlock";
import { useTheme } from "../../theme/theme";
import { useScrollLock } from "../../hooks/useScrollLock";
import { useActionFeedback } from "../../hooks/useActionFeedback";
import { fmt } from "../../utils/format";
import { invoiceDebt, isInvoiceOverdue, overdueDays, invoiceMatchesFilter, invoiceFilterCounts } from "../../utils/receivables";
import { openInvoicePrint } from "../../utils/invoicePrint";
import { COMPANY } from "../../data/company";
import { usePeriod } from "../../lib/PeriodCtx";
import {
  fetchInvoices, fetchInvoicePayments, insertInvoice, cancelInvoice, payInvoice,
  fetchIncomeTypes, fetchIncomeRefs, fetchCounterparties, createCounterparty, isoDate,
  reverseInvoicePayment, fetchInvoiceAttachments,
} from "../../lib/api";


// ---------------------------------------------------------------- CLIENTS
// Живые данные (ТЗ v2 §4.1.7): банкетные счета клиентов с частичными
// оплатами. Каждая оплата порождает операцию дохода (incomes.invoice_id),
// триггер сам проводит её в Реестр и на счёт ДС. Бронь будущей даты =
// счёт со статусом planned; после первой предоплаты становится issued.

const FILTERS = [["all", "Все"], ["overdue", "Просроченные"], ["planned", "Брони"], ["issued", "В работе"], ["paid", "Оплачены"], ["cancelled", "Отменены"]];
const PAGE = 100;         // размер страницы счетов (gap-map Счета §7)
const OVERDUE_LIMIT = 500; // потолок выборки просроченных; при упоре показываем «есть ещё»

export function Clients() {
  const { C, st, isMobile, profile } = useTheme();
  // Статусы счёта клиента — семантические токены; «бронь» — категориальный акцент.
  const ST_META = {
    planned:   { label: "бронь",      color: C.violet },
    issued:    { label: "выставлен",  color: C.info },
    partial:   { label: "предоплата", color: C.warning },   // производный: issued + есть оплаты
    paid:      { label: "оплачен",    color: C.success },
    cancelled: { label: "отменён",    color: C.danger },
  };
  const { periodId, loading: periodsLoading, locationId: ctxLocationId } = usePeriod();
  const isFinAdmin = ["owner", "fin_director"].includes(profile?.role);
  const canPay = isFinAdmin || ["accountant", "location_manager"].includes(profile?.role);
  const canSubmit = ["owner", "fin_director", "accountant", "location_manager", "ops_director"].includes(profile?.role);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  useActionFeedback(done, err);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState({});
  const [atts, setAtts] = useState({});
  const [types, setTypes] = useState([]);
  const [refs, setRefs] = useState(null);
  const [counterparties, setCounterparties] = useState([]);
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [paying, setPaying] = useState(null);
  const [busy, setBusy] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Просроченные счета грузятся отдельной выборкой (не постранично): старые
  // неоплаченные счета — в хвосте списка, и сводка дебиторки не должна
  // зависеть от того, сколько страниц долистал пользователь. Выборка
  // от самых старых мероприятий; при упоре в OVERDUE_LIMIT ставим флаг.
  const [overdueRaw, setOverdueRaw] = useState([]);
  const [overdueCapped, setOverdueCapped] = useState(false);

  // «Эпоха» запроса (образец — Реестр): каждый новый load() её инкрементит,
  // устаревшие ответы (в т.ч. долетевший loadMore после смены точки)
  // отбрасываются — иначе страница старой выборки дописалась бы к новой.
  const reqEpoch = useRef(0);

  // limitOverride — чтобы после действия (оплата/отмена) перезагрузить столько
  // счетов, сколько уже было на экране, а не откатываться к первой странице.
  const load = useCallback(async (limitOverride) => {
    const epoch = ++reqEpoch.current;
    setErr("");
    try {
      const limit = Math.max(PAGE, limitOverride || 0);
      const todayIso = isoDate(new Date());
      const [invs, ovd, tps, refData, cps] = await Promise.all([
        fetchInvoices(ctxLocationId, { limit }),
        fetchInvoices(ctxLocationId, { limit: OVERDUE_LIMIT, overdueBefore: todayIso }),
        fetchIncomeTypes(), fetchIncomeRefs(), fetchCounterparties(),
      ]);
      const ids = [...new Set([...invs, ...ovd].map((i) => i.id))];
      const [pays, attMap] = await Promise.all([fetchInvoicePayments(ids), fetchInvoiceAttachments(ids)]);
      if (epoch !== reqEpoch.current) return; // устаревший ответ
      setInvoices(invs); setOverdueRaw(ovd); setTypes(tps); setRefs(refData); setCounterparties(cps);
      setHasMore(invs.length === limit);
      setOverdueCapped(ovd.length === OVERDUE_LIMIT);
      setPayments(pays); setAtts(attMap);
    } catch (e) {
      if (epoch === reqEpoch.current) setErr("Не удалось загрузить счета: " + (e?.message || e));
    } finally {
      if (epoch === reqEpoch.current) setLoading(false);
    }
  }, [ctxLocationId]);
  useEffect(() => { load(); }, [load]);

  // «Показать ещё» — догружает следующую страницу и дополняет список.
  // Дедупликация по id: вставка нового счёта между страницами сдвигает
  // offset-выборку, и последняя строка страницы может прийти повторно.
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    const epoch = reqEpoch.current;
    setLoadingMore(true);
    try {
      const invs = await fetchInvoices(ctxLocationId, { limit: PAGE, offset: invoices.length });
      const ids = invs.map((i) => i.id);
      const [pays, attMap] = await Promise.all([fetchInvoicePayments(ids), fetchInvoiceAttachments(ids)]);
      if (epoch !== reqEpoch.current) return; // точка сменилась во время подгрузки
      setInvoices((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        return [...prev, ...invs.filter((i) => !seen.has(i.id))];
      });
      setPayments((prev) => ({ ...prev, ...pays }));
      setAtts((prev) => ({ ...prev, ...attMap }));
      setHasMore(invs.length === PAGE);
    } catch (e) { if (epoch === reqEpoch.current) setErr("Не удалось догрузить счета: " + (e?.message || e)); }
    // Сброс безусловный: при смене эпохи (сменили точку во время догрузки) флаг
    // иначе остаётся true навсегда и «Показать ещё» блокируется до перемонтирования.
    finally { setLoadingMore(false); }
  }, [ctxLocationId, invoices.length, loadingMore, hasMore]);

  const paidOf = useCallback((inv) =>
    (payments[inv.id] || []).reduce((a, p) => a + (p.is_return ? -Number(p.amount) : Number(p.amount)), 0),
  [payments]);

  // дерево видов дохода → листья для формы
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

  const today = isoDate(new Date());

  // Просроченная дебиторка (gap-map Счета §12): мероприятие прошло, долг не
  // закрыт. Из полной выборки кандидатов, а не из загруженных страниц.
  const overdueInvoices = useMemo(
    () => overdueRaw.filter((i) => isInvoiceOverdue(i, paidOf(i), today)),
    [overdueRaw, paidOf, today]);

  const sums = useMemo(() => {
    const active = invoices.filter((i) => i.status !== "cancelled");
    const billed = active.reduce((a, i) => a + Number(i.amount), 0);
    const received = active.reduce((a, i) => a + paidOf(i), 0);
    const overdue = overdueInvoices.reduce((a, i) => a + invoiceDebt(Number(i.amount), paidOf(i)), 0);
    return {
      billed, received, debt: billed - received,
      inWork: invoices.filter((i) => ["planned", "issued"].includes(i.status)).length,
      overdue, overdueN: overdueInvoices.length,
    };
  }, [invoices, overdueInvoices, paidOf]);

  const displayStatus = (inv) => {
    if (inv.status === "issued" && paidOf(inv) > 0) return "partial";
    return inv.status;
  };

  const doCancel = async (inv) => {
    if (busy) return;
    if (!window.confirm(`Отменить счёт №${inv.number} (${inv.event_name})?${paidOf(inv) > 0 ? " По счёту уже есть оплаты — они останутся в доходах." : ""}`)) return;
    setBusy(`cancel:${inv.id}`); setErr(""); setDone("");
    try {
      await cancelInvoice(inv.id);
      await load(invoices.length);
      setDone(`Счёт №${inv.number} отменён`);
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  const doPay = async ({ inv, amount, accountId, payTypeId, date }) => {
    if (busy) return;
    setBusy("pay"); setErr(""); setDone("");
    try {
      if (!periodId) throw new Error("Нет выбранного периода ФП — добавьте неделю в шапке");
      await payInvoice({
        invoiceId: inv.id, amount, cashAccountId: accountId,
        paymentTypeId: payTypeId, periodId, receivedOn: date,
      });
      await load(invoices.length);
      setPaying(null);
      setDone(`Оплата ${fmt(amount)} ${inv.currency?.code} принята — операция дохода проведена`);
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  const doReversePayment = async (inv, p) => {
    if (busy) return;
    if (!window.confirm(`Отменить оплату ${fmt(Number(p.amount))} ${inv.currency?.code} по счёту №${inv.number}? Будет проведён возврат — деньги уйдут со счёта ДС.`)) return;
    setBusy(`rev:${p.id}`); setErr(""); setDone("");
    try {
      await reverseInvoicePayment(p.id);
      await load(invoices.length);
      setDone(`Оплата ${fmt(Number(p.amount))} ${inv.currency?.code} отменена — проведён возврат`);
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  // id оплат, у которых уже есть запись-отмена (нельзя отменять повторно)
  const reversedIds = useMemo(() => {
    const s = new Set();
    Object.values(payments).forEach((arr) => arr.forEach((p) => { if (p.reverses_income_id) s.add(p.reverses_income_id); }));
    return s;
  }, [payments]);

  // Фильтр «Просроченные» показывает отдельную (полную) выборку кандидатов,
  // остальные фильтры — по загруженным страницам.
  const filtered = filter === "overdue" ? overdueInvoices
    : invoices.filter((i) => invoiceMatchesFilter(i, filter, paidOf(i), today));

  // Счётчики чипов одним проходом; overdue — из полной выборки.
  const chipCounts = useMemo(() => {
    const counts = invoiceFilterCounts(invoices, paidOf, today);
    counts.overdue = overdueInvoices.length;
    return counts;
  }, [invoices, overdueInvoices, paidOf, today]);

  if (loading || periodsLoading) return <div style={st.empty}><Loader2 size={18} className="spin" /> Загрузка…</div>;

  return (<>
    <section style={st.hero}>
      <div style={st.heroGlow} />
      <div style={st.heroContent}>
        <div style={st.heroTop}>
          <div>
            <div style={st.heroLabel}>Счета клиентам · банкеты и мероприятия</div>
            <div style={st.heroTitle}>Банкеты в работе: {sums.inWork}</div>
          </div>
          {canSubmit && (
            <button style={st.btnGreen} className="btn" onClick={() => setShowForm(true)}>
              <Plus size={15} /> {isMobile ? "Счёт" : "Выставить счёт"}
            </button>
          )}
        </div>
        <div style={st.heroStats}>
          <Stat label="Выставлено" value={fmt(sums.billed)} unit="TJS" />
          <Stat label="Получено" value={fmt(sums.received)} unit="TJS" accent />
          <Stat label="Осталось собрать" value={fmt(sums.debt)} unit="TJS" />
          <Stat label="Просрочено" value={fmt(sums.overdue) + (overdueCapped ? "+" : "")} unit="TJS" tone={sums.overdue > 0 ? "danger" : undefined} />
          <Stat label="Счетов" value={String(invoices.length) + (hasMore ? "+" : "")} unit="" />
        </div>
        {hasMore && (
          <div style={{ fontSize: 11.5, color: C.faint, marginTop: 8 }}>
            Суммы «Выставлено / Получено / Осталось собрать» — по загруженным счетам («Показать ещё» внизу); «Просрочено» — по всем.
          </div>
        )}
      </div>
    </section>

    {err && <div role="alert" style={{ ...st.reqError, marginBottom: 14 }}><AlertCircle size={15} /> {err}</div>}
    {done && <div style={{ ...st.reqSuccess, marginBottom: 14 }}><CheckCircle2 size={15} /> {done}</div>}

    {sums.overdue > 0 && (
      <div style={st.stockAlert}><AlertTriangle size={16} /> Просроченная дебиторка: {sums.overdueN} счёт(ов) на {fmt(sums.overdue)} TJS — мероприятия прошли, деньги не собраны{overdueCapped ? ` (показаны первые ${OVERDUE_LIMIT} самых давних — есть ещё)` : ""}</div>
    )}

    <div className="chiptray" style={{ marginBottom: 12 }}>
      {FILTERS.map(([key, label]) => {
        const active = filter === key;
        const col = key === "overdue" ? C.danger : (ST_META[key]?.color || C.green);
        // Для статус-чипов при недогруженных страницах count неполный — помечаем «+»
        const count = chipCounts[key] + (key !== "overdue" && hasMore ? "+" : "");
        return (
          <button key={key} className="btn"
            style={{
              flexShrink: 0, border: "none", cursor: "pointer", fontFamily: "inherit",
              padding: "6px 13px", borderRadius: 99, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
              color: active ? "#04130a" : col, background: active ? col : "transparent",
            }}
            onClick={() => setFilter(key)}>
            {label} · {count}
          </button>
        );
      })}
    </div>

    {!filtered.length && (
      <div style={{ ...st.locCard, ...st.empty }}>
        {invoices.length ? "Нет счетов с этим статусом" : "Счетов пока нет — выставите первый банкетный счёт кнопкой выше"}
      </div>
    )}

    {filtered.map((inv) => {
      const paid = paidOf(inv);
      const rest = Number(inv.amount) - paid;
      const pct = Math.min(100, Math.round((paid / Number(inv.amount)) * 100));
      const code = displayStatus(inv);
      const m = ST_META[code];
      const isExp = !!expanded[inv.id];
      const pays = payments[inv.id] || [];
      return (
        <div key={inv.id} style={{ ...st.locCard, marginBottom: 10, opacity: inv.status === "cancelled" ? 0.6 : 1 }}>
          <div style={{ ...st.locHead, cursor: "pointer" }} className="locHead"
            onClick={() => setExpanded((e) => ({ ...e, [inv.id]: !e[inv.id] }))}>
            <div style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", flexShrink: 0, background: `${m.color}22`, color: m.color }}><Receipt size={17} /></div>
            <div style={st.locTitle}>
              <div style={st.locName}>№{inv.number} · {inv.counterparty?.name || "—"}</div>
              <div style={st.locCode}>
                <PartyPopper size={11} style={{ verticalAlign: -1, marginRight: 3 }} />
                {inv.event_name}
                {inv.hall ? ` · ${inv.hall}` : ""}
                {inv.event_on ? ` · ${new Date(inv.event_on + "T00:00:00").toLocaleDateString("ru")}` : ""}
                {inv.location ? ` · ${inv.location.name}` : ""}
                {isInvoiceOverdue(inv, paid, today) && <b style={{ color: C.danger }}> · просрочен {overdueDays(inv.event_on, today)} дн.</b>}
              </div>
              {/* прогресс оплат */}
              <div style={{ ...st.bar, marginTop: 6, maxWidth: 260 }}>
                <div style={{ ...st.barFill, width: `${pct}%`, background: pct >= 100 ? C.green : C.warning }} />
              </div>
            </div>
            <div style={st.locRight}>
              <div style={st.locSum}>{fmt(Number(inv.amount))} <span style={st.locUnit}>{inv.currency?.code}</span></div>
              <div style={{ fontSize: 11.5, color: rest > 0.009 ? C.warning : C.green, fontWeight: 700 }}>
                {rest > 0.009 ? `долг ${fmt(rest)}` : "оплачен"}
              </div>
              <span style={{ ...st.weekTag, marginLeft: 0, color: m.color, background: `${m.color}1a` }}>{m.label}</span>
            </div>
            <span style={{ ...st.locChevron, transform: isExp ? "rotate(90deg)" : "none" }}><ChevronRight size={18} /></span>
          </div>

          {isExp && (
            <div style={st.locBody}>
              <div style={{ display: "grid", gap: 10, padding: "4px 2px 8px" }}>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12.5, color: C.sub }}>
                  <span>Вид дохода: <b style={{ color: C.text }}>{inv.income_type ? `${inv.income_type.code || ""} ${inv.income_type.name}` : "—"}</b></span>
                  <span>Оплачено: <b style={{ color: C.money }}>{fmt(paid)}</b></span>
                  <span>Остаток: <b style={{ color: rest > 0.009 ? C.warning : C.green }}>{fmt(rest)}</b></span>
                </div>
                {inv.comment && <div style={{ fontSize: 13 }}>{inv.comment}</div>}

                {pays.length > 0 && (
                  <div style={{ display: "grid", gap: 5 }}>
                    {pays.map((p) => {
                      const isReversed = reversedIds.has(p.id);
                      const canReverse = canPay && !p.is_return && !isReversed && inv.status !== "cancelled";
                      return (
                        <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, fontSize: 12.5, padding: "7px 10px", borderRadius: 8, background: C.panel2, border: `1px solid ${C.line}`, opacity: isReversed ? 0.6 : 1 }}>
                          <span style={{ color: C.sub }}>
                            <CalendarDays size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
                            {new Date(p.received_on + "T00:00:00").toLocaleDateString("ru")}
                            {p.cash_account ? ` · ${p.cash_account.name}` : ""}
                            {p.payment_type ? ` · ${p.payment_type.name}` : ""}
                            {p.is_return ? " · возврат" : ""}
                            {isReversed ? " · отменена" : ""}
                          </span>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                            <b style={{ color: p.is_return ? C.danger : C.green, fontVariantNumeric: "tabular-nums" }}>
                              {p.is_return ? "−" : "+"}{fmt(Number(p.amount))}
                            </b>
                            {canReverse && (
                              <button style={{ ...st.iconBtn, width: 26, height: 26, color: C.danger }} className="btn"
                                title="Отменить оплату" aria-label="Отменить оплату"
                                disabled={!!busy} onClick={() => doReversePayment(inv, p)}>
                                {busy === `rev:${p.id}` ? <Loader2 size={13} className="spin" /> : <Undo2 size={13} />}
                              </button>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                <AttachmentsBlock kind="invoice" parentId={inv.id} attachments={atts[inv.id] || []}
                  canUpload={canSubmit} profileId={profile.id} onChanged={load} />

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button style={st.btnGhost} className="btn"
                    onClick={() => { setErr(""); setDone(""); const ok = openInvoicePrint(inv, COMPANY, paid); if (!ok) setErr("Разрешите всплывающие окна, чтобы открыть печать счёта"); }}>
                    <Printer size={14} /> Печать счёта
                  </button>
                  {canPay && !["paid", "cancelled"].includes(inv.status) && (
                    <button style={st.btnGreen} className="btn" disabled={!!busy} onClick={() => setPaying(inv)}>
                      <Banknote size={14} /> Принять оплату
                    </button>
                  )}
                  {isFinAdmin && !["cancelled"].includes(inv.status) && (
                    <button style={{ ...st.btnGhost, color: C.danger }} className="btn" disabled={!!busy} onClick={() => doCancel(inv)}>
                      {busy === `cancel:${inv.id}` ? <Loader2 size={14} className="spin" /> : <Ban size={14} />} Отменить
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      );
    })}

    {hasMore && filter !== "overdue" && (
      <div style={{ textAlign: "center", marginTop: 4 }}>
        <button className="btn" style={st.btnGhost} onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? <Loader2 size={15} className="spin" /> : <ListChecks size={15} />}
          {loadingMore ? " Загрузка…" : " Показать ещё"}
        </button>
      </div>
    )}

    {showForm && refs && (
      <InvoiceForm st={st} isMobile={isMobile} profile={profile}
        groups={groups} refs={refs} counterparties={counterparties}
        onCounterpartiesChanged={async () => setCounterparties(await fetchCounterparties())}
        onClose={() => setShowForm(false)}
        onSaved={() => { setShowForm(false); load(invoices.length + 1); setDone("Счёт выставлен"); }} />
    )}
    {paying && refs && (
      <PayModal C={C} st={st} inv={paying} rest={Number(paying.amount) - paidOf(paying)}
        accounts={refs.accounts} payTypes={refs.payTypes}
        busy={busy === "pay"} onClose={() => setPaying(null)} onConfirm={doPay} />
    )}
  </>);
}


// ---------------------------------------------------------------- Форма счёта
const Field = ({ st, label, full, children }) => (
  <div style={{ ...st.reqField, ...(full ? st.mdFull : {}) }}>
    <span style={st.reqFieldLbl}>{label}</span>
    {children}
  </div>
);

function InvoiceForm({ st, isMobile, profile, groups, refs, counterparties, onCounterpartiesChanged, onClose, onSaved }) {
  useScrollLock();
  const baseCur = refs.currencies.find((c) => c.is_base) || refs.currencies[0];
  const [f, setF] = useState({
    counterpartyId: "", eventName: "", hall: "", eventOn: "",
    locationId: "", typeId: "", amount: "", currencyId: baseCur?.id || "",
    isPlanned: false, comment: "",
  });
  const [newClient, setNewClient] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e?.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e }));

  const addClient = async () => {
    if (busy || !newClient.trim()) return;
    setBusy(true); setErr("");
    try {
      const cp = await createCounterparty(newClient.trim(), { isSupplier: false });
      await onCounterpartiesChanged();
      setF((p) => ({ ...p, counterpartyId: cp.id }));
      setNewClient("");
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    if (busy) return;
    setErr("");
    const amount = parseFloat(String(f.amount).replace(",", "."));
    if (!f.counterpartyId) return setErr("Выберите клиента");
    if (!f.eventName.trim()) return setErr("Укажите мероприятие (свадьба, юбилей…)");
    if (!f.locationId) return setErr("Выберите точку");
    if (!f.typeId) return setErr("Выберите вид дохода — по нему будут проводиться оплаты");
    if (!amount || amount <= 0) return setErr("Введите сумму больше нуля");
    setBusy(true);
    try {
      await insertInvoice({
        counterparty_id: f.counterpartyId, event_name: f.eventName.trim(),
        hall: f.hall.trim() || null, event_on: f.eventOn || null,
        location_id: f.locationId, income_type_id: f.typeId,
        amount, currency_id: f.currencyId,
        status: f.isPlanned ? "planned" : "issued",
        comment: f.comment.trim() || null, created_by: profile.id,
      });
      onSaved();
    } catch (e) {
      const msg = e?.message || String(e);
      setErr(msg.includes("row-level security") ? "Нет прав на выставление счёта по этой точке." : msg);
      setBusy(false);
    }
  };

  return (
    <div style={st.mdOverlay} data-modal="1" onClick={onClose}>
      <div style={st.mdCard} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>Счёт клиенту · банкет</div>
          <button style={st.iconBtn} onClick={onClose} aria-label="Закрыть"><X size={17} /></button>
        </div>

        <div style={{ ...st.mdGrid, ...(isMobile ? { gridTemplateColumns: "1fr" } : {}) }}>
          <Field st={st} label="Клиент" full>
            <select style={st.mdSelect} className="fin" value={f.counterpartyId} onChange={set("counterpartyId")} autoFocus>
              <option value="">— выберите —</option>
              {counterparties.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <input style={{ ...st.mdInput, flex: 1 }} className="fin" placeholder="…или новый клиент"
                value={newClient} onChange={(e) => setNewClient(e.target.value)} />
              <button style={{ ...st.btnGhost, whiteSpace: "nowrap" }} className="btn" onClick={addClient} disabled={busy || !newClient.trim()}>
                <Plus size={14} /> Добавить
              </button>
            </div>
          </Field>

          <Field st={st} label="Мероприятие">
            <input style={st.mdInput} className="fin" placeholder="Свадьба, юбилей, оши…"
              value={f.eventName} onChange={set("eventName")} />
          </Field>
          <Field st={st} label="Зал">
            <input style={st.mdInput} className="fin" placeholder="Большой зал…"
              value={f.hall} onChange={set("hall")} />
          </Field>

          <Field st={st} label="Дата мероприятия">
            <input style={st.mdInput} className="fin" type="date" value={f.eventOn} onChange={set("eventOn")} />
          </Field>
          <Field st={st} label="Точка">
            <select style={st.mdSelect} className="fin" value={f.locationId} onChange={set("locationId")}>
              <option value="">— выберите —</option>
              {refs.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>

          <Field st={st} label="Вид дохода (для оплат)" full>
            <select style={st.mdSelect} className="fin" value={f.typeId} onChange={set("typeId")}>
              <option value="">— выберите —</option>
              {groups.map((g) => (
                <optgroup key={g.root.id} label={`${g.root.code || ""} ${g.root.name}`}>
                  {g.leaves.map((l) => <option key={l.id} value={l.id}>{l.code ? `${l.code} · ` : ""}{l.name}</option>)}
                </optgroup>
              ))}
            </select>
          </Field>

          <Field st={st} label="Сумма счёта">
            <input style={st.mdInput} className="fin" inputMode="decimal" placeholder="0.00"
              value={f.amount} onChange={set("amount")} />
          </Field>
          <Field st={st} label="Валюта">
            <select style={st.mdSelect} className="fin" value={f.currencyId} onChange={set("currencyId")}>
              {refs.currencies.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </select>
          </Field>

          <Field st={st} label="Комментарий" full>
            <input style={st.mdInput} className="fin" placeholder="Меню, особые условия…"
              value={f.comment} onChange={set("comment")} />
          </Field>

          <label style={{ ...st.mdCheck, ...st.mdFull }}>
            <input type="checkbox" checked={f.isPlanned} onChange={set("isPlanned")} />
            Бронь будущей даты (планируемый счёт — станет «выставлен» после первой предоплаты)
          </label>
        </div>

        {err && <div role="alert" style={st.reqError}><AlertCircle size={15} /> {err}</div>}

        <div style={st.mdActions}>
          <button style={st.btnGhost} className="btn" onClick={onClose}>Отмена</button>
          <button style={{ ...st.btnGreen, opacity: busy ? 0.7 : 1 }} className="btn" onClick={submit} disabled={busy}>
            {busy ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} Выставить счёт
          </button>
        </div>
      </div>
    </div>
  );
}


// ---------------------------------------------------------------- Приём оплаты
function PayModal({ C, st, inv, rest, accounts, payTypes, busy, onClose, onConfirm }) {
  useScrollLock();
  const [amount, setAmount] = useState(String(Math.round(rest * 100) / 100));
  const [accountId, setAccountId] = useState("");
  const [payTypeId, setPayTypeId] = useState("");
  const [date, setDate] = useState(isoDate(new Date()));
  const [err, setErr] = useState("");
  const accs = accounts.filter((a) => a.currency_id === inv.currency?.id);
  const a = parseFloat(String(amount).replace(",", ".")) || 0;

  const confirm = () => {
    setErr("");
    if (a <= 0) return setErr("Введите сумму больше нуля");
    if (a > rest + 0.009) return setErr(`Долг по счёту ${fmt(rest)} — нельзя принять больше`);
    if (!accountId) return setErr(accs.length ? "Выберите счёт ДС — куда пришли деньги" : "Нет счетов ДС в валюте счёта");
    if (!payTypeId) return setErr("Выберите способ оплаты");
    onConfirm({ inv, amount: a, accountId, payTypeId, date });
  };

  return (
    <div style={st.mdOverlay} data-modal="1" onClick={onClose}>
      <div style={{ ...st.mdCard, width: "min(440px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>Оплата · №{inv.number} {inv.counterparty?.name}</div>
          <button style={st.iconBtn} onClick={onClose} aria-label="Закрыть"><X size={17} /></button>
        </div>

        <div style={{ fontSize: 13, color: C.sub, marginBottom: 12 }}>
          {inv.event_name} · долг <b style={{ color: C.text }}>{fmt(rest)}</b> {inv.currency?.code}
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Сумма (можно частично — предоплата)</span>
            <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
              onWheel={(e) => e.target.blur()} style={{ ...st.numInput, width: "100%" }} autoFocus />
          </div>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Счёт ДС — куда пришли деньги</span>
            <select style={st.mdSelect} className="fin" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">{accs.length ? "— выберите —" : "Нет счетов в валюте счёта"}</option>
              {accs.map((acc) => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
            </select>
          </div>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Способ оплаты</span>
            <select style={st.mdSelect} className="fin" value={payTypeId} onChange={(e) => setPayTypeId(e.target.value)}>
              <option value="">— выберите —</option>
              {payTypes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Дата поступления</span>
            <input style={st.mdInput} className="fin" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        {err && <div role="alert" style={st.reqError}><AlertCircle size={15} /> {err}</div>}

        <div style={st.mdActions}>
          <button style={st.btnGhost} className="btn" onClick={onClose}>Отмена</button>
          <button style={{ ...st.btnGreen, opacity: busy ? 0.7 : 1 }} className="btn" onClick={confirm} disabled={busy}>
            {busy ? <Loader2 size={15} className="spin" /> : <Banknote size={15} />} Принять оплату
          </button>
        </div>
      </div>
    </div>
  );
}
