import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, Search, Loader2, CheckCheck } from "lucide-react";
import { useTheme } from "../theme/theme";
import { globalSearch, fetchNotifications, markNotificationsRead } from "../lib/api";


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
        aria-label="Поиск" type="search" value={q} onChange={(e) => setQ(e.target.value)} />
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
// Лента личных уведомлений (notifications): новый комментарий по заявке
// (в т.ч. ответ Финансового директора) и решения по заявке. Бейдж — число
// непрочитанных; клик по пункту ведёт в раздел и помечает прочитанным.
export function NotifyBell({ onGo }) {
  const { C, st, profile } = useTheme();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const canSee = !!profile?.id;

  const refresh = useCallback(async () => {
    if (!canSee) return;
    try { setItems(await fetchNotifications({ limit: 20 })); } catch { /* не критично */ }
  }, [canSee]);
  useEffect(() => {
    if (!canSee) return;
    refresh();
    const t = setInterval(refresh, 60000);   // лёгкий поллинг раз в минуту
    return () => clearInterval(t);
  }, [refresh, canSee]);

  const unread = items.filter((n) => !n.is_read).length;

  const onItem = async (n) => {
    setOpen(false);
    if (!n.is_read) {
      setItems((x) => x.map((i) => (i.id === n.id ? { ...i, is_read: true } : i)));
      try { await markNotificationsRead([n.id]); } catch { /* не критично */ }
    }
    if (n.module) onGo(n.module, n.view_key || "requests");
  };
  const markAll = async () => {
    setItems((x) => x.map((i) => ({ ...i, is_read: true })));
    try { await markNotificationsRead(); } catch { /* не критично */ }
  };

  return (
    <div style={{ position: "relative" }}>
      <button style={{ ...st.iconBtn, position: "relative", background: undefined, border: undefined, boxShadow: undefined, backdropFilter: undefined, WebkitBackdropFilter: undefined }} className="btn glass-pill-btn"
        title="Уведомления" aria-label="Уведомления" onClick={() => setOpen((v) => !v)}>
        <Bell size={17} />
        {unread > 0 && (
          <span style={{
            position: "absolute", top: 2, right: 2, minWidth: 15, height: 15, borderRadius: 8,
            background: C.danger, color: "#fff", fontSize: 9.5, fontWeight: 800,
            display: "grid", placeItems: "center", padding: "0 3px",
          }}>{unread > 9 ? "9+" : unread}</span>
        )}
      </button>
      {open && (<>
        <div style={st.weekOverlay} onClick={() => setOpen(false)} />
        <div style={{ ...st.weekMenu, top: 42, right: 0, width: "min(320px, calc(100vw - 24px))", maxHeight: 420, overflowY: "auto" }}>
          <div style={{ ...st.weekMenuHead, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span>Уведомления</span>
            {unread > 0 && (
              <button onClick={markAll} className="btn"
                style={{ border: "none", background: "transparent", cursor: "pointer", color: C.green, fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}>
                <CheckCheck size={13} /> Прочитать все
              </button>
            )}
          </div>
          {!items.length && <div style={{ ...st.empty, padding: 14 }}>Нет уведомлений</div>}
          {items.map((n) => (
            <button key={n.id} onClick={() => onItem(n)} className="btn"
              style={{ display: "block", width: "100%", textAlign: "left", border: "none", cursor: "pointer",
                fontFamily: "inherit", padding: "9px 12px", borderBottom: `1px solid ${C.line}`,
                background: n.is_read ? "transparent" : `${C.green}12` }}>
              <div style={{ fontWeight: n.is_read ? 600 : 800, fontSize: 12.5, color: C.text }}>{n.title}</div>
              {n.body && <div style={{ fontSize: 11.5, color: C.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.body}</div>}
              <div style={{ fontSize: 10.5, color: C.faint, marginTop: 2 }}>
                {new Date(n.created_at).toLocaleString("ru", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </div>
            </button>
          ))}
        </div>
      </>)}
    </div>
  );
}
