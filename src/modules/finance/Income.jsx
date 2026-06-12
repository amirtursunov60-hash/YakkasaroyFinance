import { useState, useMemo, useEffect, useCallback } from "react";
import { ArrowUpRight, ArrowDownRight, ChevronRight, Plus, X, Loader2, AlertCircle } from "lucide-react";
import { useTheme } from "../../theme/theme";
import { fmt } from "../../utils/format";
import {
  isoDate, weekBounds, getPeriodFor, getPrevPeriodFor,
  fetchIncomeTypes, fetchIncomeSums, fetchIncomeRefs, findRate, insertIncome,
} from "../../lib/api";


// ---------------------------------------------------------------- INCOME
// Живые данные: дерево видов дохода (income_types), суммы текущей и прошлой
// недели ФП (incomes), форма ввода операции дохода.

const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const PALETTE = ["#e8911c", "#7bd88f", "#5bd6c9", "#5b8def", "#d6c14a", "#9c6ade", "#e0463b", "#2f9e44", "#d64ad6"];

const periodLabel = (date) => {
  const { start, end } = weekBounds(date);
  const d2 = (n) => String(n).padStart(2, "0");
  return `${d2(start.getDate())}–${d2(end.getDate())} ${MONTHS[end.getMonth()]} ${end.getFullYear()}`;
};

export function Income() {
  const { C, st, isMobile, profile } = useTheme();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [types, setTypes] = useState([]);
  const [periods, setPeriods] = useState({ cur: null, prev: null });
  const [sums, setSums] = useState({});           // { typeId: { periodId: сумма } }
  const [refs, setRefs] = useState(null);
  const [open, setOpen] = useState(null);         // раскрытые папки; null = ещё не инициализировано
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const today = new Date();
      const [list, cur, prev, refData] = await Promise.all([
        fetchIncomeTypes(), getPeriodFor(today), getPrevPeriodFor(today), fetchIncomeRefs(),
      ]);
      const sumData = await fetchIncomeSums([cur?.id, prev?.id]);
      setTypes(list); setPeriods({ cur, prev }); setSums(sumData); setRefs(refData);
    } catch (e) {
      setLoadError("Не удалось загрузить данные: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

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
    const col = d.up ? C.green : C.danger;
    return (
      <span style={{ ...st.trend, color: col, fontSize: big ? 13 : 12 }}>
        {d.up ? <ArrowUpRight size={big ? 15 : 13} /> : <ArrowDownRight size={big ? 15 : 13} />}
        {d.pct.toFixed(0)}%
      </span>
    );
  };

  if (loading) return <div style={st.empty}><Loader2 size={18} className="spin" /> Загрузка…</div>;

  return (<>
    {loadError && <div style={st.reqError}><AlertCircle size={15} /> {loadError}</div>}

    {/* Сводка периода */}
    <section style={st.incHero}>
      <div style={st.incHeroGlow} />
      <div style={st.incHeroInner}>
        <div>
          <div style={st.incHeroLabel}>Выручка за период · {periodLabel(new Date())}</div>
          <div style={st.incHeroValue}>{fmt(totals.cur)} <span style={st.incHeroUnit}>TJS</span></div>
          <div style={st.incHeroSub}>
            <Trend cur={totals.cur} prev={totals.prev} big /> к прошлому периоду · было {fmt(totals.prev)}
          </div>
        </div>
        <button style={st.btnGreen} className="btn" onClick={() => setShowForm(true)}>
          <Plus size={15} /> Добавить доход
        </button>
      </div>
    </section>

    {/* Дерево видов дохода */}
    {!tree.length && !loadError && (
      <div style={{ ...st.locCard, ...st.empty }}>
        Справочник видов дохода пуст. Примените сид-миграцию из supabase/migrations (см. supabase/README.md).
      </div>
    )}
    <div style={st.incList}>
      {tree.map((loc, i) => {
        const isOpen = !!open?.[loc.id];
        const hasChildren = loc.children.length > 0;
        const r = rolled[loc.id] || { cur: 0, prev: 0 };
        return (
          <div key={loc.id} style={st.locCard}>
            <div style={st.locHead} className="locHead" onClick={() => hasChildren && setOpen((o) => ({ ...o, [loc.id]: !o?.[loc.id] }))}>
              <div style={{ ...st.locDot, background: PALETTE[i % PALETTE.length] }} />
              <div style={st.locTitle}>
                <div style={st.locName}>{loc.name}</div>
                <div style={st.locCode}>{loc.code}{hasChildren ? ` · ${loc.children.length} статей` : ""}</div>
              </div>
              <div style={st.locRight}>
                <div style={st.locSum}>{fmt(r.cur)} <span style={st.locUnit}>TJS</span></div>
                <Trend cur={r.cur} prev={r.prev} />
              </div>
              {hasChildren && <span style={{ ...st.locChevron, transform: isOpen ? "rotate(90deg)" : "none" }}><ChevronRight size={18} /></span>}
            </div>

            {isOpen && hasChildren && (
              <div style={st.locBody}>
                <div style={st.itemHeadRow}>
                  <span />
                  <div style={st.itemHeadCell}>Было</div>
                  <div style={st.itemHeadCell}>Стало</div>
                </div>
                {loc.children.map((c) => {
                  const rc = rolled[c.id] || { cur: 0, prev: 0 };
                  return (
                    <div key={c.id} style={st.itemRow} className="itemRow">
                      <div style={st.itemName}>
                        <span style={st.itemCode}>{c.code}</span>
                        <span>{c.name}</span>
                      </div>
                      <div style={st.itemPrev}>{fmt(rc.prev)}</div>
                      <div style={{ ...st.itemCur, color: rc.cur ? C.green : C.faint }}>{fmt(rc.cur)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>

    {showForm && refs && (
      <IncomeForm
        refs={refs} tree={tree} byParent={byParent} locationOf={locationOf}
        profile={profile} isMobile={isMobile} C={C} st={st}
        onClose={() => setShowForm(false)}
        onSaved={() => { setShowForm(false); load(); }}
      />
    )}
  </>);
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

function IncomeForm({ refs, tree, byParent, locationOf, profile, isMobile, C, st, onClose, onSaved }) {
  const baseCur = refs.currencies.find((c) => c.is_base) || refs.currencies[0];
  const [f, setF] = useState({
    typeId: "", amount: "", currencyId: baseCur?.id || "", date: isoDate(new Date()),
    accountId: "", payTypeId: "", locationId: "", isReturn: false, comment: "",
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
        is_return: f.isReturn, comment: f.comment.trim() || null, created_by: profile.id,
      });
      onSaved();
    } catch (e) {
      const msg = e?.message || String(e);
      setErr(msg.includes("row-level security") ? "Нет прав на ввод дохода по этой точке." : msg);
      setBusy(false);
    }
  };

  return (
    <div style={st.mdOverlay} onClick={onClose}>
      <div style={st.mdCard} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>Операция дохода</div>
          <button style={st.iconBtn} onClick={onClose}><X size={17} /></button>
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

          <Field st={st} label="Комментарий" full>
            <input style={st.mdInput} className="fin" placeholder="Документ-основание, примечание…"
              value={f.comment} onChange={set("comment")} />
          </Field>

          <label style={{ ...st.mdCheck, ...st.mdFull }}>
            <input type="checkbox" checked={f.isReturn} onChange={set("isReturn")} />
            Возврат клиенту (уменьшает доход)
          </label>
        </div>

        {err && <div style={st.reqError}><AlertCircle size={15} /> {err}</div>}

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
