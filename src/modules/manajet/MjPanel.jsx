import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Loader2, AlertCircle, Database } from "lucide-react";
import { useTheme } from "../../theme/theme";
import { fmt } from "../../utils/format";
import {
  triggerMjSync, fetchMjSyncLog, fetchMjPurchaseOrders, fetchMjBills, fetchMjInvoices,
  fetchMjPositions, fetchMjPersons,
} from "../../lib/api";

// Встраиваемая ManaJet-панель (read-only зеркало) для рабочих экранов.
// Переключатель «Наши данные / ManaJet» + список нужного типа + кнопка синка.

// Какие сущности ManaJet синкать для каждого вида (ManaJet медленный ~6–15 с/
// страница, лимит Edge Function ~150 с — поэтому по одной, с докачкой по курсору).
const KIND_SYNC = {
  requests: ["purchase_orders"], bills: ["bills"], invoices: ["invoices"],
  positions: ["positions"], persons: ["persons"],
};
const PO_STATUS = {
  "-1": { label: "Отклонена", tone: "danger" }, 0: { label: "На рассмотрении", tone: "warning" },
  2: { label: "Одобрена", tone: "info" }, 3: { label: "Оплачена", tone: "money" },
};
const dt = (iso) => (iso ? new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "2-digit" }) : "—");
const dtTime = (iso) => (iso ? new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

// Сегментированный переключатель источника данных
export function MjSwitch({ src, setSrc }) {
  const { st } = useTheme();
  return (
    <div style={{ ...st.viewToggle, marginBottom: 14 }}>
      <button style={{ ...st.viewBtn, ...(src === "ours" ? st.viewBtnOn : {}) }} onClick={() => setSrc("ours")}>Наши данные</button>
      <button style={{ ...st.viewBtn, ...(src === "manajet" ? st.viewBtnOn : {}) }} onClick={() => setSrc("manajet")}>
        <Database size={13} /> ManaJet
      </button>
    </div>
  );
}

export function MjPanel({ kind, src, setSrc }) {
  const { C, st, isMobile } = useTheme();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [syncing, setSyncing] = useState("");
  const [rows, setRows] = useState([]);
  const [lastSync, setLastSync] = useState(null);

  const load = useCallback(async () => {
    setErr("");
    try {
      const log = await fetchMjSyncLog(1);
      setLastSync(log[0] || null);
      if (kind === "requests") setRows(await fetchMjPurchaseOrders({}));
      else if (kind === "bills") setRows(await fetchMjBills({}));
      else if (kind === "invoices") setRows(await fetchMjInvoices({}));
      else if (kind === "positions") setRows(await fetchMjPositions());
      else if (kind === "persons") setRows(await fetchMjPersons());
    } catch (e) {
      setErr("Не удалось загрузить данные ManaJet: " + (e?.message || e));
    } finally { setLoading(false); }
  }, [kind]);
  useEffect(() => { setLoading(true); load(); }, [load]);

  // Синкаем только сущности активного вида (с докачкой по курсору).
  const runSync = async () => {
    setErr(""); setSyncing("Обновление…");
    const entities = KIND_SYNC[kind] || [];
    try {
      let cursor = null; let guard = 0;
      do {
        setSyncing(cursor ? "Обновление (продолжение…)" : "Обновление из ManaJet…");
        const res = await triggerMjSync(entities, cursor);
        if (res && res.ok === false) throw new Error(res.error || "ошибка");
        cursor = res?.cursor || null;
      } while (cursor && ++guard < 60);
    } catch (e) {
      setErr("Обновление не удалось: " + (e?.message || e));
    }
    setSyncing("");
    await load();
  };

  // --- общие стили карточек
  const grid = (children) => (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>{children}</div>
  );
  const card = () => ({ background: C.solid, border: `1px solid ${C.glassBorder}`, borderRadius: 16, padding: 14, boxShadow: `0 8px 24px ${C.shadow}` });
  const chip = (tone) => ({ fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 999, whiteSpace: "nowrap", color: tone === "danger" ? C.danger : tone === "warning" ? C.warning : tone === "money" ? C.money : tone === "info" ? C.info : C.sub, background: C.panel2, border: `1px solid ${C.line}` });
  const line = (l, v, color) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, padding: "2px 0" }}>
      <span style={{ color: C.faint }}>{l}</span>
      <span style={{ fontWeight: 600, color: color || C.text, textAlign: "right" }}>{v}</span>
    </div>
  );

  const header = (
    <div style={{ ...st.toolbar, marginBottom: 14 }}>
      <div style={st.tbLeft}>
        <Database size={16} color={C.green} />
        <span style={{ fontSize: 12.5, color: C.faint }}>
          {lastSync ? <>обновлено {dtTime(lastSync.finished_at || lastSync.started_at)}</> : "данные из зеркала ManaJet"}
        </span>
      </div>
      <button style={{ ...st.btnGhost, opacity: syncing ? 0.7 : 1 }} disabled={!!syncing} onClick={runSync}>
        {syncing ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
        {isMobile ? "Обновить" : "Обновить из ManaJet"}
      </button>
    </div>
  );

  const banners = (<>
    {syncing && <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, padding: "9px 12px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, color: C.info, background: `${C.info}1a`, border: `1px solid ${C.info}44` }}><Loader2 size={14} className="spin" /> {syncing}</div>}
    {err && <div style={{ ...st.reqError, marginBottom: 12 }}><AlertCircle size={15} /> {err}</div>}
  </>);

  let body = null;
  if (loading) body = <div style={st.empty}><Loader2 size={18} className="spin" /> Загрузка…</div>;
  else if (!rows.length) body = <div style={st.empty}>Нет данных. Нажмите «Обновить из ManaJet».</div>;
  else if (kind === "requests") body = grid(rows.map((r) => {
    const s = PO_STATUS[r.status] || { label: `статус ${r.status}`, tone: "sub" };
    return (
      <div key={r.mj_id} style={card()}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.3 }}>{r.name || "Без названия"}</span>
          <span style={chip(s.tone)}>{s.label}</span>
        </div>
        {line("Фонд", r.fund_name || "—")}
        {line("Статья", r.expense_name || "—")}
        {line("Запрошено", fmt(r.planned_value || 0))}
        {line("Одобрено", fmt(r.confirmed_value || 0))}
        {line("Оплачено", fmt(r.payed_amount || 0), C.money)}
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
  }));
  else if (kind === "bills") body = grid(rows.map((r) => (
    <div key={r.mj_id} style={card()}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>{r.company_name || "—"}</span>
        <span style={chip(r.remaining_amount > 0 ? "warning" : "money")}>{r.remaining_amount > 0 ? "не оплачен" : "оплачен"}</span>
      </div>
      {line("Счёт", `${r.seria || ""}${r.number ? " №" + r.number : ""}` || "—")}
      {line("Дата", dt(r.doc_date))}
      {line("Статья", r.expense_name || "—")}
      {line("Сумма", fmt(r.total_amount || 0))}
      {line("Оплачено", fmt(r.payed_amount || 0), C.money)}
      {line("Остаток", fmt(r.remaining_amount || 0), r.remaining_amount > 0 ? C.warning : C.faint)}
    </div>
  )));
  else if (kind === "invoices") body = grid(rows.map((r) => (
    <div key={r.mj_id} style={card()}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>{r.company_name || "—"}</span>
        <span style={chip(r.remaining_amount > 0 ? "warning" : "money")}>{r.remaining_amount > 0 ? "есть долг" : "оплачен"}</span>
      </div>
      {line("Счёт", `${r.seria || ""}${r.number ? " №" + r.number : ""}` || "—")}
      {line("Дата", dt(r.doc_date))}
      {line("Сумма", fmt(r.total_amount || 0))}
      {line("Оплачено", fmt(r.payed_amount || 0), C.money)}
      {line("Остаток", fmt(r.remaining_amount || 0), r.remaining_amount > 0 ? C.warning : C.faint)}
    </div>
  )));
  else if (kind === "positions") body = (
    <div style={{ ...card(), padding: "6px 4px" }}>
      {rows.map((r) => {
        const depth = Math.max(0, String(r.full_number || "").split(".").length - 1);
        return (
          <div key={r.mj_id} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "6px 10px", paddingLeft: 10 + depth * 18, borderBottom: `1px solid ${C.line}`, opacity: r.in_archive ? 0.5 : 1 }}>
            <span style={{ ...st.code, minWidth: 64 }}>{r.full_number}</span>
            <span style={{ fontWeight: 600, fontSize: 13.5 }}>{r.name}</span>
            {r.person_name && <span style={{ fontSize: 12.5, color: C.money }}>· {r.person_name}</span>}
            {r.functional && <span style={{ fontSize: 12, color: C.faint, marginLeft: "auto", maxWidth: "45%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.functional}>{r.functional}</span>}
          </div>
        );
      })}
    </div>
  );
  else if (kind === "persons") body = grid(rows.map((r) => (
    <div key={r.mj_id} style={{ ...card(), display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
      <span style={{ fontWeight: 600, fontSize: 14, opacity: r.is_disabled ? 0.5 : 1 }}>{r.name || [r.last_name, r.first_name].filter(Boolean).join(" ") || "—"}</span>
      {r.is_disabled && <span style={chip("sub")}>отключён</span>}
    </div>
  )));

  return (
    <div>
      <MjSwitch src={src} setSrc={setSrc} />
      {header}{banners}{body}
    </div>
  );
}
