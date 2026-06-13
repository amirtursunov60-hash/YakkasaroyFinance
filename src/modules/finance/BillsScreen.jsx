import { useState, useEffect, useCallback, useMemo } from "react";
import { Check, Banknote, AlertTriangle, Loader2, AlertCircle, CheckCircle2, Plus, X, Ban, ChevronRight, Repeat, FileText } from "lucide-react";
import { Stat } from "../../components/common";
import { useTheme } from "../../theme/theme";
import { fmt } from "../../utils/format";
import { usePeriod, periodTitle } from "../../lib/PeriodCtx";
import { AttachmentsBlock } from "../../components/AttachmentsBlock";
import {
  fetchBills, insertBill, decideBill, payBill, createCounterparty,
  fetchExpenseTypes, fetchIncomeRefs, fetchFunds, fetchCounterparties,
} from "../../lib/api";


// ---------------------------------------------------------------- BILLS
// Общий экран входящих счетов (ТЗ v2 §4.1.6) с РАЗДЕЛЬНЫМИ периодами
// одобрения и оплаты. Используется двумя разделами (kind):
//  - supply     «Счета поставщиков» — продукты и хозтовары;
//  - obligation «Обязательства» — оборудование, услуги, ремонт.
// Повторяющиеся счета дублируются кнопкой «Повторить». Оплата — fp_pay_bill.

const FILTERS = [["all", "Все"], ["submitted", "Поданы"], ["approved", "Одобрены"], ["paid", "Оплачены"], ["rejected", "Отклонены"]];
const shortPeriod = (p) => p ? `${p.starts_on.slice(8, 10)}.${p.starts_on.slice(5, 7)}–${p.ends_on.slice(8, 10)}.${p.ends_on.slice(5, 7)}` : null;

export function BillsScreen({ kind, ui }) {
  const { C, st, isMobile, profile } = useTheme();
  // Статусы счёта — семантические токены; «на планировании» — категориальный акцент.
  const ST_META = {
    submitted: { label: "подан",            color: C.info },
    planning:  { label: "на планировании",  color: "#9c6ade" },
    approved:  { label: "одобрен",          color: C.warning },
    rejected:  { label: "отклонён",         color: C.danger },
    paid:      { label: "оплачен",          color: C.success },
  };
  const { period, periodId, loading: periodsLoading, locationId: ctxLocationId } = usePeriod();
  const isFinAdmin = ["owner", "fin_director"].includes(profile?.role);
  const canPay = isFinAdmin || profile?.role === "accountant";
  const canSubmit = ["owner", "fin_director", "accountant", "location_manager", "ops_director"].includes(profile?.role);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const [bills, setBills] = useState([]);
  const [types, setTypes] = useState([]);
  const [refs, setRefs] = useState(null);
  const [funds, setFunds] = useState([]);
  const [counterparties, setCounterparties] = useState([]);
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [prefill, setPrefill] = useState(null);   // для «Повторить»
  const [decide, setDecide] = useState(null);     // { bill, action }
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
    try { setBills(await fetchBills(periodId, kind, ctxLocationId)); }
    catch (e) { setErr("Не удалось загрузить счета: " + (e?.message || e)); }
  }, [periodId, kind, ctxLocationId]);
  useEffect(() => { if (!periodsLoading) loadBills(); }, [loadBills, periodsLoading]);

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

  const filtered = filter === "all" ? bills : bills.filter((b) => b.status === filter);

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
          {canSubmit && (
            <button style={st.btnGreen} className="btn" onClick={() => { setPrefill(null); setShowForm(true); }}>
              <Plus size={15} /> {isMobile ? "Счёт" : ui.addBtn}
            </button>
          )}
        </div>
        <div style={st.heroStats}>
          <Stat label="К оплате" value={fmt(sums.toPay)} unit="TJS" accent />
          <Stat label="Просрочено" value={fmt(sums.overdue)} unit="TJS" />
          <Stat label="Оплачено за неделю" value={fmt(sums.paid)} unit="TJS" />
          <Stat label="Счетов" value={String(bills.length)} unit="" />
        </div>
      </div>
    </section>

    {err && <div style={{ ...st.reqError, marginBottom: 14 }}><AlertCircle size={15} /> {err}</div>}
    {done && <div style={{ ...st.reqError, marginBottom: 14, color: C.green, background: `${C.green}1a`, borderColor: `${C.green}44` }}><CheckCircle2 size={15} /> {done}</div>}
    {sums.overdue > 0 && (
      <div style={st.stockAlert}><AlertTriangle size={16} /> Просрочено {sums.overdueN} счёт(ов) на {fmt(sums.overdue)} TJS — портятся отношения и условия поставщиков</div>
    )}

    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
      {FILTERS.map(([key, label]) => (
        <button key={key} className="btn"
          style={{
            ...st.weekTag, cursor: "pointer", border: "none", fontFamily: "inherit", marginLeft: 0,
            padding: "5px 12px", fontSize: 12,
            color: filter === key ? C.bg : (ST_META[key]?.color || C.sub),
            background: filter === key ? (ST_META[key]?.color || C.green) : `${ST_META[key]?.color || C.sub}1a`,
          }}
          onClick={() => setFilter(key)}>
          {label} · {key === "all" ? bills.length : bills.filter((b) => b.status === key).length}
        </button>
      ))}
    </div>

    {!filtered.length && (
      <div style={{ ...st.locCard, ...st.empty }}>
        {bills.length ? "Нет счетов с этим статусом" : ui.emptyText}
      </div>
    )}

    {filtered.map((b) => {
      const m = ST_META[b.status] || {};
      const isExp = !!expanded[b.id];
      const today = new Date().toISOString().slice(0, 10);
      const isOverdue = b.due_on && b.due_on < today && !["paid", "rejected"].includes(b.status);
      return (
        <div key={b.id} style={{ ...st.locCard, marginBottom: 10 }}>
          <div style={{ ...st.locHead, cursor: "pointer" }} className="locHead"
            onClick={() => setExpanded((e) => ({ ...e, [b.id]: !e[b.id] }))}>
            <div style={{ ...st.locDot, background: isOverdue ? C.danger : m.color }} />
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

    {showForm && refs && (
      <BillForm C={C} st={st} isMobile={isMobile} profile={profile} kind={kind} ui={ui}
        groups={groups} refs={refs} funds={funds} counterparties={counterparties}
        prefill={prefill}
        onCounterpartiesChanged={async () => setCounterparties(await fetchCounterparties())}
        onClose={() => setShowForm(false)}
        onSaved={() => { setShowForm(false); loadBills(); setDone("Счёт добавлен — ожидает одобрения финкомитетом"); }} />
    )}
    {decide && (
      <BillDecideModal C={C} st={st} decide={decide} funds={funds} accounts={refs?.accounts || []}
        busy={busy === "decide"} onClose={() => setDecide(null)} onConfirm={doDecide} />
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

function BillForm({ C, st, isMobile, profile, kind, ui, groups, refs, funds, counterparties, prefill, onCounterpartiesChanged, onClose, onSaved }) {
  const baseCur = refs.currencies.find((c) => c.is_base) || refs.currencies[0];
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({
    number: prefill?.number || "", counterpartyId: prefill?.counterpartyId || "",
    typeId: prefill?.typeId || "", locationId: prefill?.locationId || "",
    amount: prefill?.amount || "", currencyId: prefill?.currencyId || baseCur?.id || "",
    issuedOn: today, dueOn: "", fundId: "",
    isRecurring: prefill?.isRecurring || false, comment: prefill?.comment || "",
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
      await insertBill({
        number: f.number.trim(), counterparty_id: f.counterpartyId,
        expense_type_id: f.typeId, location_id: f.locationId,
        amount, currency_id: f.currencyId,
        issued_on: f.issuedOn, due_on: f.dueOn || null, fund_id: f.fundId || null,
        is_recurring: f.isRecurring, comment: f.comment.trim() || null,
        kind, status: "submitted", created_by: profile.id,
      });
      onSaved();
    } catch (e) {
      const msg = e?.message || String(e);
      setErr(msg.includes("row-level security") ? "Нет прав на добавление счёта по этой точке." : msg);
      setBusy(false);
    }
  };

  return (
    <div style={st.mdOverlay} onClick={onClose}>
      <div style={st.mdCard} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>{ui.formTitle}</div>
          <button style={st.iconBtn} onClick={onClose}><X size={17} /></button>
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

        {err && <div style={st.reqError}><AlertCircle size={15} /> {err}</div>}

        <div style={st.mdActions}>
          <button style={st.btnGhost} className="btn" onClick={onClose}>Отмена</button>
          <button style={{ ...st.btnGreen, opacity: busy ? 0.7 : 1 }} className="btn" onClick={submit} disabled={busy}>
            {busy ? <Loader2 size={15} className="spin" /> : <FileText size={15} />} Подать счёт
          </button>
        </div>
      </div>
    </div>
  );
}


// ---------------------------------------------------------------- Одобрение / отклонение / оплата
function BillDecideModal({ C, st, decide, funds, accounts, busy, onClose, onConfirm }) {
  const { bill, action } = decide;
  const [fundId, setFundId] = useState(bill.fund?.id || "");
  const [reason, setReason] = useState("");
  const [accountId, setAccountId] = useState("");
  const titles = { approve: "Одобрить счёт", reject: "Отклонить счёт", pay: "Оплатить счёт" };
  const accs = accounts.filter((a) => a.currency_id === bill.currency?.id);

  return (
    <div style={st.mdOverlay} onClick={onClose}>
      <div style={{ ...st.mdCard, width: "min(440px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>{titles[action]} №{bill.number}</div>
          <button style={st.iconBtn} onClick={onClose}><X size={17} /></button>
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
