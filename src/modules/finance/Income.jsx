import { useState, useMemo, useEffect, useCallback } from "react";
import { ArrowUpRight, ArrowDownRight, ChevronRight, Plus, X, Loader2, AlertCircle, Calculator, Trash2, Store, List, Undo2, Pencil, CalendarDays, FileText, Archive } from "lucide-react";
import { useTheme } from "../../theme/theme";
import { useScrollLock } from "../../hooks/useScrollLock";
import { fmt } from "../../utils/format";
import { usePeriod, periodTitle } from "../../lib/PeriodCtx";
import {
  isoDate, getPeriodFor,
  fetchIncomeTypes, fetchIncomeSums, fetchIncomeRefs, findRate, insertIncome,
  fetchRulesByIncomeType, fetchFunds, addDistributionRule, deleteDistributionRule,
  fetchIncomeOperations, reverseIncome, setIncomeTypeArchived,
  createIncomeType, updateIncomeType,
} from "../../lib/api";


// ---------------------------------------------------------------- INCOME
// Живые данные: дерево видов дохода (income_types), суммы выбранной в шапке
// недели ФП и предыдущей (incomes), форма ввода операции дохода.

export function Income() {
  const { C, st, isMobile, profile } = useTheme();
  const { period, prevPeriod, loading: periodsLoading, locationId: ctxLocationId } = usePeriod();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [types, setTypes] = useState([]);
  const [sums, setSums] = useState({});           // { typeId: { periodId: сумма } }
  const [refs, setRefs] = useState(null);
  const [open, setOpen] = useState(null);         // раскрытые папки; null = ещё не инициализировано
  const [showForm, setShowForm] = useState(false);
  const [formInit, setFormInit] = useState(null);   // предзаполнение формы (правка = сторно + повтор)
  const [ops, setOps] = useState([]);               // лента операций недели
  const [opsOpen, setOpsOpen] = useState(false);
  const [opBusy, setOpBusy] = useState(null);
  // Фильтры ленты — клиентские, по уже загруженным операциям недели
  // (вид дохода §6, контрагент §5, диапазон дат внутри недели §4).
  const [opF, setOpF] = useState({ typeId: "", counterpartyId: "", from: "", to: "" });
  const isFinAdmin = ["owner", "fin_director"].includes(profile?.role);
  const canReverse = isFinAdmin || ["accountant", "location_manager"].includes(profile?.role);
  const isClosed = period?.status === "closed";
  const [rulesByType, setRulesByType] = useState({}); // схемы распределения по видам дохода
  const [funds, setFunds] = useState([]);
  const [schemeType, setSchemeType] = useState(null); // вид дохода для модала «Схема»
  const [archBusy, setArchBusy] = useState(null);     // id вида дохода в процессе архивирования
  const [editingType, setEditingType] = useState(null); // "new" | объект вида/папки для правки | null

  // Неделя — из общего контекста (выбирается в шапке)
  const periods = useMemo(() => ({ cur: period, prev: prevPeriod }), [period, prevPeriod]);

  const loadStatic = useCallback(async () => {
    setLoadError("");
    try {
      const [list, refData, rbt, fs] = await Promise.all([
        fetchIncomeTypes(), fetchIncomeRefs(),
        isFinAdmin ? fetchRulesByIncomeType() : Promise.resolve({}),
        isFinAdmin ? fetchFunds() : Promise.resolve([]),
      ]);
      setTypes(list); setRefs(refData); setRulesByType(rbt);
      setFunds(fs.sort((a, b) => a.code.localeCompare(b.code, "ru", { numeric: true })));
    } catch (e) {
      setLoadError("Не удалось загрузить данные: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [isFinAdmin]);
  useEffect(() => { loadStatic(); }, [loadStatic]);

  const reloadRules = useCallback(async () => {
    if (isFinAdmin) setRulesByType(await fetchRulesByIncomeType());
  }, [isFinAdmin]);

  const reloadTypes = useCallback(async () => { setTypes(await fetchIncomeTypes()); }, []);

  const loadSums = useCallback(async () => {
    try {
      setSums(await fetchIncomeSums([period?.id, prevPeriod?.id], ctxLocationId));
    } catch (e) {
      setLoadError("Не удалось загрузить суммы периода: " + (e?.message || e));
    }
  }, [period?.id, prevPeriod?.id, ctxLocationId]);
  useEffect(() => { if (!periodsLoading) loadSums(); }, [loadSums, periodsLoading]);

  const loadOps = useCallback(async () => {
    if (!period?.id) { setOps([]); return; }
    try { setOps(await fetchIncomeOperations({ periodId: period.id, locationId: ctxLocationId })); }
    catch (e) { setLoadError("Не удалось загрузить операции: " + (e?.message || e)); }
  }, [period?.id, ctxLocationId]);
  useEffect(() => { if (!periodsLoading) loadOps(); }, [loadOps, periodsLoading]);

  // id операций, у которых есть сторно (нельзя отменять повторно)
  const reversedIds = useMemo(() => {
    const s = new Set();
    ops.forEach((o) => { if (o.reverses_income_id) s.add(o.reverses_income_id); });
    return s;
  }, [ops]);

  // Опции селектов — только встречающиеся в ленте значения (а не весь справочник),
  // чтобы не плодить пустые варианты. [id, {code?, name}].
  const opTypeOpts = useMemo(() => {
    const m = new Map();
    ops.forEach((o) => { if (o.income_type_id && o.income_type) m.set(o.income_type_id, o.income_type); });
    return [...m.entries()].sort((a, b) => (a[1].code || a[1].name).localeCompare(b[1].code || b[1].name, "ru", { numeric: true }));
  }, [ops]);
  const opCpOpts = useMemo(() => {
    const m = new Map();
    ops.forEach((o) => { if (o.counterparty_id && o.counterparty) m.set(o.counterparty_id, o.counterparty); });
    return [...m.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name, "ru"));
  }, [ops]);
  const opsFiltered = useMemo(() => ops.filter((o) => {
    if (opF.typeId && o.income_type_id !== opF.typeId) return false;
    if (opF.counterpartyId && o.counterparty_id !== opF.counterpartyId) return false;
    if (opF.from && o.received_on < opF.from) return false;   // received_on = 'YYYY-MM-DD' → строковое сравнение корректно
    if (opF.to && o.received_on > opF.to) return false;
    return true;
  }), [ops, opF]);
  const opFActive = !!(opF.typeId || opF.counterpartyId || opF.from || opF.to);

  const refresh = useCallback(async () => { await Promise.all([loadSums(), loadOps()]); }, [loadSums, loadOps]);

  const doReverse = async (op) => {
    if (opBusy) return;
    if (!window.confirm(`Отменить операцию дохода ${fmt(Number(op.amount))} ${op.currency?.code || ""}? Будет проведено сторно — сумма снимется со счёта ДС.`)) return;
    setOpBusy(`rev:${op.id}`); setLoadError("");
    try { await reverseIncome(op.id); await refresh(); }
    catch (e) { setLoadError(e?.message || String(e)); }
    finally { setOpBusy(null); }
  };

  // Правка = сторно исходной операции + форма, предзаполненная её значениями
  const doEdit = async (op) => {
    if (opBusy) return;
    if (!window.confirm(`Изменить операцию? Текущая будет отменена (сторно), затем введите исправленную.`)) return;
    setOpBusy(`edit:${op.id}`); setLoadError("");
    try {
      await reverseIncome(op.id);
      await refresh();
      setFormInit({
        typeId: op.income_type_id || "", amount: String(op.amount ?? ""), currencyId: op.currency_id || "",
        date: op.received_on, accountId: op.cash_account_id || "", payTypeId: op.payment_type_id || "",
        locationId: op.location_id || "", counterpartyId: op.counterparty_id || "",
        isReturn: false, basisDocument: op.basis_document || "", comment: op.comment || "",
      });
      setShowForm(true);
    } catch (e) { setLoadError(e?.message || String(e)); }
    finally { setOpBusy(null); }
  };

  // Архивирование вида дохода прямо из дерева (только финадмин, RLS
  // itypes_write = is_fin_admin). Восстановление — в разделе «Архив».
  // Кнопка показывается лишь у видов без вложенных статей: архив папки с
  // активными статьями скрыл бы их из дерева, поэтому такой случай отсекаем.
  const doArchiveType = async (t) => {
    if (archBusy) return;
    if (t.children?.length) {
      setLoadError(`«${t.name}» содержит активные статьи — сначала заархивируйте их.`);
      return;
    }
    if (!window.confirm(`Заархивировать вид дохода «${t.code ? t.code + " " : ""}${t.name}»? Он исчезнет из выбора при вводе дохода. Восстановить можно в разделе «Архив». Проведённые операции в Реестре не затрагиваются.`)) return;
    setArchBusy(t.id); setLoadError("");
    try {
      await setIncomeTypeArchived(t.id, true);
      setTypes((ts) => ts.filter((x) => x.id !== t.id));
    } catch (e) {
      const msg = e?.message || String(e);
      setLoadError(msg.includes("row-level security") ? "Нет прав на изменение справочника видов дохода." : msg);
    } finally { setArchBusy(null); }
  };

  // Дерево из плоского списка; сортировка по коду
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
  const typeById = useMemo(() => Object.fromEntries(types.map((t) => [t.id, t])), [types]);

  useEffect(() => {
    if (open === null && tree.length) setOpen({ [tree[0].id]: true });
  }, [tree, open]);

  // Свод сумм с подъёмом по дереву: узел = своё + сумма детей
  const rolled = useMemo(() => {
    const out = {};
    const walk = (node) => {
      const own = sums[node.id] || {};
      let cur = own[periods.cur?.id] || 0;
      let prev = own[periods.prev?.id] || 0;
      node.children.forEach((c) => { const r = walk(c); cur += r.cur; prev += r.prev; });
      return (out[node.id] = { cur, prev });
    };
    tree.forEach(walk);
    return out;
  }, [tree, sums, periods]);

  const totals = useMemo(() => tree.reduce(
    (acc, t) => ({ cur: acc.cur + (rolled[t.id]?.cur || 0), prev: acc.prev + (rolled[t.id]?.prev || 0) }),
    { cur: 0, prev: 0 },
  ), [tree, rolled]);

  // Точка вида дохода: своя или ближайшего предка
  const locationOf = useCallback((typeId) => {
    let t = typeById[typeId];
    while (t) { if (t.location_id) return t.location_id; t = typeById[t.parent_id]; }
    return null;
  }, [typeById]);

  const delta = (cur, prev) => {
    if (!prev && !cur) return null;
    if (!prev) return { pct: 100, up: true };
    const d = ((cur - prev) / prev) * 100;
    return { pct: Math.abs(d), up: d >= 0 };
  };

  const Trend = ({ cur, prev, big }) => {
    const d = delta(cur, prev);
    if (!d) return <span style={{ ...st.trend, color: C.faint }}>—</span>;
    const col = d.up ? C.money : C.danger;
    return (
      <span style={{ ...st.trend, color: col, fontSize: big ? 13 : 12 }}>
        {d.up ? <ArrowUpRight size={big ? 15 : 13} /> : <ArrowDownRight size={big ? 15 : 13} />}
        {d.pct.toFixed(0)}%
      </span>
    );
  };

  if (loading || periodsLoading) return <div style={st.empty}><Loader2 size={18} className="spin" /> Загрузка…</div>;

  return (<>
    {loadError && <div style={st.reqError}><AlertCircle size={15} /> {loadError}</div>}

    {/* Сводка периода */}
    <section style={st.incHero}>
      <div style={st.incHeroGlow} />
      <div style={st.incHeroInner}>
        <div>
          <div style={st.incHeroLabel}>Выручка за период · {period ? periodTitle(period) : "период не создан"}</div>
          <div style={st.incHeroValue}>{fmt(totals.cur)} <span style={st.incHeroUnit}>TJS</span></div>
          <div style={st.incHeroSub}>
            <Trend cur={totals.cur} prev={totals.prev} big /> к прошлому периоду · было {fmt(totals.prev)}
          </div>
        </div>
        <button style={{ ...st.btnGreen, opacity: isClosed ? 0.5 : 1, cursor: isClosed ? "not-allowed" : "pointer" }}
          className="btn" onClick={() => !isClosed && setShowForm(true)} disabled={isClosed}
          title={isClosed ? "Период закрыт Директивой — ввод дохода недоступен" : "Добавить операцию дохода"}>
          <Plus size={15} /> Добавить доход
        </button>
      </div>
    </section>

    {isClosed && (
      <div style={st.reqError}>
        <AlertCircle size={15} /> Период закрыт Директивой — ввод дохода недоступен. Открыть неделю можно в Директиве.
      </div>
    )}

    {/* Дерево видов дохода */}
    {isFinAdmin && (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, margin: "2px 2px 10px" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.sub }}>Виды дохода</span>
        <button style={st.btnGhost} className="btn" onClick={() => setEditingType("new")}>
          <Plus size={15} /> Вид дохода
        </button>
      </div>
    )}
    {!tree.length && !loadError && (
      <div style={{ ...st.dataCard, ...st.empty }}>
        Справочник видов дохода пуст. Примените сид-миграцию из supabase/migrations (см. supabase/README.md).
      </div>
    )}
    <div style={st.incList}>
      {tree.map((loc, i) => {
        const isOpen = !!open?.[loc.id];
        const hasChildren = loc.children.length > 0;
        const r = rolled[loc.id] || { cur: 0, prev: 0 };
        return (
          <div key={loc.id} style={st.dataCard}>
            <div style={st.locHead} className="locHead" onClick={() => hasChildren && setOpen((o) => ({ ...o, [loc.id]: !o?.[loc.id] }))}>
              <div style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", flexShrink: 0,
                background: `${C.chartPalette[i % C.chartPalette.length]}22`, color: C.chartPalette[i % C.chartPalette.length] }}>
                <Store size={18} />
              </div>
              <div style={st.locTitle}>
                <div style={st.locName}>{loc.name}</div>
                <div style={st.locCode}>{loc.code}{hasChildren ? ` · ${loc.children.length} статей` : ""}</div>
              </div>
              <div style={st.locRight}>
                <div style={st.locSum}>{fmt(r.cur)} <span style={st.locUnit}>TJS</span></div>
                <Trend cur={r.cur} prev={r.prev} />
              </div>
              {isFinAdmin && (
                <button style={{ ...st.iconBtn, padding: 4, color: (rulesByType[loc.id]?.length ? C.green : C.faint), flexShrink: 0 }} className="btn"
                  title="Схема распределения по фондам" onClick={(e) => { e.stopPropagation(); setSchemeType(loc); }}>
                  <Calculator size={16} />
                </button>
              )}
              {isFinAdmin && (
                <button style={{ ...st.iconBtn, padding: 4, color: C.faint, flexShrink: 0 }} className="btn"
                  title="Редактировать" onClick={(e) => { e.stopPropagation(); setEditingType(loc); }}>
                  <Pencil size={15} />
                </button>
              )}
              {isFinAdmin && !hasChildren && (
                <button style={{ ...st.iconBtn, padding: 4, color: C.faint, flexShrink: 0 }} className="btn"
                  title="В архив" disabled={archBusy === loc.id}
                  onClick={(e) => { e.stopPropagation(); doArchiveType(loc); }}>
                  {archBusy === loc.id ? <Loader2 size={15} className="spin" /> : <Archive size={16} />}
                </button>
              )}
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
                {loc.children.map((c) => {
                  const rc = rolled[c.id] || { cur: 0, prev: 0 };
                  const hasScheme = rulesByType[c.id]?.length;
                  const calcBtn = isFinAdmin ? (
                    <button style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", flexShrink: 0,
                        border: `1px solid ${hasScheme ? C.green : C.line}`, background: hasScheme ? `${C.green}1a` : "transparent",
                        color: hasScheme ? C.green : C.faint, cursor: "pointer" }}
                      className="btn" title="Схема распределения по фондам" onClick={(e) => { e.stopPropagation(); setSchemeType(c); }}>
                      <Calculator size={15} />
                    </button>
                  ) : null;
                  const editBtn = isFinAdmin ? (
                    <button style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", flexShrink: 0,
                        border: `1px solid ${C.line}`, background: "transparent", color: C.faint, cursor: "pointer" }}
                      className="btn" title="Редактировать" onClick={(e) => { e.stopPropagation(); setEditingType(c); }}>
                      <Pencil size={15} />
                    </button>
                  ) : null;
                  const archBtn = isFinAdmin && !c.children.length ? (
                    <button style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", flexShrink: 0,
                        border: `1px solid ${C.line}`, background: "transparent", color: C.faint, cursor: "pointer" }}
                      className="btn" title="В архив" disabled={archBusy === c.id}
                      onClick={(e) => { e.stopPropagation(); doArchiveType(c); }}>
                      {archBusy === c.id ? <Loader2 size={15} className="spin" /> : <Archive size={15} />}
                    </button>
                  ) : null;

                  if (isMobile) {
                    return (
                      <div key={c.id} style={{ padding: "11px 18px", borderTop: `1px solid ${C.line}` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <span style={st.itemCode}>{c.code}</span>
                          <span style={{ fontWeight: 600, fontSize: 13, flex: 1, minWidth: 0 }}>{c.name}</span>
                          {calcBtn}
                          {editBtn}
                          {archBtn}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <div>
                            <div style={{ fontSize: 10, color: C.faint }}>Было</div>
                            <div className="denseNum" style={{ fontSize: 13, fontWeight: 600 }}>{fmt(rc.prev)}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: C.faint }}>Стало</div>
                            <div className="denseNum" style={{ fontSize: 13, fontWeight: 700, color: rc.cur ? C.money : C.faint }}>{fmt(rc.cur)}</div>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={c.id} style={st.itemRow} className="itemRow">
                      <div style={st.itemName}>
                        <span style={st.itemCode}>{c.code}</span>
                        <span>{c.name}</span>
                        {calcBtn}
                        {editBtn}
                        {archBtn}
                      </div>
                      <div style={st.itemPrev}>{fmt(rc.prev)}</div>
                      <div style={{ ...st.itemCur, color: rc.cur ? C.money : C.faint }}>{fmt(rc.cur)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>

    {/* Лента отдельных операций дохода недели (ManaJet FpIncome) */}
    <div style={{ ...st.dataCard, marginTop: 14 }}>
      <div style={st.locHead} className="locHead" onClick={() => setOpsOpen((v) => !v)}>
        <div style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", flexShrink: 0, background: `${C.info}22`, color: C.info }}>
          <List size={18} />
        </div>
        <div style={st.locTitle}>
          <div style={st.locName}>Операции дохода</div>
          <div style={st.locCode}>{ops.length ? `${opFActive ? `${opsFiltered.length} из ${ops.length}` : ops.length} операций за неделю` : "за неделю операций нет"}</div>
        </div>
        <span style={{ ...st.locChevron, transform: opsOpen ? "rotate(90deg)" : "none" }}><ChevronRight size={18} /></span>
      </div>

      {opsOpen && (
        <div style={st.locBody}>
          {!ops.length && <div style={{ ...st.empty, padding: "14px 0" }}>Операций за эту неделю пока нет</div>}
          {ops.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "10px 14px", borderTop: `1px solid ${C.line}` }}>
              <select style={{ ...st.mdSelect, flex: isMobile ? "1 1 100%" : "1 1 160px", minWidth: 0 }} className="fin"
                value={opF.typeId} onChange={(e) => setOpF((p) => ({ ...p, typeId: e.target.value }))} aria-label="Вид дохода">
                <option value="">Все виды дохода</option>
                {opTypeOpts.map(([id, t]) => <option key={id} value={id}>{t.code ? `${t.code} ` : ""}{t.name}</option>)}
              </select>
              {opCpOpts.length > 0 && (
                <select style={{ ...st.mdSelect, flex: isMobile ? "1 1 100%" : "1 1 160px", minWidth: 0 }} className="fin"
                  value={opF.counterpartyId} onChange={(e) => setOpF((p) => ({ ...p, counterpartyId: e.target.value }))} aria-label="Контрагент">
                  <option value="">Все контрагенты</option>
                  {opCpOpts.map(([id, c]) => <option key={id} value={id}>{c.name}</option>)}
                </select>
              )}
              <input style={{ ...st.mdInput, flex: isMobile ? "1 1 46%" : "0 1 140px", minWidth: 0 }} className="fin" type="date"
                value={opF.from} max={opF.to || undefined} onChange={(e) => setOpF((p) => ({ ...p, from: e.target.value }))} aria-label="С даты" title="С даты" />
              <input style={{ ...st.mdInput, flex: isMobile ? "1 1 46%" : "0 1 140px", minWidth: 0 }} className="fin" type="date"
                value={opF.to} min={opF.from || undefined} onChange={(e) => setOpF((p) => ({ ...p, to: e.target.value }))} aria-label="По дату" title="По дату" />
              {opFActive && (
                <button style={{ ...st.btnGhost, padding: "6px 12px" }} className="btn"
                  onClick={() => setOpF({ typeId: "", counterpartyId: "", from: "", to: "" })}>
                  <X size={14} /> Сбросить
                </button>
              )}
            </div>
          )}
          {ops.length > 0 && !opsFiltered.length && <div style={{ ...st.empty, padding: "14px 0" }}>По выбранному фильтру операций нет</div>}
          {opsFiltered.map((op) => {
            const isReversed = reversedIds.has(op.id);
            const isStorno = !!op.reverses_income_id;       // сама запись-сторно
            const allowReverse = canReverse && !isClosed && !op.is_return && !isReversed;
            const sign = op.is_return ? "−" : "+";
            const col = op.is_return ? C.danger : C.money;
            return (
              <div key={op.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                borderTop: `1px solid ${C.line}`, opacity: isReversed ? 0.55 : 1, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {op.income_type ? `${op.income_type.code || ""} ${op.income_type.name}` : "—"}
                    {op.counterparty ? ` · ${op.counterparty.name}` : ""}
                  </div>
                  <div style={{ fontSize: 11.5, color: C.faint, display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
                    <span><CalendarDays size={11} style={{ verticalAlign: -1, marginRight: 3 }} />{new Date(op.received_on + "T00:00:00").toLocaleDateString("ru")}</span>
                    {op.cash_account && <span>· {op.cash_account.name}</span>}
                    {op.payment_type && <span>· {op.payment_type.name}</span>}
                    {op.basis_document && <span title="Документ-основание"><FileText size={11} style={{ verticalAlign: -1, marginRight: 3 }} />{op.basis_document}</span>}
                    {isStorno && <span style={{ color: C.danger }}>· сторно</span>}
                    {isReversed && <span>· отменена</span>}
                    {op.comment && <span>· {op.comment}</span>}
                  </div>
                </div>
                <b style={{ color: col, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                  {sign}{fmt(Number(op.amount))} <span style={{ fontSize: 11, color: C.faint }}>{op.currency?.code}</span>
                </b>
                {allowReverse && (
                  <span style={{ display: "inline-flex", gap: 4, flexShrink: 0 }}>
                    <button style={{ ...st.iconBtn, width: 28, height: 28 }} className="btn" title="Изменить (сторно + повтор)"
                      disabled={!!opBusy} onClick={() => doEdit(op)}>
                      {opBusy === `edit:${op.id}` ? <Loader2 size={13} className="spin" /> : <Pencil size={13} />}
                    </button>
                    <button style={{ ...st.iconBtn, width: 28, height: 28, color: C.danger }} className="btn" title="Отменить (сторно)"
                      disabled={!!opBusy} onClick={() => doReverse(op)}>
                      {opBusy === `rev:${op.id}` ? <Loader2 size={13} className="spin" /> : <Undo2 size={13} />}
                    </button>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>

    {showForm && refs && (
      <IncomeForm
        refs={refs} tree={tree} byParent={byParent} locationOf={locationOf}
        period={period} ctxLocationId={ctxLocationId} profile={profile} isMobile={isMobile} C={C} st={st}
        initVals={formInit}
        onClose={() => { setShowForm(false); setFormInit(null); }}
        onSaved={() => { setShowForm(false); setFormInit(null); refresh(); }}
      />
    )}
    {schemeType && (
      <SchemeModal C={C} st={st} type={schemeType}
        rules={rulesByType[schemeType.id] || []} funds={funds}
        onChanged={reloadRules} onClose={() => setSchemeType(null)} />
    )}
    {editingType && (
      <IncomeTypeFormModal st={st}
        node={editingType === "new" ? null : editingType}
        folders={tree} locations={refs?.locations || []}
        onClose={() => setEditingType(null)}
        onSaved={async () => { setEditingType(null); await reloadTypes(); }} />
    )}
  </>);
}

// ---------------------------------------------------------------- Схема распределения вида дохода
// Свои проценты: «этот доход → какому фонду сколько %» (ФРС, ТЗ §4.1.3).
// Используется калькулятором Директивы для автоматического расчёта.
const STAGE_OPTS = [["revenue", "Выручка"], ["margin", "Маржинальный"], ["adjusted", "Скорректированный"]];

function SchemeModal({ C, st, type, rules, funds, onChanged, onClose }) {
  useScrollLock();
  const [f, setF] = useState({ fundId: "", percent: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const add = async () => {
    if (busy) return;
    setErr("");
    const pct = parseFloat(String(f.percent).replace(",", "."));
    if (!f.fundId) return setErr("Выберите фонд");
    // Этап правила берётся из самого фонда (одноэтапный фонд, funds-spec §10) —
    // отдельно в схеме доходов не выбирается, редактируется только в «Фондах».
    const fund = funds.find((fd) => fd.id === f.fundId);
    if (!fund?.stage) return setErr("У выбранного фонда не задан этап — задайте его в разделе «Фонды»");
    if (!pct || pct <= 0 || pct > 100) return setErr("Процент: от 0 до 100");
    setBusy(true);
    try {
      await addDistributionRule({ fundId: f.fundId, incomeTypeId: type.id, stage: fund.stage, percent: pct });
      await onChanged();
      setF((p) => ({ ...p, fundId: "", percent: "" }));
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(false); }
  };
  const del = async (r) => {
    if (busy) return;
    setBusy(true); setErr("");
    try { await deleteDistributionRule(r.id); await onChanged(); }
    catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div style={st.mdOverlay} data-modal="1" onClick={onClose}>
      <div style={{ ...st.mdCard, width: "min(560px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>Схема · {type.code ? `${type.code} ` : ""}{type.name}</div>
          <button style={st.iconBtn} onClick={onClose} aria-label="Закрыть"><X size={17} /></button>
        </div>
        <div style={{ fontSize: 12, color: C.sub, marginBottom: 10 }}>
          Сколько процентов от этого дохода в какой фонд — Директива посчитает суммы автоматически. Этап распределения берётся из самого фонда (раздел «Фонды»).
        </div>

        {!rules.length && <div style={{ ...st.empty, padding: 14 }}>Правил пока нет — добавьте первое ниже</div>}
        <div style={{ display: "grid", gap: 5, maxHeight: 300, overflowY: "auto", marginBottom: 12 }}>
          {rules.map((r) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, background: C.panel2, border: `1px solid ${C.line}`, fontSize: 12.5 }}>
              <span style={st.itemCode}>{r.fund?.code}</span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.fund?.name}</span>
              <span style={{ ...st.weekTag, marginLeft: 0 }}>{STAGE_OPTS.find(([k]) => k === r.stage)?.[1]}</span>
              <b>{r.percent ? `${Number(r.percent)}%` : fmt(Number(r.fixed_amount))}</b>
              <button style={{ ...st.iconBtn, color: C.danger, padding: 4 }} className="btn" disabled={busy} onClick={() => del(r)} aria-label="Удалить">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gap: 8, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
          <select style={st.mdSelect} className="fin" value={f.fundId} onChange={(e) => setF((p) => ({ ...p, fundId: e.target.value }))}>
            <option value="">— фонд —</option>
            {funds.map((fd) => <option key={fd.id} value={fd.id}>{fd.code} — {fd.name}{fd.stage ? ` · ${STAGE_OPTS.find(([k]) => k === fd.stage)?.[1] || ""}` : " · этап не задан"}</option>)}
          </select>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input style={{ ...st.mdInput, flex: 1, minWidth: 90 }} className="fin" inputMode="decimal" placeholder="%"
              value={f.percent} onChange={(e) => setF((p) => ({ ...p, percent: e.target.value }))} />
            <button style={{ ...st.btnGreen, whiteSpace: "nowrap", opacity: busy ? 0.7 : 1 }} className="btn" onClick={add} disabled={busy}>
              {busy ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Добавить
            </button>
          </div>
        </div>
        {err && <div role="alert" style={st.reqError}><AlertCircle size={15} /> {err}</div>}
      </div>
    </div>
  );
}


// ---------------------------------------------------------------- Вид дохода / папка
// Создание и правка справочника income_types (только финадмин, RLS
// itypes_write = is_fin_admin). Тип: «папка-направление» (parent_id = null,
// со своей точкой) или «вид дохода» (лист в выбранной папке). Оформление —
// как у модалки фонда (Funds.jsx). Схема распределения — отдельной кнопкой.
function IncomeTypeFormModal({ st, node, folders, locations, onClose, onSaved }) {
  useScrollLock();
  const isEdit = !!node;
  const [isFolder, setIsFolder] = useState(isEdit ? !node.parent_id : false);
  const [f, setF] = useState({
    code: node?.code || "", name: node?.name || "",
    parentId: node?.parent_id || "", locationId: node?.location_id || "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (busy) return;
    setErr("");
    if (!f.name.trim()) return setErr("Укажите название");
    if (!isFolder && !f.parentId) return setErr("Выберите папку-направление для вида дохода");
    setBusy(true);
    try {
      if (isEdit) {
        const patch = isFolder
          ? { code: f.code.trim() || null, name: f.name.trim(), location_id: f.locationId || null }
          : { code: f.code.trim() || null, name: f.name.trim(), parent_id: f.parentId };
        await updateIncomeType(node.id, patch);
      } else if (isFolder) {
        await createIncomeType({ code: f.code.trim(), name: f.name.trim(), parentId: null, locationId: f.locationId || null });
      } else {
        await createIncomeType({ code: f.code.trim(), name: f.name.trim(), parentId: f.parentId });
      }
      await onSaved();
    } catch (e) {
      const msg = e?.message || String(e);
      setErr(
        msg.includes("row-level security") ? "Нет прав на изменение справочника видов дохода."
          : msg.includes("duplicate") ? "Вид дохода с таким кодом уже существует" : msg,
      );
      setBusy(false);
    }
  };

  return (
    <div style={st.mdOverlay} data-modal="1" onClick={onClose}>
      <div style={{ ...st.mdCard, width: "min(460px, 100%)", maxHeight: "92vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>{isEdit ? (isFolder ? "Редактировать папку" : "Редактировать вид дохода") : "Новый вид дохода"}</div>
          <button style={st.iconBtn} onClick={onClose} aria-label="Закрыть"><X size={17} /></button>
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Код (номер)</span>
            <input style={st.mdInput} className="fin" placeholder="напр. D10" autoFocus
              value={f.code} onChange={(e) => setF((p) => ({ ...p, code: e.target.value }))} />
          </div>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Название</span>
            <input style={st.mdInput} className="fin" placeholder={isFolder ? "Направление…" : "Название вида дохода…"}
              value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} />
          </div>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Тип</span>
            <select style={st.mdSelect} className="fin" value={isFolder ? "folder" : "leaf"} disabled={isEdit}
              onChange={(e) => setIsFolder(e.target.value === "folder")}>
              <option value="leaf">Вид дохода (статья)</option>
              <option value="folder">Папка (направление)</option>
            </select>
          </div>
          {isFolder ? (
            <div style={st.reqField}>
              <span style={st.reqFieldLbl}>Точка</span>
              <select style={st.mdSelect} className="fin" value={f.locationId} onChange={(e) => setF((p) => ({ ...p, locationId: e.target.value }))}>
                <option value="">— вся сеть —</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          ) : (
            <div style={st.reqField}>
              <span style={st.reqFieldLbl}>Находится в папке</span>
              <select style={st.mdSelect} className="fin" value={f.parentId}
                onChange={(e) => setF((p) => ({ ...p, parentId: e.target.value }))}>
                <option value="">— выберите папку —</option>
                {folders.map((fl) => <option key={fl.id} value={fl.id}>{fl.code ? `${fl.code} ` : ""}{fl.name}</option>)}
              </select>
            </div>
          )}
        </div>
        {err && <div role="alert" style={st.reqError}><AlertCircle size={15} /> {err}</div>}
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

// ---------------------------------------------------------------- Форма ввода дохода
// Field — на уровне модуля, иначе пересоздание компонента на каждый рендер
// размонтировало бы input и сбрасывало фокус при вводе.
const Field = ({ st, label, full, children }) => (
  <div style={{ ...st.reqField, ...(full ? st.mdFull : {}) }}>
    <span style={st.reqFieldLbl}>{label}</span>
    {children}
  </div>
);

function IncomeForm({ refs, tree, byParent, locationOf, period, ctxLocationId, profile, isMobile, C, st, initVals, onClose, onSaved }) {
  useScrollLock();
  const baseCur = refs.currencies.find((c) => c.is_base) || refs.currencies[0];
  // Дата по умолчанию: сегодня, если попадает в выбранную неделю, иначе её начало
  const today = isoDate(new Date());
  const defDate = period && (today < period.starts_on || today > period.ends_on)
    ? period.starts_on : today;
  const [f, setF] = useState({
    typeId: "", amount: "", currencyId: baseCur?.id || "", date: defDate,
    accountId: "", payTypeId: "", locationId: ctxLocationId || "", counterpartyId: "",
    isReturn: false, basisDocument: "", comment: "",
    ...(initVals || {}),
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e?.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e }));

  // Листья дерева, сгруппированные по корневым папкам (вид без детей — лист)
  const groups = useMemo(() => tree.map((root) => {
    const leaves = [];
    const walk = (n) => { if (!n.children.length) leaves.push(n); else n.children.forEach(walk); };
    walk(root);
    return { root, leaves };
  }).filter((g) => g.leaves.length), [tree]);

  const derivedLoc = f.typeId ? locationOf(f.typeId) : null;
  const locationId = derivedLoc || f.locationId;
  const accounts = refs.accounts.filter((a) => a.currency_id === f.currencyId);

  const submit = async () => {
    if (busy) return;
    setErr("");
    const amount = parseFloat(String(f.amount).replace(",", "."));
    if (!f.typeId) return setErr("Выберите вид дохода");
    if (!amount || amount <= 0) return setErr("Введите сумму больше нуля");
    if (!locationId) return setErr("Выберите точку");
    if (!f.accountId) return setErr(accounts.length ? "Выберите счёт ДС — куда пришли деньги" : "Нет счетов ДС в этой валюте — добавьте счёт в Контроле средств");
    if (!f.payTypeId) return setErr("Выберите способ оплаты");
    setBusy(true);
    try {
      const period = await getPeriodFor(new Date(f.date + "T00:00:00"), { create: true });
      if (!period) throw new Error("Период ФП для этой даты не создан. Создать период может финдиректор или владелец.");
      if (period.status === "closed") throw new Error("Период ФП этой даты закрыт Директивой — операции запрещены.");

      const cur = refs.currencies.find((c) => c.id === f.currencyId);
      let amountBase = amount;
      if (!cur.is_base) {
        const rate = await findRate(f.currencyId, baseCur.id, f.date);
        if (!rate) throw new Error(`Нет курса ${cur.code} → ${baseCur.code} на ${f.date}. Добавьте курс в справочник курсов валют.`);
        amountBase = amount * rate;
      }

      await insertIncome({
        income_type_id: f.typeId, location_id: locationId, period_id: period.id,
        amount, currency_id: f.currencyId, amount_base: amountBase, received_on: f.date,
        cash_account_id: f.accountId, payment_type_id: f.payTypeId,
        counterparty_id: f.counterpartyId || null,
        is_return: f.isReturn, basis_document: f.basisDocument.trim() || null,
        comment: f.comment.trim() || null, created_by: profile.id,
      });
      onSaved();
    } catch (e) {
      const msg = e?.message || String(e);
      setErr(msg.includes("row-level security") ? "Нет прав на ввод дохода по этой точке." : msg);
      setBusy(false);
    }
  };

  return (
    <div style={st.mdOverlay} data-modal="1" onClick={onClose}>
      <div style={st.mdCard} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>{initVals ? "Исправление операции дохода" : "Операция дохода"}</div>
          <button style={st.iconBtn} onClick={onClose} aria-label="Закрыть"><X size={17} /></button>
        </div>

        <div style={{ ...st.mdGrid, ...(isMobile ? { gridTemplateColumns: "1fr" } : {}) }}>
          <Field st={st} label="Вид дохода" full>
            <select style={st.mdSelect} className="fin" value={f.typeId} onChange={set("typeId")} autoFocus>
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
            <select style={st.mdSelect} className="fin" value={f.currencyId}
              onChange={(e) => setF((p) => ({ ...p, currencyId: e.target.value, accountId: "" }))}>
              {refs.currencies.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </select>
          </Field>

          <Field st={st} label="Дата поступления">
            <input style={st.mdInput} className="fin" type="date" value={f.date} onChange={set("date")} />
          </Field>
          <Field st={st} label="Точка">
            <select style={st.mdSelect} className="fin" value={locationId || ""}
              onChange={set("locationId")} disabled={!!derivedLoc}>
              <option value="">— выберите —</option>
              {refs.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>

          <Field st={st} label="Счёт ДС — куда пришли деньги">
            <select style={st.mdSelect} className="fin" value={f.accountId} onChange={set("accountId")}>
              <option value="">— выберите —</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field st={st} label="Способ оплаты">
            <select style={st.mdSelect} className="fin" value={f.payTypeId} onChange={set("payTypeId")}>
              <option value="">— выберите —</option>
              {refs.payTypes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>

          <Field st={st} label="Клиент (необязательно)" full>
            <select style={st.mdSelect} className="fin" value={f.counterpartyId} onChange={set("counterpartyId")}>
              <option value="">— не выбран —</option>
              {(refs.counterparties || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>

          <Field st={st} label="Документ-основание (необязательно)" full>
            <input style={st.mdInput} className="fin" placeholder="№ счёта / договора / чека / акта…"
              value={f.basisDocument} onChange={set("basisDocument")} />
          </Field>

          <Field st={st} label="Комментарий" full>
            <input style={st.mdInput} className="fin" placeholder="Примечание…"
              value={f.comment} onChange={set("comment")} />
          </Field>

          <label style={{ ...st.mdCheck, ...st.mdFull }}>
            <input type="checkbox" checked={f.isReturn} onChange={set("isReturn")} />
            Возврат клиенту (уменьшает доход)
          </label>
        </div>

        {err && <div role="alert" style={st.reqError}><AlertCircle size={15} /> {err}</div>}

        <div style={st.mdActions}>
          <button style={st.btnGhost} className="btn" onClick={onClose}>Отмена</button>
          <button style={{ ...st.btnGreen, opacity: busy ? 0.7 : 1 }} className="btn" onClick={submit} disabled={busy}>
            {busy ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} Провести доход
          </button>
        </div>
      </div>
    </div>
  );
}
