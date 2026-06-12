import { useState, useEffect, useCallback, useMemo } from "react";
import { ClipboardList, FileText, Check, Ban, Banknote, Loader2, AlertCircle, CheckCircle2, ChevronRight, X, Network } from "lucide-react";
import { Stat } from "../../components/common";
import { useTheme } from "../../theme/theme";
import { fmt } from "../../utils/format";
import { usePeriod, periodTitle } from "../../lib/PeriodCtx";
import {
  fetchRequests, decideRequest, payRequest,
  fetchBills, decideBill, payBill,
  fetchFunds, fetchIncomeRefs,
} from "../../lib/api";


// ---------------------------------------------------------------- REQUESTS
// Экран финкомитета (ТЗ v2 §4.1.5–4.1.6): всё, что ждёт рассмотрения.
// Счета поставщиков одобряются приоритетно (выше заявок); заявки
// сгруппированы по отделениям оргсхемы (отделение берётся от поста
// заявителя). Действия те же, что в Расходах/Счетах — общие API-функции.

const ST_META = {
  submitted: { label: "подана",           color: "#e8911c" },
  planning:  { label: "на планировании",  color: "#5b8def" },
  approved:  { label: "одобрена",         color: "#7bd88f" },
  rejected:  { label: "отклонена",        color: "#e0463b" },
  paid:      { label: "оплачена",         color: "#2f9e44" },
};

export function Requests() {
  const { C, st, isMobile, profile } = useTheme();
  const { period, periodId, loading: periodsLoading } = usePeriod();
  const isFinAdmin = ["owner", "fin_director"].includes(profile?.role);
  const canPay = isFinAdmin || profile?.role === "accountant";

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const [requests, setRequests] = useState([]);
  const [bills, setBills] = useState([]);
  const [funds, setFunds] = useState([]);
  const [refs, setRefs] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [decide, setDecide] = useState(null);   // { item, itemKind: 'request'|'bill', action }
  const [busy, setBusy] = useState(null);

  const loadStatic = useCallback(async () => {
    try {
      const [fs, refData] = await Promise.all([fetchFunds(), fetchIncomeRefs()]);
      setFunds(fs.sort((a, b) => a.code.localeCompare(b.code, "ru", { numeric: true })));
      setRefs(refData);
    } catch (e) { setErr("Не удалось загрузить справочники: " + (e?.message || e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { loadStatic(); }, [loadStatic]);

  const loadItems = useCallback(async () => {
    try {
      const [reqs, bls] = await Promise.all([fetchRequests(periodId), fetchBills(periodId)]);
      setRequests(reqs); setBills(bls);
    } catch (e) { setErr("Не удалось загрузить заявки: " + (e?.message || e)); }
  }, [periodId]);
  useEffect(() => { if (!periodsLoading) loadItems(); }, [loadItems, periodsLoading]);

  // Заявки по отделениям оргсхемы (отделение — от поста заявителя)
  const byDivision = useMemo(() => {
    const groups = new Map();
    for (const r of requests) {
      const d = r.position?.division;
      const key = d?.id || "none";
      if (!groups.has(key)) groups.set(key, { code: d?.code || "—", name: d?.name || "Без отделения", items: [] });
      groups.get(key).items.push(r);
    }
    return [...groups.values()].sort((a, b) => String(a.code).localeCompare(String(b.code), "ru", { numeric: true }));
  }, [requests]);

  const sums = useMemo(() => {
    const pend = (arr) => arr.filter((x) => ["submitted", "planning"].includes(x.status));
    const appr = (arr) => arr.filter((x) => x.status === "approved");
    const reqPend = pend(requests), billPend = pend(bills);
    return {
      billPendN: billPend.length,
      billPendSum: billPend.reduce((a, b) => a + Number(b.amount), 0),
      reqPendN: reqPend.length,
      reqPendSum: reqPend.reduce((a, r) => a + Number(r.planned_amount), 0),
      toPayN: appr(requests).length + appr(bills).length,
      toPaySum: appr(requests).reduce((a, r) => a + Number(r.planned_amount), 0)
        + appr(bills).reduce((a, b) => a + Number(b.amount), 0),
    };
  }, [requests, bills]);

  const doDecide = async ({ item, itemKind, action, fundId, reason, accountId }) => {
    if (busy) return;
    setBusy("decide"); setErr(""); setDone("");
    try {
      if (!periodId && action !== "reject") throw new Error("Нет выбранного периода ФП");
      const isBill = itemKind === "bill";
      const num = item.number;
      if (action === "approve") {
        if (!fundId) throw new Error("Выберите фонд-источник");
        if (isBill) await decideBill(item.id, { status: "approved", fund_id: fundId, period_approved_id: periodId });
        else await decideRequest(item.id, { status: "approved", fund_id: fundId, period_id: periodId });
        setDone(`${isBill ? "Счёт" : "Заявка"} №${num}: одобрено — фонд ${funds.find((f) => f.id === fundId)?.code}`);
      } else if (action === "reject") {
        if (!reason?.trim()) throw new Error("Укажите причину отклонения");
        if (isBill) await decideBill(item.id, { status: "rejected", rejection_reason: reason.trim() });
        else await decideRequest(item.id, { status: "rejected", rejection_reason: reason.trim() });
        setDone(`${isBill ? "Счёт" : "Заявка"} №${num}: отклонено`);
      } else if (action === "pay") {
        if (!accountId) throw new Error("Выберите счёт ДС");
        if (isBill) await payBill(item.id, accountId, periodId);
        else await payRequest(item.id, accountId, periodId);
        setDone(`${isBill ? "Счёт" : "Заявка"} №${num}: оплачено — расход проведён в Реестре`);
      }
      await loadItems();
      setDecide(null);
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  const toPlanning = async (req) => {
    if (busy) return;
    setBusy("decide"); setErr(""); setDone("");
    try {
      await decideRequest(req.id, { status: "planning" });
      await loadItems();
      setDone(`Заявка №${req.number} взята на планирование`);
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  if (loading || periodsLoading) return <div style={st.empty}><Loader2 size={18} className="spin" /> Загрузка…</div>;

  const Actions = ({ item, itemKind }) => (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {isFinAdmin && ["submitted", "planning"].includes(item.status) && (<>
        {itemKind === "request" && item.status === "submitted" && (
          <button style={st.btnGhost} className="btn" disabled={!!busy} onClick={() => toPlanning(item)}>
            <FileText size={14} /> На планирование
          </button>
        )}
        <button style={st.btnGreen} className="btn" disabled={!!busy} onClick={() => setDecide({ item, itemKind, action: "approve" })}>
          <Check size={14} /> Одобрить
        </button>
        <button style={{ ...st.btnGhost, color: C.danger }} className="btn" disabled={!!busy} onClick={() => setDecide({ item, itemKind, action: "reject" })}>
          <Ban size={14} /> Отклонить
        </button>
      </>)}
      {canPay && item.status === "approved" && (
        <button style={st.btnGreen} className="btn" disabled={!!busy} onClick={() => setDecide({ item, itemKind, action: "pay" })}>
          <Banknote size={14} /> Оплатить
        </button>
      )}
    </div>
  );

  const ItemCard = ({ item, itemKind }) => {
    const m = ST_META[item.status] || {};
    const key = `${itemKind}:${item.id}`;
    const isExp = !!expanded[key];
    const amount = Number(itemKind === "bill" ? item.amount : item.planned_amount);
    return (
      <div style={{ ...st.locCard, marginBottom: 8 }}>
        <div style={{ ...st.locHead, cursor: "pointer" }} className="locHead"
          onClick={() => setExpanded((e) => ({ ...e, [key]: !e[key] }))}>
          <div style={{ ...st.locDot, background: m.color }} />
          <div style={st.locTitle}>
            <div style={st.locName}>
              №{item.number} · {itemKind === "bill"
                ? (item.counterparty?.name || "—")
                : (item.expense_type ? `${item.expense_type.code || ""} ${item.expense_type.name}` : "—")}
            </div>
            <div style={st.locCode}>
              {itemKind === "bill"
                ? `${item.expense_type ? `${item.expense_type.code || ""} ${item.expense_type.name}` : ""}${item.location ? ` · ${item.location.name}` : ""}`
                : `${item.position ? `${item.position.code} ${item.position.name}` : "пост не указан"}${item.requester ? ` · ${item.requester.full_name}` : ""}${item.location ? ` · ${item.location.name}` : ""}`}
            </div>
          </div>
          <div style={st.locRight}>
            <div style={st.locSum}>{fmt(amount)} <span style={st.locUnit}>{item.currency?.code || ""}</span></div>
            <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", flexWrap: "wrap" }}>
              {item.kind === "obligation" && <span style={{ ...st.weekTag, marginLeft: 0, color: "#9c6ade", background: "#9c6ade1a" }}>обязательство</span>}
              <span style={{ ...st.weekTag, marginLeft: 0, color: m.color, background: `${m.color}1a` }}>{m.label}</span>
            </div>
          </div>
          <span style={{ ...st.locChevron, transform: isExp ? "rotate(90deg)" : "none" }}><ChevronRight size={18} /></span>
        </div>
        {isExp && (
          <div style={st.locBody}>
            <div style={{ display: "grid", gap: 10, padding: "4px 2px 8px" }}>
              {itemKind === "request" && (<>
                <CswRow C={C} label="Данные" text={item.csw_data} />
                <CswRow C={C} label="Ситуация" text={item.csw_situation} />
                <CswRow C={C} label="Решение" text={item.csw_solution} />
              </>)}
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12.5, color: C.sub }}>
                {item.fund && <span>Фонд: <b style={{ color: C.text }}>{item.fund.code} {item.fund.name}</b></span>}
                {itemKind === "bill" && item.due_on && <span>Срок: <b style={{ color: C.text }}>{new Date(item.due_on + "T00:00:00").toLocaleDateString("ru")}</b></span>}
                {item.comment && <span>{item.comment}</span>}
                <span>Подано: <b style={{ color: C.text }}>{new Date(item.created_at).toLocaleDateString("ru")}</b></span>
              </div>
              {item.status === "rejected" && item.rejection_reason && (
                <div style={{ color: C.danger, fontSize: 13 }}>Причина отклонения: {item.rejection_reason}</div>
              )}
              <Actions item={item} itemKind={itemKind} />
            </div>
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
            <div style={st.heroLabel}>Заявки · рассмотрение финкомитетом</div>
            <div style={st.heroTitle}>{period ? periodTitle(period) : "Период не создан"}</div>
          </div>
        </div>
        <div style={st.heroStats}>
          <Stat label="Счета к одобрению" value={`${sums.billPendN} · ${fmt(sums.billPendSum)}`} unit="TJS" accent />
          <Stat label="Заявки к одобрению" value={`${sums.reqPendN} · ${fmt(sums.reqPendSum)}`} unit="TJS" />
          <Stat label="К оплате (одобрено)" value={`${sums.toPayN} · ${fmt(sums.toPaySum)}`} unit="TJS" />
          <Stat label="Всего позиций" value={String(requests.length + bills.length)} unit="" />
        </div>
      </div>
    </section>

    {err && <div style={{ ...st.reqError, marginBottom: 14 }}><AlertCircle size={15} /> {err}</div>}
    {done && <div style={{ ...st.reqError, marginBottom: 14, color: C.green, background: `${C.green}1a`, borderColor: `${C.green}44` }}><CheckCircle2 size={15} /> {done}</div>}

    {/* Счета поставщиков — приоритет одобрения над заявками (ТЗ §4.1.6) */}
    <section style={st.reqSection}>
      <div style={st.reqSectionHead}>
        <FileText size={18} color={C.green} />
        <h3 style={st.reqSectionTitle}>Счета поставщиков и обязательства</h3>
        <span style={st.reqSectionSub}>одобряются приоритетно</span>
      </div>
      {!bills.length && <div style={{ ...st.locCard, ...st.empty }}>Счетов на рассмотрении нет</div>}
      {bills.map((b) => <ItemCard key={b.id} item={b} itemKind="bill" />)}
    </section>

    {/* Заявки по отделениям оргсхемы */}
    <section style={st.reqSection}>
      <div style={st.reqSectionHead}>
        <ClipboardList size={18} color={C.green} />
        <h3 style={st.reqSectionTitle}>Заявки от постов</h3>
        <span style={st.reqSectionSub}>по отделениям оргсхемы · формат ЗРС</span>
      </div>
      {!requests.length && <div style={{ ...st.locCard, ...st.empty }}>Заявок на рассмотрении нет — подаются в разделе «Расходы»</div>}
      {byDivision.map((g) => (
        <div key={g.code + g.name} style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, margin: "10px 2px 8px", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, color: C.faint, fontWeight: 700 }}>
            <Network size={13} /> {g.code !== "—" ? `Отделение ${g.code} · ` : ""}{g.name}
            <span style={{ ...st.weekTag, marginLeft: 4 }}>{g.items.length}</span>
          </div>
          {g.items.map((r) => <ItemCard key={r.id} item={r} itemKind="request" />)}
        </div>
      ))}
    </section>

    {decide && (
      <DecideModal C={C} st={st} decide={decide} funds={funds} accounts={refs?.accounts || []}
        busy={busy === "decide"} onClose={() => setDecide(null)} onConfirm={doDecide} />
    )}
  </>);
}

const CswRow = ({ C, label, text }) => (
  <div>
    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: C.faint, fontWeight: 700, marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 13.5, whiteSpace: "pre-wrap" }}>{text || "—"}</div>
  </div>
);


// ---------------------------------------------------------------- Одобрение / отклонение / оплата
function DecideModal({ C, st, decide, funds, accounts, busy, onClose, onConfirm }) {
  const { item, itemKind, action } = decide;
  const [fundId, setFundId] = useState(item.fund?.id || "");
  const [reason, setReason] = useState("");
  const [accountId, setAccountId] = useState("");
  const noun = itemKind === "bill" ? "счёт" : "заявку";
  const titles = { approve: `Одобрить ${noun}`, reject: `Отклонить ${noun}`, pay: `Оплатить ${noun}` };
  const amount = Number(itemKind === "bill" ? item.amount : item.planned_amount);
  const accs = accounts.filter((a) => a.currency_id === item.currency?.id);

  return (
    <div style={st.mdOverlay} onClick={onClose}>
      <div style={{ ...st.mdCard, width: "min(440px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>{titles[action]} №{item.number}</div>
          <button style={st.iconBtn} onClick={onClose}><X size={17} /></button>
        </div>

        <div style={{ ...st.reqField, marginBottom: 12 }}>
          <span style={st.reqFieldLbl}>{itemKind === "bill" ? item.counterparty?.name : item.expense_type?.name}</span>
          <div style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
            {fmt(amount)} <span style={st.locUnit}>{item.currency?.code}</span>
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
              <option value="">{accs.length ? "— выберите —" : "Нет счетов в нужной валюте"}</option>
              {accs.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}

        <div style={st.mdActions}>
          <button style={st.btnGhost} className="btn" onClick={onClose}>Отмена</button>
          <button style={{ ...(action === "reject" ? { ...st.btnGhost, color: C.danger } : st.btnGreen), opacity: busy ? 0.7 : 1 }} className="btn"
            disabled={busy} onClick={() => onConfirm({ item, itemKind, action, fundId, reason, accountId })}>
            {busy ? <Loader2 size={15} className="spin" /> : action === "pay" ? <Banknote size={15} /> : action === "reject" ? <Ban size={15} /> : <Check size={15} />}
            {" "}{titles[action].split(" ")[0]}
          </button>
        </div>
      </div>
    </div>
  );
}
