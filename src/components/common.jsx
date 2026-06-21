import { Construction, X, Loader2 } from "lucide-react";
import { useTheme } from "../theme/theme";


export function Stub({ label }) {
  const { C, st } = useTheme();
  return <div style={st.stub}><Construction size={40} color={C.faint} /><div style={st.stubTitle}>{label}</div><div style={st.stubText}>Раздел в разработке — добавим на следующем шаге.</div></div>;
}

export function FolderIcon({ color = "#e8911c" }) { return <svg width="16" height="16" viewBox="0 0 24 24" fill={color} style={{ flexShrink: 0 }}><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>; }

// tone: "danger" | "warning" | "success" — для сводных значений со знаком/здоровьем
// (дефицит, расхождение, нетто). accent — устаревший «зелёный акцент», = tone:"success".
export function Stat({ label, value, unit, accent, tone }) {
  const { C, st } = useTheme();
  const color = tone === "danger" ? C.danger
    : tone === "warning" ? C.warning
    : (tone === "success" || accent) ? C.green
    : C.text;
  return <div><div style={st.statLabel}>{label}</div><div style={{ ...st.statValue, color }}>{value} <span style={st.statUnit}>{unit}</span></div></div>;
}

// Тематический модал подтверждения вместо системного window.confirm.
// danger — для необратимых/денежных операций (красная кнопка действия).
export function ConfirmModal({ C, st, title, message, confirmLabel = "Подтвердить", cancelLabel = "Отмена", danger, busy, onConfirm, onClose }) {
  const confirmStyle = danger
    ? { ...st.btnGhost, color: C.danger, borderColor: `${C.danger}66`, fontWeight: 700 }
    : st.btnGreen;
  return (
    <div style={st.mdOverlay} onClick={() => !busy && onClose()}>
      <div style={{ ...st.mdCard, width: "min(440px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={st.mdTitle}>{title}</div>
          <button style={st.iconBtn} className="btn" onClick={onClose} disabled={busy}><X size={17} /></button>
        </div>
        <div style={{ fontSize: 13.5, color: C.sub, lineHeight: 1.6 }}>{message}</div>
        <div style={st.mdActions}>
          <button style={st.btnGhost} className="btn" onClick={onClose} disabled={busy}>{cancelLabel}</button>
          <button style={{ ...confirmStyle, opacity: busy ? 0.7 : 1 }} className="btn" onClick={onConfirm} disabled={busy}>
            {busy ? <Loader2 size={15} className="spin" /> : null}{confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
