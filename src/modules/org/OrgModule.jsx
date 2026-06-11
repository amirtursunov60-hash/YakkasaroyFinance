import { useState, useMemo } from "react";
import { ChevronRight, Check, User2, RotateCw } from "lucide-react";
import { Stat } from "../../components/common";
import { HAT_LIB, ORG_DEPTS } from "../../data/org";
import { useTheme } from "../../theme/theme";


export function OrgModule({ view }) {
  const { C, st } = useTheme();
  const [open, setOpen] = useState({ "7": true });
  const [hatOpen, setHatOpen] = useState({});
  const allPosts = useMemo(() => ORG_DEPTS.flatMap((d) => d.sections.flatMap((s) => s.posts.map((p) => ({ ...p, dept: d.code, deptName: d.name, color: d.color, section: s.name })))), []);
  const [hats, setHats] = useState(() => { const m = {}; allPosts.forEach((p) => (m[p.id] = p.hat)); return m; });

  const HAT_META = {
    done: { label: "Изучена", color: C.green },
    learning: { label: "В обучении", color: "#e8911c" },
    none: { label: "Нет шляпы", color: C.danger },
  };
  const cycleHat = (id) => setHats((m) => ({ ...m, [id]: m[id] === "none" ? "learning" : m[id] === "learning" ? "done" : "none" }));

  const counts = useMemo(() => {
    const total = allPosts.length;
    const filled = allPosts.filter((p) => p.person).length;
    const done = allPosts.filter((p) => hats[p.id] === "done").length;
    return { total, filled, vacant: total - filled, hatPct: Math.round((done / total) * 100) };
  }, [allPosts, hats]);

  const HatBadge = ({ code }) => {
    const m = HAT_META[code];
    return <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 20, whiteSpace: "nowrap", color: m.color, background: `${m.color}1a` }}>{m.label}</span>;
  };
  const VacBadge = () => (
    <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 20, whiteSpace: "nowrap", color: C.danger, background: `${C.danger}1a` }}>Вакансия</span>
  );

  const hero = (
    <section style={st.hero}>
      <div style={st.heroGlow} />
      <div style={st.heroContent}>
        <div style={st.heroTop}>
          <div><div style={st.heroLabel}>{view === "o_hats" ? "Шляпы · должностные папки постов" : "Организующая схема · сеть Яккасарой"}</div><div style={st.heroTitle}>{view === "o_hats" ? "Шляпы постов" : "7 отделений"}</div></div>
        </div>
        <div style={st.heroStats}>
          <Stat label="Постов на схеме" value={String(counts.total)} unit="" />
          <Stat label="Занято" value={String(counts.filled)} unit="" accent />
          <Stat label="Вакансий" value={String(counts.vacant)} unit="" />
          <Stat label="Шляпы изучены" value={`${counts.hatPct}%`} unit="" />
        </div>
      </div>
    </section>
  );

  // ---------- Оргсхема ----------
  if (view !== "o_hats") {
    return (<>
      {hero}
      <div style={st.incList}>
        {ORG_DEPTS.map((d) => {
          const isOpen = !!open[d.code];
          const posts = d.sections.flatMap((s) => s.posts);
          const vac = posts.filter((p) => !p.person).length;
          return (
            <div key={d.code} style={st.locCard}>
              <div style={st.locHead} className="locHead" onClick={() => setOpen((o) => ({ ...o, [d.code]: !o[d.code] }))}>
                <div style={{ ...st.locDot, background: d.color }} />
                <div style={st.locTitle}>
                  <div style={st.locName}>Отделение {d.code} · {d.name}</div>
                  <div style={st.locCode}>ЦКП: {d.ckp}</div>
                </div>
                <div style={st.locRight}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: d.head ? C.text : C.danger }}>{d.head || "Руководитель не назначен"}</div>
                  <div style={{ fontSize: 11.5, color: vac ? C.danger : C.faint }}>{posts.length} постов{vac ? ` · ${vac} вакансий` : ""}</div>
                </div>
                <span style={{ ...st.locChevron, transform: isOpen ? "rotate(90deg)" : "none" }}><ChevronRight size={18} /></span>
              </div>
              {isOpen && (
                <div style={st.locBody}>
                  {d.sections.map((s) => (
                    <div key={s.name} style={{ padding: "10px 18px 4px" }}>
                      <div style={{ ...st.zoneTitle, marginBottom: 6 }}>{s.name}</div>
                      {s.posts.map((p) => (
                        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: `1px solid ${C.line}` }}>
                          <div style={{ width: 34, height: 34, borderRadius: "50%", background: p.person ? C.panel2 : `${C.danger}14`, color: p.person ? d.color : C.danger, display: "grid", placeItems: "center", flexShrink: 0 }}>
                            <User2 size={16} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{p.title}</div>
                            <div style={{ fontSize: 11.5, color: p.person ? C.sub : C.danger }}>{p.person || "пост не занят"}</div>
                          </div>
                          {p.person ? <HatBadge code={hats[p.id]} /> : <VacBadge />}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={st.vibeNote}>
        <b style={{ color: C.green }}>Подсказка по схеме:</b> вакансии руководителей отделений 2, 3 и 5 — главные дыры.
        Пока пост не занят, его шляпу носит вышестоящий — то есть ты. Закрытие этих трёх постов снимает с тебя больше всего нагрузки.
      </div>
    </>);
  }

  // ---------- Шляпы ----------
  return (<>
    {hero}
    <div style={st.incList}>
      {allPosts.map((p) => {
        const lib = HAT_LIB[p.id];
        const isOpen = !!hatOpen[p.id];
        const code = hats[p.id];
        return (
          <div key={p.id} style={st.locCard}>
            <div style={st.locHead} className="locHead" onClick={() => setHatOpen((o) => ({ ...o, [p.id]: !o[p.id] }))}>
              <div style={{ ...st.locDot, background: p.color }} />
              <div style={st.locTitle}>
                <div style={st.locName}>{p.title}</div>
                <div style={st.locCode}>Отд. {p.dept} · {p.section} · {p.person || "вакансия"}</div>
              </div>
              <div style={st.locRight}><HatBadge code={code} /></div>
              <span style={{ ...st.locChevron, transform: isOpen ? "rotate(90deg)" : "none" }}><ChevronRight size={18} /></span>
            </div>
            {isOpen && (
              <div style={{ ...st.locBody, padding: "16px 18px" }}>
                {lib ? (<>
                  <div style={{ marginBottom: 12 }}>
                    <div style={st.reqFieldLbl}>ЦКП поста</div>
                    <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{lib.ckp}</div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={st.reqFieldLbl}>Статистика поста</div>
                    <div style={{ fontSize: 13.5, color: C.sub, marginTop: 4 }}>{lib.stat}</div>
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <div style={st.reqFieldLbl}>Основные обязанности</div>
                    {lib.duties.map((dt, i) => (
                      <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "5px 0", fontSize: 13, color: C.text }}>
                        <Check size={14} color={C.green} style={{ flexShrink: 0, marginTop: 2 }} /> {dt}
                      </div>
                    ))}
                  </div>
                </>) : (
                  <div style={{ ...st.empty, padding: "10px 0 16px", textAlign: "left" }}>Шляпа для этого поста ещё не составлена — внеси ЦКП, статистику и обязанности.</div>
                )}
                <button style={st.btnGhost} className="btn" onClick={(e) => { e.stopPropagation(); cycleHat(p.id); }}>
                  <RotateCw size={14} /> Сменить статус: {HAT_META[code].label} → {HAT_META[code === "none" ? "learning" : code === "learning" ? "done" : "none"].label}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  </>);
}
