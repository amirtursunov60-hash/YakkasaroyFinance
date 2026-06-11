import { Armchair } from "lucide-react";
import { TABLES } from "../../data/restaurant";
import { useTheme } from "../../theme/theme";
import { fmt } from "../../utils/format";


export function RestTables() {
  const { C, st } = useTheme();
  const META = {
    free: { label: "Свободен", color: C.green },
    busy: { label: "Занят", color: "#e8911c" },
    reserved: { label: "Бронь", color: "#5b8def" },
  };
  const zones = [...new Set(TABLES.map((t) => t.zone))];
  return (<>
    <div style={st.rSectionHead}><Armchair size={18} color={C.green} /><h3 style={st.reqSectionTitle}>План зала</h3><span style={st.reqSectionSub}>{TABLES.filter((t) => t.status === "busy").length} занято · {TABLES.filter((t) => t.status === "free").length} свободно</span></div>
    {zones.map((z) => (
      <div key={z} style={{ marginBottom: 22 }}>
        <div style={st.zoneTitle}>{z}</div>
        <div style={st.tableGrid}>
          {TABLES.filter((t) => t.zone === z).map((t) => { const m = META[t.status]; return (
            <div key={t.id} style={{ ...st.tableCard, borderColor: `${m.color}55` }}>
              <div style={st.tableTop}><span style={st.tableName}>{t.name}</span><span style={{ ...st.tableDot, background: m.color }} /></div>
              <div style={st.tableSeats}>{t.seats} мест</div>
              <div style={{ ...st.tableStatus, color: m.color }}>{m.label}</div>
              {t.status === "busy" && <div style={st.tableInfo}>{t.guests} гостей · {fmt(t.sum)} TJS · {t.time}</div>}
              {t.status === "reserved" && <div style={st.tableInfo}>Бронь на {t.time}</div>}
            </div>); })}
        </div>
      </div>
    ))}
  </>);
}
