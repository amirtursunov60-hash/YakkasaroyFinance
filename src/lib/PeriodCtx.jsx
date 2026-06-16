import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { CalendarDays, MapPin, ChevronDown, Check, Plus, Trash2, Loader2, AlertCircle } from "lucide-react";
import { useTheme } from "../theme/theme";
import { isoDate, weekBounds, getPeriodFor, fetchPeriods, createPeriod, periodHasData, deletePeriod, fetchLocations } from "./api";

// ============================================================================
//  Общий выбор недели ФП для всего приложения. Выбранный период живёт в
//  контексте: пользователь переключает неделю в шапке, и каждый раздел
//  (Директива, Доходы, …) показывает данные этой недели.
// ============================================================================

const MON = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const d2 = (n) => String(n).padStart(2, "0");
const STATUS_LABEL = { open: "открыт", planning: "на планировании", closed: "закрыт" };

// «11 июн – 17 июн 2026»
export const periodTitle = (p) => {
  const s = new Date(p.starts_on + "T00:00:00"), e = new Date(p.ends_on + "T00:00:00");
  return `${s.getDate()} ${MON[s.getMonth()]} – ${e.getDate()} ${MON[e.getMonth()]} ${e.getFullYear()}`;
};

// Компакт для телефона: «11–17.06», через границу месяца — «28.05–03.06»
export const periodTitleShort = (p) => {
  const s = new Date(p.starts_on + "T00:00:00"), e = new Date(p.ends_on + "T00:00:00");
  return s.getMonth() === e.getMonth()
    ? `${d2(s.getDate())}–${d2(e.getDate())}.${d2(e.getMonth() + 1)}`
    : `${d2(s.getDate())}.${d2(s.getMonth() + 1)}–${d2(e.getDate())}.${d2(e.getMonth() + 1)}`;
};

const PeriodCtx = createContext(null);
export const usePeriod = () => useContext(PeriodCtx);

export function PeriodProvider({ children }) {
  const [periods, setPeriods] = useState([]);
  const [periodId, setPeriodId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  // Переключатель «вся сеть / точка» (ТЗ v2 §5): null — вся сеть
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState(null);

  // Перечитать список периодов. keepPeriod=false — выбрать текущую неделю.
  const reload = useCallback(async (keepPeriod = true) => {
    setErr("");
    const ps = await fetchPeriods();
    setPeriods(ps);
    const curIso = isoDate(weekBounds(new Date()).start);
    const cur = ps.find((p) => p.starts_on === curIso);
    setPeriodId((id) =>
      keepPeriod && id && ps.some((p) => p.id === id) ? id : (cur?.id || ps[0]?.id || null));
    return ps;
  }, []);

  useEffect(() => {
    Promise.all([
      reload(false),
      fetchLocations().then(setLocations),
    ])
      .catch((e) => setErr("Не удалось загрузить периоды: " + (e?.message || e)))
      .finally(() => setLoading(false));
  }, [reload]);

  const period = periods.find((p) => p.id === periodId) || null;
  // Период перед выбранным (для сравнения «было/стало»)
  const prevPeriod = useMemo(() => {
    if (!period) return null;
    return periods
      .filter((p) => p.starts_on < period.starts_on)
      .sort((a, b) => b.starts_on.localeCompare(a.starts_on))[0] || null;
  }, [periods, period]);

  const location = locations.find((l) => l.id === locationId) || null;
  const value = useMemo(
    () => ({ periods, periodId, setPeriodId, period, prevPeriod, loading, err, reload,
      locations, locationId, setLocationId, location }),
    [periods, periodId, period, prevPeriod, loading, err, reload, locations, locationId, location],
  );
  return <PeriodCtx.Provider value={value}>{children}</PeriodCtx.Provider>;
}

// ---------------------------------------------------------------- Селектор в шапке
export function WeekPicker() {
  const { C, st, isMobile } = useTheme();
  const ctx = usePeriod();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState("");
  if (!ctx) return null;
  const { periods, periodId, setPeriodId, period, reload } = ctx;

  const addDaysIso = (iso, n) => {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + n);
    return isoDate(d);
  };
  const currentExists = periods.some((p) => p.starts_on === isoDate(weekBounds(new Date()).start));

  // «+»: если текущей недели нет — создаёт её, иначе добавляет неделю после последней
  const addWeek = async () => {
    if (busy) return;
    setBusy("create"); setErr("");
    try {
      let p;
      if (!currentExists) {
        p = await getPeriodFor(new Date(), { create: true });
      } else {
        const last = [...periods].sort((a, b) => a.starts_on.localeCompare(b.starts_on)).at(-1);
        p = await createPeriod(addDaysIso(last.ends_on, 1), addDaysIso(last.ends_on, 7));
      }
      if (!p) throw new Error("Нет прав на создание периода");
      await reload(true);
      setPeriodId(p.id);
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(null); }
  };

  // Удаление недели: закрытую нельзя, с операциями нельзя
  const doDelete = async (p, e) => {
    e.stopPropagation();
    if (busy) return;
    if (p.status === "closed") { setErr("Закрытую неделю нельзя удалить — сначала откройте её"); return; }
    if (!window.confirm(`Удалить неделю ${periodTitle(p)}? Удалить можно только неделю без операций.`)) return;
    setBusy(`del:${p.id}`); setErr("");
    try {
      if (await periodHasData(p.id))
        throw new Error("В этой неделе уже есть операции (доходы, Реестр, заявки или протокол) — такую неделю удалить нельзя");
      await deletePeriod(p.id);
      if (p.id === periodId) setPeriodId(null);
      await reload(p.id !== periodId);
    } catch (e2) {
      setErr(e2?.code === "23503"
        ? "Неделя связана с операциями — удалить нельзя"
        : (e2?.message || String(e2)));
    } finally { setBusy(null); }
  };

  const label = period
    ? (isMobile ? periodTitleShort(period) : periodTitle(period))
    : (isMobile ? "—" : "Период не создан");

  return (
    <div style={st.topWeekWrap}>
      <button style={{ ...st.topWeekBtn, ...(isMobile ? { padding: "6px 8px", gap: 5, fontSize: 12 } : {}) }} className="btn" onClick={() => { setOpen((v) => !v); setErr(""); }}>
        <CalendarDays size={14} color={C.green} />
        <span>{label}</span>
        <ChevronDown size={14} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
      </button>
      {open && (<>
        <div style={st.weekOverlay} onClick={() => setOpen(false)} />
        <div style={{ ...st.weekMenu, top: 44 }}>
          <div style={{ ...st.weekMenuHead, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>Периоды ФП</span>
            <button style={{ ...st.iconBtn, color: C.green }} className="btn" title="Добавить неделю"
              onClick={addWeek} disabled={!!busy}>
              {busy === "create" ? <Loader2 size={15} className="spin" /> : <Plus size={15} />}
            </button>
          </div>
          {err && (
            <div style={{ display: "flex", gap: 6, alignItems: "flex-start", color: C.danger, fontSize: 12, padding: "4px 10px 8px" }}>
              <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} /> {err}
            </div>
          )}
          {periods.map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <button style={{ ...st.weekOption, flex: 1, ...(p.id === periodId ? st.weekOptionOn : {}) }} className="weekOpt"
                onClick={() => { setPeriodId(p.id); setOpen(false); }}>
                <span>{periodTitle(p)}</span>
                {p.status === "closed"
                  ? <span style={{ ...st.weekTag, color: C.danger, background: `${C.danger}1a` }}>закрыт</span>
                  : <span style={st.weekTag}>{STATUS_LABEL[p.status]}</span>}
                {p.id === periodId && <Check size={15} color={C.green} />}
              </button>
              {p.status !== "closed" && (
                <button style={{ ...st.iconBtn, color: C.danger, flexShrink: 0 }} className="btn" title="Удалить неделю"
                  onClick={(e) => doDelete(p, e)} disabled={!!busy}>
                  {busy === `del:${p.id}` ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
                </button>
              )}
            </div>
          ))}
          {!periods.length && <div style={st.empty}>Периодов пока нет</div>}
        </div>
      </>)}
    </div>
  );
}


// ---------------------------------------------------------------- Точка в шапке
// «Вся сеть / точка» — фильтр для всех разделов (ТЗ v2 §5)
export function LocationPicker() {
  const { C, st, isMobile } = useTheme();
  const ctx = usePeriod();
  const [open, setOpen] = useState(false);
  // На телефоне показываем компактно (только иконка) — точка нужна и на
  // мобильном (например, для подачи заявки, которая привязывается к точке).
  if (!ctx) return null;
  const { locations, locationId, setLocationId, location } = ctx;
  if (!locations.length) return null;

  const label = location ? (isMobile ? location.name.slice(0, 10) : location.name) : "Вся сеть";

  return (
    <div style={st.topWeekWrap}>
      <button style={st.topWeekBtn} className="btn" onClick={() => setOpen((v) => !v)}>
        <MapPin size={15} color={location ? C.warning : C.green} />
        {!isMobile && <span>{label}</span>}
        <ChevronDown size={14} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
      </button>
      {open && (<>
        <div style={st.weekOverlay} onClick={() => setOpen(false)} />
        <div style={{ ...st.weekMenu, top: 44, width: 230 }}>
          <div style={st.weekMenuHead}>Точка</div>
          <button style={{ ...st.weekOption, ...(locationId === null ? st.weekOptionOn : {}) }} className="weekOpt"
            onClick={() => { setLocationId(null); setOpen(false); }}>
            <span>Вся сеть</span>
            {locationId === null && <Check size={15} color={C.green} />}
          </button>
          {locations.map((l) => (
            <button key={l.id} style={{ ...st.weekOption, ...(l.id === locationId ? st.weekOptionOn : {}) }} className="weekOpt"
              onClick={() => { setLocationId(l.id); setOpen(false); }}>
              <span>{l.name}{l.city ? ` · ${l.city}` : ""}</span>
              {l.id === locationId && <Check size={15} color={C.green} />}
            </button>
          ))}
        </div>
      </>)}
    </div>
  );
}
