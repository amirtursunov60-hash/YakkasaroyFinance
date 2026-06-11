import { useState } from "react";
import { ChevronRight, UtensilsCrossed } from "lucide-react";
import { MENU_CATS } from "../../data/restaurant";
import { useTheme } from "../../theme/theme";
import { fmt } from "../../utils/format";


export function RestMenu() {
  const { C, st } = useTheme();
  const [openCat, setOpenCat] = useState(() => { const o = {}; MENU_CATS.forEach((c, i) => (o[c.id] = i === 0)); return o; });
  return (<>
    <div style={st.rSectionHead}><UtensilsCrossed size={18} color={C.green} /><h3 style={st.reqSectionTitle}>Меню</h3><span style={st.reqSectionSub}>{MENU_CATS.reduce((a, c) => a + c.items.length, 0)} позиций</span></div>
    <div style={st.incList}>
      {MENU_CATS.map((cat) => { const isOpen = !!openCat[cat.id]; return (
        <div key={cat.id} style={st.locCard}>
          <div style={st.locHead} className="locHead" onClick={() => setOpenCat((o) => ({ ...o, [cat.id]: !o[cat.id] }))}>
            <div style={{ ...st.locDot, background: C.green }} />
            <div style={st.locTitle}><div style={st.locName}>{cat.name}</div><div style={st.locCode}>{cat.items.length} блюд</div></div>
            <span style={{ ...st.locChevron, transform: isOpen ? "rotate(90deg)" : "none" }}><ChevronRight size={18} /></span>
          </div>
          {isOpen && (
            <div style={st.locBody}>
              {cat.items.map((it) => { const margin = Math.round(((it.price - it.cost) / it.price) * 100); return (
                <div key={it.id} style={st.menuRow}>
                  <div style={st.menuPhoto}>{it.photo ? <img src={it.photo} alt="" style={st.menuImg} /> : <UtensilsCrossed size={18} color={C.faint} />}</div>
                  <div style={st.menuInfo}><div style={st.menuName}>{it.name}</div><div style={st.menuCost}>Себестоимость {fmt(it.cost)} · маржа {margin}%</div></div>
                  <div style={st.menuPrice}>{fmt(it.price)} <span style={st.locUnit}>TJS</span></div>
                </div>); })}
            </div>
          )}
        </div>); })}
    </div>
  </>);
}
