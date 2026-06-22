import { useState, useMemo, useEffect, useCallback } from "react";
import { ArrowUpRight, ArrowDownRight, ChevronRight, X, Loader2, AlertCircle, CheckCircle2, Receipt, Link2, Check } from "lucide-react";
import { useTheme } from "../../theme/theme";
import { useScrollLock } from "../../hooks/useScrollLock";
import { fmt } from "../../utils/format";
import { usePeriod, periodTitle } from "../../lib/PeriodCtx";
import {
  fetchExpenseTypes, fetchExpenseSums, fetchFunds, updateExpenseType,
} from "../../lib/api";


// ---------------------------------------------------------------- EXPENSES
// Живые данные (ТЗ v2 §4.1.5): дерево статей РД с фактом оплат за неделю
// (Реестр, op_type=request_payment). Подача и рассмотрение заявок (ЗРС) —
// в разделе «Заявки». Здесь — справочник статей и привязка статьи к
// фонду/цели по умолчанию (подставляются в форме ЗРС).

export function Expenses() {
  const { C, st, isMobile, profile } = useTheme();
  const { period, prevPeriod, loading: periodsLoading, locationId: ctxLocationId } = usePeriod();
  const isFinAdmin = ["owner", "fin_director"].includes(profile?.role);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const [types, setTypes] = useState([]);
  const [sums, setSums] = useState({});
  const [funds, setFunds] = useState([]);
  const [open, setOpen] = useState(null);          // раскрытые папки дерева
  const [editType, setEditType] = useState(null);  // статья для привязки фонда/цели (админ)

  const loadStatic = useCallback(async () => {
    setErr("");
    try {
      const [list, fs] = await Promise.all([fetchExpenseTypes(), fetchFunds()]);
      setTypes(list);
      setFunds(fs.sort((a, b) => a.code.localeCompare(b.code, "ru", { numeric: true })));
    } catch (e) {
      setErr("Не удалось загрузить данные: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { loadStatic(); }, [loadStatic]);

  const loadPeriodData = useCallback(async () => {
    try {
      setSums(await fetchExpenseSums([period?.id, prevPeriod?.id], ctxLocationId));
    } catch (e) {
      setErr("Не удалось загрузить данные периода: " + (e?.message || e));
    }
  }, [period?.id, prevPeriod?.id, ctxLocationId]);
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

  // Привязка статьи к фонду/цели: чип с привязанным фондом + кнопка правки (админам).
  // Значения подставляются в форме ЗРС (раздел «Заявки») при выборе вида расхода.
  const BindCtl = ({ c }) => {
    const fd = funds.find((f) => f.id === c.default_fund_id);
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {fd && <span style={{ ...st.weekTag, marginLeft: 0, color: C.green, background: `${C.green}1a` }}>{fd.code}</span>}
        {isFinAdmin && (
          <button
            style={{ display: "inline-grid", placeItems: "center", width: 26, height: 26, borderRadius: 8, background: C.panel2, border: `1px solid ${C.line}`, color: fd ? C.green : C.sub, cursor: "pointer", flexShrink: 0 }}
            className="btn" title="Привязать фонд и цель"
            onClick={(e) => { e.stopPropagation(); setEditType(c); }}>
            <Link2 size={14} />
          </button>
        )}
      </div>
    );
  };

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
      </div>
    </section>

    {err && <div role="alert" style={{ ...st.reqError, marginBottom: 14 }}><AlertCircle size={15} /> {err}</div>}
    {done && <div style={{ ...st.reqSuccess, marginBottom: 14 }}><CheckCircle2 size={15} /> {done}</div>}

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
              <div style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", flexShrink: 0, background: `${C.chartPalette[i % C.chartPalette.length]}22`, color: C.chartPalette[i % C.chartPalette.length] }}><Receipt size={18} /></div>
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
                          <BindCtl c={c} />
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
                      <div style={{ ...st.itemName, display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ ...st.itemCode, color: C.danger }}>{c.code}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>{c.name}</span>
                        <BindCtl c={c} />
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

    {editType && (
      <ExpenseTypeBindModal
        C={C} st={st} type={editType} funds={funds}
        onClose={() => setEditType(null)}
        onSaved={async () => { const n = editType.name; setEditType(null); setTypes(await fetchExpenseTypes()); setDone(`Привязка статьи «${n}» сохранена`); }}
      />
    )}
  </>);
}


// ---------------------------------------------------------------- Привязка одной статьи РД к фонду/цели
// Открывается кнопкой в карточке статьи. Значения подставляются в форме ЗРС
// (раздел «Заявки») при выборе вида расхода. Доступно админам (owner/fin_director).
function ExpenseTypeBindModal({ C, st, type, funds, onClose, onSaved }) {
  useScrollLock();
  const [fundId, setFundId] = useState(type.default_fund_id || "");
  const [purpose, setPurpose] = useState(type.default_purpose || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    if (busy) return;
    setErr(""); setBusy(true);
    try {
      await updateExpenseType(type.id, { default_fund_id: fundId || null, default_purpose: purpose.trim() || null });
      onSaved();
    } catch (e) { setErr(e?.message || String(e)); setBusy(false); }
  };

  return (
    <div style={st.mdOverlay} data-modal="1" onClick={onClose}>
      <div style={{ ...st.mdCard, width: "min(440px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>Привязка статьи</div>
          <button style={st.iconBtn} onClick={onClose} aria-label="Закрыть"><X size={17} /></button>
        </div>

        <div style={{ ...st.reqField, marginBottom: 12 }}>
          <span style={st.reqFieldLbl}>Статья расхода</span>
          <div style={{ fontSize: 15, fontWeight: 700 }}>
            <span style={{ color: C.faint, marginRight: 6 }}>{type.code}</span>{type.name}
          </div>
        </div>

        <div style={{ fontSize: 12.5, color: C.sub, marginBottom: 12 }}>
          Фонд-источник и цель подставятся в форме заявки (ЗРС) при выборе этого вида расхода.
        </div>

        <div style={st.reqField}>
          <span style={st.reqFieldLbl}>Фонд-источник по умолчанию</span>
          <select style={st.mdSelect} className="fin" value={fundId} onChange={(e) => setFundId(e.target.value)}>
            <option value="">— не задан —</option>
            {funds.map((fd) => <option key={fd.id} value={fd.id}>{fd.code} — {fd.name}</option>)}
          </select>
        </div>
        <div style={{ ...st.reqField, marginTop: 12 }}>
          <span style={st.reqFieldLbl}>Цель по умолчанию (необязательно)</span>
          <input style={st.mdInput} className="fin" placeholder="Если пусто — подставится название статьи"
            value={purpose} onChange={(e) => setPurpose(e.target.value)} />
        </div>

        {err && <div role="alert" style={{ ...st.reqError, marginTop: 12 }}><AlertCircle size={15} /> {err}</div>}

        <div style={st.mdActions}>
          <button style={st.btnGhost} className="btn" onClick={onClose}>Отмена</button>
          <button style={{ ...st.btnGreen, opacity: busy ? 0.7 : 1 }} className="btn" disabled={busy} onClick={save}>
            {busy ? <Loader2 size={15} className="spin" /> : <Check size={15} />} Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
