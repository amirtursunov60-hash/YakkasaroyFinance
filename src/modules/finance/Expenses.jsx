import { useState, useMemo, useEffect, useCallback } from "react";
import { ArrowUpRight, ArrowDownRight, ChevronRight, Plus, X, Loader2, AlertCircle, CheckCircle2, ClipboardList, Check, Ban, Banknote, FileText, Receipt } from "lucide-react";
import { useTheme } from "../../theme/theme";
import { useScrollLock } from "../../hooks/useScrollLock";
import { fmt } from "../../utils/format";
import { usePeriod, periodTitle } from "../../lib/PeriodCtx";
import { AttachmentsBlock } from "../../components/AttachmentsBlock";
import {
  fetchExpenseTypes, fetchExpenseSums, fetchIncomeRefs, fetchFunds, fetchCounterparties,
  fetchMyPositions, fetchOrgDivisions, createPositionAndAssign,
  fetchRequests, insertRequest, decideRequest, payRequest,
} from "../../lib/api";


// ---------------------------------------------------------------- EXPENSES
// Живые данные (ТЗ v2 §4.1.5): дерево статей РД с фактом оплат за неделю
// (Реестр, op_type=request_payment) + заявки в формате ЗРС от поста.
// Статусы: подана → на планировании → одобрена/отклонена → оплачена.
// Период проставляется заявке при одобрении; оплата — серверной функцией
// fp_pay_request (Реестр + статус атомарно).

const PALETTE = ["#e0463b", "#e8911c", "#9c6ade", "#5b8def", "#5bd6c9", "#d6c14a", "#7bd88f", "#d64ad6", "#2f9e44"];
const FILTERS = [["all", "Все"], ["submitted", "Поданы"], ["planning", "Планирование"], ["approved", "Одобрены"], ["paid", "Оплачены"], ["rejected", "Отклонены"]];

export function Expenses() {
  const { C, st, isMobile, profile } = useTheme();
  // Статусы заявок — цвета из семантических токенов темы.
  const ST_META = {
    submitted: { label: "подана",           color: C.warning },
    planning:  { label: "на планировании",  color: C.info },
    approved:  { label: "одобрена",         color: C.successSoft },
    rejected:  { label: "отклонена",        color: C.danger },
    paid:      { label: "оплачена",         color: C.success },
  };
  const { period, prevPeriod, periodId, loading: periodsLoading, locationId: ctxLocationId } = usePeriod();
  const isFinAdmin = ["owner", "fin_director"].includes(profile?.role);
  const canPay = isFinAdmin || profile?.role === "accountant";

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const [types, setTypes] = useState([]);
  const [sums, setSums] = useState({});
  const [refs, setRefs] = useState(null);          // счета, способы, валюты, точки
  const [funds, setFunds] = useState([]);
  const [counterparties, setCounterparties] = useState([]);
  const [myPositions, setMyPositions] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [requests, setRequests] = useState([]);
  const [open, setOpen] = useState(null);          // раскрытые папки дерева
  const [expanded, setExpanded] = useState({});    // раскрытые ЗРС заявок
  const [filter, setFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [decide, setDecide] = useState(null);      // { req, action: 'approve'|'reject'|'pay' }
  const [busy, setBusy] = useState(null);

  const loadStatic = useCallback(async () => {
    setErr("");
    try {
      const [list, refData, fs, cps, poss, divs] = await Promise.all([
        fetchExpenseTypes(), fetchIncomeRefs(), fetchFunds(), fetchCounterparties(),
        fetchMyPositions(profile.id), fetchOrgDivisions(),
      ]);
      setTypes(list); setRefs(refData); setCounterparties(cps); setDivisions(divs);
      setFunds(fs.sort((a, b) => a.code.localeCompare(b.code, "ru", { numeric: true })));
      setMyPositions(poss);
    } catch (e) {
      setErr("Не удалось загрузить данные: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [profile.id]);
  useEffect(() => { loadStatic(); }, [loadStatic]);

  const loadPeriodData = useCallback(async () => {
    try {
      const [sumData, reqs] = await Promise.all([
        fetchExpenseSums([period?.id, prevPeriod?.id], ctxLocationId),
        fetchRequests(periodId, ctxLocationId),
      ]);
      setSums(sumData); setRequests(reqs);
    } catch (e) {
      setErr("Не удалось загрузить данные периода: " + (e?.message || e));
    }
  }, [period?.id, prevPeriod?.id, periodId, ctxLocationId]);
  useEffect(() => { if (!periodsLoading) loadPeriodData(); }, [loadPeriodData, periodsLoading]);

  // -------- дерево статей РД (как в Доходах)
  const byParent = useMemo(() => {
    const m = {};
    types.forEach((t) => { (m[t.parent_id || "root"] ??= []).push(t); });
    const cmp = (a, b) => (a.code || a.name).localeCompare(b.code || b.name, "ru", { numeric: true });
    Object.values(m).forEach((arr) => arr.sort(cmp));
    return m;
  }, [types]);
  const tree = useMemo(() => {
    const attach = (t) => ({ ...t, children: (byParent[t.id] || []).map(attach) });
    return (byParent.root || []).map(attach);
  }, [byParent]);

  useEffect(() => {
    if (open === null && tree.length) setOpen({ [tree[0].id]: true });
  }, [tree, open]);

  const rolled = useMemo(() => {
    const out = {};
    const walk = (node) => {
      const own = sums[node.id] || {};
      let cur = own[period?.id] || 0;
      let prev = own[prevPeriod?.id] || 0;
      node.children.forEach((c) => { const r = walk(c); cur += r.cur; prev += r.prev; });
      return (out[node.id] = { cur, prev });
    };
    tree.forEach(walk);
    return out;
  }, [tree, sums, period, prevPeriod]);

  const totals = useMemo(() => tree.reduce(
    (acc, t) => ({ cur: acc.cur + (rolled[t.id]?.cur || 0), prev: acc.prev + (rolled[t.id]?.prev || 0) }),
    { cur: 0, prev: 0 },
  ), [tree, rolled]);

  // Для расходов рост — тревожный (красный), снижение — хорошо (зелёный)
  const delta = (cur, prev) => {
    if (!prev && !cur) return null;
    if (!prev) return { pct: 100, up: true };
    const d = ((cur - prev) / prev) * 100;
    return { pct: Math.abs(d), up: d >= 0 };
  };
  const Trend = ({ cur, prev, big }) => {
    const d = delta(cur, prev);
    if (!d) return <span style={{ ...st.trend, color: C.faint }}>—</span>;
    const col = d.up ? C.danger : C.green;
    return (
      <span style={{ ...st.trend, color: col, fontSize: big ? 13 : 12 }}>
        {d.up ? <ArrowUpRight size={big ? 15 : 13} /> : <ArrowDownRight size={big ? 15 : 13} />}
        {d.pct.toFixed(0)}%
      </span>
    );
  };

  // -------- действия по заявкам
  const afterAction = async (msg) => {
    await loadPeriodData();
    setDecide(null);
    setDone(msg);
  };

  const doDecide = async ({ req, action, fundId, reason, accountId }) => {
    if (busy) return;
    setBusy("decide"); setErr(""); setDone("");
    try {
      if (action === "approve") {
        if (!fundId) throw new Error("Выберите фонд-источник");
        if (!periodId) throw new Error("Нет выбранного периода ФП");
        await decideRequest(req.id, { status: "approved", fund_id: fundId, period_id: periodId });
        await afterAction(`Заявка №${req.number} одобрена — фонд ${funds.find((f) => f.id === fundId)?.code}`);
      } else if (action === "reject") {
        if (!reason?.trim()) throw new Error("Укажите причину отклонения");
        await decideRequest(req.id, { status: "rejected", rejection_reason: reason.trim() });
        await afterAction(`Заявка №${req.number} отклонена`);
      } else if (action === "pay") {
        if (!accountId) throw new Error("Выберите счёт ДС");
        if (!periodId) throw new Error("Нет выбранного периода ФП");
        await payRequest(req.id, accountId, periodId);
        await afterAction(`Заявка №${req.number} оплачена — расход проведён в Реестре`);
      }
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  const toPlanning = async (req) => {
    if (busy) return;
    setBusy("decide"); setErr(""); setDone("");
    try {
      await decideRequest(req.id, { status: "planning" });
      await afterAction(`Заявка №${req.number} взята на планирование`);
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  const filtered = filter === "all" ? requests : requests.filter((r) => r.status === filter);

  if (loading || periodsLoading) return <div style={st.empty}><Loader2 size={18} className="spin" /> Загрузка…</div>;

  return (<>
    {/* Сводка периода */}
    <section style={st.incHero}>
      <div style={{ ...st.incHeroGlow, background: `radial-gradient(circle, ${C.danger}22 0%, transparent 70%)` }} />
      <div style={st.incHeroInner}>
        <div>
          <div style={st.incHeroLabel}>Расходы за период · {period ? periodTitle(period) : "период не создан"}</div>
          <div style={st.incHeroValue}>{fmt(totals.cur)} <span style={st.incHeroUnit}>TJS</span></div>
          <div style={st.incHeroSub}>
            <Trend cur={totals.cur} prev={totals.prev} big /> к прошлому периоду · было {fmt(totals.prev)}
          </div>
        </div>
        <button style={st.btnGreen} className="btn" onClick={() => { setErr(""); setShowForm(true); }}>
          <Plus size={15} /> Подать заявку (ЗРС)
        </button>
      </div>
    </section>

    {err && <div style={{ ...st.reqError, marginBottom: 14 }}><AlertCircle size={15} /> {err}</div>}
    {done && <div style={{ ...st.reqError, marginBottom: 14, color: C.green, background: `${C.green}1a`, borderColor: `${C.green}44` }}><CheckCircle2 size={15} /> {done}</div>}

    {/* Дерево статей РД */}
    {!tree.length && (
      <div style={{ ...st.dataCard, ...st.empty }}>
        Справочник статей расходов пуст. Примените сид-миграцию из supabase/migrations (см. supabase/README.md).
      </div>
    )}
    <div style={st.incList}>
      {tree.map((cat, i) => {
        const isOpen = !!open?.[cat.id];
        const hasChildren = cat.children.length > 0;
        const r = rolled[cat.id] || { cur: 0, prev: 0 };
        return (
          <div key={cat.id} style={st.dataCard}>
            <div style={st.locHead} className="locHead" onClick={() => hasChildren && setOpen((o) => ({ ...o, [cat.id]: !o?.[cat.id] }))}>
              <div style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", flexShrink: 0, background: `${PALETTE[i % PALETTE.length]}22`, color: PALETTE[i % PALETTE.length] }}><Receipt size={18} /></div>
              <div style={st.locTitle}>
                <div style={st.locName}>{cat.name}</div>
                <div style={st.locCode}>{cat.code}{hasChildren ? ` · ${cat.children.length} статей` : ""}</div>
              </div>
              <div style={st.locRight}>
                <div style={st.locSum}>{fmt(r.cur)} <span style={st.locUnit}>TJS</span></div>
                <Trend cur={r.cur} prev={r.prev} />
              </div>
              {hasChildren && <span style={{ ...st.locChevron, transform: isOpen ? "rotate(90deg)" : "none" }}><ChevronRight size={18} /></span>}
            </div>
            {isOpen && hasChildren && (
              <div style={st.locBody}>
                {!isMobile && (
                  <div style={st.itemHeadRow}>
                    <span />
                    <div style={st.itemHeadCell}>Было</div>
                    <div style={st.itemHeadCell}>Стало</div>
                  </div>
                )}
                {cat.children.map((c) => {
                  const rc = rolled[c.id] || { cur: 0, prev: 0 };
                  if (isMobile) {
                    return (
                      <div key={c.id} style={{ padding: "11px 18px", borderTop: `1px solid ${C.line}` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <span style={{ ...st.itemCode, color: C.danger }}>{c.code}</span>
                          <span style={{ fontWeight: 600, fontSize: 13, flex: 1, minWidth: 0 }}>{c.name}</span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <div>
                            <div style={{ fontSize: 10, color: C.faint }}>Было</div>
                            <div className="denseNum" style={{ fontSize: 13, fontWeight: 600 }}>{fmt(rc.prev)}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: C.faint }}>Стало</div>
                            <div className="denseNum" style={{ fontSize: 13, fontWeight: 700, color: rc.cur ? C.text : C.faint }}>{fmt(rc.cur)}</div>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={c.id} style={st.itemRow} className="itemRow">
                      <div style={st.itemName}>
                        <span style={{ ...st.itemCode, color: C.danger }}>{c.code}</span>
                        <span>{c.name}</span>
                      </div>
                      <div style={st.itemPrev}>{fmt(rc.prev)}</div>
                      <div style={{ ...st.itemCur, color: rc.cur ? C.text : C.faint }}>{fmt(rc.cur)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>

    {/* Заявки */}
    <section style={st.reqSection}>
      <div style={st.reqSectionHead}>
        <ClipboardList size={18} color={C.green} />
        <h3 style={st.reqSectionTitle}>Заявки</h3>
        <span style={st.reqSectionSub}>от поста · формат ЗРС</span>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {FILTERS.map(([key, label]) => (
          <button key={key} className="btn"
            style={{
              ...st.weekTag, cursor: "pointer", border: "none", fontFamily: "inherit", marginLeft: 0,
              padding: "5px 12px", fontSize: 12,
              color: filter === key ? "#04130a" : (ST_META[key]?.color || C.sub),
              background: filter === key ? (ST_META[key]?.color || C.green) : `${ST_META[key]?.color || C.sub}1a`,
            }}
            onClick={() => setFilter(key)}>
            {label}{key !== "all" ? ` · ${requests.filter((r) => r.status === key).length}` : ` · ${requests.length}`}
          </button>
        ))}
      </div>

      {!filtered.length && (
        <div style={{ ...st.dataCard, ...st.empty }}>
          {requests.length ? "Нет заявок с этим статусом" : "Заявок на этой неделе пока нет — подайте первую кнопкой выше"}
        </div>
      )}

      {filtered.map((req) => {
        const m = ST_META[req.status] || {};
        const isExp = !!expanded[req.id];
        return (
          <div key={req.id} style={{ ...st.dataCard, marginBottom: 10 }}>
            <div style={{ ...st.locHead, cursor: "pointer" }} className="locHead"
              onClick={() => setExpanded((e) => ({ ...e, [req.id]: !e[req.id] }))}>
              <div style={{ ...st.locDot, background: m.color }} />
              <div style={st.locTitle}>
                <div style={st.locName}>
                  №{req.number} · {req.expense_type ? `${req.expense_type.code || ""} ${req.expense_type.name}` : "—"}
                </div>
                <div style={st.locCode}>
                  {req.position ? `${req.position.code} ${req.position.name}` : "пост не указан"}
                  {req.requester ? ` · ${req.requester.full_name}` : ""}
                  {req.location ? ` · ${req.location.name}` : ""}
                </div>
              </div>
              <div style={st.locRight}>
                <div style={st.locSum}>{fmt(Number(req.planned_amount))} <span style={st.locUnit}>{req.currency?.code || ""}</span></div>
                <span style={{ ...st.weekTag, marginLeft: 0, color: m.color, background: `${m.color}1a` }}>{m.label}</span>
              </div>
              <span style={{ ...st.locChevron, transform: isExp ? "rotate(90deg)" : "none" }}><ChevronRight size={18} /></span>
            </div>

            {isExp && (
              <div style={st.locBody}>
                <div style={{ display: "grid", gap: 10, padding: "4px 2px 8px" }}>
                  <CswRow C={C} label="Данные" text={req.csw_data} />
                  <CswRow C={C} label="Ситуация" text={req.csw_situation} />
                  <CswRow C={C} label="Решение" text={req.csw_solution} />
                  <AttachmentsBlock kind="request" parentId={req.id} attachments={req.attachments}
                    canUpload={!["paid", "rejected"].includes(req.status)} profileId={profile.id} onChanged={loadPeriodData} />
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12.5, color: C.sub }}>
                    {req.fund && <span>Фонд: <b style={{ color: C.text }}>{req.fund.code} {req.fund.name}</b></span>}
                    {req.payment_type && <span>Оплата: <b style={{ color: C.text }}>{req.payment_type.name}</b></span>}
                    {req.counterparty && <span>Контрагент: <b style={{ color: C.text }}>{req.counterparty.name}</b></span>}
                    <span>Подана: <b style={{ color: C.text }}>{new Date(req.created_at).toLocaleDateString("ru")}</b></span>
                  </div>
                  {req.status === "rejected" && req.rejection_reason && (
                    <div style={{ color: C.danger, fontSize: 13 }}>Причина отклонения: {req.rejection_reason}</div>
                  )}
                  {(isFinAdmin || canPay) && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {isFinAdmin && (req.status === "submitted" || req.status === "planning") && (<>
                        {req.status === "submitted" && (
                          <button style={st.btnGhost} className="btn" disabled={!!busy} onClick={() => toPlanning(req)}>
                            <FileText size={14} /> На планирование
                          </button>
                        )}
                        <button style={st.btnGreen} className="btn" disabled={!!busy} onClick={() => setDecide({ req, action: "approve" })}>
                          <Check size={14} /> Одобрить
                        </button>
                        <button style={{ ...st.btnGhost, color: C.danger }} className="btn" disabled={!!busy} onClick={() => setDecide({ req, action: "reject" })}>
                          <Ban size={14} /> Отклонить
                        </button>
                      </>)}
                      {canPay && req.status === "approved" && (
                        <button style={st.btnGreen} className="btn" disabled={!!busy} onClick={() => setDecide({ req, action: "pay" })}>
                          <Banknote size={14} /> Оплатить
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </section>

    {showForm && refs && (
      <RequestForm
        C={C} st={st} isMobile={isMobile} profile={profile}
        tree={tree} refs={refs} funds={funds} counterparties={counterparties}
        myPositions={myPositions} divisions={divisions}
        onPositionsChanged={async () => setMyPositions(await fetchMyPositions(profile.id))}
        onClose={() => setShowForm(false)}
        onSaved={() => { setShowForm(false); loadPeriodData(); setDone("Заявка подана — финкомитет рассмотрит её в Директиве"); }}
      />
    )}

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


// ---------------------------------------------------------------- Форма подачи заявки (ЗРС)
const Field = ({ st, label, full, children }) => (
  <div style={{ ...st.reqField, ...(full ? st.mdFull : {}) }}>
    <span style={st.reqFieldLbl}>{label}</span>
    {children}
  </div>
);

function RequestForm({ C, st, isMobile, profile, tree, refs, funds, counterparties, myPositions, divisions, onPositionsChanged, onClose, onSaved }) {
  useScrollLock();
  const baseCur = refs.currencies.find((c) => c.is_base) || refs.currencies[0];
  const [f, setF] = useState({
    positionId: myPositions[0]?.id || "", typeId: "", locationId: "",
    amount: "", currencyId: baseCur?.id || "", payTypeId: "", counterpartyId: "", fundId: "",
    cswData: "", cswSituation: "", cswSolution: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // Быстрое создание поста, пока оргсхема пуста (только владелец/директора)
  const canMakePosition = ["owner", "fin_director", "ops_director"].includes(profile?.role);
  const [pos, setPos] = useState({ code: "", name: "", divisionId: "" });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e?.target ? e.target.value : e }));

  // Листья дерева статей по корневым папкам
  const groups = useMemo(() => tree.map((root) => {
    const leaves = [];
    const walk = (n) => { if (!n.children.length) leaves.push(n); else n.children.forEach(walk); };
    walk(root);
    return { root, leaves };
  }).filter((g) => g.leaves.length), [tree]);

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
    if (!f.typeId) return setErr("Выберите статью расхода");
    if (!f.locationId) return setErr("Выберите точку");
    if (!amount || amount <= 0) return setErr("Введите сумму больше нуля");
    if (!f.cswData.trim() || !f.cswSituation.trim() || !f.cswSolution.trim())
      return setErr("Заполните все три поля ЗРС: данные, ситуация, решение");
    setBusy(true);
    try {
      await insertRequest({
        position_id: f.positionId, requester_id: profile.id, location_id: f.locationId,
        expense_type_id: f.typeId, fund_id: f.fundId || null,
        planned_amount: amount, currency_id: f.currencyId,
        payment_type_id: f.payTypeId || null, counterparty_id: f.counterpartyId || null,
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
          <Field st={st} label="От поста">
            <select style={st.mdSelect} className="fin" value={f.positionId} onChange={set("positionId")} autoFocus>
              <option value="">— выберите —</option>
              {myPositions.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
            </select>
          </Field>
          <Field st={st} label="Точка">
            <select style={st.mdSelect} className="fin" value={f.locationId} onChange={set("locationId")}>
              <option value="">— выберите —</option>
              {refs.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
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

          <Field st={st} label="Плановая сумма">
            <input style={st.mdInput} className="fin" inputMode="decimal" placeholder="0.00"
              value={f.amount} onChange={set("amount")} />
          </Field>
          <Field st={st} label="Валюта">
            <select style={st.mdSelect} className="fin" value={f.currencyId} onChange={set("currencyId")}>
              {refs.currencies.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </select>
          </Field>

          <Field st={st} label="Способ оплаты">
            <select style={st.mdSelect} className="fin" value={f.payTypeId} onChange={set("payTypeId")}>
              <option value="">—</option>
              {refs.payTypes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field st={st} label="Контрагент">
            <select style={st.mdSelect} className="fin" value={f.counterpartyId} onChange={set("counterpartyId")}>
              <option value="">—</option>
              {counterparties.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>

          <Field st={st} label="Фонд-источник (предложение, назначается при одобрении)" full>
            <select style={st.mdSelect} className="fin" value={f.fundId} onChange={set("fundId")}>
              <option value="">—</option>
              {funds.map((fd) => <option key={fd.id} value={fd.id}>{fd.code} — {fd.name} ({fmt(Number(fd.balance))})</option>)}
            </select>
          </Field>

          <Field st={st} label="Данные (факты, цифры)" full>{area("cswData", "Что известно: счёт, цены, объёмы…")}</Field>
          <Field st={st} label="Ситуация (что происходит)" full>{area("cswSituation", "Почему возник расход, что будет без него…")}</Field>
          <Field st={st} label="Предлагаемое решение" full>{area("cswSolution", "Что предлагаете сделать и сколько это стоит…")}</Field>
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


// ---------------------------------------------------------------- Одобрение / отклонение / оплата
function DecideModal({ C, st, decide, funds, accounts, busy, onClose, onConfirm }) {
  useScrollLock();
  const { req, action } = decide;
  const [fundId, setFundId] = useState(req.fund?.id || "");
  const [reason, setReason] = useState("");
  const [accountId, setAccountId] = useState("");
  const titles = { approve: "Одобрить заявку", reject: "Отклонить заявку", pay: "Оплатить заявку" };
  // Счета в валюте заявки (конвенция Реестра: суммы в базовой)
  const accs = accounts.filter((a) => a.currency_id === req.currency?.id);

  return (
    <div style={st.mdOverlay} onClick={onClose}>
      <div style={{ ...st.mdCard, width: "min(440px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>{titles[action]} №{req.number}</div>
          <button style={st.iconBtn} onClick={onClose}><X size={17} /></button>
        </div>

        <div style={{ ...st.reqField, marginBottom: 12 }}>
          <span style={st.reqFieldLbl}>Сумма</span>
          <div style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
            {fmt(Number(req.planned_amount))} <span style={st.locUnit}>{req.currency?.code}</span>
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
              <option value="">{accs.length ? "— выберите —" : "Нет счетов в валюте заявки"}</option>
              {accs.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}

        <div style={st.mdActions}>
          <button style={st.btnGhost} className="btn" onClick={onClose}>Отмена</button>
          <button style={{ ...(action === "reject" ? { ...st.btnGhost, color: C.danger } : st.btnGreen), opacity: busy ? 0.7 : 1 }} className="btn"
            disabled={busy} onClick={() => onConfirm({ req, action, fundId, reason, accountId })}>
            {busy ? <Loader2 size={15} className="spin" /> : action === "pay" ? <Banknote size={15} /> : action === "reject" ? <Ban size={15} /> : <Check size={15} />}
            {" "}{titles[action].split(" ")[0]}
          </button>
        </div>
      </div>
    </div>
  );
}
