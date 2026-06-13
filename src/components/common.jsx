import { Construction } from "lucide-react";
import { useTheme } from "../theme/theme";


export function Stub({ label }) {
  const { C, st } = useTheme();
  return <div style={st.stub}><Construction size={40} color={C.faint} /><div style={st.stubTitle}>{label}</div><div style={st.stubText}>Раздел в разработке — добавим на следующем шаге.</div></div>;
}

export function FolderIcon({ color = "#e8911c" }) { return <svg width="16" height="16" viewBox="0 0 24 24" fill={color} style={{ flexShrink: 0 }}><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>; }

export function Stat({ label, value, unit, accent }) {
  const { C, st } = useTheme(); return <div><div style={st.statLabel}>{label}</div><div style={{ ...st.statValue, color: accent ? C.green : C.text }}>{value} <span style={st.statUnit}>{unit}</span></div></div>; }
