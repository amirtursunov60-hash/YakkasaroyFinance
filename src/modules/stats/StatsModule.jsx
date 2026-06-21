import { useState, useEffect, useMemo, useCallback } from "react";
import {
  ArrowUpRight, ArrowDownRight, ChevronRight, Plus, TrendingUp,
  Loader2, AlertCircle, CheckCircle2, X, Pencil, Archive,
} from "lucide-react";
import { StatChart } from "../../components/charts/StatChart";
import { Stat } from "../../components/common";
import { useTheme } from "../../theme/theme";
import { useScrollLock } from "../../hooks/useScrollLock";
import { usePeriod, periodTitle } from "../../lib/PeriodCtx";
import { calcState, STAT_STATES, quotaAchievement } from "../../utils/stats";
import {
  fetchStatistics, fetchStatisticValues, fetchPeriods, fetchOrgDivisions,
  fetchAllPositions, upsertStatisticValue, createStatistic, updateStatistic,
  archiveStatistic,
} from "../../lib/api";

const ru = (v) => (v == null || Number.isNaN(v) ? "—" : Number(v).toLocaleString("ru-RU"));

export function StatsModule({ view }) {
  const { C, st, isMobile, profile } = useTheme();
  const { period, periodId } = usePeriod();
  const isAdmin = ["owner", "fin_director", "ops_director"].includes(profile?.role);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const [stats, setStats] = useState([]);
  const [periods, setPeriods] = useState([]); // по убыванию даты
  const [values, setValues] = useState({});
  const [divisions, setDivisions] = useState([]);
  const [positions, setPositions] = useState([]);
  const [open, setOpen] = useState({});
  const [busy, setBusy] = useState(null);
  const [editing, setEditing] = useState(null); // "new" | объект статистики

  const periodsAsc = useMemo(() => [...periods].reverse(), [periods]);

  const reloadValues = useCallback(async (ps) => {
    const vals = await fetchStatisticValues((ps || periods).map((p) => p.id));
    setValues(vals);
  }, [periods]);

  const load = useCallback(async () => {
    setErr("");
    try {
      const [ss, ps, divs, poss] = await Promise.all([
        fetchStatistics(), fetchPeriods(12), fetchOrgDivisions(), fetchAllPositions(),
      ]);
      setStats(ss); setPeriods(ps); setDivisions(divs); setPositions(poss);
      await reloadValues(ps);
    } catch (e) {
      setErr("Не удалось загрузить статистики: " + (e?.message || e));
    } finally { setLoading(false); }
  }, [reloadValues]);
  useEffect(() => { load(); }, [load]);

  // Модель строки: хронологический ряд факта, состояние, дельта, текущая квота
  const rows = useMemo(() => stats.map((s) => {
    const series = [];
    const quotaSeries = [];   // план, выровненный по неделям факта (null где плана нет)
    for (const p of periodsAsc) {
      const cell = values[s.id]?.[p.id];
      if (cell && cell.value != null) {
        series.push(Number(cell.value));
        quotaSeries.push(cell.quota != null ? Number(cell.quota) : null);
      }
    }
    const hasQuota = quotaSeries.some((q) => q != null);
    const state = calcState(series, s.invert);
    const n = series.length;
    const last = n ? series[n - 1] : null;
    const prev = n > 1 ? series[n - 2] : null;
    let delta = null;
    if (last != null && prev != null) {
      const diff = last - prev;
      const pct = prev !== 0 ? Math.abs((diff / prev) * 100) : 100;
      delta = { diff, pct, good: s.invert ? diff < 0 : diff > 0, flat: diff === 0 };
    }
    const divCode = s.position?.division?.code || "—";
    const divName = s.position?.division?.name || "Без отделения";
    const owner = s.owner?.full_name || s.position?.name || "—";
    const curCell = periodId ? values[s.id]?.[periodId] : null;
    const achievement = quotaAchievement(curCell?.value, curCell?.quota, s.invert);
    return { s, series, quotaSeries, hasQuota, state, last, delta, divCode, divName, owner,
      curValue: curCell?.value ?? null, curQuota: curCell?.quota ?? null, achievement };
  }), [stats, values, periodsAsc, periodId]);

  const summary = useMemo(() => {
    let up = 0, down = 0, danger = 0;
    rows.forEach((r) => {
      if (r.state === "danger") danger++;
      if (r.delta && !r.delta.flat) (r.delta.good ? up++ : down++);
    });
    return { up, down, danger };
  }, [rows]);

  const onSaved = async (msg) => { setEditing(null); await load(); setDone(msg); };

  const doArchive = async (s) => {
    setBusy(`arch:${s.id}`); setErr(""); setDone("");
    try { await archiveStatistic(s.id); await load(); setEditing(null); setDone(`Статистика «${s.name}» архивирована`); }
    catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  const Badge = ({ code }) => {
    const m = STAT_STATES[code];
    return <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 20, whiteSpace: "nowrap", color: m.color, background: `${m.color}1a` }}>{m.label}</span>;
  };
  const Delta = ({ d }) => {
    if (!d || d.flat) return <span style={{ ...st.trend, color: C.faint, fontSize: 12 }}>—</span>;
    const col = d.good ? C.green : C.danger;
    return (
      <span style={{ ...st.trend, color: col, fontSize: 12 }}>
        {d.diff > 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{d.pct.toFixed(1)}%
      </span>
    );
  };
  // Бейдж выполнения квоты (плана) за текущую неделю
  const QuotaBadge = ({ a }) => {
    if (!a) return null;
    const col = a.met ? C.green : C.warning;
    return (
      <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 20, whiteSpace: "nowrap", color: col, background: `${col}1a` }}>
        план {a.pct.toFixed(0)}%
      </span>
    );
  };
  // Легенда «факт / план» под графиком (когда у статистики есть план)
  const ChartLegend = ({ color }) => (
    <div style={{ display: "flex", gap: 14, marginTop: 6, fontSize: 11, color: C.sub }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 14, height: 2.5, borderRadius: 2, background: color }} /> Факт</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 14, height: 0, borderTop: `2px dashed ${C.faint}` }} /> План (квота)</span>
    </div>
  );

  // ---------- Справочник состояний (статичный — без данных) ----------
  if (view === "s_ref") {
    const REF = [
      { code: "power", text: "Статистика в рекордном диапазоне и продолжает расти. Ничего не меняй — запиши, какие именно действия привели сюда, и закрепи их письменно." },
      { code: "affluence", text: "Крутой устойчивый рост. Экономь, оплати долги, укрепляй то, что дало рост, не трать на пустое." },
      { code: "normal", text: "Лёгкий стабильный рост. Не меняй то, что работает. Ищи, что слегка улучшить, и устраняй мелкие помехи." },
      { code: "emergency", text: "Стагнация или лёгкий спад. Продвигай, меняй действия, экономь. Если за 2–3 недели не выправилось — ужесточай меры." },
      { code: "danger", text: "Резкий спад. Руководитель лично обходит обычный порядок и исправляет ситуацию, затем укрепляет слабое место." },
      { code: "nonexistence", text: "Новый пост или новая статистика. Осмотрись, выясни, что от тебя нужно, и начни это производить и фиксировать." },
    ];
    return (<>
      <div style={st.rSectionHead}><TrendingUp size={18} color={C.green} /><h3 style={st.reqSectionTitle}>Состояния статистик</h3><span style={st.reqSectionSub}>определяются по наклону графика за 4 недели</span></div>
      <div style={st.incList}>
        {REF.map((r) => { const m = STAT_STATES[r.code]; return (
          <div key={r.code} style={{ ...st.locCard, padding: "16px 18px", display: "flex", gap: 14, alignItems: "flex-start" }}>
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: m.color, flexShrink: 0, marginTop: 4 }} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: m.color, marginBottom: 4 }}>{m.label}</div>
              <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.55 }}>{r.text}</div>
            </div>
          </div>); })}
      </div>
    </>);
  }

  if (loading) return <div style={st.empty}><Loader2 size={18} className="spin" /> Загрузка…</div>;

  // ---------- Общий hero ----------
  const hero = (
    <section style={st.hero}>
      <div style={st.heroGlow} />
      <div style={st.heroContent}>
        <div style={st.heroTop}>
          <div>
            <div style={st.heroLabel}>{view === "s_ico" ? "ИЦО · информационный центр организации" : "Все статистики компании"}</div>
            <div style={st.heroTitle}>{period ? periodTitle(period) : "Период не выбран"}</div>
          </div>
          {isAdmin && view !== "s_ico" && (
            <button style={st.btnGhost} className="btn glass" onClick={() => setEditing("new")}>
              <Plus size={15} /> {!isMobile && "Новая статистика"}
            </button>
          )}
        </div>
        <div style={st.heroStats}>
          <Stat label="Всего статистик" value={String(stats.length)} unit="" />
          <Stat label="Растут" value={String(summary.up)} unit="" accent />
          <Stat label="Падают" value={String(summary.down)} unit="" />
          <Stat label="В Опасности" value={String(summary.danger)} unit="" />
        </div>
      </div>
    </section>
  );

  const banners = (<>
    {err && <div style={{ ...st.reqError, marginBottom: 14 }}><AlertCircle size={15} /> {err}</div>}
    {done && <div style={{ ...st.reqSuccess, marginBottom: 14 }}><CheckCircle2 size={15} /> {done}</div>}
  </>);

  const modals = (<>
    {editing && (
      <StatFormModal C={C} st={st} isMobile={isMobile} positions={positions} divisions={divisions}
        stat={editing === "new" ? null : editing} busy={busy} onArchive={doArchive}
        onClose={() => setEditing(null)} onSaved={onSaved} />
    )}
  </>);

  // ---------- ИЦО: доска по отделениям ----------
  if (view === "s_ico") {
    const used = divisions.filter((d) => rows.some((r) => r.divCode === d.code));
    const orphan = rows.filter((r) => !divisions.some((d) => d.code === r.divCode));
    return (<>
      {hero}{banners}
      {rows.length === 0 && <div style={st.empty}>Статистик пока нет{isAdmin ? " — добавьте на вкладке «Все статистики»" : ""}</div>}
      {[...used.map((d) => ({ code: d.code, name: d.name, items: rows.filter((r) => r.divCode === d.code) })),
        ...(orphan.length ? [{ code: "—", name: "Без отделения", items: orphan }] : [])].map((grp) => (
        <div key={grp.code} style={{ marginBottom: 24 }}>
          <div style={st.zoneTitle}>{grp.code !== "—" ? `Отделение ${grp.code} · ` : ""}{grp.name}</div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(270px, 1fr))", gap: 12 }} className="stagger">
            {grp.items.map((r) => {
              const m = STAT_STATES[r.state];
              return (
                <div key={r.s.id} style={{ ...st.locCard, padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.3 }}>{r.s.name}</div>
                    <Badge code={r.state} />
                  </div>
                  <div style={{ fontSize: 11, color: C.faint, marginBottom: 10 }}>{r.owner}</div>
                  {r.series.length ? (<>
                    <div style={{ color: C.text }}><StatChart values={r.series} quota={r.hasQuota ? r.quotaSeries : undefined} color={m.color} height={95} /></div>
                    {r.hasQuota && <ChartLegend color={m.color} />}
                  </>) : <div style={{ fontSize: 12, color: C.faint, padding: "24px 0", textAlign: "center" }}>нет данных</div>}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 8, gap: 8 }}>
                    <span style={{ fontSize: 17, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{ru(r.last)} <span style={{ fontSize: 11, fontWeight: 600, color: C.sub }}>{r.s.unit}</span></span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}><QuotaBadge a={r.achievement} /><Delta d={r.delta} /></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {modals}
    </>);
  }

  // ---------- Все статистики: список с вводом значения за неделю ----------
  return (<>
    {hero}{banners}
    {rows.length === 0 && <div style={st.empty}>Статистик пока нет{isAdmin ? " — нажмите «Новая статистика»" : ""}</div>}
    <div style={st.incList}>
      {rows.map((r) => {
        const s = r.s;
        const m = STAT_STATES[r.state];
        const isOpen = !!open[s.id];
        return (
          <div key={s.id} style={st.locCard}>
            <div style={st.locHead} className="locHead" onClick={() => setOpen((o) => ({ ...o, [s.id]: !o[s.id] }))}>
              <div style={{ ...st.locDot, background: m.color, borderRadius: "50%" }} />
              <div style={st.locTitle}>
                <div style={st.locName}>{s.name}</div>
                <div style={st.locCode}>{r.divCode !== "—" ? `Отд. ${r.divCode} · ${r.divName} · ` : ""}{r.owner}</div>
              </div>
              <div style={st.locRight}>
                <div style={st.locSum}>{ru(r.last)} <span style={st.locUnit}>{s.unit}</span></div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}><QuotaBadge a={r.achievement} /><Delta d={r.delta} /><Badge code={r.state} /></div>
              </div>
              <span style={{ ...st.locChevron, transform: isOpen ? "rotate(90deg)" : "none" }}><ChevronRight size={18} /></span>
            </div>
            {isOpen && (
              <div style={{ ...st.locBody, padding: "16px 18px" }}>
                {r.series.length ? (<>
                  <div style={{ color: C.text }}><StatChart values={r.series} quota={r.hasQuota ? r.quotaSeries : undefined} color={m.color} height={150} /></div>
                  {r.hasQuota && <ChartLegend color={m.color} />}
                </>) : <div style={{ fontSize: 12.5, color: C.faint, padding: "20px 0", textAlign: "center" }}>Значений ещё нет — внесите за неделю ниже</div>}
                {r.curQuota != null && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12, marginTop: 12 }}>
                    <span style={{ color: C.sub }}>План недели <b style={{ color: C.text }}>{ru(r.curQuota)} {s.unit}</b></span>
                    <span style={{ color: C.sub }}>· Факт <b style={{ color: C.text }}>{ru(r.curValue)} {s.unit}</b></span>
                    {r.achievement && (
                      <span style={{ fontWeight: 700, color: r.achievement.met ? C.green : C.warning }}>
                        · выполнение {r.achievement.pct.toFixed(0)}% {r.achievement.met ? "✓" : ""}
                      </span>
                    )}
                  </div>
                )}
                <ValueEntry C={C} st={st} isMobile={isMobile} stat={s} periodId={periodId}
                  curValue={r.curValue} curQuota={r.curQuota}
                  onSaved={async (msg) => { await reloadValues(); setDone(msg); }}
                  onError={setErr} />
                {isAdmin && (
                  <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                    <button style={{ ...st.btnGhost, padding: "7px 12px", fontSize: 12 }} className="btn" onClick={() => setEditing(s)}>
                      <Pencil size={13} /> Изменить
                    </button>
                  </div>
                )}
                {r.series.length > 0 && (
                  <div style={{ fontSize: 11.5, color: C.faint, marginTop: 10 }}>
                    Мин {ru(Math.min(...r.series))} · Макс {ru(Math.max(...r.series))} · состояние пересчитывается по тренду за 4 недели
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
    {modals}
  </>);
}


// ---------------------------------------------------------------- Ввод значения за неделю
function ValueEntry({ C, st, isMobile, stat, periodId, curValue, curQuota, onSaved, onError }) {
  const [val, setVal] = useState(curValue ?? "");
  const [quota, setQuota] = useState(curQuota ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setVal(curValue ?? ""); setQuota(curQuota ?? ""); }, [curValue, curQuota, periodId]);

  const save = async () => {
    if (busy) return;
    onError("");
    if (!periodId) return onError("Нет выбранной недели ФП — добавьте неделю в шапке");
    const v = val === "" ? null : Number(String(val).replace(",", "."));
    const q = quota === "" ? null : Number(String(quota).replace(",", "."));
    if (v == null && q == null) return onError("Укажите факт или квоту");
    if (v != null && Number.isNaN(v)) return onError("Факт — не число");
    if (q != null && Number.isNaN(q)) return onError("Квота — не число");
    setBusy(true);
    try {
      if (v != null) await upsertStatisticValue(stat.id, periodId, v, false);
      if (q != null) await upsertStatisticValue(stat.id, periodId, q, true);
      await onSaved(`«${stat.name}»: значение за неделю сохранено`);
    } catch (e) { onError(e?.message || String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", paddingTop: 14, marginTop: 4, borderTop: `1px solid ${C.line}` }}>
      <label style={{ ...st.reqField, flex: isMobile ? "1 1 100%" : 1 }}>
        <span style={st.reqFieldLbl}>Факт за неделю{stat.unit ? `, ${stat.unit}` : ""}</span>
        <input type="number" inputMode="decimal" value={val} placeholder="0"
          onChange={(e) => setVal(e.target.value)} onWheel={(e) => e.target.blur()}
          onKeyDown={(e) => e.key === "Enter" && save()} style={{ ...st.numInput, width: "100%" }} className="amtIn" />
      </label>
      <label style={{ ...st.reqField, flex: isMobile ? "1 1 100%" : 1 }}>
        <span style={st.reqFieldLbl}>Квота (план){stat.unit ? `, ${stat.unit}` : ""}</span>
        <input type="number" inputMode="decimal" value={quota} placeholder="—"
          onChange={(e) => setQuota(e.target.value)} onWheel={(e) => e.target.blur()}
          onKeyDown={(e) => e.key === "Enter" && save()} style={{ ...st.numInput, width: "100%" }} className="amtIn" />
      </label>
      <button style={{ ...st.btnGreen, opacity: busy ? 0.7 : 1 }} className="btn glass" onClick={save} disabled={busy}>
        {busy ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} Сохранить
      </button>
    </div>
  );
}


// ---------------------------------------------------------------- Новая / Редактировать статистика
function StatFormModal({ C, st, isMobile, positions, stat, busy, onArchive, onClose, onSaved }) {
  useScrollLock();
  const isEdit = !!stat;
  const [f, setF] = useState({
    name: stat?.name || "", unit: stat?.unit || "", invert: stat?.invert || false,
    positionId: stat?.position_id || "", source: stat?.source || "",
  });
  const [confirmArch, setConfirmArch] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (saving) return;
    setErr("");
    if (!f.name.trim()) return setErr("Укажите название статистики");
    setSaving(true);
    try {
      const payload = {
        name: f.name.trim(), unit: f.unit.trim() || null, invert: f.invert,
        position_id: f.positionId || null, source: f.source.trim() || null,
      };
      if (isEdit) { await updateStatistic(stat.id, payload); onSaved("Статистика обновлена"); }
      else { await createStatistic({ ...payload, positionId: f.positionId }); onSaved("Статистика создана"); }
    } catch (e) { setErr(e?.message || String(e)); setSaving(false); }
  };

  return (
    <div style={st.mdOverlay} onClick={onClose}>
      <div style={{ ...st.mdCard, width: "min(460px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>{isEdit ? "Редактировать статистику" : "Новая статистика"}</div>
          <button style={st.iconBtn} onClick={onClose}><X size={17} /></button>
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Название</span>
            <input style={st.mdInput} className="fin" placeholder="Собранный доход…" autoFocus
              value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} />
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ ...st.reqField, flex: isMobile ? "1 1 100%" : "0 0 130px" }}>
              <span style={st.reqFieldLbl}>Единица</span>
              <input style={st.mdInput} className="fin" placeholder="шт / TJS / %"
                value={f.unit} onChange={(e) => setF((p) => ({ ...p, unit: e.target.value }))} />
            </div>
            <div style={{ ...st.reqField, flex: 1, minWidth: 150 }}>
              <span style={st.reqFieldLbl}>Пост-владелец (отделение)</span>
              <select style={st.mdSelect} className="fin" value={f.positionId}
                onChange={(e) => setF((p) => ({ ...p, positionId: e.target.value }))}>
                <option value="">— не задан —</option>
                {positions.map((p) => <option key={p.id} value={p.id}>{p.division ? `${p.division.code} · ` : ""}{p.name}</option>)}
              </select>
            </div>
          </div>
          <div style={st.reqField}>
            <span style={st.reqFieldLbl}>Источник (необязательно)</span>
            <input style={st.mdInput} className="fin" placeholder="откуда берётся значение…"
              value={f.source} onChange={(e) => setF((p) => ({ ...p, source: e.target.value }))} />
          </div>
          <label style={st.mdCheck}>
            <input type="checkbox" checked={f.invert} onChange={(e) => setF((p) => ({ ...p, invert: e.target.checked }))} />
            Рост значения — это плохо (расходы, жалобы): тогда падение считается улучшением
          </label>
        </div>
        {err && <div style={st.reqError}><AlertCircle size={15} /> {err}</div>}
        <div style={{ ...st.mdActions, justifyContent: isEdit ? "space-between" : "flex-end" }}>
          {isEdit && (
            confirmArch ? (
              <button style={{ ...st.btnGhost, color: C.danger, borderColor: `${C.danger}55` }} className="btn"
                disabled={busy === `arch:${stat.id}`} onClick={() => onArchive(stat)}>
                {busy === `arch:${stat.id}` ? <Loader2 size={15} className="spin" /> : <Archive size={15} />} Точно?
              </button>
            ) : (
              <button style={{ ...st.btnGhost, color: C.danger }} className="btn" onClick={() => setConfirmArch(true)}>
                <Archive size={15} /> {!isMobile && "Архивировать"}
              </button>
            )
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button style={st.btnGhost} className="btn" onClick={onClose}>Отмена</button>
            <button style={{ ...st.btnGreen, opacity: saving ? 0.7 : 1 }} className="btn glass" onClick={submit} disabled={saving}>
              {saving ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} {isEdit ? "Сохранить" : "Создать"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
