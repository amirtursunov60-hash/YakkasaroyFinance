import { useState } from "react";
import { ExternalLink, Copy, Check } from "lucide-react";
import { useTheme } from "../../theme/theme";

// Публичное меню кофейни «Яккасарой Family» — отдельное приложение (свой деплой).
// Платформа даёт быстрый доступ: открыть, скопировать ссылку, QR для гостей.
const MENU_URL = "https://yakkasaroy-menu.vercel.app/";
// QR генерируется внешним сервисом (данные — публичный URL меню).
const QR_SRC = `https://api.qrserver.com/v1/create-qr-code/?size=480x480&margin=10&data=${encodeURIComponent(MENU_URL)}`;

export function MenuModule() {
  const { C, st } = useTheme();
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
      </div>
    </section>

    {/* QR для гостей: навести камеру — откроется меню */}
    <div style={{ ...st.dataCard, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "26px 18px" }}>
      <div style={{ background: "#fff", padding: 12, borderRadius: 16, lineHeight: 0, boxShadow: `0 8px 24px ${C.shadow}` }}>
        <img src={QR_SRC} alt="QR-код меню" width={220} height={220} style={{ display: "block", width: 220, height: 220 }} />
      </div>
      <div style={{ fontSize: 13.5, color: C.sub, textAlign: "center", maxWidth: 320 }}>
        Наведите камеру телефона на QR-код, чтобы открыть меню. Код можно распечатать и поставить на столы.
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        <a href={MENU_URL} target="_blank" rel="noreferrer" style={{ ...st.btnGreen, textDecoration: "none" }} className="btn">
          <ExternalLink size={15} /> Открыть меню
        </a>
        <button style={st.btnGhost} className="btn" onClick={copy}>
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Скопировано" : "Скопировать ссылку"}
        </button>
      </div>
      <div style={{ fontSize: 12, color: C.faint, wordBreak: "break-all", textAlign: "center" }}>{MENU_URL}</div>
    </div>
  </>);
}
