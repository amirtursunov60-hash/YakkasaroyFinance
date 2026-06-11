import { useState, useMemo, useEffect } from "react";
import { App } from "./components/AppShell";
import { Login } from "./components/Login";
import { useIsMobile } from "./hooks/useIsMobile";
import { makeStyles } from "./theme/styles";
import { THEMES, ThemeCtx } from "./theme/theme";
import { supabase } from "./lib/supabase";
import { getProfile, signOut } from "./lib/auth";


export default function YakkasaroyFinance() {
  const [theme, setTheme] = useState("dark");
  const [lang, setLang] = useState("ru");
  const [profile, setProfile] = useState(null);  // профиль вошедшего (с ролью) или null
  const [loading, setLoading] = useState(true);   // идёт первичная проверка сессии
  const isMobile = useIsMobile();
  const C = THEMES[theme];
  const st = useMemo(() => makeStyles(C), [C]);

  // следим за сессией: при входе/выходе обновляем профиль
  useEffect(() => {
    let active = true;

    const load = async () => {
      const p = await getProfile();
      if (active) { setProfile(p); setLoading(false); }
    };
    load();

    const { data: sub } = supabase.auth.onAuthStateChange(() => { load(); });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  const handleLogout = async () => {
    await signOut();
    setProfile(null);
  };

  const ctxVal = { C, st, theme, setTheme, lang, setLang, isMobile, profile };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, color: C.sub,
        display: "grid", placeItems: "center", fontFamily: "'Inter',system-ui,sans-serif", fontSize: 14 }}>
        Загрузка…
      </div>
    );
  }

  return (
    <ThemeCtx.Provider value={ctxVal}>
      {!profile
        ? <Login onEnter={() => { /* профиль подтянется через onAuthStateChange */ }} />
        : <App onLogout={handleLogout} />}
    </ThemeCtx.Provider>
  );
}
