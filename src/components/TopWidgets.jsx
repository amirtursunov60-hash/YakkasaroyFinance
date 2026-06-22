import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, Search, Loader2 } from "lucide-react";
import { useTheme } from "../theme/theme";
import { usePeriod } from "../lib/PeriodCtx";
import { globalSearch, fetchRequests, fetchBills } from "../lib/api";


// ---------------------------------------------------------------- Поиск в шапке
// Глобальный поиск: контрагенты, заявки, счета, банкеты, фонды, сотрудники.
// Клик по результату открывает соответствующий раздел.
export function GlobalSearch({ onGo }) {
  const { C, st } = useTheme();
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) { setResults(null); return; }
    timer.current = setTimeout(async () => {
      setBusy(true);
      try { setResults(await globalSearch(q.trim())); }
      catch { setResults([]); }
      finally { setBusy(false); }
    }, 350);
    return () => clearTimeout(timer.current);
  }, [q]);

  return (
    <div style={{ ...st.searchWrap, position: "relative" }}>
      {busy ? <Loader2 size={16} color={C.faint} className="spin" /> : <Search size={16} color={C.faint} />}
      <input style={st.search} placeholder="Поиск: контрагенты, заявки, счета…"
        value={q} onChange={(e) => setQ(e.target.value)} />
      {results !== null && (<>
        <div style={st.weekOverlay} onClick={() => { setResults(null); setQ(""); }} />
        <div style={{ ...st.weekMenu, top: 42, left: 0, width: 320 }}>
          <div style={st.weekMenuHead}>Результаты поиска</div>
          {!results.length && <div style={{ ...st.empty, padding: 14 }}>Ничего не найдено</div>}
          {results.map((r, i) => (
            <button key={i} style={st.weekOption} className="weekOpt"
              onClick={() => { setResults(null); setQ(""); onGo(r.module, r.section); }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
              <span style={{ ...st.weekTag }}>{r.type}</span>
            </button>
          ))}
        </div>
      </>)}
    </div>
  );
}


// ---------------------------------------------------------------- Колокольчик
// Считает поданные заявки и счета (к рассмотрению финкомитетом);
// клик ведёт в раздел «Заявки». Обновляется при смене недели.
export function NotifyBell({ onGo }) {
  const { C, st, profile } = useTheme();
  const ctx = usePeriod();
  const [count, setCount] = useState(0);
  const canSee = ["owner", "fin_director", "ops_director", "accountant"].includes(profile?.role);

  const refresh = useCallback(async () => {
    if (!canSee || !ctx || ctx.loading) return;
    try {
      const [reqs, bills] = await Promise.all([fetchRequests(ctx.periodId), fetchBills(ctx.periodId)]);
      setCount(
        reqs.filter((r) => ["submitted", "planning"].includes(r.status)).length +
        bills.filter((b) => ["submitted", "planning"].includes(b.status)).length,
      );
    } catch { /* счётчик не критичен */ }
  }, [canSee, ctx?.periodId, ctx?.loading]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { refresh(); }, [refresh]);

  return (
    <button style={{ ...st.iconBtn, position: "relative", background: undefined, border: undefined, boxShadow: undefined, backdropFilter: undefined, WebkitBackdropFilter: undefined }} className="btn glass-pill-btn"
      title={count ? `К рассмотрению: ${count}` : "Уведомления"}
      onClick={() => count && onGo("finance", "requests")}>
      <Bell size={17} />
      {count > 0 && (
        <span style={{
          position: "absolute", top: 2, right: 2, minWidth: 15, height: 15, borderRadius: 8,
          background: C.danger, color: "#fff", fontSize: 9.5, fontWeight: 800,
          display: "grid", placeItems: "center", padding: "0 3px",
        }}>{count > 9 ? "9+" : count}</span>
      )}
    </button>
  );
}
