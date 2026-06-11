import { useState, useMemo } from "react";
import { ArrowUpRight, ArrowDownRight, ChevronRight, Plus } from "lucide-react";
import { INCOME_TREE } from "../../data/finance";
import { useTheme } from "../../theme/theme";
import { fmt } from "../../utils/format";


// ---------------------------------------------------------------- INCOME
export function Income() {
  const { C, st, isMobile } = useTheme();
  const [open, setOpen] = useState({ 14: true });

  const totals = useMemo(() => {
    let prev = 0, cur = 0;
    INCOME_TREE.forEach((f) => { prev += f.prev; cur += f.cur; });
    return { prev, cur };
  }, []);

  const delta = (cur, prev) => {
    if (!prev && !cur) return null;
    if (!prev) return { pct: 100, up: true };
    const d = ((cur - prev) / prev) * 100;
    return { pct: Math.abs(d), up: d >= 0 };
  };

  const Trend = ({ cur, prev, big }) => {
    const d = delta(cur, prev);
    if (!d) return <span style={{ ...st.trend, color: C.faint }}>—</span>;
    const col = d.up ? C.green : C.danger;
    return (
      <span style={{ ...st.trend, color: col, fontSize: big ? 13 : 12 }}>
        {d.up ? <ArrowUpRight size={big ? 15 : 13} /> : <ArrowDownRight size={big ? 15 : 13} />}
        {d.pct.toFixed(0)}%
      </span>
    );
  };

  return (<>
    {/* Сводка периода */}
    <section style={st.incHero}>
      <div style={st.incHeroGlow} />
      <div style={st.incHeroInner}>
        <div>
          <div style={st.incHeroLabel}>Выручка за период · 04–10 июн 2026</div>
          <div style={st.incHeroValue}>{fmt(totals.cur)} <span style={st.incHeroUnit}>TJS</span></div>
          <div style={st.incHeroSub}>
            <Trend cur={totals.cur} prev={totals.prev} big /> к прошлому периоду · было {fmt(totals.prev)}
          </div>
        </div>
        <button style={st.btnGreen} className="btn"><Plus size={15} /> Добавить доход</button>
      </div>
    </section>

    {/* Карточки локаций */}
    <div style={st.incList}>
      {INCOME_TREE.map((loc) => {
        const isOpen = !!open[loc.id];
        const hasChildren = (loc.children || []).length > 0;
        return (
          <div key={loc.id} style={st.locCard}>
            <div style={st.locHead} className="locHead" onClick={() => hasChildren && setOpen((o) => ({ ...o, [loc.id]: !o[loc.id] }))}>
              <div style={{ ...st.locDot, background: loc.color }} />
              <div style={st.locTitle}>
                <div style={st.locName}>{loc.name}</div>
                <div style={st.locCode}>{loc.code}{hasChildren ? ` · ${loc.children.length} статей` : ""}</div>
              </div>
              <div style={st.locRight}>
                <div style={st.locSum}>{fmt(loc.cur)} <span style={st.locUnit}>TJS</span></div>
                <Trend cur={loc.cur} prev={loc.prev} />
              </div>
              {hasChildren && <span style={{ ...st.locChevron, transform: isOpen ? "rotate(90deg)" : "none" }}><ChevronRight size={18} /></span>}
            </div>

            {isOpen && hasChildren && (
              <div style={st.locBody}>
                <div style={st.itemHeadRow}>
                  <span />
                  <div style={st.itemHeadCell}>Было</div>
                  <div style={st.itemHeadCell}>Стало</div>
                </div>
                {loc.children.map((c) => (
                  <div key={c.id} style={st.itemRow} className="itemRow">
                    <div style={st.itemName}>
                      <span style={st.itemCode}>{c.code}</span>
                      <span>{c.name}</span>
                    </div>
                    <div style={st.itemPrev}>{fmt(c.prev)}</div>
                    <div style={{ ...st.itemCur, color: c.cur ? C.green : C.faint }}>{fmt(c.cur)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  </>);
}
