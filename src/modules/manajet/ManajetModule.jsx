import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw, Loader2, AlertCircle, CheckCircle2, Search, Layers,
  ClipboardList, FileText, Receipt, BarChart3, Database, Clock,
} from "lucide-react";
import { useTheme } from "../../theme/theme";
import { fmt } from "../../utils/format";
import { calcState } from "../../utils/stats";
import { STAT_STATES } from "../../data/stats";
import {
  triggerMjSync, fetchMjOverview, fetchMjPurchaseOrders, fetchMjBills,
  fetchMjInvoices, fetchMjFunds, fetchMjStats, fetchMjStatValues,
} from "../../lib/api";

// Синкаем по одной сущности за вызов — ManaJet отвечает медленно (~6 c/страница),
// тяжёлые сущности (заявки/счета) поодиночке упираются в лимит времени Edge
// Function. Справочник контрагентов (≈4700, не помещается в один вызов) в обкатку
// не тянем — названия и так денормализованы в счета/заявки/инвойсы.
const SYNC_GROUPS = [
  ["funds", "periods", "stats", "positions"],
  ["purchase_orders"],
  ["bills"],
  ["invoices"],
  ["incomes"],
  ["stat_values"],
];

// Статусы заявок (ЗРС / PurchaseOrder) ManaJet: enum [-1,0,2,3]
const PO_STATUS = {
  "-1": { label: "Отклонена", tone: "danger" },
  0: { label: "На рассмотрении", tone: "warning" },
  2: { label: "Одобрена", tone: "info" },
  3: { label: "Оплачена", tone: "money" },
};

const TABLES_RU = {
  mj_funds: "Фонды", mj_periods: "Периоды ФП", mj_purchase_orders: "Заявки (ЗРС)",
  mj_bills: "Счета поставщиков", mj_invoices: "Счета клиентам", mj_incomes: "Доходы",
  mj_stats: "Статистики", mj_stat_values: "Значения статистик",
  mj_positions: "Посты оргсхемы",
};

const dt = (iso) => (iso ? new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "2-digit" }) : "—");
const dtTime = (iso) => (iso ? new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

export function ManajetModule({ view }) {
  const { C, st, isMobile } = useTheme();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [syncing, setSyncing] = useState("");      // текст прогресса синхронизации
  const [query, setQuery] = useState("");
  const [overview, setOverview] = useState({ counts: {}, log: [] });
  const [rows, setRows] = useState([]);
  const [statVals, setStatVals] = useState({});

  // загрузка данных активной вкладки
  const load = useCallback(async () => {
    setErr("");
    try {
      const ov = await fetchMjOverview();
      setOverview(ov);
      if (view === "mj_requests") setRows(await fetchMjPurchaseOrders({ q: query }));
      else if (view === "mj_bills") setRows(await fetchMjBills({ q: query }));
      else if (view === "mj_invoices") setRows(await fetchMjInvoices({ q: query }));
      else if (view === "mj_funds") setRows(await fetchMjFunds());
      else if (view === "mj_stats") {
        const s = await fetchMjStats();
        setRows(s);
        const vals = await fetchMjStatValues(s.map((x) => x.mj_id));
        const byStat = {};
        for (const v of vals) (byStat[v.stat_mj_id] ||= []).push(v);
        setStatVals(byStat);
      } else setRows([]);
    } catch (e) {
      setErr("Не удалось загрузить зеркало ManaJet: " + (e?.message || e));
    } finally { setLoading(false); }
  }, [view, query]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  // Синхронизация по группам с прогрессом. Сбой одной группы не прерывает
  // остальные — собираем список проблемных и показываем сводку.
  const runSync = async () => {
    setErr(""); setSyncing("Запуск…");
    const failed = [];
    for (let i = 0; i < SYNC_GROUPS.length; i++) {
      const label = SYNC_GROUPS[i].map((e) => TABLES_RU["mj_" + e] || e).join(", ");
      try {
        // докачка по курсору, если сущность прервалась по бюджету времени
        let cursor = null; let guard = 0;
        do {
          setSyncing(`Синхронизация ${i + 1}/${SYNC_GROUPS.length}: ${label}${cursor ? " (продолжение…)" : "…"}`);
          const res = await triggerMjSync(SYNC_GROUPS[i], cursor);
          if (res && res.ok === false) throw new Error(res.error || "ошибка");
          cursor = res?.cursor || null;
        } while (cursor && ++guard < 30);
      } catch (e) {
        failed.push(`${label} (${e?.message || e})`);
      }
    }
    setSyncing("");
    if (failed.length) setErr("Не загрузились: " + failed.join("; "));
    await load();
  };

  const lastSync = overview.log?.[0];

  // ---- шапка модуля (общая для всех вкладок)
  const header = (
    <div style={{ ...st.toolbar, marginBottom: 16 }}>
      <div style={st.tbLeft}>
        <Database size={18} color={C.green} />
        <div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>ManaJet · зеркало</div>
          <div style={{ fontSize: 12, color: C.faint }}>
            {lastSync
              ? <>обновлено {dtTime(lastSync.finished_at || lastSync.started_at)} {lastSync.ok ? <CheckCircle2 size={11} style={{ verticalAlign: -1 }} color={C.green} /> : <AlertCircle size={11} style={{ verticalAlign: -1 }} color={C.danger} />}</>
              : "ещё не синхронизировано"}
          </div>
        </div>
      </div>
      <div style={st.tbRight}>
        <button style={{ ...st.btnGreen, opacity: syncing ? 0.7 : 1 }} disabled={!!syncing} onClick={runSync}>
          {syncing ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
          {isMobile ? "Обновить" : "Обновить из ManaJet"}
        </button>
      </div>
    </div>
  );

  const banners = (<>
    {syncing && <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, padding: "9px 12px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, color: C.info, background: `${C.info}1a`, border: `1px solid ${C.info}44` }}><Loader2 size={14} className="spin" /> {syncing}</div>}
    {err && <div style={{ ...st.reqError, marginBottom: 12 }}><AlertCircle size={15} /> {err}</div>}
  </>);

  const searchBar = (
    <div style={{ ...st.search, maxWidth: isMobile ? "100%" : 360, marginBottom: 14 }}>
      <Search size={15} color={C.faint} />
      <input
        style={{ background: "transparent", border: "none", outline: "none", color: C.text, fontSize: 14, width: "100%", fontFamily: "inherit" }}
        placeholder="Поиск…" value={query} onChange={(e) => setQuery(e.target.value)}
      />
    </div>
  );

  if (loading) return <div style={st.empty}><Loader2 size={18} className="spin" /> Загрузка…</div>;

  // карточная сетка
  const grid = (children) => (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>{children}</div>
  );
  const card = (extra) => ({ background: C.solid, border: `1px solid ${C.glassBorder}`, borderRadius: 16, padding: 14, boxShadow: `0 8px 24px ${C.shadow}`, ...extra });
  const chip = (tone) => ({ fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 999, whiteSpace: "nowrap", color: tone === "danger" ? C.danger : tone === "warning" ? C.warning : tone === "money" ? C.money : tone === "info" ? C.info : C.sub, background: C.panel2, border: `1px solid ${C.line}` });
  const rowLine = (l, v, color) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, padding: "2px 0" }}>
      <span style={{ color: C.faint }}>{l}</span>
      <span style={{ fontWeight: 600, color: color || C.text, textAlign: "right" }}>{v}</span>
    </div>
  );

  // ====================== ОБЗОР ======================
  if (view === "mj_overview") {
    const ICONS = { mj_funds: Layers, mj_purchase_orders: ClipboardList, mj_bills: FileText, mj_invoices: Receipt, mj_stats: BarChart3, mj_companies: Database, mj_periods: Clock, mj_incomes: Receipt, mj_stat_values: BarChart3, mj_positions: Database };
    return (
      <div>
        {header}{banners}
        {grid(Object.entries(TABLES_RU).map(([t, ru]) => {
          const Icon = ICONS[t] || Database;
          return (
            <div key={t} style={card()}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <Icon size={16} color={C.green} />
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{ru}</span>
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                {(overview.counts[t] ?? 0).toLocaleString("ru-RU")}
              </div>
            </div>
          );
        }))}
        <div style={{ ...card(), marginTop: 16 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 10 }}>Журнал синхронизаций</div>
          {(!overview.log || !overview.log.length) && <div style={{ color: C.faint, fontSize: 13 }}>Пока пусто — нажмите «Обновить из ManaJet».</div>}
          {overview.log?.map((l) => (
            <div key={l.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5, padding: "5px 0", borderTop: `1px solid ${C.line}` }}>
              <span style={{ color: C.sub }}>{dtTime(l.finished_at || l.started_at)} · {l.trigger === "cron" ? "авто" : "вручную"}</span>
              <span style={{ color: l.ok ? C.green : C.danger, fontWeight: 600 }}>
                {l.ok ? "OK" : "ошибка"} {l.entities ? Object.entries(l.entities).map(([k, v]) => `${k}:${v}`).join(" ") : ""}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ====================== ЗАЯВКИ (ЗРС) ======================
  if (view === "mj_requests") {
    return (
      <div>{header}{banners}{searchBar}
        {!rows.length && <div style={st.empty}>Нет данных. Нажмите «Обновить из ManaJet».</div>}
        {grid(rows.map((r) => {
          const stt = PO_STATUS[r.status] || { label: `статус ${r.status}`, tone: "sub" };
          return (
            <div key={r.mj_id} style={card()}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.3 }}>{r.name || "Без названия"}</span>
                <span style={chip(stt.tone)}>{stt.label}</span>
              </div>
              {rowLine("Фонд", r.fund_name || "—")}
              {rowLine("Статья", r.expense_name || "—")}
              {rowLine("Запрошено", fmt(r.planned_value || 0))}
              {rowLine("Одобрено", fmt(r.confirmed_value || 0), C.text)}
              {rowLine("Оплачено", fmt(r.payed_amount || 0), C.money)}
              {(r.csw_data || r.csw_situation || r.csw_solution) && (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ cursor: "pointer", fontSize: 12.5, color: C.green, fontWeight: 600 }}>ЗРС: данные · ситуация · решение</summary>
                  <div style={{ fontSize: 12.5, color: C.sub, marginTop: 6, whiteSpace: "pre-wrap", lineHeight: 1.45 }}>
                    {r.csw_data && <p style={{ margin: "0 0 6px" }}><b>Данные:</b> {r.csw_data}</p>}
                    {r.csw_situation && <p style={{ margin: "0 0 6px" }}><b>Ситуация:</b> {r.csw_situation}</p>}
                    {r.csw_solution && <p style={{ margin: 0 }}><b>Решение:</b> {r.csw_solution}</p>}
                  </div>
                </details>
              )}
            </div>
          );
        }))}
      </div>
    );
  }

  // ====================== СЧЕТА ПОСТАВЩИКОВ ======================
  if (view === "mj_bills") {
    return (
      <div>{header}{banners}{searchBar}
        {!rows.length && <div style={st.empty}>Нет данных. Нажмите «Обновить из ManaJet».</div>}
        {grid(rows.map((r) => (
          <div key={r.mj_id} style={card()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{r.company_name || "—"}</span>
              <span style={chip(r.remaining_amount > 0 ? "warning" : "money")}>{r.remaining_amount > 0 ? "не оплачен" : "оплачен"}</span>
            </div>
            {rowLine("Счёт", `${r.seria || ""}${r.number ? " №" + r.number : ""}` || "—")}
            {rowLine("Дата", dt(r.doc_date))}
            {rowLine("Статья", r.expense_name || "—")}
            {rowLine("Сумма", fmt(r.total_amount || 0))}
            {rowLine("Оплачено", fmt(r.payed_amount || 0), C.money)}
            {rowLine("Остаток", fmt(r.remaining_amount || 0), r.remaining_amount > 0 ? C.warning : C.faint)}
          </div>
        )))}
      </div>
    );
  }

  // ====================== СЧЕТА КЛИЕНТАМ ======================
  if (view === "mj_invoices") {
    return (
      <div>{header}{banners}{searchBar}
        {!rows.length && <div style={st.empty}>Нет данных. Нажмите «Обновить из ManaJet».</div>}
        {grid(rows.map((r) => (
          <div key={r.mj_id} style={card()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{r.company_name || "—"}</span>
              <span style={chip(r.remaining_amount > 0 ? "warning" : "money")}>{r.remaining_amount > 0 ? "есть долг" : "оплачен"}</span>
            </div>
            {rowLine("Счёт", `${r.seria || ""}${r.number ? " №" + r.number : ""}` || "—")}
            {rowLine("Дата", dt(r.doc_date))}
            {rowLine("Сумма", fmt(r.total_amount || 0))}
            {rowLine("Оплачено", fmt(r.payed_amount || 0), C.money)}
            {rowLine("Остаток", fmt(r.remaining_amount || 0), r.remaining_amount > 0 ? C.warning : C.faint)}
          </div>
        )))}
      </div>
    );
  }

  // ====================== ФОНДЫ ======================
  if (view === "mj_funds") {
    return (
      <div>{header}{banners}
        {!rows.length && <div style={st.empty}>Нет данных. Нажмите «Обновить из ManaJet».</div>}
        {grid(rows.map((r) => (
          <div key={r.mj_id} style={card()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{r.name}</span>
              <span style={chip("info")}>{r.number}</span>
            </div>
          </div>
        )))}
      </div>
    );
  }

  // ====================== СТАТИСТИКИ ======================
  if (view === "mj_stats") {
    return (
      <div>{header}{banners}
        {!rows.length && <div style={st.empty}>Нет данных. Нажмите «Обновить из ManaJet».</div>}
        {grid(rows.map((r) => {
          // значения хранятся по убыванию даты; факт (не квота)
          const facts = (statVals[r.mj_id] || []).filter((v) => !v.is_quota);
          const last = facts[0];
          // состояние ХМС по тренду последних 4 недель (ascending)
          const series = facts.slice(0, 4).reverse().map((v) => Number(v.amount));
          const code = calcState(series, r.sign === false);
          const state = STAT_STATES[code];
          return (
            <div key={r.mj_id} style={card()}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.3 }}>{r.name}</span>
                {state && <span style={{ ...chip("sub"), color: state.color, borderColor: `${state.color}55` }}>{state.label}</span>}
              </div>
              {rowLine("Последнее", last ? `${Number(last.amount).toLocaleString("ru-RU")} ${r.unit || ""}` : "—", C.money)}
              {(r.min_val != null || r.max_val != null) && rowLine("Коридор", `${r.min_val != null ? Number(r.min_val).toLocaleString("ru-RU") : "—"} … ${r.max_val != null ? Number(r.max_val).toLocaleString("ru-RU") : "—"}`)}
              {r.position_name && rowLine("Пост", r.position_name)}
            </div>
          );
        }))}
      </div>
    );
  }

  return <div style={st.empty}>Раздел не найден.</div>;
}
