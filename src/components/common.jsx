import { Construction, AlertTriangle, X, Loader2 } from "lucide-react";
import { useTheme } from "../theme/theme";
import { useScrollLock } from "../hooks/useScrollLock";


export function Stub({ label }) {
  const { C, st } = useTheme();
  return <div style={st.stub}><Construction size={40} color={C.faint} /><div style={st.stubTitle}>{label}</div><div style={st.stubText}>Раздел в разработке — добавим на следующем шаге.</div></div>;
}

export function FolderIcon({ color = "#e8911c" }) { return <svg width="16" height="16" viewBox="0 0 24 24" fill={color} style={{ flexShrink: 0 }}><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>; }

// tone: "danger" | "warning" | "success" — для сводных значений со знаком/здоровьем
// (дефицит, расхождение, нетто). accent — устаревший «зелёный акцент», = tone:"success".
// Отрицательное значение (строка с ведущим «-»/«−») всегда красное — кроме явного
// tone "warning". Так минус везде читается как красный без правки каждого вызова.
export function Stat({ label, value, unit, accent, tone }) {
  const { C, st } = useTheme();
  const negative = typeof value === "string" && /^\s*[-−]/.test(value);
  const color = tone === "danger" ? C.danger
    : tone === "warning" ? C.warning
    : negative ? C.danger
    : tone === "info" ? C.info
    : (tone === "success" || accent) ? C.green
    : C.text;
  return <div><div style={st.statLabel}>{label}</div><div style={{ ...st.statValue, color }}>{value} <span style={st.statUnit}>{unit}</span></div></div>;
}

// Тематический модал подтверждения — замена системного window.confirm.
// tone: "danger" (красная кнопка, для необратимых действий) | "warning" | "default" (зелёная).
// Оверлей и «Отмена» вызывают onCancel; основное действие — onConfirm. busy блокирует кнопки.
export function ConfirmModal({ title, message, error, confirmLabel = "Подтвердить", cancelLabel = "Отмена", tone = "default", busy = false, onConfirm, onCancel }) {
  const { C, st, isMobile } = useTheme();
  useScrollLock();
  const accent = tone === "danger" ? C.danger : tone === "warning" ? C.warning : C.green;
  const baseBtn = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
    padding: "11px 18px", borderRadius: 14, fontSize: 13.5, fontWeight: 700, cursor: "pointer",
    fontFamily: "inherit", whiteSpace: "nowrap", border: "1px solid rgba(255,255,255,0.25)",
    ...(isMobile ? { flex: 1 } : {}) };
  const confirmBtn = tone === "default"
    ? { ...st.btnGreen, ...(isMobile ? { flex: 1, justifyContent: "center" } : {}) }
    : { ...baseBtn, background: accent, color: "#fff" };

  return (
    <div style={st.mdOverlay} data-modal="1" onClick={() => !busy && onCancel?.()}>
      <div style={{ ...st.mdCard, width: "min(440px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div style={st.mdHead}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center",
              background: `${accent}22`, color: accent, flexShrink: 0 }}>
              <AlertTriangle size={18} />
            </div>
            <div style={st.mdTitle}>{title}</div>
          </div>
          <button style={st.iconBtn} className="btn" onClick={() => !busy && onCancel?.()} aria-label="Закрыть"><X size={17} /></button>
        </div>
        {message && <div style={{ fontSize: 13.5, lineHeight: 1.5, color: C.sub }}>{message}</div>}
        {error && (
          <div role="alert" style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 12,
            padding: "10px 12px", borderRadius: 12, fontSize: 13, lineHeight: 1.45,
            color: C.danger, background: `${C.danger}14`, border: `1px solid ${C.danger}44` }}>
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
          </div>
        )}
        <div style={{ ...st.mdActions, ...(isMobile ? { flexDirection: "row" } : {}) }}>
          <button style={{ ...st.btnGhost, ...(isMobile ? { flex: 1, justifyContent: "center" } : {}) }}
            className="btn" onClick={() => onCancel?.()} disabled={busy}>{cancelLabel}</button>
          <button style={{ ...confirmBtn, opacity: busy ? 0.7 : 1 }} className="btn"
            onClick={() => onConfirm?.()} disabled={busy}>
            {busy ? <Loader2 size={15} className="spin" /> : <AlertTriangle size={15} />} {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
