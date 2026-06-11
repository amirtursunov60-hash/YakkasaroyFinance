import { useState, useMemo } from "react";
import { App } from "./components/AppShell";
import { Login } from "./components/Login";
import { useIsMobile } from "./hooks/useIsMobile";
import { makeStyles } from "./theme/styles";
import { THEMES, ThemeCtx } from "./theme/theme";


export default function YakkasaroyFinance() {
  const [authed, setAuthed] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [lang, setLang] = useState("ru");
  const isMobile = useIsMobile();
  const C = THEMES[theme];
  const st = useMemo(() => makeStyles(C), [C]);
  const ctxVal = { C, st, theme, setTheme, lang, setLang, isMobile };
  return (
    <ThemeCtx.Provider value={ctxVal}>
      {!authed
        ? <Login onEnter={() => setAuthed(true)} />
        : <App onLogout={() => setAuthed(false)} />}
    </ThemeCtx.Provider>
  );
}
