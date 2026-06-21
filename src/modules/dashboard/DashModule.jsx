import { useState, useEffect, useCallback, useMemo } from "react";
import {
  CalendarDays, Plus, Check, Flame, Loader2, AlertCircle, CheckCircle2,
} from "lucide-react";
import { StatChart } from "../../components/charts/StatChart";
import { Stat } from "../../components/common";
import { useTheme } from "../../theme/theme";
import { fmt } from "../../utils/format";
import { calcState, STAT_STATES } from "../../utils/stats";
import {
  fetchTasks, createTask, setTaskStatus, fetchBattlePlan, createBattleItem,
  setBattleDone, fetchPeopleBrief, fetchStatistics, fetchStatisticValues,
  fetchPeriods, fetchMyRequests,
} from "../../lib/api";

const REQ_STATUS = {
  submitted: { label: "На рассмотрении", color: "warning" },
  planning: { label: "Финкомитет", color: "info" },
  approved: { label: "Одобрена", color: "green" },
  rejected: { label: "Отклонена", color: "danger" },
  paid: { label: "Оплачена", color: "money" },
};
const todayLabel = () => new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const ru = (v) => (v == null || Number.isNaN(v) ? "—" : Number(v).toLocaleString("ru-RU"));

export function DashModule({ view }) {
  const { C, st, isMobile, profile } = useTheme();
  const myId = profile?.id;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(null);
  const [battle, setBattle] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [people, setPeople] = useState([]);
  const [stats, setStats] = useState([]);
  const [statValues, setStatValues] = useState({});
  const [periods, setPeriods] = useState([]);
  const [myReqs, setMyReqs] = useState([]);

  const [newBp, setNewBp] = useState("");
  const [taskFilter, setTaskFilter] = useState("active");
  const [tForm, setTForm] = useState({ title: "", toId: "", due: "", priority: "mid" });

  const load = useCallback(async () => {
    setErr("");
    try {
      const [bp, ts, ppl, ss, ps, reqs] = await Promise.all([
        fetchBattlePlan(), fetchTasks(), fetchPeopleBrief(), fetchStatistics(),
        fetchPeriods(12), fetchMyRequests(myId),
      ]);
      setBattle(bp); setTasks(ts); setPeople(ppl); setStats(ss); setPeriods(ps); setMyReqs(reqs);
      const vals = await fetchStatisticValues(ps.map((p) => p.id));
      setStatValues(vals);
    } catch (e) {
      setErr("Не удалось загрузить кабинет: " + (e?.message || e));
    } finally { setLoading(false); }
  }, [myId]);
  useEffect(() => { load(); }, [load]);

  const bpDone = battle.filter((b) => b.done).length;
  const bpPct = battle.length ? Math.round((bpDone / battle.length) * 100) : 0;

  const toggleBp = async (b) => {
    setBusy(`bp:${b.id}`); setErr("");
    try { await setBattleDone(b.id, !b.done); setBattle((bs) => bs.map((x) => x.id === b.id ? { ...x, done: !x.done } : x)); }
    catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };
  const addBp = async () => {
    const t = newBp.trim(); if (!t || busy) return;
    setBusy("addbp"); setErr("");
    try { await createBattleItem({ text: t }); setNewBp(""); await load(); }
    catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  const tCounts = useMemo(() => ({
    active: tasks.filter((t) => t.status !== "done").length,
    new: tasks.filter((t) => t.status === "new").length,
    progress: tasks.filter((t) => t.status === "progress").length,
    done: tasks.filter((t) => t.status === "done").length,
    all: tasks.length,
  }), [tasks]);

  const advanceTask = async (t, next) => {
    setBusy(`t:${t.id}`); setErr("");
    try { await setTaskStatus(t.id, next); await load(); }
    catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };
  const addTask = async () => {
    const title = tForm.title.trim(); if (!title || busy) return;
    setBusy("addtask"); setErr("");
    try {
      await createTask({ title, toId: tForm.toId, dueDate: tForm.due || null, priority: tForm.priority });
      setTForm((f) => ({ ...f, title: "", due: "" }));
      await load(); setDone("Задача поручена");
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  // «Моя статистика»: статистика, где владелец — я; иначе первая
  const periodsAsc = useMemo(() => [...periods].reverse(), [periods]);
  const myStat = useMemo(() => {
    const mine = stats.find((s) => s.owner_id && s.owner_id === myId);
    return mine || stats[0] || null;
  }, [stats, myId]);
  const myStatSeries = useMemo(() => {
    if (!myStat) return [];
    const out = [];
    for (const p of periodsAsc) {
      const cell = statValues[myStat.id]?.[p.id];
      if (cell && cell.value != null) out.push(Number(cell.value));
    }
    return out;
  }, [myStat, statValues, periodsAsc]);

  if (loading) return <div style={st.empty}><Loader2 size={18} className="spin" /> Загрузка…</div>;

  const T_META = {
    new: { label: "Новая", color: C.info, next: "Взять в работу", nextStatus: "progress" },
    progress: { label: "В работе", color: C.warning, next: "Завершить", nextStatus: "done" },
    done: { label: "Выполнена", color: C.green, next: null },
  };
  const P_META = { high: { label: "срочно", color: C.danger }, mid: { label: "обычный", color: C.warning }, low: { label: "низкий", color: C.faint } };

  const banners = (<>
    {err && <div style={{ ...st.reqError, marginBottom: 14 }}><AlertCircle size={15} /> {err}</div>}
    {done && <div style={{ ...st.reqSuccess, marginBottom: 14 }}><CheckCircle2 size={15} /> {done}</div>}
  </>);

  const TaskCard = ({ t }) => {
    const m = T_META[t.status]; const pm = P_META[t.priority] || P_META.mid;
    return (
      <div style={{ ...st.locCard, padding: "14px 16px", opacity: t.status === "done" ? 0.65 : 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
          <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.35, textDecoration: t.status === "done" ? "line-through" : "none" }}>{t.title}</div>
          <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 20, whiteSpace: "nowrap", color: m.color, background: `${m.color}1a`, flexShrink: 0 }}>{m.label}</span>
        </div>
        <div style={{ fontSize: 12, color: C.sub, marginTop: 6 }}>{t.from?.full_name || "—"} → <b style={{ color: C.text }}>{t.assignee?.full_name || "не назначен"}</b></div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: C.faint }}><CalendarDays size={13} /> {t.due_date ? new Date(t.due_date + "T00:00:00").toLocaleDateString("ru-RU", { day: "2-digit", month: "short" }) : "без срока"}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: pm.color }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: pm.color }} /> {pm.label}</span>
          </div>
          {m.next && <button style={{ ...st.btnGhost, padding: "7px 12px" }} className="btn" disabled={!!busy} onClick={() => advanceTask(t, m.nextStatus)}>{busy === `t:${t.id}` ? <Loader2 size={13} className="spin" /> : m.next}</button>}
        </div>
      </div>
    );
  };

  const BpRow = ({ b }) => (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 0", borderBottom: `1px solid ${C.line}` }}>
      <button onClick={() => toggleBp(b)} className="btn" disabled={busy === `bp:${b.id}`} style={{ width: 24, height: 24, borderRadius: 8, flexShrink: 0, cursor: "pointer", display: "grid", placeItems: "center", border: `1.5px solid ${b.done ? C.green : C.line}`, background: b.done ? C.green : "transparent", color: C.onAccent, marginTop: 1 }}>
        {b.done && <Check size={15} strokeWidth={3} />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, textDecoration: b.done ? "line-through" : "none", color: b.done ? C.faint : C.text }}>{b.text}</div>
        <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>→ {b.target || "Личный план"}</div>
      </div>
    </div>
  );

  // ============ БОЕВОЕ ПЛАНИРОВАНИЕ ============
  if (view === "d_battle") {
    return (<>
      <section style={st.incHero}>
        <div style={st.incHeroGlow} />
        <div style={st.incHeroInner}>
          <div>
            <div style={st.incHeroLabel}>Боевое планирование · {todayLabel()}</div>
            <div style={st.incHeroValue}>{bpDone} <span style={st.incHeroUnit}>из {battle.length} выполнено</span></div>
            <div style={{ ...st.bar, maxWidth: 280, marginTop: 14 }}><div style={{ ...st.barFill, width: `${bpPct}%` }} /></div>
          </div>
        </div>
      </section>
      {banners}
      <section style={st.fpCard}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <Flame size={18} color={C.green} />
          <h3 style={st.reqSectionTitle}>Мой план</h3>
          <span style={st.reqSectionSub}>каждое действие ведёт к ЦКП или статистике</span>
        </div>
        {battle.length === 0 && <div style={{ ...st.empty, padding: "16px 0" }}>Пунктов пока нет — добавьте первое действие</div>}
        {battle.map((b) => <BpRow key={b.id} b={b} />)}
        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <input value={newBp} onChange={(e) => setNewBp(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addBp()}
            placeholder="Новое действие на день…" style={{ ...st.numInput, flex: 1, minWidth: 200, textAlign: "left" }} className="amtIn" />
          <button style={{ ...st.btnGreen, opacity: busy === "addbp" ? 0.7 : 1 }} className="btn glass" onClick={addBp} disabled={busy === "addbp"}>
            {busy === "addbp" ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} Добавить
          </button>
        </div>
      </section>
      <div style={st.vibeNote}>
        <b style={{ color: C.green }}>Правило БП:</b> план пишется вечером накануне или утром до начала работы.
        Каждый пункт — конкретное действие, двигающее статистику поста, а не «поработать над…».
      </div>
    </>);
  }

  // ============ ЗАДАЧИ ============
  if (view === "d_tasks") {
    const TABS = [
      { key: "active", label: "Активные", n: tCounts.active },
      { key: "new", label: "Новые", n: tCounts.new },
      { key: "progress", label: "В работе", n: tCounts.progress },
      { key: "done", label: "Выполнены", n: tCounts.done },
    ];
    const shown = tasks.filter((t) => taskFilter === "active" ? t.status !== "done" : t.status === taskFilter);
    return (<>
      <section style={st.incHero}>
        <div style={st.incHeroGlow} />
        <div style={st.incHeroInner}>
          <div>
            <div style={st.incHeroLabel}>Задачи · поручения по компании</div>
            <div style={st.incHeroValue}>{tCounts.active} <span style={st.incHeroUnit}>активных</span></div>
            <div style={st.incHeroSub}>выполнено: <b style={{ color: C.green }}>{tCounts.done}</b></div>
          </div>
        </div>
      </section>
      {banners}
      <section style={{ ...st.fpCard, marginTop: 0, marginBottom: 18 }}>
        <div style={st.reqFieldLbl}>Новая задача</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginTop: 8 }}>
          <label style={{ ...st.reqField, flexBasis: "100%" }}>
            <input value={tForm.title} onChange={(e) => setTForm((f) => ({ ...f, title: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && addTask()}
              placeholder="Что нужно сделать…" style={{ ...st.numInput, width: "100%", textAlign: "left" }} className="amtIn" />
          </label>
          <label style={st.reqField}>
            <span style={st.reqFieldLbl}>Исполнитель</span>
            <select style={st.reqSelect} value={tForm.toId} onChange={(e) => setTForm((f) => ({ ...f, toId: e.target.value }))}>
              <option value="">— выберите —</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </label>
          <label style={st.reqField}>
            <span style={st.reqFieldLbl}>Приоритет</span>
            <select style={st.reqSelect} value={tForm.priority} onChange={(e) => setTForm((f) => ({ ...f, priority: e.target.value }))}>
              <option value="high">срочно</option><option value="mid">обычный</option><option value="low">низкий</option>
            </select>
          </label>
          <label style={st.reqField}>
            <span style={st.reqFieldLbl}>Срок</span>
            <input type="date" value={tForm.due} onChange={(e) => setTForm((f) => ({ ...f, due: e.target.value }))}
              style={{ ...st.numInput, width: "100%", textAlign: "left" }} className="amtIn fin" />
          </label>
          <button style={{ ...st.btnGreen, opacity: busy === "addtask" ? 0.7 : 1 }} className="btn glass" onClick={addTask} disabled={busy === "addtask"}>
            {busy === "addtask" ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} Поручить
          </button>
        </div>
      </section>
      <div style={st.reqTabs}>
        {TABS.map((t) => (
          <button key={t.key} style={{ ...st.reqTab, ...(taskFilter === t.key ? st.reqTabOn : {}) }} onClick={() => setTaskFilter(t.key)} className="btn">
            {t.label} <span style={st.reqTabN}>{t.n}</span>
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(290px, 1fr))", gap: 12 }} className="stagger">
        {shown.map((t) => <TaskCard key={t.id} t={t} />)}
        {shown.length === 0 && <div style={st.empty}>В этом списке задач нет</div>}
      </div>
    </>);
  }

  // ============ МОЙ КАБИНЕТ ============
  const myCode = calcState(myStatSeries, myStat?.invert);
  const myState = STAT_STATES[myCode];
  const firstName = (profile?.full_name || "").split(" ")[0] || "коллега";
  const activeTasks = tasks.filter((t) => t.status !== "done").slice(0, 3);
  return (<>
    <section style={st.hero}>
      <div style={st.heroGlow} />
      <div style={st.heroContent}>
        <div style={st.heroTop}>
          <div><div style={st.heroLabel}>Личный кабинет · {todayLabel()}</div><div style={st.heroTitle}>Салом, {firstName}!</div></div>
        </div>
        <div style={st.heroStats}>
          <Stat label="БП на сегодня" value={`${bpDone}/${battle.length}`} unit="" accent />
          <Stat label="Задач активных" value={String(tCounts.active)} unit="" />
          <Stat label="Моих заявок" value={String(myReqs.length)} unit="" />
          <Stat label="Статистик" value={String(stats.length)} unit="" />
        </div>
      </div>
    </section>
    {banners}

    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
      {/* Моя статистика */}
      <div style={{ ...st.locCard, padding: 16 }}>
        {myStat ? (<>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>Моя статистика · {myStat.name}</div>
            <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 20, color: myState.color, background: `${myState.color}1a`, whiteSpace: "nowrap" }}>{myState.label}</span>
          </div>
          <div style={{ fontSize: 11, color: C.faint, marginBottom: 10 }}>{myStat.unit || ""}</div>
          {myStatSeries.length ? <div style={{ color: C.text }}><StatChart values={myStatSeries} color={myState.color} height={100} /></div>
            : <div style={{ fontSize: 12, color: C.faint, padding: "24px 0", textAlign: "center" }}>значений ещё нет</div>}
          <div style={{ fontSize: 17, fontWeight: 800, marginTop: 8, fontVariantNumeric: "tabular-nums" }}>{ru(myStatSeries[myStatSeries.length - 1])} <span style={{ fontSize: 11, fontWeight: 600, color: C.sub }}>{myStat.unit}</span></div>
        </>) : <div style={{ ...st.empty, padding: "16px 0" }}>Статистик пока нет — добавьте в модуле «Статистики»</div>}
      </div>

      {/* БП кратко */}
      <div style={{ ...st.locCard, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Боевое планирование</div>
          <span style={{ fontSize: 12, color: C.sub }}>{bpPct}%</span>
        </div>
        <div style={{ ...st.bar, marginBottom: 8 }}><div style={{ ...st.barFill, width: `${bpPct}%` }} /></div>
        {battle.length === 0 && <div style={{ ...st.empty, padding: "12px 0" }}>Плана ещё нет</div>}
        {battle.slice(0, 4).map((b) => <BpRow key={b.id} b={b} />)}
      </div>

      {/* Мои задачи кратко */}
      <div style={{ ...st.locCard, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>Мои задачи</div>
        {activeTasks.map((t) => <TaskCard key={t.id} t={t} />)}
        {activeTasks.length === 0 && <div style={{ ...st.empty, padding: "16px 0" }}>Активных задач нет</div>}
      </div>

      {/* Мои заявки (read-only; создание — в модуле «Заявки») */}
      <div style={{ ...st.locCard, padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>Мои заявки на ФП</div>
        <div style={{ fontSize: 11.5, color: C.faint, marginBottom: 10 }}>Подать новую заявку (ЗРС) — в модуле «Заявки»</div>
        {myReqs.length === 0 ? (
          <div style={{ ...st.empty, padding: "16px 0" }}>Заявок пока нет</div>
        ) : myReqs.map((r) => {
          const meta = REQ_STATUS[r.status] || { label: r.status, color: "sub" };
          const amt = r.approved_amount ?? r.planned_amount;
          return (
            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: `1px solid ${C.line}` }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.purpose || "Заявка"}</div>
                <div style={{ fontSize: 11, color: C.faint }}>{new Date(r.created_at).toLocaleDateString("ru-RU", { day: "2-digit", month: "short" })}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(amt || 0)}</div>
                <div style={{ fontSize: 10.5, color: C[meta.color] || C.sub, fontWeight: 700 }}>{meta.label}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  </>);
}
