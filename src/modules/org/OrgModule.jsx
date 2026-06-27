import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ChevronRight, Check, User2, RotateCw, Plus, Pencil, Trash2, X,
  Loader2, AlertCircle, CheckCircle2, Star,
} from "lucide-react";
import { Stat } from "../../components/common";
import { InfoHint } from "../../components/InfoHint";
import { useTheme } from "../../theme/theme";
import { useScrollLock } from "../../hooks/useScrollLock";
import { useActionFeedback } from "../../hooks/useActionFeedback";
import { avatarColor } from "../../utils/format";
import { orgCounts, nextHatStatus } from "../../utils/org";
import { MjPanel, MjSwitch } from "../manajet/MjPanel";
import {
  fetchOrgChart, fetchPeopleBrief, fetchLocations,
  createDivision, updateDivision, deleteDivision,
  createPosition, updatePosition, archivePosition,
  assignPosition, unassignPosition, setHatStatus,
} from "../../lib/api";


// ---------------------------------------------------------------- ОРГСХЕМА + ШЛЯПЫ (ТЗ v2 §4.3–4.4)
// Живые данные (Supabase): 7 отделений → посты с секциями, ЦКП, шляпами и
// держателями. Права — RLS: читают все; отделения правит финадмин, посты и
// назначения — финадмин или операционный директор.

const HAT_META = {
  done: { label: "Изучена", key: "green" },
  learning: { label: "В обучении", key: "warning" },
  none: { label: "Нет шляпы", key: "danger" },
};

export function OrgModule({ view }) {
  const { C, st, isMobile, profile } = useTheme();
  const isFinAdmin = ["owner", "fin_director"].includes(profile?.role);
  const canPos = isFinAdmin || profile?.role === "ops_director"; // посты, назначения, шляпы
  const canDiv = isFinAdmin;                                     // отделения

  const [loading, setLoading] = useState(true);
  const [src, setSrc] = useState("ours");   // наши данные / зеркало ManaJet
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  useActionFeedback(done, err);
  const [busy, setBusy] = useState(null);
  const [divisions, setDivisions] = useState([]);
  const [people, setPeople] = useState([]);
  const [locations, setLocations] = useState([]);
  const [open, setOpen] = useState({});
  const [hatOpen, setHatOpen] = useState({});
  const [modal, setModal] = useState(null); // { type, division?, position? }

  const load = useCallback(async () => {
    setErr("");
    try {
      const [chart, ppl, locs] = await Promise.all([
        fetchOrgChart(),
        canPos ? fetchPeopleBrief() : Promise.resolve([]),
        fetchLocations(),
      ]);
      setDivisions(chart);
      setPeople(ppl);
      setLocations(locs);
      setOpen((o) => (Object.keys(o).length ? o : (chart[0] ? { [chart[0].id]: true } : {})));
    } catch (e) {
      setErr("Не удалось загрузить оргсхему: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [canPos]);
  useEffect(() => { load(); }, [load]);

  const act = async (key, fn, okMsg) => {
    if (busy) return;
    setBusy(key); setErr(""); setDone("");
    try {
      await fn();
      await load();
      if (okMsg) setDone(okMsg);
    } catch (e) { setErr(friendly(e)); }
    finally { setBusy(null); }
  };
  // Закрыть модал и перезагрузить (для форм с собственным сабмитом)
  const afterModal = async (okMsg) => { setModal(null); await load(); setDone(okMsg || ""); };

  const C2 = { green: C.green, warning: C.warning, danger: C.danger };
  const counts = useMemo(() => orgCounts(divisions), [divisions]);
  const allPosts = useMemo(
    () => divisions.flatMap((d) => d.positions.map((p) => ({ ...p, deptCode: d.code, color: d.color || C.green }))),
    [divisions, C.green],
  );

  if (src === "manajet") return <MjPanel kind="positions" src={src} setSrc={setSrc} />;
  if (loading) return <div style={st.empty}><Loader2 size={18} className="spin" /> Загрузка…</div>;

  const banner = (<>
    {err && <div role="alert" style={{ ...st.reqError, marginBottom: 14 }}><AlertCircle size={15} /> {err}</div>}
    {done && <div style={{ ...st.reqError, marginBottom: 14, color: C.green, background: `${C.green}1a`, borderColor: `${C.green}44` }}><CheckCircle2 size={15} /> {done}</div>}
  </>);

  const HatBadge = ({ code }) => {
    const m = HAT_META[code] || HAT_META.none;
    const col = C2[m.key];
    return <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 20, whiteSpace: "nowrap", color: col, background: `${col}1a` }}>{m.label}</span>;
  };
  const VacBadge = () => (
    <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 20, whiteSpace: "nowrap", color: C.danger, background: `${C.danger}1a` }}>Вакансия</span>
  );

  const hero = (
    <section style={st.hero}>
      <div style={st.heroGlow} />
      <div style={st.heroContent}>
        <div style={st.heroTop}>
          <div>
            <div style={st.heroLabel}>{view === "o_hats" ? "Шляпы · должностные папки постов" : "Организующая схема · сеть Яккасарой"}</div>
            <div style={st.heroTitle}>{view === "o_hats" ? "Шляпы постов" : "7 отделений"}</div>
          </div>
          {view !== "o_hats" && canDiv && (
            <button style={{ ...st.btnGreen, whiteSpace: "nowrap" }} className="btn"
              onClick={() => setModal({ type: "division" })}>
              <Plus size={15} /> {isMobile ? "Отделение" : "Добавить отделение"}
            </button>
          )}
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

  // ----------------------------------------------------------- Оргсхема
  const chartView = (
    <>
      {hero}
      {banner}
      {!divisions.length && <div style={{ ...st.locCard, ...st.empty }}>Отделений пока нет{canDiv ? " — добавьте первое." : "."}</div>}
      <div style={st.incList}>
        {divisions.map((d) => {
          const isOpen = !!open[d.id];
          const color = d.color || C.green;
          const headPost = d.positions.find((p) => p.isExecutive && p.holders.length);
          const head = headPost?.holders[0]?.name || null;
          const vac = d.positions.filter((p) => !p.holders.length).length;
          // посты по секциям с сохранением порядка
          const sections = [];
          for (const p of d.positions) {
            let s = sections.find((x) => x.name === p.section);
            if (!s) { s = { name: p.section, posts: [] }; sections.push(s); }
            s.posts.push(p);
          }
          return (
            <div key={d.id} style={st.locCard}>
              <div style={st.locHead} className="locHead" onClick={() => setOpen((o) => ({ ...o, [d.id]: !o[d.id] }))}>
                <div style={{ ...st.locDot, background: color }} />
                <div style={st.locTitle}>
                  <div style={st.locName}>Отделение {d.code} · {d.name}</div>
                  {d.ckp && <div style={st.locCode}>ЦКП: {d.ckp}</div>}
                </div>
                <div style={{ ...st.locRight, textAlign: "right" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: head ? C.text : C.danger }}>{head || "Руководитель не назначен"}</div>
                  <div style={{ fontSize: 11.5, color: vac ? C.danger : C.faint }}>{d.positions.length} постов{vac ? ` · ${vac} вак.` : ""}</div>
                </div>
                {canDiv && (
                  <div style={{ display: "flex", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                    <button style={{ ...st.iconBtn, width: 32, height: 32 }} className="btn" title="Изменить отделение"
                      onClick={() => setModal({ type: "division", division: d })}><Pencil size={14} /></button>
                    <button style={{ ...st.iconBtn, width: 32, height: 32, color: C.danger }} className="btn" title="Удалить отделение" disabled={!!busy}
                      onClick={() => window.confirm(`Удалить отделение «${d.name}»? Возможно только если в нём нет постов.`) &&
                        act(`deldiv:${d.id}`, () => deleteDivision(d.id), "Отделение удалено")}>
                      {busy === `deldiv:${d.id}` ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                )}
                <span style={{ ...st.locChevron, transform: isOpen ? "rotate(90deg)" : "none" }}><ChevronRight size={18} /></span>
              </div>

              {isOpen && (
                <div style={st.locBody}>
                  {sections.map((s) => (
                    <div key={s.name} style={{ padding: "10px 18px 4px" }}>
                      <div style={{ ...st.zoneTitle, marginBottom: 6 }}>{s.name}</div>
                      {orderSectionPosts(s.posts).map((p) => (
                        <PostRow key={p.id} p={p} color={color} C={C} st={st}
                          canPos={canPos} people={people} busy={busy} act={act}
                          HatBadge={HatBadge} VacBadge={VacBadge}
                          onEdit={() => setModal({ type: "position", position: p, division: d })} />
                      ))}
                    </div>
                  ))}
                  {canPos && (
                    <div style={{ padding: "4px 18px 14px" }}>
                      <button style={{ ...st.btnGhost, padding: "8px 12px", fontSize: 12.5 }} className="btn"
                        onClick={() => setModal({ type: "position", division: d })}>
                        <Plus size={14} /> Добавить пост
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={st.vibeNote}>
        <b style={{ color: C.green }}>Подсказка:</b> вакантные руководящие посты (со звездой) — главные дыры.
        Пока пост не занят, его шляпу носит вышестоящий. Назначение людей на посты — в модуле «Сотрудники».
      </div>
    </>
  );

  // ----------------------------------------------------------- Шляпы
  const hatsView = (
    <>
      {hero}
      {banner}
      <div style={st.incList}>
        {allPosts.map((p) => {
          const isOpen = !!hatOpen[p.id];
          const holder = p.holders[0];
          const code = holder?.hatStatus || "none";
          const hasHat = !!(p.ckp || p.statistic || (p.duties && p.duties.length));
          return (
            <div key={p.id} style={st.locCard}>
              <div style={st.locHead} className="locHead" onClick={() => setHatOpen((o) => ({ ...o, [p.id]: !o[p.id] }))}>
                <div style={{ ...st.locDot, background: p.color }} />
                <div style={st.locTitle}>
                  <div style={st.locName}>{p.isExecutive && <Star size={12} color={p.color} style={{ marginRight: 4, verticalAlign: "middle" }} />}{p.name}</div>
                  <div style={st.locCode}>Отд. {p.deptCode} · {p.section}{p.locationName ? ` · ${p.locationName}` : ""} · {holder?.name || "вакансия"}</div>
                </div>
                <div style={st.locRight}>{holder ? <HatBadge code={code} /> : <VacBadge />}</div>
                <span style={{ ...st.locChevron, transform: isOpen ? "rotate(90deg)" : "none" }}><ChevronRight size={18} /></span>
              </div>
              {isOpen && (
                <div style={{ ...st.locBody, padding: "16px 18px" }}>
                  {hasHat ? (<>
                    {p.ckp && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={st.reqFieldLbl}>ЦКП поста</div>
                        <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{p.ckp}</div>
                      </div>
                    )}
                    {p.statistic && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={st.reqFieldLbl}>Статистика поста</div>
                        <div style={{ fontSize: 13.5, color: C.sub, marginTop: 4 }}>{p.statistic}</div>
                      </div>
                    )}
                    {!!p.duties.length && (
                      <div style={{ marginBottom: 14 }}>
                        <div style={st.reqFieldLbl}>Основные обязанности</div>
                        {p.duties.map((dt, i) => (
                          <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "5px 0", fontSize: 13, color: C.text }}>
                            <Check size={14} color={C.green} style={{ flexShrink: 0, marginTop: 2 }} /> {dt}
                          </div>
                        ))}
                      </div>
                    )}
                  </>) : (
                    <div style={{ ...st.empty, padding: "10px 0 16px", textAlign: "left" }}>Шляпа для этого поста ещё не составлена — внеси ЦКП, статистику и обязанности.</div>
                  )}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {canPos && (
                      <button style={st.btnGhost} className="btn" onClick={(e) => { e.stopPropagation(); setModal({ type: "hat", position: p }); }}>
                        <Pencil size={14} /> Редактировать шляпу
                      </button>
                    )}
                    {canPos && holder && (
                      <button style={st.btnGhost} className="btn" disabled={!!busy}
                        onClick={(e) => { e.stopPropagation(); act(`hat:${p.id}`, () => setHatStatus(holder.id, p.id, nextHatStatus(code)), "Статус шляпы обновлён"); }}>
                        <RotateCw size={14} /> Статус: {HAT_META[code].label} → {HAT_META[nextHatStatus(code)].label}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );

  return (<>
    <MjSwitch src={src} setSrc={setSrc} />
    {view === "o_hats" ? hatsView : chartView}
    {modal?.type === "division" && (
      <DivisionModal C={C} st={st} division={modal.division}
        onClose={() => setModal(null)} onSaved={afterModal} />
    )}
    {modal?.type === "position" && (
      <PositionModal C={C} st={st} isMobile={isMobile} divisions={divisions} locations={locations}
        position={modal.position} division={modal.division}
        onClose={() => setModal(null)} onSaved={afterModal} onArchive={act} />
    )}
    {modal?.type === "hat" && (
      <HatModal st={st} position={modal.position}
        onClose={() => setModal(null)} onSaved={afterModal} />
    )}
  </>);
}


// Упорядочить посты секции деревом: подчинённые идут сразу под руководителем
// (parent_id в пределах той же секции), с глубиной _depth для отступа.
function orderSectionPosts(posts) {
  const byId = new Map(posts.map((p) => [p.id, p]));
  const children = new Map();
  const roots = [];
  for (const p of posts) {
    if (p.parentId && byId.has(p.parentId)) {
      if (!children.has(p.parentId)) children.set(p.parentId, []);
      children.get(p.parentId).push(p);
    } else roots.push(p);
  }
  const out = [];
  const walk = (p, depth) => { out.push({ ...p, _depth: depth }); (children.get(p.id) || []).forEach((c) => walk(c, depth + 1)); };
  roots.forEach((r) => walk(r, 0));
  return out;
}

// ---------------------------------------------------------------- Строка поста
function PostRow({ p, color, C, st, canPos, people, busy, act, HatBadge, VacBadge, onEdit }) {
  const holder = p.holders[0];
  const assignedIds = new Set(p.holders.map((h) => h.id));
  const depth = p._depth || 0;
  return (
    <div style={{ padding: "9px 0", borderBottom: `1px solid ${C.line}`, marginLeft: depth ? depth * 20 : 0,
      ...(depth ? { borderLeft: `2px solid ${C.line}`, paddingLeft: 12 } : {}) }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {depth > 0 && <span style={{ color: C.faint, fontSize: 13, flexShrink: 0 }} title="подчинённый пост">↳</span>}
        <div style={{ width: 34, height: 34, borderRadius: "50%", background: holder ? `${avatarColor(holder.name)}26` : `${C.danger}14`, color: holder ? avatarColor(holder.name) : C.danger, display: "grid", placeItems: "center", flexShrink: 0 }}>
          <User2 size={16} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
            {p.isExecutive && <Star size={12} color={color} />}{p.name}
          </div>
          <div style={{ fontSize: 11.5, color: holder ? C.sub : C.danger }}>
            {p.holders.length ? p.holders.map((h) => h.name).join(", ") : "пост не занят"}
          </div>
        </div>
        {holder ? <HatBadge code={holder.hatStatus} /> : <VacBadge />}
        {canPos && (
          <button style={{ ...st.iconBtn, width: 30, height: 30 }} className="btn" title="Изменить пост" onClick={onEdit}>
            <Pencil size={13} />
          </button>
        )}
      </div>

      {/* Назначения: чипы держателей + назначить (финадмин/опердиректор) */}
      {canPos && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", paddingLeft: 46, marginTop: 6 }}>
          {p.holders.map((h) => (
            <span key={h.id} style={{ ...st.weekTag, marginLeft: 0, display: "inline-flex", alignItems: "center", gap: 5 }}>
              {h.name}
              <X size={12} style={{ cursor: "pointer" }} title="Снять с поста"
                onClick={() => act(`unassign:${p.id}:${h.id}`, () => unassignPosition(h.id, p.id), "Сотрудник снят с поста")} />
            </span>
          ))}
          <select style={{ ...st.mdSelect, width: "auto", fontSize: 12, padding: "5px 9px" }} className="fin" value="" disabled={!!busy}
            onChange={(e) => e.target.value && act(`assign:${p.id}`, () => assignPosition(e.target.value, p.id), "Сотрудник назначен на пост")}>
            <option value="">+ назначить сотрудника</option>
            {people.filter((x) => !assignedIds.has(x.id)).map((x) => (
              <option key={x.id} value={x.id}>{x.full_name}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}


// ---------------------------------------------------------------- Модал отделения
function DivisionModal({ C, st, division, onClose, onSaved }) {
  useScrollLock();
  const edit = !!division;
  const [f, setF] = useState({
    code: division?.code || "", name: division?.name || "",
    color: division?.color || "#3f9e6a", ckp: division?.ckp || "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const valid = f.code.trim() && f.name.trim();

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true); setErr("");
    try {
      const patch = { code: f.code.trim(), name: f.name.trim(), color: f.color || null, ckp: f.ckp.trim() || null };
      if (edit) await updateDivision(division.id, patch);
      else await createDivision(patch);
      await onSaved(edit ? "Отделение обновлено" : "Отделение создано");
    } catch (e) { setErr(friendly(e)); setBusy(false); }
  };

  return (
    <div style={st.mdOverlay} data-modal="1" onClick={onClose}>
      <div style={{ ...st.mdCard, width: "min(440px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>{edit ? "Изменить отделение" : "Новое отделение"}</div>
          <button style={st.iconBtn} onClick={onClose} aria-label="Закрыть"><X size={17} /></button>
        </div>
        {err && <div role="alert" style={{ ...st.reqError, marginBottom: 12 }}><AlertCircle size={15} /> {err}</div>}
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: 10 }}>
            <div style={st.reqField}>
              <span style={st.reqFieldLbl}>Код</span>
              <input style={st.mdInput} value={f.code} onChange={(e) => setF((p) => ({ ...p, code: e.target.value }))} placeholder="7" />
            </div>
            <div style={st.reqField}>
              <span style={st.reqFieldLbl}>Название</span>
              <input style={st.mdInput} value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} placeholder="Административное" autoFocus />
            </div>
          </div>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>ЦКП отделения</span>
            <input style={st.mdInput} value={f.ckp} onChange={(e) => setF((p) => ({ ...p, ckp: e.target.value }))} placeholder="Процветающая и расширяющаяся компания" />
          </div>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Цвет</span>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input type="color" value={f.color} onChange={(e) => setF((p) => ({ ...p, color: e.target.value }))}
                style={{ width: 44, height: 36, border: `1px solid ${C.line}`, borderRadius: 8, background: C.panel2, cursor: "pointer" }} />
              <input style={{ ...st.mdInput, flex: 1 }} value={f.color} onChange={(e) => setF((p) => ({ ...p, color: e.target.value }))} />
            </div>
          </div>
        </div>
        <div style={st.mdActions}>
          <button style={st.btnGhost} className="btn" onClick={onClose}>Отмена</button>
          <button style={{ ...st.btnGreen, opacity: valid && !busy ? 1 : 0.6 }} className="btn" disabled={!valid || busy} onClick={save}>
            {busy ? <Loader2 size={15} className="spin" /> : <Check size={15} />} Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}


// ---------------------------------------------------------------- Модал поста
function PositionModal({ C, st, isMobile, divisions, locations = [], position, division, onClose, onSaved, onArchive }) {
  useScrollLock();
  const edit = !!position;
  const [f, setF] = useState({
    code: position?.code || "", name: position?.name || "",
    divisionId: position?.divisionId || division?.id || (divisions[0]?.id ?? ""),
    locationId: position?.locationId || "",
    section: position?.section && position.section !== "Без секции" ? position.section : "",
    ckp: position?.ckp || "", statistic: position?.statistic || "",
    duties: (position?.duties || []).join("\n"),
    isExecutive: !!position?.isExecutive,
    parentId: position?.parentId || "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const valid = f.code.trim() && f.name.trim() && f.divisionId;

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true); setErr("");
    try {
      const patch = {
        code: f.code.trim(), name: f.name.trim(), division_id: f.divisionId,
        location_id: f.locationId || null,
        section: f.section.trim() || null, ckp: f.ckp.trim() || null,
        statistic: f.statistic.trim() || null,
        duties: f.duties.split("\n").map((s) => s.trim()).filter(Boolean),
        is_executive: f.isExecutive,
        parent_id: f.parentId || null,
      };
      if (edit) await updatePosition(position.id, patch);
      else await createPosition(patch);
      await onSaved(edit ? "Пост обновлён" : "Пост создан");
    } catch (e) { setErr(friendly(e)); setBusy(false); }
  };

  return (
    <div style={st.mdOverlay} data-modal="1" onClick={onClose}>
      <div style={{ ...st.mdCard, width: "min(520px, 100%)", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>{edit ? "Изменить пост" : "Новый пост"}</div>
          <button style={st.iconBtn} onClick={onClose} aria-label="Закрыть"><X size={17} /></button>
        </div>
        {err && <div role="alert" style={{ ...st.reqError, marginBottom: 12 }}><AlertCircle size={15} /> {err}</div>}
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "110px 1fr", gap: 10 }}>
            <div style={st.reqField}>
              <span style={st.reqFieldLbl}>Код</span>
              <input style={st.mdInput} value={f.code} onChange={(e) => setF((p) => ({ ...p, code: e.target.value }))} placeholder="7.20.1" />
            </div>
            <div style={st.reqField}>
              <span style={st.reqFieldLbl}>Название поста</span>
              <input style={st.mdInput} value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} placeholder="Менеджер по банкетам" autoFocus />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
            <div style={st.reqField}>
              <span style={st.reqFieldLbl}>Отделение</span>
              <select style={st.mdSelect} className="fin" value={f.divisionId} onChange={(e) => setF((p) => ({ ...p, divisionId: e.target.value }))}>
                {divisions.map((d) => <option key={d.id} value={d.id}>{d.code} · {d.name}</option>)}
              </select>
            </div>
            <div style={st.reqField}>
              <span style={st.reqFieldLbl}>Секция</span>
              <input style={st.mdInput} value={f.section} onChange={(e) => setF((p) => ({ ...p, section: e.target.value }))} placeholder="Отдел продаж банкетов" />
            </div>
          </div>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Точка (необязательно)</span>
            <select style={st.mdSelect} className="fin" value={f.locationId} onChange={(e) => setF((p) => ({ ...p, locationId: e.target.value }))}>
              <option value="">— вся сеть —</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Подчинён посту (руководитель, необязательно)</span>
            <select style={st.mdSelect} className="fin" value={f.parentId} onChange={(e) => setF((p) => ({ ...p, parentId: e.target.value }))}>
              <option value="">— подчинён напрямую отделению —</option>
              {(divisions.find((d) => d.id === f.divisionId)?.positions || [])
                .filter((p) => p.id !== position?.id)
                .map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
            </select>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.text, cursor: "pointer" }}>
            <input type="checkbox" checked={f.isExecutive} onChange={(e) => setF((p) => ({ ...p, isExecutive: e.target.checked }))} />
            <Star size={13} color={C.green} /> Руководящий пост отделения
          </label>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>ЦКП поста</span>
            <input style={st.mdInput} value={f.ckp} onChange={(e) => setF((p) => ({ ...p, ckp: e.target.value }))} placeholder="Заключённые договоры на банкеты" />
          </div>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Статистика поста</span>
            <input style={st.mdInput} value={f.statistic} onChange={(e) => setF((p) => ({ ...p, statistic: e.target.value }))} placeholder="Подписанные брони, сумма предоплат" />
          </div>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Обязанности (по одной на строку)</span>
            <textarea style={{ ...st.mdInput, minHeight: 96, resize: "vertical", lineHeight: 1.5 }} value={f.duties}
              onChange={(e) => setF((p) => ({ ...p, duties: e.target.value }))}
              placeholder={"Обработка входящих заявок\nПоказы залов и расчёт смет\nДоговоры и предоплаты"} />
          </div>
        </div>
        <div style={st.mdActions}>
          {edit && (
            <button style={{ ...st.btnGhost, color: C.danger, marginRight: "auto" }} className="btn"
              onClick={() => window.confirm(`Архивировать пост «${position.name}»?`) &&
                onArchive(`arch:${position.id}`, () => archivePosition(position.id), "Пост архивирован").then(onClose)}>
              <Trash2 size={14} /> Архивировать
            </button>
          )}
          <button style={st.btnGhost} className="btn" onClick={onClose}>Отмена</button>
          <button style={{ ...st.btnGreen, opacity: valid && !busy ? 1 : 0.6 }} className="btn" disabled={!valid || busy} onClick={save}>
            {busy ? <Loader2 size={15} className="spin" /> : <Check size={15} />} Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}


// ---------------------------------------------------------------- Модал шляпы (ЦКП/статистика/обязанности)
function HatModal({ st, position, onClose, onSaved }) {
  useScrollLock();
  const [f, setF] = useState({
    ckp: position?.ckp || "", statistic: position?.statistic || "",
    duties: (position?.duties || []).join("\n"),
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    if (busy) return;
    setBusy(true); setErr("");
    try {
      await updatePosition(position.id, {
        ckp: f.ckp.trim() || null, statistic: f.statistic.trim() || null,
        duties: f.duties.split("\n").map((s) => s.trim()).filter(Boolean),
      });
      await onSaved("Шляпа обновлена");
    } catch (e) { setErr(friendly(e)); setBusy(false); }
  };

  return (
    <div style={st.mdOverlay} data-modal="1" onClick={onClose}>
      <div style={{ ...st.mdCard, width: "min(520px, 100%)", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={{ ...st.mdTitle, display: "inline-flex", alignItems: "center", gap: 6 }}>
            Шляпа · {position.name}<InfoHint term="шляпа" />
          </div>
          <button style={st.iconBtn} onClick={onClose} aria-label="Закрыть"><X size={17} /></button>
        </div>
        {err && <div role="alert" style={{ ...st.reqError, marginBottom: 12 }}><AlertCircle size={15} /> {err}</div>}
        <div style={{ display: "grid", gap: 12 }}>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>ЦКП поста</span>
            <input style={st.mdInput} value={f.ckp} onChange={(e) => setF((p) => ({ ...p, ckp: e.target.value }))} autoFocus />
          </div>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Статистика поста</span>
            <input style={st.mdInput} value={f.statistic} onChange={(e) => setF((p) => ({ ...p, statistic: e.target.value }))} />
          </div>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Основные обязанности (по одной на строку)</span>
            <textarea style={{ ...st.mdInput, minHeight: 120, resize: "vertical", lineHeight: 1.5 }} value={f.duties}
              onChange={(e) => setF((p) => ({ ...p, duties: e.target.value }))} />
          </div>
        </div>
        <div style={st.mdActions}>
          <button style={st.btnGhost} className="btn" onClick={onClose}>Отмена</button>
          <button style={{ ...st.btnGreen, opacity: busy ? 0.6 : 1 }} className="btn" disabled={busy} onClick={save}>
            {busy ? <Loader2 size={15} className="spin" /> : <Check size={15} />} Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}


// Понятные сообщения по типовым ошибкам БД (FK/права/уникальность)
function friendly(e) {
  const msg = e?.message || String(e);
  if (e?.code === "23503") return "Нельзя удалить: на отделении ещё есть посты — сначала перенесите или архивируйте их.";
  if (e?.code === "23505") return "Такой код уже используется — выберите другой.";
  if (e?.code === "42501") return "Недостаточно прав для этого действия.";
  return msg;
}
