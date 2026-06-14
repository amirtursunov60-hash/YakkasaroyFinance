// ============================================================================
//  Liquid Glass — переиспользуемые компоненты дизайн-языка (Apple HIG)
//  Принцип: «оболочка» приложения — стекло (GlassCard, KpiTile, GlassModal,
//  GlassButton), «данные» — плотная непрозрачная поверхность (DenseSurface).
//  Все цвета/радиусы/тени — из токенов темы (useTheme → C), хардкода нет.
//  Каждый модуль использует эти компоненты, а не свою вёрстку.
// ============================================================================
import { X } from "lucide-react";
import { useTheme } from "../../theme/theme";

// --- Стеклянная карточка-«оболочка» (раздел, блок) ---------------------------
export function GlassCard({ children, style, glow, pad = 0, radius = 22, className }) {
  const { C } = useTheme();
  return (
    <section className={className} style={{
      position: "relative", overflow: "hidden", borderRadius: radius,
      background: C.panel, border: `1px solid ${C.glassBorder}`,
      boxShadow: `inset 0 1px 0 ${C.glassHi}, 0 12px 34px ${C.shadow}`,
      backdropFilter: "blur(24px) saturate(180%)", WebkitBackdropFilter: "blur(24px) saturate(180%)",
      padding: pad, ...style,
    }}>
      {glow && <span style={{
        position: "absolute", left: "6%", bottom: "-75%", width: "62%", height: "210%",
        background: `radial-gradient(circle, ${C.glow} 0%, ${C.glow.replace(/[\d.]+\)$/, "0.10)")} 45%, transparent 66%)`,
        filter: "blur(16px)", pointerEvents: "none",
      }} />}
      <div style={{ position: "relative" }}>{children}</div>
    </section>
  );
}

// --- KPI-плитка: лёгкое стекло, акцентный glow проходит сквозь ----------------
export function KpiTile({ label, value, unit, accent, icon }) {
  const { C } = useTheme();
  return (
    <div style={{
      position: "relative", overflow: "hidden", borderRadius: 18, padding: "16px 18px",
      background: accent ? `linear-gradient(160deg, ${C.glow.replace(/[\d.]+\)$/, "0.14)")} 0%, ${C.panel2} 60%)` : C.panel2,
      border: `1px solid ${accent ? C.green + "55" : C.glassBorder}`,
      boxShadow: `inset 0 1px 0 ${C.glassHi}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: C.heroLabel, marginBottom: 9, letterSpacing: 0.2 }}>
        {icon}{label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span className="denseNum" style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.6, lineHeight: 1, color: accent ? C.green : C.text }}>{value}</span>
        {unit && <span style={{ fontSize: 13, fontWeight: 600, color: C.heroStat }}>{unit}</span>}
      </div>
    </div>
  );
}

// --- Плотная поверхность данных (НЕ стекло): таблицы, реестры -----------------
export function DenseSurface({ children, style }) {
  const { C } = useTheme();
  return (
    <div style={{
      background: C.solid, border: `1px solid ${C.line}`, borderRadius: 16, overflow: "hidden",
      boxShadow: `0 1px 2px ${C.shadow}`, ...style,
    }}>{children}</div>
  );
}

// --- Pill-кнопка HIG: тач-зона ≥44px, пружинное нажатие (.glass) --------------
export function GlassButton({ children, onClick, variant = "ghost", active, busy, disabled, title, full, type = "button", style }) {
  const { C } = useTheme();
  const base = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
    minHeight: 44, padding: "0 18px", borderRadius: 999, fontSize: 13.5, fontWeight: 700,
    fontFamily: "inherit", cursor: disabled ? "not-allowed" : "pointer", whiteSpace: "nowrap",
    border: "1px solid transparent", width: full ? "100%" : undefined, flexShrink: 0,
    opacity: disabled ? 0.45 : (busy ? 0.7 : 1),
  };
  const skins = {
    primary: { background: "linear-gradient(180deg, #5be88f 0%, #2fcf73 45%, #18b85f 100%)", color: "#fff",
      border: "1px solid rgba(255,255,255,0.35)", textShadow: "0 1px 2px rgba(0,80,30,0.35)",
      boxShadow: "inset 0 2px 3px rgba(255,255,255,0.5), 0 8px 22px rgba(40,200,110,0.5)" },
    ghost: { background: C.panel, color: C.text, border: `1px solid ${C.glassBorder}`,
      boxShadow: `inset 0 1px 0 ${C.glassHi}, 0 6px 18px ${C.shadow}`,
      backdropFilter: "blur(18px) saturate(160%)", WebkitBackdropFilter: "blur(18px) saturate(160%)" },
    danger: { background: `${C.danger}1a`, color: C.danger, border: `1px solid ${C.danger}44` },
    toggle: active
      ? { background: C.green, color: "#04130a", border: "1px solid transparent", boxShadow: `0 6px 18px ${C.glow}` }
      : { background: C.panel, color: C.text, border: `1px solid ${C.glassBorder}`,
          backdropFilter: "blur(18px) saturate(160%)", WebkitBackdropFilter: "blur(18px) saturate(160%)" },
  };
  return (
    <button type={type} className="btn glass" onClick={onClick} disabled={disabled || busy} title={title}
      style={{ ...base, ...skins[variant], ...style }}>
      {children}
    </button>
  );
}

// --- Плавающая стеклянная модалка над затемнённым фоном -----------------------
export function GlassModal({ title, subtitle, onClose, width = 560, children, footer }) {
  const { C } = useTheme();
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(4,8,14,0.5)", backdropFilter: "blur(3px)",
      WebkitBackdropFilter: "blur(3px)", zIndex: 70, display: "flex", alignItems: "center",
      justifyContent: "center", padding: 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: `min(${width}px, 100%)`, maxHeight: "92vh", overflowY: "auto", borderRadius: 24,
        background: C.glassStrong, border: `1px solid ${C.glassBorder}`,
        boxShadow: `inset 0 1px 0 ${C.glassHi}, 0 28px 70px rgba(0,0,0,0.5)`,
        backdropFilter: "blur(40px) saturate(180%)", WebkitBackdropFilter: "blur(40px) saturate(180%)",
        padding: "20px 22px 18px",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.3 }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12, color: C.sub, marginTop: 4 }}>{subtitle}</div>}
          </div>
          <button className="btn" onClick={onClose} title="Закрыть" style={{
            width: 36, height: 36, borderRadius: "50%", background: C.panel2, border: `1px solid ${C.glassBorder}`,
            color: C.sub, cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0,
          }}><X size={17} /></button>
        </div>
        {children}
        {footer && <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>{footer}</div>}
      </div>
    </div>
  );
}
