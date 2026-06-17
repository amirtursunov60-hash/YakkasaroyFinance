import { useState } from "react";
import { ExternalLink, Copy, Check, AlertCircle } from "lucide-react";
import { useTheme } from "../../theme/theme";

// Публичное меню кофейни «Яккасарой Family» — отдельное приложение (свой деплой).
// Здесь платформа лишь даёт быстрый доступ: открыть, скопировать ссылку, превью.
const MENU_URL = "https://yakkasaroy-menu.vercel.app/";

export function MenuModule() {
  const { C, st, isMobile } = useTheme();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(MENU_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* буфер обмена недоступен — ссылка видна рядом */ }
  };

  return (<>
    <section style={st.hero}>
      <div style={st.heroGlow} />
      <div style={st.heroContent}>
        <div style={st.heroTop}>
          <div>
            <div style={st.heroLabel}>Публичное меню для гостей</div>
            <div style={st.heroTitle}>Меню кофейни «Яккасарой Family»</div>
          </div>
          <a href={MENU_URL} target="_blank" rel="noreferrer"
            style={{ ...st.btnGreen, textDecoration: "none" }} className="btn">
            <ExternalLink size={15} /> Открыть меню
          </a>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
          <span style={{ fontSize: 13, color: C.sub, wordBreak: "break-all" }}>{MENU_URL}</span>
          <button style={st.btnGhost} className="btn" onClick={copy}>
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Скопировано" : "Скопировать ссылку"}
          </button>
        </div>
      </div>
    </section>

    <div style={{ ...st.dataCard, display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: C.sub }}>
      <AlertCircle size={15} color={C.warning} />
      Превью ниже — живое меню. Если оно не открылось (сайт запрещает встраивание), нажмите «Открыть меню».
    </div>

    <div style={{ ...st.dataCard, padding: 0, overflow: "hidden", height: isMobile ? "68vh" : "74vh" }}>
      <iframe title="Меню кофейни «Яккасарой Family»" src={MENU_URL}
        style={{ width: "100%", height: "100%", border: "none", display: "block", background: "#fff" }} />
    </div>
  </>);
}
