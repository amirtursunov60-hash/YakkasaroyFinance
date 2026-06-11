import { useState, useMemo } from "react";
import { Layers, Eye, EyeOff } from "lucide-react";
import { makeCss } from "../theme/css";
import { useTheme } from "../theme/theme";



// ============================================================================
export function Login({ onEnter }) {
  const { C, st, theme, setTheme } = useTheme();
  const lg = useMemo(() => makeLg(C), [C]);
  const css = useMemo(() => makeCss(C), [C]);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [show, setShow] = useState(false);
  const submit = () => { onEnter(); }; // прототип: реальной проверки нет
  return (
    <div style={lg.screen}>
      <style>{css}</style>
      <div style={lg.glow} />
      <header style={lg.top}>
        <div style={st.brand}>
          <div style={st.logo}><Layers size={18} strokeWidth={2.4} /></div>
          <div style={st.brandTxt}>Яккасарой<span style={st.brandThin}> финанс</span></div>
        </div>
      </header>
      <div style={lg.center}>
        <div style={lg.card}>
          <div style={lg.title}>Вход в кабинет</div>
          <div style={lg.field}>
            <label style={lg.label}>Email</label>
            <input style={lg.input} value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="example@mail.ru" type="email" autoFocus />
          </div>
          <div style={lg.field}>
            <label style={lg.label}>Пароль</label>
            <div style={lg.passWrap}>
              <input style={{ ...lg.input, border: "none", padding: 0 }} value={pass}
                onChange={(e) => setPass(e.target.value)} placeholder="••••••••"
                type={show ? "text" : "password"} onKeyDown={(e) => e.key === "Enter" && submit()} />
              <span style={lg.eye} onClick={() => setShow(!show)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</span>
            </div>
          </div>
          <button style={lg.btn} className="btn" onClick={submit}>Войти</button>
          <div style={lg.note}>Демо-вход: данные не проверяются — это прототип без сервера.</div>
        </div>
      </div>
    </div>
  );
}


export const makeLg = (C) => ({
  screen: { minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Inter',system-ui,sans-serif", position: "relative", overflow: "hidden" },
  glow: { position: "absolute", inset: 0, background: "radial-gradient(120% 80% at 50% 120%, rgba(31,214,95,0.35) 0%, rgba(20,120,180,0.18) 35%, rgba(14,16,17,0) 70%)", pointerEvents: "none" },
  top: { position: "relative", height: 72, display: "flex", alignItems: "center", padding: "0 28px", borderBottom: `1px solid ${C.line}`, background: "rgba(14,16,17,0.6)" },
  center: { position: "relative", display: "flex", justifyContent: "center", alignItems: "center", minHeight: "calc(100vh - 72px)", padding: 20 },
  card: { width: "100%", maxWidth: 400, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 22, padding: "30px 26px", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" },
  title: { fontSize: 22, fontWeight: 800, textAlign: "center", marginBottom: 24 },
  field: { background: C.bg, border: `1px solid ${C.line}`, borderRadius: 12, padding: "10px 14px", marginBottom: 14 },
  label: { display: "block", fontSize: 11, color: C.sub, marginBottom: 4 },
  input: { width: "100%", background: "transparent", border: "none", outline: "none", color: C.text, fontSize: 15, fontFamily: "inherit" },
  passWrap: { display: "flex", alignItems: "center", gap: 10 },
  eye: { color: C.sub, cursor: "pointer", display: "flex", flexShrink: 0 },
  btn: { width: "100%", background: C.green, color: "#04130a", border: "none", padding: "14px", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginTop: 6 },
  note: { fontSize: 11, color: C.faint, textAlign: "center", marginTop: 16, lineHeight: 1.5 },
});
