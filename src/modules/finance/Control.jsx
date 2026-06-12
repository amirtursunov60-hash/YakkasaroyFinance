import { useState, useEffect, useCallback, useMemo } from "react";
import { Banknote, Save, AlertTriangle, Loader2, AlertCircle, CheckCircle2, Plus, X, List, Landmark, CreditCard, Wifi } from "lucide-react";
import { Stat } from "../../components/common";
import { useTheme } from "../../theme/theme";
import { fmt } from "../../utils/format";
import { usePeriod, periodTitle } from "../../lib/PeriodCtx";
import {
  fetchCashAccounts, createCashAccount, fetchReconciliations, saveReconciliations,
  fetchAccountStatement, fetchIncomeRefs,
} from "../../lib/api";


// ---------------------------------------------------------------- CONTROL
// Живые данные (ТЗ v2 §4.1.8): счета ДС с расчётным остатком из Реестра,
// сверка бухгалтером (снимок факт/расчёт на выбранную неделю, повторная
// сверка перезаписывает), выписка по счёту, добавление счетов.
// Конвенция Реестра: суммы операций и балансы счетов — в базовой валюте (TJS).

const TYPE_META = {
  cash:      { label: "касса",     icon: Banknote },
  bank:      { label: "банк",      icon: Landmark },
  card:      { label: "карта",     icon: CreditCard },
  acquiring: { label: "эквайринг", icon: Wifi },
};
const OP_LABELS = {
  income: "Доход", income_return: "Возврат дохода", distribution: "Распределение",
  request_payment: "Оплата заявки", bill_payment: "Оплата счёта", payroll_payment: "Выплата ЗП", fund_transfer: "Перемещение фондов",
  fund_loan: "Заём фонда", fund_loan_return: "Возврат займа", fx_exchange: "Обмен валют",
  cash_transfer: "Перемещение ДС", off_plan: "Трата вне ФП", adjustment: "Корректировка",
};

export function Control() {
  const { C, st, isMobile, profile } = useTheme();
  const { period, periodId, loading: periodsLoading } = usePeriod();
  const canEdit = ["owner", "fin_director", "accountant"].includes(profile?.role);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const [accounts, setAccounts] = useState([]);
  const [recons, setRecons] = useState({});
  const [values, setValues] = useState({});      // ввод факта { accountId: строка }
  const [busy, setBusy] = useState(null);
  const [statement, setStatement] = useState(null); // { account, rows, allTime }
  const [showAdd, setShowAdd] = useState(false);
  const [refs, setRefs] = useState(null);

  const load = useCallback(async () => {
    setErr("");
    try {
      const [accs, refData] = await Promise.all([fetchCashAccounts(), fetchIncomeRefs()]);
      setAccounts(accs); setRefs(refData);
    } catch (e) {
      setErr("Не удалось загрузить счета: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Сверки выбранной недели → предзаполняем «факт»
  useEffect(() => {
    if (periodsLoading) return;
    (async () => {
      try {
        const r = await fetchReconciliations(periodId);
        setRecons(r);
        setValues(Object.fromEntries(Object.entries(r).map(([accId, row]) => [accId, String(row.actual_balance)])));
        setDone("");
      } catch (e) { setErr("Не удалось загрузить сверки: " + (e?.message || e)); }
    })();
  }, [periodId, periodsLoading]);

  const totals = useMemo(() => {
    let calc = 0, fact = 0, entered = 0;
    for (const a of accounts) {
      calc += Number(a.balance) || 0;
      const v = values[a.id];
      if (v !== undefined && v !== "") { fact += Number(v) || 0; entered++; }
    }
    return { calc, fact, entered, diff: fact - (entered ? calc : 0) };
  }, [accounts, values]);
  const anyEntered = totals.entered > 0;
  const allEntered = totals.entered === accounts.length && accounts.length > 0;
  const diffTotal = allEntered ? totals.fact - totals.calc : null;

  const save = async () => {
    if (busy) return;
    if (!periodId) { setErr("Нет выбранного периода ФП — добавьте неделю в шапке"); return; }
    const rows = accounts
      .filter((a) => values[a.id] !== undefined && values[a.id] !== "")
      .map((a) => ({
        cash_account_id: a.id, period_id: periodId,
        actual_balance: Number(values[a.id]) || 0,
        system_balance: Number(a.balance) || 0,
        created_by: profile.id,
      }));
    if (!rows.length) { setErr("Введите фактические остатки хотя бы по одному счёту"); return; }
    setBusy("save"); setErr(""); setDone("");
    try {
      await saveReconciliations(rows);
      setRecons(await fetchReconciliations(periodId));
      setDone(`Сверка сохранена: ${rows.length} счёт(ов) за неделю ${period ? periodTitle(period) : ""}`);
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  const openStatement = async (account, allTime = false) => {
    setBusy(`stmt:${account.id}`); setErr("");
    try {
      const rows = await fetchAccountStatement(account.id, allTime ? null : periodId);
      setStatement({ account, rows, allTime });
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  if (loading || periodsLoading) return <div style={st.empty}><Loader2 size={18} className="spin" /> Загрузка…</div>;

  const GRID = isMobile ? "1fr 105px 120px" : "1fr 70px 140px 170px 140px 90px";

  return (<>
    <section style={st.hero}>
      <div style={st.heroGlow} />
      <div style={st.heroContent}>
        <div style={st.heroTop}>
          <div>
            <div style={st.heroLabel}>Контроль средств · сверка факта с расчётом системы</div>
            <div style={st.heroTitle}>{period ? periodTitle(period) : "Период не создан"}</div>
          </div>
        </div>
        <div style={st.heroStats}>
          <Stat label="Расчёт системы (Реестр)" value={fmt(totals.calc)} unit="TJS" accent />
          <Stat label="Факт (введено)" value={anyEntered ? fmt(totals.fact) : "—"} unit={anyEntered ? "TJS" : ""} />
          <Stat label="Расхождение" value={diffTotal === null ? "—" : fmt(diffTotal)} unit={diffTotal === null ? "" : "TJS"} />
          <Stat label="Сверено счетов" value={`${Object.keys(recons).length} / ${accounts.length}`} unit="" />
        </div>
      </div>
    </section>

    {err && <div style={{ ...st.reqError, marginBottom: 14 }}><AlertCircle size={15} /> {err}</div>}
    {done && <div style={{ ...st.reqError, marginBottom: 14, color: C.green, background: `${C.green}1a`, borderColor: `${C.green}44` }}><CheckCircle2 size={15} /> {done}</div>}
    {diffTotal !== null && Math.abs(diffTotal) > 0.01 && (
      <div style={st.stockAlert}><AlertTriangle size={16} /> Расхождение {fmt(diffTotal)} TJS между фактом и расчётом — проверьте кассы и неучтённые операции</div>
    )}

    <div style={st.cardWrap}>
      <section style={st.card}>
        <div style={st.cardHead}>
          <div style={st.cardTitle}>Остатки по счетам</div>
          <div style={{ display: "flex", gap: 8 }}>
            {canEdit && (
              <button style={st.btnGhost} className="btn" onClick={() => setShowAdd(true)}>
                <Plus size={15} /> {!isMobile && "Добавить счёт"}
              </button>
            )}
            {canEdit && (
              <button style={{ ...st.btnGreen, opacity: busy === "save" ? 0.7 : 1 }} className="btn" onClick={save} disabled={!!busy}>
                {busy === "save" ? <Loader2 size={15} className="spin" /> : <Save size={15} />} Сохранить сверку
              </button>
            )}
          </div>
        </div>

        {!accounts.length && <div style={st.empty}>Счетов ДС пока нет — добавьте кассу или банковский счёт</div>}
        {accounts.length > 0 && (<>
          <div style={{ ...st.frow, ...st.frowHead, gridTemplateColumns: GRID }}>
            <div style={st.fName}>Счёт / касса</div>
            {!isMobile && <div style={st.fPct}>Валюта</div>}
            <div style={st.fNum}>Расчёт</div>
            <div style={st.fNum}>Факт</div>
            {!isMobile && <div style={st.fNum}>Расхождение</div>}
            {!isMobile && <div style={st.fNum} />}
          </div>
          {accounts.map((a) => {
            const Icon = TYPE_META[a.type]?.icon || Banknote;
            const calc = Number(a.balance) || 0;
            const v = values[a.id] === undefined || values[a.id] === "" ? null : Number(values[a.id]) || 0;
            const d = v === null ? null : v - calc;
            const ok = d !== null && Math.abs(d) < 0.01;
            const saved = recons[a.id];
            return (
              <div key={a.id} style={{ ...st.frow, gridTemplateColumns: GRID }} className="frow">
                <div style={st.fName}>
                  <div style={st.fundTop}>
                    <Icon size={15} color={C.green} />
                    <span>{a.name}</span>
                    {saved && <CheckCircle2 size={13} color={ok || (saved && Math.abs(Number(saved.difference)) < 0.01) ? C.green : C.danger} />}
                  </div>
                  <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}>
                    {TYPE_META[a.type]?.label}{a.location ? ` · ${a.location.name}` : ""}
                    {isMobile && d !== null && <span style={{ color: ok ? C.green : C.danger, fontWeight: 700 }}> · {ok ? "✓ сходится" : fmt(d)}</span>}
                  </div>
                </div>
                {!isMobile && <div style={st.fPct}>{a.currency?.code}</div>}
                <div style={{ ...st.fNum, color: C.sub }}>{fmt(calc)}</div>
                <div style={{ textAlign: "right" }}>
                  <input type="number" value={values[a.id] ?? ""} disabled={!canEdit}
                    onChange={(e) => { setValues((p) => ({ ...p, [a.id]: e.target.value })); setDone(""); }}
                    placeholder="0" style={{ ...st.numInput, width: isMobile ? 105 : 150 }} />
                </div>
                {!isMobile && (
                  <div style={{ ...st.fNum, fontWeight: 700, color: d === null ? C.faint : ok ? C.green : C.danger }}>
                    {d === null ? "—" : ok ? "✓ сходится" : fmt(d)}
                  </div>
                )}
                {!isMobile && (
                  <div style={{ textAlign: "right" }}>
                    <button style={{ ...st.btnGhost, padding: "6px 10px", fontSize: 12 }} className="btn"
                      disabled={!!busy} onClick={() => openStatement(a)}>
                      {busy === `stmt:${a.id}` ? <Loader2 size={13} className="spin" /> : <List size={13} />} Подробно
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ ...st.frow, ...st.frowTotal, gridTemplateColumns: GRID }}>
            <div style={st.fName}><b>Итого (TJS)</b></div>
            {!isMobile && <div style={st.fPct} />}
            <div style={{ ...st.fNum, fontWeight: 700, color: C.sub }}>{fmt(totals.calc)}</div>
            <div style={{ ...st.fNum, fontWeight: 800, color: C.green, fontSize: 16 }}>{anyEntered ? fmt(totals.fact) : "—"}</div>
            {!isMobile && (
              <div style={{ ...st.fNum, fontWeight: 800, color: diffTotal === null ? C.faint : Math.abs(diffTotal) < 0.01 ? C.green : C.danger }}>
                {diffTotal === null ? "—" : fmt(diffTotal)}
              </div>
            )}
            {!isMobile && <div />}
          </div>
        </>)}
        {isMobile && accounts.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
            {accounts.map((a) => (
              <button key={a.id} style={{ ...st.btnGhost, padding: "6px 10px", fontSize: 12 }} className="btn"
                disabled={!!busy} onClick={() => openStatement(a)}>
                <List size={13} /> {a.name}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>

    <div style={st.vibeNote}>
      <b style={{ color: C.green }}>Принцип:</b> «чтобы ни одна копейка не пропала». Расчётный остаток система
      ведёт сама по Реестру (доходы на счёт − оплаты со счёта). Бухгалтер вводит фактические остатки на конец
      недели — сверка сохраняется снимком за период, расхождение — сигнал проверить кассу.
    </div>

    {statement && (
      <StatementModal C={C} st={st} statement={statement} period={period}
        onAllTime={() => openStatement(statement.account, true)}
        onClose={() => setStatement(null)} />
    )}
    {showAdd && refs && (
      <AddAccountModal C={C} st={st} refs={refs}
        onClose={() => setShowAdd(false)}
        onSaved={async () => { setShowAdd(false); await load(); setDone("Счёт ДС добавлен"); }} />
    )}
  </>);
}


// ---------------------------------------------------------------- Выписка по счёту
function StatementModal({ C, st, statement, period, onAllTime, onClose }) {
  const { account, rows, allTime } = statement;
  return (
    <div style={st.mdOverlay} onClick={onClose}>
      <div style={{ ...st.mdCard, width: "min(560px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>{account.name} · выписка</div>
          <button style={st.iconBtn} onClick={onClose}><X size={17} /></button>
        </div>
        <div style={{ fontSize: 12.5, color: C.sub, marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span>{allTime ? "Последние операции (все периоды)" : `Неделя ${period ? periodTitle(period) : "—"}`}</span>
          {!allTime && (
            <button style={{ ...st.btnGhost, padding: "5px 10px", fontSize: 12 }} className="btn" onClick={onAllTime}>
              Показать все
            </button>
          )}
        </div>
        {!rows.length && <div style={st.empty}>Операций нет</div>}
        <div style={{ maxHeight: 420, overflowY: "auto", display: "grid", gap: 6 }}>
          {rows.map((r) => {
            const amt = Number(r.cash_amount) || 0;
            const offPlan = r.op_type === "off_plan";
            return (
              <div key={r.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
                padding: "9px 12px", borderRadius: 10, background: offPlan ? `${C.danger}14` : C.panel2 || C.bg,
                border: `1px solid ${offPlan ? `${C.danger}44` : C.line}`,
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: offPlan ? C.danger : C.text }}>
                    {OP_LABELS[r.op_type] || r.op_type}
                    {r.counterparty ? ` · ${r.counterparty.name}` : ""}
                  </div>
                  <div style={{ fontSize: 11.5, color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {new Date(r.created_at).toLocaleString("ru", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    {r.comment ? ` · ${r.comment}` : ""}
                  </div>
                </div>
                <div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: amt >= 0 ? C.green : C.danger, flexShrink: 0 }}>
                  {amt >= 0 ? "+" : ""}{fmt(amt)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}


// ---------------------------------------------------------------- Новый счёт ДС
function AddAccountModal({ C, st, refs, onClose, onSaved }) {
  const baseCur = refs.currencies.find((c) => c.is_base) || refs.currencies[0];
  const [f, setF] = useState({ name: "", type: "cash", locationId: "", currencyId: baseCur?.id || "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (busy) return;
    setErr("");
    if (!f.name.trim()) return setErr("Введите название счёта");
    setBusy(true);
    try {
      await createCashAccount({ name: f.name.trim(), type: f.type, locationId: f.locationId, currencyId: f.currencyId });
      onSaved();
    } catch (e) { setErr(e?.message || String(e)); setBusy(false); }
  };

  return (
    <div style={st.mdOverlay} onClick={onClose}>
      <div style={{ ...st.mdCard, width: "min(420px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>Новый счёт ДС</div>
          <button style={st.iconBtn} onClick={onClose}><X size={17} /></button>
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Название</span>
            <input style={st.mdInput} className="fin" placeholder="Касса Душанбе" autoFocus
              value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} />
          </div>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Тип</span>
            <select style={st.mdSelect} className="fin" value={f.type} onChange={(e) => setF((p) => ({ ...p, type: e.target.value }))}>
              {Object.entries(TYPE_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
            </select>
          </div>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Точка</span>
            <select style={st.mdSelect} className="fin" value={f.locationId} onChange={(e) => setF((p) => ({ ...p, locationId: e.target.value }))}>
              <option value="">— вся сеть —</option>
              {refs.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Валюта</span>
            <select style={st.mdSelect} className="fin" value={f.currencyId} onChange={(e) => setF((p) => ({ ...p, currencyId: e.target.value }))}>
              {refs.currencies.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </select>
          </div>
        </div>
        {err && <div style={st.reqError}><AlertCircle size={15} /> {err}</div>}
        <div style={st.mdActions}>
          <button style={st.btnGhost} className="btn" onClick={onClose}>Отмена</button>
          <button style={{ ...st.btnGreen, opacity: busy ? 0.7 : 1 }} className="btn" onClick={submit} disabled={busy}>
            {busy ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} Добавить
          </button>
        </div>
      </div>
    </div>
  );
}
