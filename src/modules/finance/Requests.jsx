import { useState, useEffect, useCallback, useMemo } from "react";
import { ClipboardList, FileText, Check, Ban, Banknote, Loader2, AlertCircle, CheckCircle2, ChevronRight, X, Network, Plus } from "lucide-react";
import { Stat } from "../../components/common";
import { useTheme } from "../../theme/theme";
import { useScrollLock } from "../../hooks/useScrollLock";
import { fmt, avatarColor } from "../../utils/format";
import { usePeriod, periodTitle } from "../../lib/PeriodCtx";
import { AttachmentsBlock } from "../../components/AttachmentsBlock";
import { feedbackSuccess, feedbackError } from "../../lib/feedback";
import {
  fetchRequests, decideRequest, payRequest,
  fetchBills, decideBill, payBill,
  fetchFunds, fetchIncomeRefs,
  fetchExpenseTypes, insertRequest, createPositionAndAssign, fetchMyPositions, fetchOrgDivisions,
} from "../../lib/api";


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
});

// «К рассмотрению на ФП» = ждут решения финкомитета (поданные + на планировании).
export const isReviewStatus = (status) => ["submitted", "planning"].includes(status);

// Счётчики заявок по статусам — для чипов-фильтров.
export const requestCounts = (requests) => {
  const c = { all: requests.length, review: 0, approved: 0, rejected: 0, paid: 0 };
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
  const [bills, setBills] = useState([]);
  const [funds, setFunds] = useState([]);
  const [refs, setRefs] = useState(null);
  const [types, setTypes] = useState([]);
  const [myPositions, setMyPositions] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [decide, setDecide] = useState(null);   // { item, itemKind: 'request'|'bill', action }
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(null);
  const [reqFilter, setReqFilter] = useState("approved");   // здесь оплачиваем — по умолчанию «Одобрено»

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
      const [reqs, bls] = await Promise.all([fetchRequests(periodId, ctxLocationId), fetchBills(periodId, null, ctxLocationId)]);
      setRequests(reqs); setBills(bls);
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
      feedbackSuccess();
    } catch (e) { setErr(e?.message || String(e)); feedbackError(); }
    finally { setBusy(null); }
  };

  if (loading || periodsLoading) return <div style={st.empty}><Loader2 size={18} className="spin" /> Загрузка…</div>;

  // Счета поставщиков: одобрение/отклонение/оплата. Заявки-ЗРС рассматриваются
  // (одобрение/отклонение) в Директиве, а здесь — только оплачиваются одобренные.
  const Actions = ({ item, itemKind }) => {
    if (itemKind === "bill") {
      return (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {isFinAdmin && ["submitted", "planning"].includes(item.status) && (<>
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
    }
    // заявка-ЗРС: только оплата одобренной (рассмотрение — в Директиве)
    if (canPay && item.status === "approved") {
      return (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={st.btnGreen} className="btn" disabled={!!busy} onClick={() => setDecide({ item, itemKind, action: "pay" })}>
            <Banknote size={14} /> Оплатить
          </button>
        </div>
      );
    }
    return null;
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
          <button style={st.btnGreen} className="btn" onClick={() => { setErr(""); setShowForm(true); }}>
            <Plus size={15} /> {isMobile ? "Заявка (ЗРС)" : "Подать заявку (ЗРС)"}
          </button>
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
      {bills.map((b) => (
        <ItemCard key={b.id} C={C} st={st} item={b} itemKind="bill"
          isExpanded={!!expanded[`bill:${b.id}`]}
          onToggle={() => setExpanded((e) => ({ ...e, [`bill:${b.id}`]: !e[`bill:${b.id}`] }))}
          statusMeta={ST_META} profileId={profile.id} onAttachmentsChanged={loadItems}>
          <Actions item={b} itemKind="bill" />
        </ItemCard>
      ))}
    </section>

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
              <Actions item={r} itemKind="request" />
            </ItemCard>
          ))}
        </div>
      ))}
    </section>

    {decide && (
      <DecideModal C={C} st={st} decide={decide} funds={funds} accounts={refs?.accounts || []}
        busy={busy === "decide"} onClose={() => setDecide(null)} onConfirm={doDecide} />
    )}

    {showForm && refs && (
      <RequestForm
        st={st} isMobile={isMobile} profile={profile}
        tree={tree} refs={refs} funds={funds}
        periods={periods} locationId={ctxLocationId} currentPeriodId={periodId}
        myPositions={myPositions} divisions={divisions}
        onPositionsChanged={async () => setMyPositions(await fetchMyPositions(profile.id))}
        onClose={() => setShowForm(false)}
        onSaved={() => { setShowForm(false); loadItems(); setDone("Заявка подана — рассмотрите её ниже"); }}
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
              {itemKind === "bill" && item.due_on && <span>Срок: <b style={{ color: C.text }}>{new Date(item.due_on + "T00:00:00").toLocaleDateString("ru")}</b></span>}
              {item.comment && <span>{item.comment}</span>}
              <span>Подано: <b style={{ color: C.text }}>{new Date(item.created_at).toLocaleDateString("ru")}</b></span>
            </div>
            {item.status === "rejected" && item.rejection_reason && (
              <div style={{ color: C.danger, fontSize: 13 }}>Причина отклонения: {item.rejection_reason}</div>
            )}
            {children}
          </div>
        </div>
      )}
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

function RequestForm({ st, isMobile, profile, tree, refs, funds, periods, locationId, currentPeriodId, myPositions, divisions, onPositionsChanged, onClose, onSaved }) {
  useScrollLock();
  // Валюта — базовая (TJS) по умолчанию, в форме не показывается;
  // точка берётся из выбора в шапке приложения (поле в форме убрано).
  const baseCur = refs.currencies.find((c) => c.is_base) || refs.currencies[0];
  const [f, setF] = useState({
    positionId: myPositions[0]?.id || "", typeId: "", purpose: "",
    periodId: currentPeriodId || "", amount: "", fundId: "",
    cswData: "", cswSituation: "", cswSolution: "", tags: "",
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
    if (!locationId) return setErr("Выберите точку в шапке приложения — заявка привязывается к точке");
    if (!f.periodId) return setErr("Выберите неделю ФП для рассмотрения");
    if (!amount || amount <= 0) return setErr("Введите сумму больше нуля");
    if (!f.cswData.trim() || !f.cswSituation.trim() || !f.cswSolution.trim())
      return setErr("Заполните все три поля ЗРС: данные, ситуация, решение");
    if (!baseCur?.id) return setErr("Не найдена базовая валюта");
    setBusy(true);
    try {
      const tags = f.tags.split(",").map((t) => t.trim()).filter(Boolean);
      await insertRequest({
        position_id: f.positionId, requester_id: profile.id, location_id: locationId,
        expense_type_id: f.typeId, fund_id: f.fundId || null,
        planned_amount: amount, currency_id: baseCur.id, period_id: f.periodId,
        purpose: f.purpose.trim() || null, tags,
        csw_data: f.cswData.trim(), csw_situation: f.cswSituation.trim(), csw_solution: f.cswSolution.trim(),
        status: "submitted",
      });
      onSaved();
    } catch (e) {
      const msg = e?.message || String(e);
      setErr(msg.includes("row-level security")
        ? "Нет прав на подачу: проверьте, что вам назначен пост и есть доступ к точке."
        : msg);
      setBusy(false);
    }
  };

  const area = (k, ph) => (
    <textarea style={{ ...st.mdInput, minHeight: 64, resize: "vertical", fontFamily: "inherit" }} className="fin"
      placeholder={ph} value={f[k]} onChange={set(k)} />
  );

  return (
    <div style={st.mdOverlay} onClick={onClose}>
      <div style={st.mdCard} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>Заявка на расход средств (ЗРС)</div>
          <button style={st.iconBtn} onClick={onClose}><X size={17} /></button>
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

        {err && <div style={st.reqError}><AlertCircle size={15} /> {err}</div>}

        <div style={st.mdActions}>
          <button style={st.btnGhost} className="btn" onClick={onClose}>Отмена</button>
          <button style={{ ...st.btnGreen, opacity: busy ? 0.7 : 1 }} className="btn" onClick={submit} disabled={busy || !myPositions.length}>
            {busy ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} Подать заявку
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


// ---------------------------------------------------------------- Одобрение / отклонение / оплата
export function DecideModal({ C, st, decide, funds, accounts, busy, onClose, onConfirm }) {
  useScrollLock();
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
