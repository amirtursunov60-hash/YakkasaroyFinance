import { useState, useEffect, useCallback, useMemo } from "react";
import { Loader2, AlertCircle, Download, ListChecks, Search, X, BookOpen, ChevronRight } from "lucide-react";
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
  income:           { label: "Доход",              tone: "success",     desc: "Поступление денег от клиента/выручки — зачисляется на счёт ДС и запускает распределение по фондам." },
  income_return:    { label: "Возврат дохода",     tone: "danger",      desc: "Сторно ранее принятого дохода: возврат денег клиенту, обратное распределение по фондам." },
  distribution:     { label: "Распределение",      tone: "successSoft", desc: "Разнесение поступивших денег по фондам по схемам ФРС (3 этапа: от выручки → маржи → скорр. дохода)." },
  request_payment:  { label: "Оплата заявки",      tone: "warning",     desc: "Расход из фонда по одобренной заявке (ЗРС) финкомитета." },
  bill_payment:     { label: "Оплата счёта",       tone: "warning",     desc: "Оплата счёта поставщика или обязательства из фонда." },
  payroll_payment:  { label: "Выплата ЗП",         tone: "gold",        desc: "Выплата заработной платы сотрудникам из фонда оплаты труда." },
  fund_transfer:    { label: "Перемещение фондов", tone: "info",        desc: "Перевод средств между фондами (без возврата)." },
  fund_loan:        { label: "Заём фонда",         tone: "violet",      desc: "Заём из одного фонда в другой — с обязательством вернуть." },
  fund_loan_return: { label: "Возврат займа",      tone: "violet",      desc: "Возврат ранее выданного межфондового займа." },
  fx_exchange:      { label: "Обмен валют",        tone: "teal",        desc: "Конвертация валюты между счетами ДС по курсу." },
  cash_transfer:    { label: "Перемещение ДС",     tone: "info",        desc: "Перемещение денег между счетами ДС (например касса ⇄ банк)." },
  off_plan:         { label: "Трата вне ФП",       tone: "danger",      desc: "Внеплановый расход мимо финансового планирования — выделен как отклонение." },
  adjustment:       { label: "Корректировка",      tone: "sub",         desc: "Ручное выравнивание остатка фонда/счёта (инвентаризация, исправление)." },
};

export function Register() {
  const { C, st, isMobile } = useTheme();
  const { period, periodId, loading: periodsLoading } = usePeriod();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState([]);
  const [funds, setFunds] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [counterparties, setCounterparties] = useState([]);
  const [payTypes, setPayTypes] = useState([]);
  const [f, setF] = useState({ scope: "week", opType: "", fundId: "", accountId: "", counterpartyId: "", paymentTypeId: "" });
  // Поиск — клиентский, по уже загруженной ленте (не перезапрашивает сервер),
  // поэтому отдельным состоянием, а не в f (иначе load() дёргался бы на каждый символ).
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null); // строка для карточки-деталей (drill-down)
  const [legendOpen, setLegendOpen] = useState(false); // справочник типов операций (§11)

  useEffect(() => {
    (async () => {
      try {
        const [fs, refs] = await Promise.all([fetchFunds(), fetchIncomeRefs()]);
        setFunds(fs.sort((a, b) => a.code.localeCompare(b.code, "ru", { numeric: true })));
        setAccounts(refs.accounts);
        setCounterparties(refs.counterparties || []);
        setPayTypes(refs.payTypes || []);
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
        counterpartyId: f.counterpartyId || null, paymentTypeId: f.paymentTypeId || null,
      }));
    } catch (e) { setErr("Не удалось загрузить Реестр: " + (e?.message || e)); }
    finally { setLoading(false); }
  }, [f, periodId, periodsLoading]);
  useEffect(() => { load(); }, [load]);

  // Клиентский поиск по ленте: тип, фонд, счёт, контрагент, способ оплаты,
  // комментарий, провёл. Без учёта регистра. Сумму тоже ищем (подстрокой).
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => [
      OP_META[r.op_type]?.label || r.op_type,
      r.fund ? `${r.fund.code} ${r.fund.name}` : "",
      r.cash_account?.name, r.counterparty?.name, r.payment_type?.name,
      r.comment, r.creator?.full_name,
      String(r.fund_amount ?? ""), String(r.cash_amount ?? ""),
    ].filter(Boolean).join(" ").toLowerCase().includes(s));
  }, [rows, search]);

  const sums = useMemo(() => {
    let inflow = 0, outflow = 0;
    for (const r of filtered) {
      const v = Number(r.cash_amount ?? r.fund_amount) || 0;
      if (v >= 0) inflow += v; else outflow += -v;
    }
    return { inflow, outflow, net: inflow - outflow };
  }, [filtered]);

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const exportCsv = () => {
    const head = ["Дата", "Тип", "Фонд", "Счёт ДС", "Контрагент", "Способ оплаты", "Сумма (фонд)", "Сумма (счёт)", "Комментарий", "Провёл"];
    const lines = filtered.map((r) => [
      new Date(r.created_at).toLocaleString("ru"),
      OP_META[r.op_type]?.label || r.op_type,
      r.fund ? `${r.fund.code} ${r.fund.name}` : "",
      r.cash_account?.name || "",
      r.counterparty?.name || "",
      r.payment_type?.name || "",
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
          <button style={st.btnGhost} className="btn" onClick={exportCsv} disabled={!filtered.length}>
            <Download size={15} /> {!isMobile && "Экспорт CSV"}
          </button>
        </div>
        <div style={st.heroStats}>
          <Stat label="Операций" value={String(filtered.length)}
            unit={search.trim() ? `из ${rows.length}` : (rows.length === 200 ? "последние 200" : "")} />
          <Stat label="Поступления (+)" value={fmt(sums.inflow)} unit="TJS" />
          <Stat label="Списания (−)" value={fmt(sums.outflow)} unit="TJS" />
          <Stat label="Нетто" value={fmt(sums.net)} unit="TJS" tone={sums.net < -0.01 ? "danger" : "success"} />
        </div>
      </div>
    </section>

    {err && <div role="alert" style={{ ...st.reqError, marginBottom: 14 }}><AlertCircle size={15} /> {err}</div>}

    {/* Фильтры */}
    <section style={{ ...st.fpCard, marginTop: 0, marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: isMobile ? "1 1 100%" : "1 1 220px", minWidth: isMobile ? "100%" : 200 }}>
          <Search size={15} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.faint, pointerEvents: "none" }} />
          <input
            style={{ ...selStyle, width: "100%", minWidth: 0, padding: "8px 32px 8px 34px" }}
            className="fin" type="text" inputMode="search" value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по ленте (контрагент, фонд, комментарий…)"
            aria-label="Поиск по Реестру"
          />
          {search && (
            <button onClick={() => setSearch("")} aria-label="Очистить поиск"
              style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: C.faint, cursor: "pointer", display: "grid", placeItems: "center", padding: 4 }}>
              <X size={14} />
            </button>
          )}
        </div>
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
        {counterparties.length > 0 && (
          <select style={selStyle} className="fin" value={f.counterpartyId} onChange={set("counterpartyId")}>
            <option value="">Все контрагенты</option>
            {counterparties.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {payTypes.length > 0 && (
          <select style={selStyle} className="fin" value={f.paymentTypeId} onChange={set("paymentTypeId")}>
            <option value="">Все способы оплаты</option>
            {payTypes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>
    </section>

    {/* Лента */}
    {!filtered.length && (
      <div style={{ ...st.locCard, ...st.empty }}>
        <ListChecks size={18} /> {search.trim() ? "По запросу ничего не найдено" : "Операций по выбранным фильтрам нет"}
      </div>
    )}
    {/* minmax(0,1fr): иначе строка с nowrap-описанием раздувает грид-трек
        шире экрана и появляется горизонтальный скролл на телефоне. */}
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 6 }} className="stagger">
      {filtered.map((r) => {
        const m = OP_META[r.op_type] || { label: r.op_type, tone: "sub" };
        const tone = C[m.tone] || C.sub;
        const v = Number(r.cash_amount ?? r.fund_amount) || 0;
        const offPlan = r.op_type === "off_plan";
        return (
          <div key={r.id} role="button" tabIndex={0}
            onClick={() => setSelected(r)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(r); } }}
            style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
            borderRadius: 12, background: offPlan ? `${C.danger}10` : C.solid2,
            border: `1px solid ${offPlan ? `${C.danger}44` : C.line}`,
            flexWrap: isMobile ? "wrap" : "nowrap", cursor: "pointer",
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
                r.payment_type?.name,
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

    {/* Справочник типов операций (§11): легенда — что означает каждый тип
        и его цвет. Источник — тот же OP_META, что красит ленту. */}
    <div style={{ ...st.locCard, marginTop: 14, padding: 0, overflow: "hidden" }}>
      <button className="btn" onClick={() => setLegendOpen((v) => !v)}
        aria-expanded={legendOpen}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
          background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", color: C.text }}>
        <BookOpen size={16} color={C.sub} />
        <span style={{ fontWeight: 700, fontSize: 13.5 }}>Справочник типов операций</span>
        <span style={{ fontSize: 12, color: C.faint }}>{Object.keys(OP_META).length}</span>
        <ChevronRight size={17} style={{ marginLeft: "auto", transform: legendOpen ? "rotate(90deg)" : "none", transition: "transform .15s", color: C.faint }} />
      </button>
      {legendOpen && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))", gap: 10, padding: "0 14px 14px" }}>
          {Object.entries(OP_META).map(([k, m]) => {
            const tone = C[m.tone] || C.sub;
            return (
              <div key={k} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                <span style={{ flexShrink: 0, marginTop: 4, width: 9, height: 9, borderRadius: 3, background: tone }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: tone }}>{m.label}</div>
                  <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.45, marginTop: 1 }}>{m.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>

    {/* Карточка-детали операции (drill-down §10) — все поля уже в строке,
        доп. запрос не нужен. Реестр неизменяем: правка/отмена — только сторно
        из профильных вкладок (Доход/Заявки/Счета), здесь карточка — read-only. */}
    {selected && (() => {
      const m = OP_META[selected.op_type] || { label: selected.op_type, tone: "sub" };
      const tone = C[m.tone] || C.sub;
      const kv = [
        ["Дата и время", new Date(selected.created_at).toLocaleString("ru")],
        ["Фонд", selected.fund ? `${selected.fund.code} — ${selected.fund.name}` : "—"],
        ["Счёт ДС", selected.cash_account?.name || "—"],
        ["Контрагент", selected.counterparty?.name || "—"],
        ["Способ оплаты", selected.payment_type?.name || "—"],
        ["Сумма (фонд)", selected.fund_amount != null ? `${fmt(Number(selected.fund_amount))} TJS` : "—"],
        ["Сумма (счёт ДС)", selected.cash_amount != null ? `${fmt(Number(selected.cash_amount))} TJS` : "—"],
        ["Провёл", selected.creator?.full_name || "—"],
      ];
      return (
        <div style={st.mdOverlay} data-modal="1" onClick={() => setSelected(null)} role="dialog" aria-modal="true">
          <div style={st.mdCard} onClick={(e) => e.stopPropagation()}>
            <div style={st.mdHead}>
              <div style={st.mdTitle}>Операция Реестра</div>
              <button style={st.iconBtn} onClick={() => setSelected(null)} aria-label="Закрыть"><X size={17} /></button>
            </div>
            <span style={{ display: "inline-block", fontSize: 11, fontWeight: 700, padding: "4px 11px", borderRadius: 20, color: tone, background: `${tone}1a`, marginBottom: 8 }}>{m.label}</span>
            {m.desc && <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.45, marginBottom: 14 }}>{m.desc}</div>}
            <div style={{ display: "grid", gap: 0 }}>
              {kv.map(([k, val]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: `1px solid ${C.line}`, fontSize: 13 }}>
                  <span style={{ color: C.faint, flexShrink: 0 }}>{k}</span>
                  <span style={{ color: C.sub, textAlign: "right", fontWeight: 600, wordBreak: "break-word" }}>{val}</span>
                </div>
              ))}
            </div>
            {selected.comment && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11, color: C.faint, marginBottom: 5 }}>Комментарий</div>
                <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{selected.comment}</div>
              </div>
            )}
            {selected.reverses_id && (
              <div style={{ marginTop: 14, fontSize: 12, color: C.warning, display: "flex", alignItems: "center", gap: 7 }}>
                <AlertCircle size={14} /> Сторнирующая запись (отменяет другую операцию)
              </div>
            )}
            <div style={{ marginTop: 16, fontSize: 10.5, color: C.faint, fontFamily: "monospace" }}>ID: {selected.id}</div>
          </div>
        </div>
      );
    })()}
  </>);
}
