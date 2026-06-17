import { ExternalLink } from "lucide-react";
import { useTheme } from "../../theme/theme";

// Публичное меню кофейни «Яккасарой Family» — отдельное приложение (свой деплой).
// В разделе Ресторан → «Меню» показываем его целиком (встроенным).
const MENU_URL = "https://yakkasaroy-menu.vercel.app/";

export function MenuModule() {
  const { C, st } = useTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "calc(100dvh - 160px)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Меню кофейни «Яккасарой Family»</div>
        <a href={MENU_URL} target="_blank" rel="noreferrer"
          style={{ ...st.btnGhost, textDecoration: "none", marginLeft: "auto" }} className="btn">
          <ExternalLink size={14} /> Открыть в новой вкладке
        </a>
      </div>
      <iframe title="Меню кофейни «Яккасарой Family»" src={MENU_URL}
        style={{ flex: 1, width: "100%", minHeight: 0, border: `1px solid ${C.line}`, borderRadius: 16, background: "#fff", display: "block" }} />
    </div>
  );
}
