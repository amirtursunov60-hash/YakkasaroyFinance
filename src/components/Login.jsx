import { useState, useMemo } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { makeCss } from "../theme/css";
import { useTheme } from "../theme/theme";
import { signIn, registerByInvite } from "../lib/auth";


// ============================================================================
export function Login({ onEnter, initialError = "" }) {
  const { C, st } = useTheme();
  const lg = useMemo(() => makeLg(C), [C]);
  const css = useMemo(() => makeCss(C), [C]);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [name, setName] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(initialError);
  const [info, setInfo] = useState("");
  // Приглашение по ссылке: токен сохраняет App.jsx до завершения регистрации
  const [inviteMode, setInviteMode] = useState(() => !!localStorage.getItem("yk_invite"));

  const submit = async () => {
    if (busy) return;
    setErr(""); setInfo("");
    if (!email.trim() || !pass) { setErr("Введите email и пароль"); return; }
    if (inviteMode && !name.trim()) { setErr("Укажите фамилию и имя"); return; }
    setBusy(true);
    try {
      if (inviteMode) {
        // Регистрация по приглашению без письма-подтверждения: серверная функция
        // создаёт аккаунт уже подтверждённым и применяет приглашение (проверив
        // одноразовый токен). Затем сразу входим по паролю.
        const inviteTok = localStorage.getItem("yk_invite");
        const res = await registerByInvite({
          token: inviteTok, email: email.trim(), password: pass, fullName: name.trim(),
        });
        if (!res.ok) { setErr(res.error || "Не удалось зарегистрироваться"); setBusy(false); return; }
        await signIn(email.trim(), pass);
        localStorage.removeItem("yk_invite");
        localStorage.removeItem("yk_invite_name");
        onEnter(); // приглашение уже применено функцией — просто входим
        return;
      }
      await signIn(email.trim(), pass);
      onEnter();
    } catch (e) {
      const msg = e?.message || "";
      if (msg.includes("Invalid login credentials")) setErr("Неверный email или пароль");
      else if (msg.includes("Email not confirmed")) setErr("Email не подтверждён");
      else if (msg.includes("already registered")) setErr("Этот email уже зарегистрирован — войдите со своим паролем");
      else setErr((inviteMode ? "Не удалось зарегистрироваться: " : "Не удалось войти: ") + msg);
      setBusy(false);
    }
  };

  return (
    <div style={lg.screen}>
      <style>{css}</style>
      <div style={lg.glow} />
      <header style={lg.top}>
        <div style={st.brand}>
          <img src="/icons/icon-192.png" alt="Яккасарой" style={{ width: 36, height: 36, borderRadius: 12 }} />
          <div style={st.brandTxt}>Яккасарой<span style={st.brandThin}> финанс</span></div>
        </div>
      </header>
      <div style={lg.center}>
        <div style={lg.card}>
          <div style={lg.title}>{inviteMode ? "Регистрация по приглашению" : "Вход в кабинет"}</div>
          <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
            {inviteMode && (
              <div style={lg.field}>
                <label style={lg.label}>Фамилия и имя</label>
                <input style={lg.input} value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Иванов Иван" autoFocus autoComplete="name" name="name" />
              </div>
            )}
            <div style={lg.field}>
              <label style={lg.label}>Email</label>
              <input style={lg.input} value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="example@mail.ru" type="email" autoComplete="email" name="email" autoFocus={!inviteMode} />
            </div>
            <div style={lg.field}>
              <label style={lg.label}>Пароль</label>
              <div style={lg.passWrap}>
                <input style={{ ...lg.input, border: "none", padding: 0 }} value={pass}
                  onChange={(e) => setPass(e.target.value)} placeholder="••••••••"
                  autoComplete={inviteMode ? "new-password" : "current-password"} name="password"
                  type={show ? "text" : "password"} />
                <span style={lg.eye} onClick={() => setShow(!show)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</span>
              </div>
            </div>
            {err && <div role="alert" style={lg.error}>{err}</div>}
            {info && <div style={{ ...lg.error, color: C.green, background: `${C.green}1a`, borderColor: `${C.green}44` }}>{info}</div>}
            <button type="submit" style={{ ...lg.btn, opacity: busy ? 0.7 : 1 }} className="btn" disabled={busy}>
              {busy ? <span className="spin"><Loader2 size={17} /></span> : inviteMode ? "Зарегистрироваться" : "Войти"}
            </button>
          </form>
          {inviteMode && (
            <div style={{ ...lg.note, cursor: "pointer", textDecoration: "underline" }} onClick={() => setInviteMode(false)}>
              У меня уже есть аккаунт — войти
            </div>
          )}
          {!inviteMode && !!localStorage.getItem("yk_invite") && (
            <div style={{ ...lg.note, cursor: "pointer", textDecoration: "underline" }} onClick={() => setInviteMode(true)}>
              Зарегистрироваться по приглашению
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


export const makeLg = (C) => ({
  screen: { minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Inter',system-ui,sans-serif", position: "relative", overflow: "hidden" },
  glow: { display: "none" },
  top: { position: "relative", height: 72, display: "flex", alignItems: "center", padding: "0 28px", borderBottom: `1px solid ${C.line}`, background: "rgba(14,16,17,0.6)" },
  center: { position: "relative", display: "flex", justifyContent: "center", alignItems: "center", minHeight: "calc(100vh - 72px)", padding: 20 },
  card: { width: "100%", maxWidth: 400, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 20, padding: "30px 26px", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" },
  title: { fontSize: 22, fontWeight: 800, textAlign: "center", marginBottom: 24 },
  field: { background: C.inputBg, border: `1px solid ${C.line}`, borderRadius: 12, padding: "10px 14px", marginBottom: 14 },
  label: { display: "block", fontSize: 11, color: C.sub, marginBottom: 4 },
  input: { width: "100%", background: "transparent", border: "none", outline: "none", color: C.text, fontSize: 15, fontFamily: "inherit" },
  passWrap: { display: "flex", alignItems: "center", gap: 10 },
  eye: { color: C.sub, cursor: "pointer", display: "flex", flexShrink: 0 },
  btn: { width: "100%", background: C.green, color: C.onAccent, border: "none", padding: "14px", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginTop: 6, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 50 },
  error: { fontSize: 13, color: C.danger, background: `${C.danger}1a`, border: `1px solid ${C.danger}44`, borderRadius: 12, padding: "10px 12px", marginBottom: 12, textAlign: "center" },
  note: { fontSize: 11, color: C.faint, textAlign: "center", marginTop: 16, lineHeight: 1.5 },
});
