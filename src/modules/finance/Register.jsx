import { useState, useEffect, useCallback, useMemo } from "react";
import { Loader2, AlertCircle, Download, ListChecks } from "lucide-react";
import { Stat } from "../../components/common";
import { useTheme } from "../../theme/theme";
import { fmt } from "../../utils/format";
import { usePeriod, periodTitle } from "../../lib/PeriodCtx";
import { fetchRegister, fetchFunds, fetchIncomeRefs } from "../../lib/api";


// ---------------------------------------------------------------- REGISTER
// Лента Реестра (ТЗ v2 §4.1.9): единая лента всех операций ФП — источник
// истины для балансов фондов и счетов ДС. Фильтры: неделя/все, тип операции,
// фонд, счёт ДС. Суммы — в базовой валюте (TJS).

// Цвет типа операции — токен палитры C (адаптивен к теме dark/light),
// а не захардкоженный hex: соблюдает «цвета только из C» и контраст в обеих темах.
const OP_META = {
  income:           { label: "Доход",              tone: "success" },
  income_return:    { label: "Возврат дохода",     tone: "danger" },
  distribution:     { label: "Распределение",      tone: "successSoft" },
  request_payment:  { label: "Оплата заявки",      tone: "warning" },
  bill_payment:     { label: "Оплата счёта",       tone: "warning" },
  payroll_payment:  { label: "Выплата ЗП",         tone: "gold" },
  fund_transfer:    { label: "Перемещение фондов", tone: "info" },
  fund_loan:        { label: "Заём фонда",         tone: "violet" },
  fund_loan_return: { label: "Возврат займа",      tone: "violet" },
  fx_exchange:      { label: "Обмен валют",        tone: "teal" },
  cash_transfer:    { label: "Перемещение ДС",     tone: "info" },
  off_plan:         { label: "Трата вне ФП",       tone: "danger" },
  adjustment:       { label: "Корректировка",      tone: "sub" },
};

export function Register() {
  const { C, st, isMobile } = useTheme();
  const { period, periodId, loading: periodsLoading } = usePeriod();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState([]);
  const [funds, setFunds] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [f, setF] = useState({ scope: "week", opType: "", fundId: "", accountId: "" });

  useEffect(() => {
    (async () => {
      try {
        const [fs, refs] = await Promise.all([fetchFunds(), fetchIncomeRefs()]);
        setFunds(fs.sort((a, b) => a.code.localeCompare(b.code, "ru", { numeric: true })));
        setAccounts(refs.accounts);
      } catch (e) { setErr(e?.message || String(e)); }
    })();
  }, []);

  const load = useCallback(async () => {
    if (periodsLoading) return;
    setErr("");
    try {
      setRows(await fetchRegister({
        periodId: f.scope === "week" ? periodId : null,
        opType: f.opType || null, fundId: f.fundId || null, cashAccountId: f.accountId || null,
      }));
    } catch (e) { setErr("Не удалось загрузить Реестр: " + (e?.message || e)); }
    finally { setLoading(false); }
  }, [f, periodId, periodsLoading]);
  useEffect(() => { load(); }, [load]);

  const sums = useMemo(() => {
    let inflow = 0, outflow = 0;
    for (const r of rows) {
      const v = Number(r.cash_amount ?? r.fund_amount) || 0;
      if (v >= 0) inflow += v; else outflow += -v;
    }
    return { inflow, outflow, net: inflow - outflow };
  }, [rows]);

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const exportCsv = () => {
    const head = ["Дата", "Тип", "Фонд", "Счёт ДС", "Контрагент", "Сумма (фонд)", "Сумма (счёт)", "Комментарий", "Провёл"];
    const lines = rows.map((r) => [
      new Date(r.created_at).toLocaleString("ru"),
      OP_META[r.op_type]?.label || r.op_type,
      r.fund ? `${r.fund.code} ${r.fund.name}` : "",
      r.cash_account?.name || "",
      r.counterparty?.name || "",
      r.fund_amount ?? "", r.cash_amount ?? "",
      r.comment || "", r.creator?.full_name || "",
    ]);
    const csv = "﻿" + [head, ...lines].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `Реестр_${f.scope === "week" ? (period?.starts_on || "") : "все"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (loading || periodsLoading) return <div style={st.empty}><Loader2 size={18} className="spin" /> Загрузка…</div>;

  const selStyle = { ...st.reqSelect, padding: "8px 10px", fontSize: 13, minWidth: isMobile ? "100%" : 160 };

  return (<>
    <section style={st.hero}>
      <div style={st.heroGlow} />
      <div style={st.heroContent}>
        <div style={st.heroTop}>
          <div>
            <div style={st.heroLabel}>Реестр операций · источник истины ФП</div>
            <div style={st.heroTitle}>{f.scope === "week" ? (period ? periodTitle(period) : "Период не создан") : "Все периоды"}</div>
          </div>
          <button style={st.btnGhost} className="btn" onClick={exportCsv} disabled={!rows.length}>
            <Download size={15} /> {!isMobile && "Экспорт CSV"}
          </button>
        </div>
        <div style={st.heroStats}>
          <Stat label="Операций" value={String(rows.length)} unit={rows.length === 200 ? "последние 200" : ""} />
          <Stat label="Поступления (+)" value={fmt(sums.inflow)} unit="TJS" />
          <Stat label="Списания (−)" value={fmt(sums.outflow)} unit="TJS" />
          <Stat label="Нетто" value={fmt(sums.net)} unit="TJS" tone={sums.net < -0.01 ? "danger" : "success"} />
        </div>
      </div>
    </section>

    {err && <div style={{ ...st.reqError, marginBottom: 14 }}><AlertCircle size={15} /> {err}</div>}

    {/* Фильтры */}
    <section style={{ ...st.fpCard, marginTop: 0, marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <select style={selStyle} className="fin" value={f.scope} onChange={set("scope")}>
          <option value="week">Выбранная неделя</option>
          <option value="all">Все периоды</option>
        </select>
        <select style={selStyle} className="fin" value={f.opType} onChange={set("opType")}>
          <option value="">Все типы операций</option>
          {Object.entries(OP_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
        </select>
        <select style={selStyle} className="fin" value={f.fundId} onChange={set("fundId")}>
          <option value="">Все фонды</option>
          {funds.map((fd) => <option key={fd.id} value={fd.id}>{fd.code} — {fd.name}</option>)}
        </select>
        <select style={selStyle} className="fin" value={f.accountId} onChange={set("accountId")}>
          <option value="">Все счета ДС</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
    </section>

    {/* Лента */}
    {!rows.length && <div style={{ ...st.locCard, ...st.empty }}><ListChecks size={18} /> Операций по выбранным фильтрам нет</div>}
    {/* minmax(0,1fr): иначе строка с nowrap-описанием раздувает грид-трек
        шире экрана и появляется горизонтальный скролл на телефоне. */}
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 6 }} className="stagger">
      {rows.map((r) => {
        const m = OP_META[r.op_type] || { label: r.op_type, tone: "sub" };
        const tone = C[m.tone] || C.sub;
        const v = Number(r.cash_amount ?? r.fund_amount) || 0;
        const offPlan = r.op_type === "off_plan";
        return (
          <div key={r.id} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
            borderRadius: 12, background: offPlan ? `${C.danger}10` : C.solid2,
            border: `1px solid ${offPlan ? `${C.danger}44` : C.line}`,
            flexWrap: isMobile ? "wrap" : "nowrap",
          }} className="frow">
            <span style={{ fontSize: 11, color: C.faint, width: 88, flexShrink: 0 }}>
              {new Date(r.created_at).toLocaleString("ru", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </span>
            <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 20, whiteSpace: "nowrap", color: tone, background: `${tone}1a`, flexShrink: 0 }}>
              {m.label}
            </span>
            <div style={{ flex: 1, minWidth: isMobile ? "100%" : 0, fontSize: 12.5, color: C.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", order: isMobile ? 5 : 0 }}>
              {[r.fund ? `${r.fund.code} ${r.fund.name}` : null,
                r.cash_account?.name,
                r.counterparty?.name,
                r.comment].filter(Boolean).join(" · ") || "—"}
            </div>
            {!isMobile && r.creator && (
              <span style={{ fontSize: 11, color: C.faint, flexShrink: 0 }}>{r.creator.full_name}</span>
            )}
            <span style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums", fontSize: 14, color: v >= 0 ? C.money : C.danger, flexShrink: 0, marginLeft: "auto" }}>
              {v >= 0 ? "+" : ""}{fmt(v)}
            </span>
          </div>
        );
      })}
    </div>
  </>);
}
