import { useState, useMemo } from "react";
import { CalendarDays, Plus, Check, Ban, Flame } from "lucide-react";
import { StatChart } from "../../components/charts/StatChart";
import { Stat } from "../../components/common";
import { BATTLE_SEED, TASKS_SEED } from "../../data/dashboard";
import { EXPENSE_TREE, FUND_SOURCES, PAY_METHODS } from "../../data/finance";
import { ORG_DEPTS } from "../../data/org";
import { STATS_SEED, STAT_STATES } from "../../data/stats";
import { useTheme } from "../../theme/theme";
import { fmt } from "../../utils/format";
import { calcState } from "../../utils/stats";


export function DashModule({ view }) {
  const { C, st } = useTheme();
  // --- общее состояние кабинета (живёт при переключении разделов модуля) ---
  const [battle, setBattle] = useState(BATTLE_SEED);
  const [newBp, setNewBp] = useState("");
  const [tasks, setTasks] = useState(TASKS_SEED);
  const [taskFilter, setTaskFilter] = useState("active");
  const [tForm, setTForm] = useState({ title: "", to: "Чалолов Точиддин", due: "" });
  const [myReqs, setMyReqs] = useState([]);
  const [rForm, setRForm] = useState({ title: "", kind: "РД1 — Продукты и поставщики", fund: FUND_SOURCES[0], pay: PAY_METHODS[0], amount: "" });
  const [reqMsg, setReqMsg] = useState("");

  const PEOPLE = useMemo(() => {
    const set = new Set();
    ORG_DEPTS.forEach((d) => d.sections.forEach((s) => s.posts.forEach((p) => p.person && set.add(p.person))));
    return [...set];
  }, []);
  const KINDS = useMemo(() => EXPENSE_TREE.map((e) => `${e.code} — ${e.name}`), []);

  const bpDone = battle.filter((b) => b.done).length;
  const bpPct = battle.length ? Math.round((bpDone / battle.length) * 100) : 0;

  const toggleBp = (id) => setBattle((bs) => bs.map((b) => (b.id === id ? { ...b, done: !b.done } : b)));
  const addBp = () => {
    const t = newBp.trim(); if (!t) return;
    setBattle((bs) => [...bs, { id: Date.now(), text: t, target: "Личный план", done: false }]);
    setNewBp("");
  };

  const T_META = {
    new: { label: "Новая", color: "#5b8def", next: "Взять в работу", nextStatus: "progress" },
    progress: { label: "В работе", color: "#e8911c", next: "Завершить", nextStatus: "done" },
    done: { label: "Выполнена", color: C.green, next: null },
  };
  const P_META = { high: { label: "срочно", color: C.danger }, mid: { label: "обычный", color: "#e8911c" }, low: { label: "низкий", color: C.faint } };
  const advanceTask = (id) => setTasks((ts) => ts.map((t) => (t.id === id && T_META[t.status].nextStatus ? { ...t, status: T_META[t.status].nextStatus } : t)));
  const addTask = () => {
    const title = tForm.title.trim(); if (!title) return;
    setTasks((ts) => [{ id: Date.now(), title, from: "Турсунов Амир", to: tForm.to, due: tForm.due || "без срока", status: "new", dept: "7", priority: "mid" }, ...ts]);
    setTForm((f) => ({ ...f, title: "", due: "" }));
  };

  const submitReq = () => {
    const a = Number(rForm.amount) || 0;
    if (!rForm.title.trim()) { setReqMsg("Укажи название заявки"); return; }
    if (a <= 0) { setReqMsg("Сумма должна быть больше нуля"); return; }
    setMyReqs((rs) => [{ id: Date.now(), ...rForm, amount: a, status: "К рассмотрению на ФП" }, ...rs]);
    setRForm((f) => ({ ...f, title: "", amount: "" }));
    setReqMsg("");
  };

  const tCounts = useMemo(() => ({
    active: tasks.filter((t) => t.status !== "done").length,
    new: tasks.filter((t) => t.status === "new").length,
    progress: tasks.filter((t) => t.status === "progress").length,
    done: tasks.filter((t) => t.status === "done").length,
    all: tasks.length,
  }), [tasks]);

  const TaskCard = ({ t }) => {
    const m = T_META[t.status]; const pm = P_META[t.priority];
    return (
      <div style={{ ...st.locCard, padding: "14px 16px", opacity: t.status === "done" ? 0.65 : 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
          <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.35, textDecoration: t.status === "done" ? "line-through" : "none" }}>{t.title}</div>
          <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 20, whiteSpace: "nowrap", color: m.color, background: `${m.color}1a`, flexShrink: 0 }}>{m.label}</span>
        </div>
        <div style={{ fontSize: 12, color: C.sub, marginTop: 6 }}>{t.from} → <b style={{ color: C.text }}>{t.to}</b></div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: C.faint }}><CalendarDays size={13} /> {t.due}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: pm.color }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: pm.color }} /> {pm.label}</span>
          </div>
          {m.next && <button style={{ ...st.btnGhost, padding: "7px 12px" }} className="btn" onClick={() => advanceTask(t.id)}>{m.next}</button>}
        </div>
      </div>
    );
  };

  const BpRow = ({ b }) => (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 0", borderBottom: `1px solid ${C.line}` }}>
      <button onClick={() => toggleBp(b.id)} className="btn" style={{ width: 24, height: 24, borderRadius: 8, flexShrink: 0, cursor: "pointer", display: "grid", placeItems: "center", border: `1.5px solid ${b.done ? C.green : C.line}`, background: b.done ? C.green : "transparent", color: "#04130a", marginTop: 1 }}>
        {b.done && <Check size={15} strokeWidth={3} />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, textDecoration: b.done ? "line-through" : "none", color: b.done ? C.faint : C.text }}>{b.text}</div>
        <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>→ {b.target}</div>
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
            <div style={st.incHeroLabel}>Боевое планирование · Четверг, 11 июня 2026</div>
            <div style={st.incHeroValue}>{bpDone} <span style={st.incHeroUnit}>из {battle.length} выполнено</span></div>
            <div style={{ ...st.bar, maxWidth: 280, marginTop: 14 }}><div style={{ ...st.barFill, width: `${bpPct}%` }} /></div>
          </div>
        </div>
      </section>
      <section style={st.fpCard}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <Flame size={18} color={C.green} />
          <h3 style={st.reqSectionTitle}>План на сегодня</h3>
          <span style={st.reqSectionSub}>каждое действие ведёт к ЦКП или статистике</span>
        </div>
        {battle.map((b) => <BpRow key={b.id} b={b} />)}
        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <input value={newBp} onChange={(e) => setNewBp(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addBp()}
            placeholder="Новое действие на день…" style={{ ...st.numInput, flex: 1, minWidth: 200, textAlign: "left" }} className="amtIn" />
          <button style={st.btnGreen} className="btn" onClick={addBp}><Plus size={15} /> Добавить</button>
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
            <div style={st.incHeroSub}>выполнено за период: <b style={{ color: C.green }}>{tCounts.done}</b></div>
          </div>
        </div>
      </section>

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
            <select style={st.reqSelect} value={tForm.to} onChange={(e) => setTForm((f) => ({ ...f, to: e.target.value }))}>
              {PEOPLE.map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
          <label style={st.reqField}>
            <span style={st.reqFieldLbl}>Срок</span>
            <input value={tForm.due} onChange={(e) => setTForm((f) => ({ ...f, due: e.target.value }))}
              placeholder="напр. 15 июн" style={{ ...st.numInput, width: "100%", textAlign: "left" }} className="amtIn" />
          </label>
          <button style={st.btnGreen} className="btn" onClick={addTask}><Plus size={15} /> Поручить</button>
        </div>
      </section>

      <div style={st.reqTabs}>
        {TABS.map((t) => (
          <button key={t.key} style={{ ...st.reqTab, ...(taskFilter === t.key ? st.reqTabOn : {}) }} onClick={() => setTaskFilter(t.key)} className="btn">
            {t.label} <span style={st.reqTabN}>{t.n}</span>
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 12 }}>
        {shown.map((t) => <TaskCard key={t.id} t={t} />)}
        {shown.length === 0 && <div style={st.empty}>В этом списке задач нет</div>}
      </div>
    </>);
  }

  // ============ МОЙ КАБИНЕТ ============
  const myStat = STATS_SEED[0];
  const myCode = calcState(myStat.values, myStat.invert);
  const myState = STAT_STATES[myCode];
  const activeTasks = tasks.filter((t) => t.status !== "done").slice(0, 3);
  return (<>
    <section style={st.hero}>
      <div style={st.heroGlow} />
      <div style={st.heroContent}>
        <div style={st.heroTop}>
          <div><div style={st.heroLabel}>Личный кабинет · Четверг, 11 июня 2026</div><div style={st.heroTitle}>Салом, Амир!</div></div>
        </div>
        <div style={st.heroStats}>
          <Stat label="Пост" value="Ген. директор" unit="отд. 7" />
          <Stat label="БП на сегодня" value={`${bpDone}/${battle.length}`} unit="" accent />
          <Stat label="Задач активных" value={String(tCounts.active)} unit="" />
          <Stat label="Моих заявок на ФП" value={String(myReqs.length)} unit="" />
        </div>
      </div>
    </section>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
      {/* Моя статистика */}
      <div style={{ ...st.locCard, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Моя статистика · {myStat.name}</div>
          <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 20, color: myState.color, background: `${myState.color}1a`, whiteSpace: "nowrap" }}>{myState.label}</span>
        </div>
        <div style={{ fontSize: 11, color: C.faint, marginBottom: 10 }}>12 недель · {myStat.unit}</div>
        <div style={{ color: C.text }}><StatChart values={myStat.values} color={myState.color} height={100} /></div>
        <div style={{ fontSize: 17, fontWeight: 800, marginTop: 8, fontVariantNumeric: "tabular-nums" }}>{myStat.values[myStat.values.length - 1].toLocaleString("ru-RU")} <span style={{ fontSize: 11, fontWeight: 600, color: C.sub }}>{myStat.unit}</span></div>
      </div>

      {/* БП кратко */}
      <div style={{ ...st.locCard, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Боевое планирование</div>
          <span style={{ fontSize: 12, color: C.sub }}>{bpPct}%</span>
        </div>
        <div style={{ ...st.bar, marginBottom: 8 }}><div style={{ ...st.barFill, width: `${bpPct}%` }} /></div>
        {battle.slice(0, 4).map((b) => <BpRow key={b.id} b={b} />)}
      </div>

      {/* Мои задачи кратко */}
      <div style={{ ...st.locCard, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>Мои задачи</div>
        {activeTasks.map((t) => <TaskCard key={t.id} t={t} />)}
        {activeTasks.length === 0 && <div style={{ ...st.empty, padding: "16px 0" }}>Активных задач нет</div>}
      </div>

      {/* Подача заявки на ФП */}
      <div style={{ ...st.locCard, padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>Подать заявку на ФП</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input value={rForm.title} onChange={(e) => setRForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Что нужно оплатить…" style={{ ...st.numInput, width: "100%", textAlign: "left" }} className="amtIn" />
          <select style={st.reqSelect} value={rForm.kind} onChange={(e) => setRForm((f) => ({ ...f, kind: e.target.value }))}>
            {KINDS.map((k) => <option key={k}>{k}</option>)}
          </select>
          <select style={st.reqSelect} value={rForm.fund} onChange={(e) => setRForm((f) => ({ ...f, fund: e.target.value }))}>
            {FUND_SOURCES.map((f) => <option key={f}>{f}</option>)}
          </select>
          <div style={{ display: "flex", gap: 10 }}>
            <select style={{ ...st.reqSelect, flex: 1 }} value={rForm.pay} onChange={(e) => setRForm((f) => ({ ...f, pay: e.target.value }))}>
              {PAY_METHODS.map((p) => <option key={p}>{p}</option>)}
            </select>
            <input type="number" inputMode="decimal" value={rForm.amount} onChange={(e) => setRForm((f) => ({ ...f, amount: e.target.value }))}
              onWheel={(e) => e.target.blur()} placeholder="Сумма, TJS" style={{ ...st.numInput, width: 130 }} className="amtIn" />
          </div>
          {reqMsg && <div style={st.reqError}><Ban size={14} /> {reqMsg}</div>}
          <button style={{ ...st.btnGreen, justifyContent: "center" }} className="btn" onClick={submitReq}><Plus size={15} /> Отправить на Финкомитет</button>
        </div>
        {myReqs.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
            <div style={st.reqFieldLbl}>Мои заявки</div>
            {myReqs.map((r) => (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: `1px solid ${C.line}` }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{r.title}</div>
                  <div style={{ fontSize: 11, color: C.faint }}>{r.kind} · {r.fund}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(r.amount)}</div>
                  <div style={{ fontSize: 10.5, color: "#e8911c", fontWeight: 700 }}>{r.status}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  </>);
}
