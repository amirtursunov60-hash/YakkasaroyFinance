import { useState, useEffect, useCallback, useMemo } from "react";
import { ClipboardList, Check, Ban, Banknote, Loader2, AlertCircle, CheckCircle2, ChevronRight, X, Network, Plus, Copy, Pencil, ListChecks, RotateCcw, MessageSquare, Send } from "lucide-react";
import { Stat, ConfirmModal } from "../../components/common";
import { InfoHint } from "../../components/InfoHint";
import { useTheme } from "../../theme/theme";
import { useScrollLock } from "../../hooks/useScrollLock";
import { fmt, avatarColor } from "../../utils/format";
import { usePeriod, periodTitle } from "../../lib/PeriodCtx";
import { AttachmentsBlock } from "../../components/AttachmentsBlock";
import { MjPanel, MjSwitch } from "../manajet/MjPanel";
import { feedbackSuccess, feedbackError } from "../../lib/feedback";
import {
  fetchRequests, payRequest, fetchRequestPayments, reverseRequestPayment,
  fetchFunds, fetchIncomeRefs,
  fetchExpenseTypes, insertRequest, updateRequest, createPositionAndAssign, fetchMyPositions, fetchOrgDivisions,
  fetchRequestComments, addRequestComment, withdrawRequest,
} from "../../lib/api";
import { requestPrefill } from "./requestCopy";


// ---------------------------------------------------------------- REQUESTS
// Экран финкомитета (ТЗ v2 §4.1.5–4.1.6): всё, что ждёт рассмотрения.
// Счета поставщиков одобряются приоритетно (выше заявок); заявки
// сгруппированы по отделениям оргсхемы (отделение берётся от поста
// заявителя). Действия те же, что в Расходах/Счетах — общие API-функции.

// Статусы заявок/счетов — цвета из семантических токенов темы (работают в обеих темах).
// Вынесено для переиспользования в Директиве (рассмотрение заявок перенесено туда).
export const reqStatusMeta = (C) => ({
  submitted: { label: "подана",          color: C.warning },
  planning:  { label: "на планировании", color: C.info },
  approved:  { label: "одобрена",        color: C.successSoft },
  rejected:  { label: "отклонена",       color: C.danger },
  paid:      { label: "оплачена",        color: C.success },
  withdrawn: { label: "отозвана",        color: C.sub },
});

// «К рассмотрению на ФП» = ждут решения финкомитета (поданные + на планировании).
export const isReviewStatus = (status) => ["submitted", "planning"].includes(status);

// Счётчики заявок по статусам — для чипов-фильтров.
export const requestCounts = (requests) => {
  const c = { all: requests.length, review: 0, approved: 0, rejected: 0, paid: 0, withdrawn: 0 };
  requests.forEach((r) => {
    if (isReviewStatus(r.status)) c.review += 1;
    if (c[r.status] !== undefined) c[r.status] += 1;
  });
  return c;
};

export const matchRequestFilter = (r, filter) =>
  filter === "all" ? true : filter === "review" ? isReviewStatus(r.status) : r.status === filter;

// Чипы-фильтры заявок по статусам (Директива и раздел «Заявки»).
export function RequestStatusChips({ C, counts, filter, setFilter }) {
  const CHIPS = [
    { key: "review",   label: "К рассмотрению на ФП", color: C.warning },
    { key: "approved", label: "Одобрено",            color: C.successSoft },
    { key: "rejected", label: "Отклонено",           color: C.danger },
    { key: "paid",     label: "Оплачено",            color: C.success },
    { key: "withdrawn", label: "Отозвано",           color: C.sub },
    { key: "all",      label: "Все",                 color: C.green },
  ];
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
      {CHIPS.map((ch) => {
        const active = filter === ch.key;
        return (
          <button key={ch.key} className="btn" onClick={() => setFilter(ch.key)}
            style={{ padding: "7px 13px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
              whiteSpace: "nowrap", border: `1px solid ${active ? `${ch.color}66` : C.line}`,
              background: active ? `${ch.color}22` : C.panel2, color: active ? ch.color : C.sub }}>
            {ch.label} · {counts[ch.key] ?? 0}
          </button>
        );
      })}
    </div>
  );
}

export function Requests() {
  const { C, st, isMobile, profile } = useTheme();
  const ST_META = reqStatusMeta(C);
  const { period, periodId, periods, loading: periodsLoading, locationId: ctxLocationId } = usePeriod();
  const isFinAdmin = ["owner", "fin_director"].includes(profile?.role);
  const canPay = isFinAdmin || profile?.role === "accountant";

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const [requests, setRequests] = useState([]);
  const [payments, setPayments] = useState([]);   // оплаты заявок из Реестра — лента внизу
  const [funds, setFunds] = useState([]);
  const [refs, setRefs] = useState(null);
  const [types, setTypes] = useState([]);
  const [myPositions, setMyPositions] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [decide, setDecide] = useState(null);   // { item, itemKind: 'request'|'bill', action }
  const [showForm, setShowForm] = useState(false);
  const [prefillReq, setPrefillReq] = useState(null);       // предзаполнение формы для «Копировать»
  const [editReq, setEditReq] = useState(null);             // заявка в режиме редактирования (своя на рассмотрении)
  const [cancelPay, setCancelPay] = useState(null);         // строка оплаты для отмены (подтверждение)
  const [cancelErr, setCancelErr] = useState("");           // ошибка отмены — показывается в самой модалке
  const [busy, setBusy] = useState(null);
  const [withdrawTarget, setWithdrawTarget] = useState(null); // заявка к отзыву (подтверждение)
  const [withdrawErr, setWithdrawErr] = useState("");          // ошибка отзыва — показывается в самой модалке
  const [reqFilter, setReqFilter] = useState("approved");   // здесь оплачиваем — по умолчанию «Одобрено»
  const [src, setSrc] = useState("ours");                   // источник: наши данные / зеркало ManaJet

  // «Копировать заявку» — открыть форму ЗРС, предзаполненную данными заявки
  // (для быстрого повтора регулярных). Пост — свой, период/точка — из шапки.
  const copyRequest = (item) => {
    setErr("");
    setPrefillReq(requestPrefill(item, myPositions));
    setShowForm(true);
  };

  // Кто может править заявку: своя — пока она «подана» (submitted); финкомитет —
  // любую на рассмотрении. Совпадает с RLS payment_requests (requests_update).
  const canEditReq = (item) =>
    (isFinAdmin && isReviewStatus(item.status)) ||
    (item.requester_id === profile.id && item.status === "submitted");

  const editRequest = (item) => {
    setErr("");
    setEditReq(item);
  };

  // Отозвать можно только свою заявку, пока она «подана» (до решения финкомитета).
  // Совпадает с инвариантом RPC fp_withdraw_request.
  const canWithdraw = (item) =>
    item.requester_id === profile.id && item.status === "submitted";

  const doWithdraw = async () => {
    const item = withdrawTarget;
    if (!item || busy) return;
    setBusy("withdraw"); setWithdrawErr(""); setDone("");
    try {
      await withdrawRequest(item.id);
      setWithdrawTarget(null);
      await loadItems();
      setDone(`Заявка №${item.number} отозвана`);
      feedbackSuccess();
    } catch (e) { setWithdrawErr(e?.message || String(e)); feedbackError(); }
    finally { setBusy(null); }
  };

  // Открыть пустую форму подачи новой заявки (кнопка в шапке / под показателями на телефоне).
  const openNewRequest = () => { setErr(""); setPrefillReq(null); setShowForm(true); };

  const loadStatic = useCallback(async () => {
    try {
      const [fs, refData, list, poss, divs] = await Promise.all([
        fetchFunds(), fetchIncomeRefs(), fetchExpenseTypes(), fetchMyPositions(profile.id), fetchOrgDivisions(),
      ]);
      setFunds(fs.sort((a, b) => a.code.localeCompare(b.code, "ru", { numeric: true })));
      setRefs(refData); setTypes(list); setMyPositions(poss); setDivisions(divs);
    } catch (e) { setErr("Не удалось загрузить справочники: " + (e?.message || e)); }
    finally { setLoading(false); }
  }, [profile.id]);
  useEffect(() => { loadStatic(); }, [loadStatic]);

  // Дерево статей РД (для формы подачи ЗРС)
  const tree = useMemo(() => {
    const byParent = {};
    types.forEach((t) => { (byParent[t.parent_id || "root"] ??= []).push(t); });
    const cmp = (a, b) => (a.code || a.name).localeCompare(b.code || b.name, "ru", { numeric: true });
    Object.values(byParent).forEach((arr) => arr.sort(cmp));
    const attach = (t) => ({ ...t, children: (byParent[t.id] || []).map(attach) });
    return (byParent.root || []).map(attach);
  }, [types]);

  const loadItems = useCallback(async () => {
    try {
      const [reqs, pays] = await Promise.all([
        fetchRequests(periodId, ctxLocationId),
        fetchRequestPayments(ctxLocationId, { periodId }).catch(() => []),
      ]);
      setRequests(reqs); setPayments(pays);
    } catch (e) { setErr("Не удалось загрузить заявки: " + (e?.message || e)); }
  }, [periodId, ctxLocationId]);
  useEffect(() => { if (!periodsLoading) loadItems(); }, [loadItems, periodsLoading]);

  const reqCounts = useMemo(() => requestCounts(requests), [requests]);

  // Заявки по отделениям оргсхемы (отделение — от поста заявителя), с учётом чипа-фильтра
  const byDivision = useMemo(() => {
    const groups = new Map();
    for (const r of requests) {
      if (!matchRequestFilter(r, reqFilter)) continue;
      const d = r.position?.division;
      const key = d?.id || "none";
      if (!groups.has(key)) groups.set(key, { code: d?.code || "—", name: d?.name || "Без отделения", items: [] });
      groups.get(key).items.push(r);
    }
    return [...groups.values()].sort((a, b) => String(a.code).localeCompare(String(b.code), "ru", { numeric: true }));
  }, [requests, reqFilter]);

  const sums = useMemo(() => {
    const pend = (arr) => arr.filter((x) => ["submitted", "planning"].includes(x.status));
    const appr = (arr) => arr.filter((x) => x.status === "approved");
    const reqPend = pend(requests), reqAppr = appr(requests);
    return {
      reqPendN: reqPend.length,
      reqPendSum: reqPend.reduce((a, r) => a + Number(r.planned_amount), 0),
      toPayN: reqAppr.length,
      toPaySum: reqAppr.reduce((a, r) => a + Number(r.planned_amount), 0),
    };
  }, [requests]);

  // На этом экране заявки только ОПЛАЧИВАЮТСЯ (рассмотрение — в Директиве; счета —
  // на своих экранах Поставщики/Обязательства).
  const doDecide = async ({ item, action, accountId, payAmount, payPeriodId }) => {
    if (busy) return;
    setBusy("decide"); setErr(""); setDone("");
    try {
      if (action === "pay") {
        const payWeek = payPeriodId || periodId;
        if (!payWeek) throw new Error("Выберите неделю оплаты");
        if (!accountId) throw new Error("Выберите счёт ДС");
        const amt = payAmount != null && String(payAmount).trim() !== ""
          ? parseFloat(String(payAmount).replace(",", ".")) : null;
        if (amt != null && (!Number.isFinite(amt) || amt <= 0)) throw new Error("Введите сумму оплаты больше нуля");
        await payRequest(item.id, accountId, payWeek, amt);
        setDone(`Заявка №${item.number}: оплата проведена в Реестре`);
      }
      await loadItems();
      setDecide(null);
      feedbackSuccess();
    } catch (e) { setErr(e?.message || String(e)); feedbackError(); }
    finally { setBusy(null); }
  };

  // Открыть подтверждение отмены оплаты (сбрасываем прошлую ошибку модалки).
  const openCancelPay = (row) => { setCancelErr(""); setCancelPay(row); };

  // Отмена оплаты заявки: компенсирующая запись Реестра, заявка → «одобрена».
  // Ошибку показываем в самой модалке (cancelErr), а не только в баннере вверху —
  // лента внизу страницы, верхний баннер оттуда не виден.
  const doCancelPayment = async (row) => {
    if (busy) return;
    setBusy("cancelPay"); setCancelErr(""); setDone("");
    try {
      await reverseRequestPayment(row.id);
      await loadItems();
      setCancelPay(null);
      setDone(`Оплата заявки №${row.request?.number ?? ""} отменена — деньги возвращены, заявка снова одобрена`);
      feedbackSuccess();
    } catch (e) { setCancelErr(e?.message || String(e)); feedbackError(); }
    finally { setBusy(null); }
  };

  if (src === "manajet") return <MjPanel kind="requests" src={src} setSrc={setSrc} />;
  if (loading || periodsLoading) return <div style={st.empty}><Loader2 size={18} className="spin" /> Загрузка…</div>;

  // Заявка-ЗРС: оплата одобренной (рассмотрение — в Директиве), правка своей
  // заявки на рассмотрении и копирование (повтор регулярной). Счета — на своих
  // экранах (Поставщики/Обязательства), в этой вкладке их нет.
  const Actions = ({ item }) => {
    return (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {canPay && item.status === "approved" && (
          <button style={st.btnGreen} className="btn" disabled={!!busy} onClick={() => setDecide({ item, action: "pay" })}>
            <Banknote size={14} /> Оплатить
          </button>
        )}
        {canEditReq(item) && (
          <button style={st.btnGhost} className="btn" disabled={!!busy} onClick={() => editRequest(item)} title="Изменить заявку (неделя и поля ЗРС) — пока она на рассмотрении">
            <Pencil size={14} /> Изменить
          </button>
        )}
        {canWithdraw(item) && (
          <button style={st.btnGhost} className="btn" disabled={!!busy} onClick={() => { setWithdrawErr(""); setWithdrawTarget(item); }} title="Отозвать свою заявку (пока она на рассмотрении)">
            <Ban size={14} /> Отозвать
          </button>
        )}
        <button style={st.btnGhost} className="btn" disabled={!!busy} onClick={() => copyRequest(item)} title="Создать новую заявку с этими же данными">
          <Copy size={14} /> Копировать
        </button>
      </div>
    );
  };

  return (<>
    <MjSwitch src={src} setSrc={setSrc} />
    <section style={st.hero}>
      <div style={st.heroGlow} />
      <div style={st.heroContent}>
        <div style={st.heroTop}>
          <div>
            <div style={st.heroLabel}>Заявки · рассмотрение финкомитетом</div>
            <div style={st.heroTitle}>{period ? periodTitle(period) : "Период не создан"}</div>
          </div>
          {/* На десктопе кнопка справа в шапке; на телефоне она вынесена вниз,
              под показатели (в шапке не помещалась и обрезалась). */}
          {!isMobile && (
            <button style={st.btnGreen} className="btn" onClick={openNewRequest}>
              <Plus size={15} /> Подать заявку (ЗРС)
            </button>
          )}
        </div>
        <div style={st.heroStats}>
          <Stat label="Заявки к одобрению" value={`${sums.reqPendN} · ${fmt(sums.reqPendSum)}`} unit="TJS" accent />
          <Stat label="К оплате (одобрено)" value={`${sums.toPayN} · ${fmt(sums.toPaySum)}`} unit="TJS" />
        </div>
        {isMobile && (
          <button style={{ ...st.btnGreen, width: "100%", justifyContent: "center", marginTop: 18 }}
            className="btn" onClick={openNewRequest}>
            <Plus size={15} /> Подать заявку (ЗРС)
          </button>
        )}
      </div>
    </section>

    {err && <div role="alert" style={{ ...st.reqError, marginBottom: 14 }}><AlertCircle size={15} /> {err}</div>}
    {done && <div style={{ ...st.reqSuccess, marginBottom: 14 }}><CheckCircle2 size={15} /> {done}</div>}

    {/* Заявки по отделениям оргсхемы */}
    <section style={st.reqSection}>
      <div style={st.reqSectionHead}>
        <ClipboardList size={18} color={C.green} />
        <h3 style={st.reqSectionTitle}>Заявки от постов</h3>
        <span style={st.reqSectionSub}>оплата одобренных · рассмотрение — в Директиве</span>
      </div>
      <RequestStatusChips C={C} counts={reqCounts} filter={reqFilter} setFilter={setReqFilter} />
      {!requests.length ? (
        <div style={{ ...st.locCard, ...st.empty }}>Заявок нет — подайте первую кнопкой «Подать заявку (ЗРС)» выше</div>
      ) : byDivision.length === 0 ? (
        <div style={{ ...st.locCard, ...st.empty }}>Нет заявок с таким статусом</div>
      ) : byDivision.map((g) => (
        <div key={g.code + g.name} style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, margin: "10px 2px 8px", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, color: C.faint, fontWeight: 700 }}>
            <Network size={13} /> {g.code !== "—" ? `Отделение ${g.code} · ` : ""}{g.name}
            <span style={{ ...st.weekTag, marginLeft: 4 }}>{g.items.length}</span>
          </div>
          {g.items.map((r) => (
            <ItemCard key={r.id} C={C} st={st} item={r} itemKind="request"
              avatar={<RequesterAvatar requester={r.requester} />}
              isExpanded={!!expanded[`request:${r.id}`]}
              onToggle={() => setExpanded((e) => ({ ...e, [`request:${r.id}`]: !e[`request:${r.id}`] }))}
              statusMeta={ST_META} profileId={profile.id} onAttachmentsChanged={loadItems}>
              <Actions item={r} />
            </ItemCard>
          ))}
        </div>
      ))}
    </section>

    {/* Операции с заявками — лента оплат из Реестра (заявка попадает в Реестр
        только при оплате). Стиль — как лента «Реестра». */}
    <RequestOpsLog C={C} st={st} isMobile={isMobile} payments={payments}
      canCancel={canPay} busy={busy === "cancelPay"} onCancel={openCancelPay} />

    {cancelPay && (
      <ConfirmModal title="Отменить оплату заявки"
        message={`Оплата заявки №${cancelPay.request?.number ?? ""} будет отменена: деньги вернутся в фонд и на счёт ДС, заявка снова станет «одобрена». Запись в Реестре сохранится (добавится компенсирующая).`}
        error={cancelErr} tone="danger" confirmLabel="Отменить оплату" busy={busy === "cancelPay"}
        onConfirm={() => doCancelPayment(cancelPay)} onCancel={() => { setCancelPay(null); setCancelErr(""); }} />
    )}

    {decide && (
      <DecideModal C={C} st={st} decide={decide} funds={funds} accounts={refs?.accounts || []}
        periods={periods} currentPeriodId={periodId}
        busy={busy === "decide"} onClose={() => setDecide(null)} onConfirm={doDecide} />
    )}

    {withdrawTarget && (
      <ConfirmModal title="Отозвать заявку"
        message={`Заявка №${withdrawTarget.number} будет отозвана и снята с рассмотрения финкомитетом. Это не отказ — статус станет «отозвана». При необходимости подайте новую заявку («Копировать»).`}
        error={withdrawErr} tone="warning" confirmLabel="Отозвать" busy={busy === "withdraw"}
        onConfirm={doWithdraw} onCancel={() => { setWithdrawTarget(null); setWithdrawErr(""); }} />
    )}

    {(showForm || editReq) && refs && (
      <RequestForm
        st={st} isMobile={isMobile} profile={profile}
        tree={tree} refs={refs} funds={funds}
        periods={periods} locationId={ctxLocationId} currentPeriodId={periodId}
        myPositions={myPositions} divisions={divisions} prefill={prefillReq} editItem={editReq}
        onPositionsChanged={async () => setMyPositions(await fetchMyPositions(profile.id))}
        onClose={() => { setShowForm(false); setPrefillReq(null); setEditReq(null); }}
        onSaved={() => {
          const wasEdit = !!editReq;
          setShowForm(false); setPrefillReq(null); setEditReq(null); loadItems();
          setDone(wasEdit ? "Заявка обновлена" : prefillReq ? "Копия заявки подана — рассмотрите её ниже" : "Заявка подана — рассмотрите её ниже");
        }}
      />
    )}
  </>);
}


// ---------------------------------------------------------------- Карточка заявки / счёта
// Аватар заявителя для карточки заявки: фото (avatar_url) или инициалы.
// size — сторона в px, round — круглый (иначе скруглённый квадрат).
export function RequesterAvatar({ requester, size = 34, round = false }) {
  const name = requester?.full_name || "?";
  const color = avatarColor(name);
  const initials = (name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
  const base = { width: size, height: size, borderRadius: round ? "50%" : 10, flexShrink: 0 };
  return requester?.avatar_url
    ? <img src={requester.avatar_url} alt={name} style={{ ...base, objectFit: "cover", border: `1px solid ${color}55` }} />
    : <div style={{ ...base, display: "grid", placeItems: "center", background: `${color}33`, color, fontWeight: 800, fontSize: Math.round(size * 0.36), border: `1px solid ${color}55` }}>{initials}</div>;
}

// Раскрывающаяся карточка: шапка (№, статья/контрагент, сумма, статус) и тело
// (ЗРС-поля, вложения, реквизиты). Кнопки действий передаются через children —
// в «Заявках» это рассмотрение счетов, в «Директиве» — рассмотрение заявок.
export function ItemCard({ C, st, item, itemKind, isExpanded, onToggle, statusMeta, profileId, onAttachmentsChanged, avatar, hideFund, children }) {
  const m = statusMeta[item.status] || {};
  // Для заявки в шапке показываем одобренную сумму (если задана), иначе запрошенную.
  const amount = Number(itemKind === "bill" ? item.amount : (item.approved_amount ?? item.planned_amount));
  return (
    <div style={{ ...st.locCard, marginBottom: 8 }}>
      <div style={{ ...st.locHead, cursor: "pointer" }} className="locHead" onClick={onToggle}>
        {avatar || <div style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", flexShrink: 0, background: `${m.color}22`, color: m.color }}><ClipboardList size={17} /></div>}
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
            {item.kind === "obligation" && <span style={{ ...st.weekTag, marginLeft: 0, color: C.violet, background: `${C.violet}1a` }}>обязательство</span>}
            <span style={{ ...st.weekTag, marginLeft: 0, color: m.color, background: `${m.color}1a` }}>{m.label}</span>
          </div>
        </div>
        <span style={{ ...st.locChevron, transform: isExpanded ? "rotate(90deg)" : "none" }}><ChevronRight size={18} /></span>
      </div>
      {isExpanded && (
        <div style={st.locBody}>
          <div style={{ display: "grid", gap: 10, padding: "4px 2px 8px" }}>
            {itemKind === "request" && (<>
              {item.purpose && <CswRow C={C} label="Цель расхода" text={item.purpose} />}
              <CswRow C={C} label="Ситуация" text={item.csw_situation} />
              <CswRow C={C} label="Данные" text={item.csw_data} />
              <CswRow C={C} label="Решение" text={item.csw_solution} />
              {item.tags?.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {item.tags.map((t) => <span key={t} style={{ ...st.weekTag, marginLeft: 0 }}>{t}</span>)}
                </div>
              )}
            </>)}
            {item.attachments?.length > 0 && (
              <AttachmentsBlock kind={itemKind} parentId={item.id} attachments={item.attachments}
                canUpload={false} profileId={profileId} onChanged={onAttachmentsChanged} />
            )}
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12.5, color: C.sub }}>
              {!hideFund && item.fund && <span>Фонд: <b style={{ color: C.text }}>{item.fund.code} {item.fund.name}</b></span>}
              {itemKind === "request" && Number(item.paid_amount) > 0 && item.status !== "paid" && (
                <span>Оплачено: <b style={{ color: C.money }}>{fmt(Number(item.paid_amount))}</b> из {fmt(Number(item.approved_amount ?? item.planned_amount))} {item.currency?.code}</span>
              )}
              {itemKind === "bill" && item.due_on && <span>Срок: <b style={{ color: C.text }}>{new Date(item.due_on + "T00:00:00").toLocaleDateString("ru")}</b></span>}
              {itemKind === "request" && item.period && <span>Неделя заявки: <b style={{ color: C.text }}>{periodTitle(item.period)}</b></span>}
              {itemKind === "request" && item.period_paid && item.period_paid.id !== item.period?.id && (
                <span>Неделя оплаты: <b style={{ color: C.money }}>{periodTitle(item.period_paid)}</b></span>
              )}
              {item.comment && <span>{item.comment}</span>}
              <span>Подано: <b style={{ color: C.text }}>{new Date(item.created_at).toLocaleDateString("ru")}</b></span>
            </div>
            {item.status === "rejected" && item.rejection_reason && (
              <div style={{ color: C.danger, fontSize: 13 }}>Причина отклонения: {item.rejection_reason}</div>
            )}
            {itemKind === "request" && <RequestComments C={C} st={st} requestId={item.id} />}
            {children}
          </div>
        </div>
      )}
    </div>
  );
}


// ---------------------------------------------------------------- Комментарии к заявке
// Тред переписки по заявке (request_comments). Лениво грузится при раскрытии
// карточки. Любой, кто видит заявку, может оставить комментарий (RLS на сервере).
function RequestComments({ C, st, requestId }) {
  const [comments, setComments] = useState(null);   // null = ещё не загружено
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let active = true;
    fetchRequestComments(requestId)
      .then((d) => { if (active) setComments(d); })
      .catch((e) => { if (active) setErr(e?.message || String(e)); });
    return () => { active = false; };
  }, [requestId]);

  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true); setErr("");
    try {
      const added = await addRequestComment(requestId, body);
      setComments((c) => [...(c || []), added]);
      setText("");
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 10, display: "grid", gap: 8 }}>
      <span style={{ ...st.reqFieldLbl, display: "flex", alignItems: "center", gap: 6 }}>
        <MessageSquare size={13} /> Комментарии {comments?.length ? `· ${comments.length}` : ""}
      </span>
      {comments === null ? (
        <span style={{ fontSize: 12, color: C.faint }}><Loader2 size={12} className="spin" /> загрузка…</span>
      ) : comments.length === 0 ? (
        <span style={{ fontSize: 12, color: C.faint }}>Пока нет комментариев</span>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {comments.map((c) => (
            <div key={c.id} style={{ fontSize: 12.5, color: C.sub, background: C.solid2, border: `1px solid ${C.line}`, borderRadius: 10, padding: "7px 10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 2 }}>
                <b style={{ color: C.text, fontSize: 11.5 }}>{c.author?.full_name || "—"}</b>
                <span style={{ color: C.faint, fontSize: 10.5 }}>
                  {new Date(c.created_at).toLocaleString("ru", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{c.body}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <input style={{ ...st.mdInput, flex: 1 }} className="fin" placeholder="Написать комментарий…"
          value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <button style={{ ...st.btnGreen, opacity: busy || !text.trim() ? 0.6 : 1, padding: "9px 12px" }} className="btn"
          disabled={busy || !text.trim()} onClick={send} aria-label="Отправить">
          {busy ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
        </button>
      </div>
      {err && <span style={{ fontSize: 11.5, color: C.danger }}>{err}</span>}
    </div>
  );
}


// ---------------------------------------------------------------- Форма подачи заявки (ЗРС)
const Field = ({ st, label, full, children }) => (
  <div style={{ ...st.reqField, ...(full ? st.mdFull : {}) }}>
    <span style={st.reqFieldLbl}>{label}</span>
    {children}
  </div>
);

function RequestForm({ st, isMobile, profile, tree, refs, funds, periods, locationId, currentPeriodId, myPositions, divisions, prefill, editItem, onPositionsChanged, onClose, onSaved }) {
  useScrollLock();
  const isEdit = !!editItem;   // режим правки существующей заявки (иначе — подача новой)
  // Валюта — базовая (TJS) по умолчанию, в форме не показывается;
  // точка берётся из выбора в шапке приложения (поле в форме убрано).
  const baseCur = refs.currencies.find((c) => c.is_base) || refs.currencies[0];
  // Подать/перенести заявку можно только на открытую неделю — закрытую в значение по
  // умолчанию не подставляем (иначе скрытое значение прошло бы мимо выпадашки).
  const isPeriodOpen = (id) => (periods || []).some((p) => p.id === id && p.status !== "closed");
  // Правка: поля из самой заявки (период оставляем, только если он открыт — иначе
  // нужно выбрать неделю заново). Копирование: из prefill. Новая: пусто/текущая неделя.
  const [f, setF] = useState({
    positionId: editItem?.position_id || prefill?.positionId || myPositions[0]?.id || "",
    typeId: editItem?.expense_type_id || prefill?.typeId || "",
    purpose: editItem?.purpose || prefill?.purpose || "",
    periodId: isEdit
      ? (isPeriodOpen(editItem.period_id) ? editItem.period_id : "")
      : (isPeriodOpen(currentPeriodId) ? currentPeriodId : ""),
    amount: (editItem?.planned_amount ?? prefill?.amount) || "",
    fundId: editItem?.fund_id || prefill?.fundId || "",
    cswData: editItem?.csw_data || prefill?.cswData || "",
    cswSituation: editItem?.csw_situation || prefill?.cswSituation || "",
    cswSolution: editItem?.csw_solution || prefill?.cswSolution || "",
    tags: isEdit ? (editItem.tags || []).join(", ") : (prefill?.tags || ""),
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // Быстрое создание поста, пока оргсхема пуста (только владелец/директора)
  const canMakePosition = ["owner", "fin_director", "ops_director"].includes(profile?.role);
  const [pos, setPos] = useState({ code: "", name: "", divisionId: "" });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e?.target ? e.target.value : e }));

  // Недели ФП для выбора «К рассмотрению» — закрытые исключаем
  const openPeriods = useMemo(() => (periods || []).filter((p) => p.status !== "closed"), [periods]);

  // Листья дерева статей по корневым папкам
  const groups = useMemo(() => tree.map((root) => {
    const leaves = [];
    const walk = (n) => { if (!n.children.length) leaves.push(n); else n.children.forEach(walk); };
    walk(root);
    return { root, leaves };
  }).filter((g) => g.leaves.length), [tree]);
  const leafById = useMemo(() => {
    const m = {};
    groups.forEach((g) => g.leaves.forEach((l) => { m[l.id] = l; }));
    return m;
  }, [groups]);

  // Выбор вида расхода авто-подставляет Цель и Источник (фонд) из настроек статьи
  // (default_purpose / default_fund_id). Цель по умолчанию — название статьи.
  const onType = (e) => {
    const id = e.target.value;
    const t = leafById[id];
    setF((p) => ({
      ...p,
      typeId: id,
      purpose: t ? (t.default_purpose || t.name) : "",
      fundId: t?.default_fund_id || "",
    }));
  };

  const makePosition = async () => {
    if (busy) return;
    setErr("");
    if (!pos.code.trim() || !pos.name.trim()) return setErr("Укажите код и название поста (например 7.1 · Владелец)");
    setBusy(true);
    try {
      const p = await createPositionAndAssign(profile.id, {
        code: pos.code.trim(), name: pos.name.trim(), divisionId: pos.divisionId || null,
      });
      await onPositionsChanged();
      setF((prev) => ({ ...prev, positionId: p.id }));
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    if (busy) return;
    setErr("");
    const amount = parseFloat(String(f.amount).replace(",", "."));
    if (!f.positionId) return setErr("Заявка подаётся от поста — выберите пост");
    if (!f.typeId) return setErr("Выберите вид расхода");
    // Точка нужна только при подаче новой — у правки точка уже на заявке, не меняем.
    if (!isEdit && !locationId) return setErr("Выберите точку в шапке приложения — заявка привязывается к точке");
    if (!f.periodId) return setErr("Выберите неделю ФП для рассмотрения");
    if (!isPeriodOpen(f.periodId)) return setErr(isEdit
      ? "Неделя ФП закрыта — перенести заявку в закрытую неделю нельзя. Выберите открытую неделю."
      : "Неделя ФП закрыта — подать заявку на закрытую неделю нельзя. Выберите открытую неделю.");
    if (!amount || amount <= 0) return setErr("Введите сумму больше нуля");
    if (!f.cswData.trim() || !f.cswSituation.trim() || !f.cswSolution.trim())
      return setErr("Заполните все три поля ЗРС: данные, ситуация, решение");
    if (!baseCur?.id) return setErr("Не найдена базовая валюта");
    setBusy(true);
    try {
      const tags = f.tags.split(",").map((t) => t.trim()).filter(Boolean);
      const payload = {
        position_id: f.positionId, expense_type_id: f.typeId, fund_id: f.fundId || null,
        planned_amount: amount, period_id: f.periodId,
        purpose: f.purpose.trim() || null, tags,
        csw_data: f.cswData.trim(), csw_situation: f.cswSituation.trim(), csw_solution: f.cswSolution.trim(),
      };
      if (isEdit) {
        await updateRequest(editItem.id, payload);
      } else {
        await insertRequest({
          ...payload, requester_id: profile.id, location_id: locationId,
          currency_id: baseCur.id, status: "submitted",
        });
      }
      onSaved();
    } catch (e) {
      const msg = e?.message || String(e);
      setErr(msg.includes("row-level security")
        ? (isEdit
          ? "Нет прав на правку: менять заявку можно, пока она на рассмотрении."
          : "Нет прав на подачу: проверьте, что вам назначен пост и есть доступ к точке.")
        : msg);
      setBusy(false);
    }
  };

  const area = (k, ph) => (
    <textarea style={{ ...st.mdInput, minHeight: 64, resize: "vertical", fontFamily: "inherit" }} className="fin"
      placeholder={ph} value={f[k]} onChange={set(k)} />
  );

  return (
    <div style={st.mdOverlay} data-modal="1" onClick={onClose}>
      <div style={st.mdCard} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={{ ...st.mdTitle, display: "inline-flex", alignItems: "center", gap: 6 }}>
            {isEdit ? `Изменить заявку №${editItem.number} (ЗРС)` : prefill ? "Копия заявки (ЗРС)" : "Заявка на расход средств (ЗРС)"}<InfoHint term="ЗРС" />
          </div>
          <button style={st.iconBtn} onClick={onClose} aria-label="Закрыть"><X size={17} /></button>
        </div>

        {!myPositions.length && (
          <div style={{ ...st.reqError, marginBottom: 12 }}>
            <AlertCircle size={15} />
            <span>
              Заявка подаётся от поста оргсхемы, а вам пост не назначен.
              {canMakePosition ? " Создайте пост ниже:" : " Обратитесь к владельцу или директору."}
            </span>
          </div>
        )}
        {!myPositions.length && canMakePosition && (
          <div style={{ ...st.mdGrid, marginBottom: 14, ...(isMobile ? { gridTemplateColumns: "1fr" } : {}) }}>
            <Field st={st} label="Код поста (напр. 7.1)">
              <input style={st.mdInput} className="fin" value={pos.code} onChange={(e) => setPos((p) => ({ ...p, code: e.target.value }))} />
            </Field>
            <Field st={st} label="Название поста">
              <input style={st.mdInput} className="fin" placeholder="Владелец" value={pos.name} onChange={(e) => setPos((p) => ({ ...p, name: e.target.value }))} />
            </Field>
            <Field st={st} label="Отделение">
              <select style={st.mdSelect} className="fin" value={pos.divisionId} onChange={(e) => setPos((p) => ({ ...p, divisionId: e.target.value }))}>
                <option value="">—</option>
                {divisions.map((d) => <option key={d.id} value={d.id}>{d.code} · {d.name}</option>)}
              </select>
            </Field>
            <Field st={st} label=" ">
              <button style={st.btnGreen} className="btn" onClick={makePosition} disabled={busy}>
                {busy ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} Создать пост и назначить себя
              </button>
            </Field>
          </div>
        )}

        <div style={{ ...st.mdGrid, ...(isMobile ? { gridTemplateColumns: "1fr" } : {}) }}>
          <Field st={st} label="Должность (от поста)">
            <select style={st.mdSelect} className="fin" value={f.positionId} onChange={set("positionId")}>
              <option value="">— выберите —</option>
              {myPositions.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
            </select>
          </Field>
          <Field st={st} label="К рассмотрению на ФП">
            <select style={st.mdSelect} className="fin" value={f.periodId} onChange={set("periodId")}>
              <option value="">— выберите неделю —</option>
              {openPeriods.map((p) => <option key={p.id} value={p.id}>{periodTitle(p)}</option>)}
            </select>
          </Field>

          <Field st={st} label="Вид расхода" full>
            <select style={st.mdSelect} className="fin" value={f.typeId} onChange={onType}>
              <option value="">— не выбран —</option>
              {groups.map((g) => (
                <optgroup key={g.root.id} label={`${g.root.code || ""} ${g.root.name}`}>
                  {g.leaves.map((l) => <option key={l.id} value={l.id}>{l.code ? `${l.code} · ` : ""}{l.name}</option>)}
                </optgroup>
              ))}
            </select>
          </Field>

          <Field st={st} label="Цель расхода" full>
            <input style={st.mdInput} className="fin" placeholder="Подставится по виду расхода — можно изменить"
              value={f.purpose} onChange={set("purpose")} />
          </Field>

          <Field st={st} label="Источник — фонд (подставляется по виду расхода, назначается при одобрении)" full>
            <select style={st.mdSelect} className="fin" value={f.fundId} onChange={set("fundId")}>
              <option value="">— не выбран —</option>
              {funds.map((fd) => <option key={fd.id} value={fd.id}>{fd.code} — {fd.name} ({fmt(Number(fd.balance))})</option>)}
            </select>
          </Field>

          <Field st={st} label="Сумма">
            <input style={st.mdInput} className="fin" inputMode="decimal" placeholder="0.00"
              value={f.amount} onChange={set("amount")} />
          </Field>

          <Field st={st} label="Ситуация (что происходит)" full>{area("cswSituation", "Почему возник расход, что будет без него…")}</Field>
          <Field st={st} label="Данные (факты, цифры)" full>{area("cswData", "Что известно: счёт, цены, объёмы…")}</Field>
          <Field st={st} label="Решение (что предлагаете)" full>{area("cswSolution", "Что предлагаете сделать и сколько это стоит…")}</Field>

          <Field st={st} label="Метки (через запятую)" full>
            <input style={st.mdInput} className="fin" placeholder="напр. срочно, кухня, ремонт"
              value={f.tags} onChange={set("tags")} />
          </Field>
        </div>

        {err && <div role="alert" style={st.reqError}><AlertCircle size={15} /> {err}</div>}

        <div style={st.mdActions}>
          <button style={st.btnGhost} className="btn" onClick={onClose}>Отмена</button>
          <button style={{ ...st.btnGreen, opacity: busy ? 0.7 : 1 }} className="btn" onClick={submit} disabled={busy || !myPositions.length}>
            {busy ? <Loader2 size={15} className="spin" /> : isEdit ? <Check size={15} /> : <Plus size={15} />} {isEdit ? "Сохранить" : "Подать заявку"}
          </button>
        </div>
      </div>
    </div>
  );
}

export const CswRow = ({ C, label, text }) => (
  <div>
    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: C.faint, fontWeight: 700, marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 13.5, whiteSpace: "pre-wrap" }}>{text || "—"}</div>
  </div>
);


// ---------------------------------------------------------------- Операции с заявками (лента оплат)
// Внизу вкладки «Заявки»: лента оплат заявок из Реестра (op_type='request_payment').
// Заявка попадает в Реестр только при оплате. Вид — как лента «Реестра».
function RequestOpsLog({ C, st, isMobile, payments, canCancel, busy, onCancel }) {
  // Какие оплаты уже отменены (есть компенсирующая запись с reverses_id на них).
  const reversedIds = useMemo(
    () => new Set(payments.filter((p) => p.reverses_id != null).map((p) => String(p.reverses_id))),
    [payments],
  );
  return (
    <section style={st.reqSection}>
      <div style={st.reqSectionHead}>
        <ListChecks size={18} color={C.green} />
        <h3 style={st.reqSectionTitle}>Операции с заявками</h3>
        <span style={st.reqSectionSub}>оплаты заявок из Реестра · выбранная неделя</span>
      </div>
      {!payments.length ? (
        <div style={{ ...st.locCard, ...st.empty }}><ListChecks size={18} /> На этой неделе оплат по заявкам нет</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 6 }} className="stagger">
          {payments.map((r) => {
            const isReversal = r.reverses_id != null;            // запись-отмена
            const isReversed = reversedIds.has(String(r.id));    // оплата уже отменена
            const periodClosed = r.period?.status === "closed";  // неделя оплаты закрыта
            const tone = isReversal ? C.info : C.warning;
            const v = Number(r.cash_amount ?? r.fund_amount) || 0;
            const desc = [
              r.request?.number ? `Заявка №${r.request.number}` : null,
              r.request?.expense_type ? `${r.request.expense_type.code || ""} ${r.request.expense_type.name}`.trim() : null,
              r.fund ? `${r.fund.code} ${r.fund.name}` : null,
              r.cash_account?.name,
            ].filter(Boolean).join(" · ") || "—";
            // Отменить можно только активную оплату открытой недели (Реестр в закрытом
            // периоде не меняем — сначала открыть неделю в Директиве).
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
                  {isReversal ? "Отмена оплаты" : "Оплата заявки"}
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
                    title="Отменить оплату — вернуть деньги и заявку в «одобрена»">
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


// ---------------------------------------------------------------- Одобрение / отклонение / оплата
export function DecideModal({ C, st, decide, funds, accounts, periods = [], currentPeriodId, busy, onClose, onConfirm }) {
  useScrollLock();
  const { item, itemKind, action } = decide;
  const [fundId, setFundId] = useState(item.fund?.id || "");
  const [reason, setReason] = useState("");
  const [accountId, setAccountId] = useState("");
  const noun = itemKind === "bill" ? "счёт" : "заявку";
  const titles = { approve: `Одобрить ${noun}`, reject: `Отклонить ${noun}`, pay: `Оплатить ${noun}` };
  const total = Number(itemKind === "bill" ? item.amount : (item.approved_amount ?? item.planned_amount));
  const paid = Number(item.paid_amount || 0);
  const remaining = Math.max(0, Math.round((total - paid) * 100) / 100);
  const amount = action === "pay" ? remaining : total;
  const [payAmount, setPayAmount] = useState(String(remaining));
  const accs = accounts.filter((a) => a.currency_id === item.currency?.id);
  // Неделя оплаты — может отличаться от недели планирования заявки. По умолчанию
  // текущая выбранная неделя в шапке; список — все открытые недели.
  const openPeriods = (periods || []).filter((p) => p.status !== "closed");
  const defaultPayPeriod = openPeriods.some((p) => p.id === currentPeriodId) ? currentPeriodId : (openPeriods[0]?.id || "");
  const [payPeriodId, setPayPeriodId] = useState(defaultPayPeriod);

  return (
    <div style={st.mdOverlay} data-modal="1" onClick={onClose}>
      <div style={{ ...st.mdCard, width: "min(440px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>{titles[action]} №{item.number}</div>
          <button style={st.iconBtn} onClick={onClose} aria-label="Закрыть"><X size={17} /></button>
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
        {action === "pay" && (<>
          {paid > 0 && (
            <div style={{ fontSize: 12.5, color: C.sub, marginBottom: 8 }}>
              Оплачено <b style={{ color: C.text }}>{fmt(paid)}</b> из {fmt(total)} · остаток <b style={{ color: C.money }}>{fmt(remaining)}</b> {item.currency?.code}
            </div>
          )}
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Сумма оплаты (можно частично)</span>
            <input style={st.mdInput} className="fin" inputMode="decimal" value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)} placeholder={String(remaining)} />
          </div>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Счёт ДС — откуда платим</span>
            <select style={st.mdSelect} className="fin" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">{accs.length ? "— выберите —" : "Нет счетов в нужной валюте"}</option>
              {accs.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          {itemKind !== "bill" && (
            <div style={st.reqField}>
              <span style={st.reqFieldLbl}>Неделя оплаты (может отличаться от недели заявки)</span>
              <select style={st.mdSelect} className="fin" value={payPeriodId} onChange={(e) => setPayPeriodId(e.target.value)}>
                {!openPeriods.length && <option value="">Нет открытых недель</option>}
                {openPeriods.map((p) => <option key={p.id} value={p.id}>{periodTitle(p)}</option>)}
              </select>
              {item.period && payPeriodId && payPeriodId !== item.period.id && (
                <span style={{ fontSize: 11.5, color: C.warning, marginTop: 4 }}>
                  Заявка спланирована на неделю {periodTitle(item.period)} — оплата пройдёт в другой неделе.
                </span>
              )}
            </div>
          )}
        </>)}

        <div style={st.mdActions}>
          <button style={st.btnGhost} className="btn" onClick={onClose}>Отмена</button>
          <button style={{ ...(action === "reject" ? { ...st.btnGhost, color: C.danger } : st.btnGreen), opacity: busy ? 0.7 : 1 }} className="btn"
            disabled={busy} onClick={() => onConfirm({ item, itemKind, action, fundId, reason, accountId, payAmount, payPeriodId })}>
            {busy ? <Loader2 size={15} className="spin" /> : action === "pay" ? <Banknote size={15} /> : action === "reject" ? <Ban size={15} /> : <Check size={15} />}
            {" "}{titles[action].split(" ")[0]}
          </button>
        </div>
      </div>
    </div>
  );
}
