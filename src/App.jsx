import { useState, useMemo, useEffect } from "react";
import { App } from "./components/AppShell";
import { Login } from "./components/Login";
import { useIsMobile } from "./hooks/useIsMobile";
import { makeStyles } from "./theme/styles";
import { THEMES, ThemeCtx, applyThemeVars } from "./theme/theme";
import { supabase, isSupabaseConfigured } from "./lib/supabase";
import { getProfile, signOut } from "./lib/auth";
import { redeemInvite } from "./lib/api";
import { isSoundOn, setSoundOn } from "./lib/feedback";
import { enablePeekZoom } from "./lib/peekZoom";
import { enableEscClose } from "./lib/escClose";
import { enableModalBackClose } from "./lib/modalBackClose";
import { ErrorBoundary } from "./components/ErrorBoundary";
import SwitcherDemo from "@/components/ui/switcher-demo";

// Демо фундамента Tailwind/shadcn по адресу <app>/#switcher — изолировано,
// рабочее приложение не затрагивает.
const isSwitcherDemo = typeof window !== "undefined" && window.location.hash.replace("#", "") === "switcher";

// Токен приглашения из ссылки (?invite=…) сохраняем до завершения регистрации
const url = new URL(window.location.href);
const inviteParam = url.searchParams.get("invite");
if (inviteParam) {
  localStorage.setItem("yk_invite", inviteParam);
  url.searchParams.delete("invite");
  window.history.replaceState({}, "", url);
}


export default function YakkasaroyFinance() {
  if (isSwitcherDemo) return <SwitcherDemo />;
  return <YakkasaroyApp />;
}

function YakkasaroyApp() {
  // Тема и язык запоминаются между заходами (localStorage): пользователь выбрал
  // светлую/тёмную — при следующем входе откроется выбранный режим.
  const [theme, setThemeState] = useState(() => {
    const saved = localStorage.getItem("yk_theme");
    return saved && THEMES[saved] ? saved : "dark";
  });
  const setTheme = (v) => { setThemeState(v); try { localStorage.setItem("yk_theme", v); } catch { /* приватный режим */ } };
  const [lang, setLangState] = useState(() => localStorage.getItem("yk_lang") || "ru");
  const setLang = (v) => { setLangState(v); try { localStorage.setItem("yk_lang", v); } catch { /* приватный режим */ } };
  const [sound, setSoundState] = useState(isSoundOn());   // звук/вибрация отдачи (по умолчанию выкл)
  const setSound = (v) => { setSoundState(v); setSoundOn(v); };
  const [profile, setProfile] = useState(null);  // профиль вошедшего (с ролью) или null
  const [hasUser, setHasUser] = useState(false);  // есть сессия, но возможно нет профиля
  const [loading, setLoading] = useState(true);   // идёт первичная проверка сессии
  const isMobile = useIsMobile();
  const C = THEMES[theme];
  const st = useMemo(() => makeStyles(C), [C]);
  // Мост палитры → CSS-переменные (--c-*) для Tailwind/shadcn (один источник цвета).
  useEffect(() => { applyThemeVars(C); }, [C]);
  // «Зум-лупа»: пинч-зум разрешён, но возвращается к размеру экрана после жеста.
  useEffect(() => enablePeekZoom(), []);
  // Esc закрывает верхний открытый модал.
  useEffect(() => enableEscClose(), []);
  // Кнопка «Назад» (телефон) закрывает верхний модал, а не уводит со страницы.
  useEffect(() => enableModalBackClose(), []);

  // следим за сессией: при входе/выходе обновляем профиль
  useEffect(() => {
    let active = true;

    const load = async () => {
      // Без ключей Supabase не дёргаем auth (клиент-заглушка) — сразу показываем
      // экран настройки.
      if (!isSupabaseConfigured) { if (active) setLoading(false); return; }
      // Приглашение: после первого входа применяем роль/точку/пост из инвайта
      const token = localStorage.getItem("yk_invite");
      if (token) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          try {
            await redeemInvite(token, localStorage.getItem("yk_invite_name"));
          } catch (e) {
            console.warn("Приглашение не применено:", e?.message || e);
          }
          localStorage.removeItem("yk_invite");
          localStorage.removeItem("yk_invite_name");
        }
      }
      const { data: { user } } = await supabase.auth.getUser();
      const p = await getProfile();
      if (active) { setHasUser(!!user); setProfile(p); setLoading(false); }
    };
    load();

    const { data: sub } = supabase.auth.onAuthStateChange(() => { load(); });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  const handleLogout = async () => {
    await signOut();
    setProfile(null);
  };

  const ctxVal = { C, st, theme, setTheme, lang, setLang, sound, setSound, isMobile, profile };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, color: C.sub,
        display: "grid", placeItems: "center", fontFamily: "'Inter',system-ui,sans-serif", fontSize: 14 }}>
        Загрузка…
      </div>
    );
  }

  // Ключи Supabase не заданы — вместо белого экрана показываем, что настроить.
  if (!isSupabaseConfigured) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, color: C.text,
        display: "grid", placeItems: "center", fontFamily: "'Inter',system-ui,sans-serif", padding: 20 }}>
        <div style={{ maxWidth: 460, width: "100%", textAlign: "center", background: C.panel,
          border: `1px solid ${C.line}`, borderRadius: 20, padding: "28px 24px" }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Приложение не настроено</div>
          <div style={{ fontSize: 13.5, color: C.sub, lineHeight: 1.6, marginBottom: 16 }}>
            Не заданы переменные окружения для подключения к базе. Добавьте их и
            перезапустите сборку:
          </div>
          <pre style={{ textAlign: "left", background: C.bg, color: C.text,
            border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px 14px",
            fontSize: 12.5, overflowX: "auto", margin: 0 }}>
{`VITE_SUPABASE_URL=…
VITE_SUPABASE_KEY=…`}
          </pre>
          <div style={{ fontSize: 12.5, color: C.sub, lineHeight: 1.6, marginTop: 14 }}>
            Локально — в файл <code>.env</code>; на Vercel — в настройках проекта
            (Environment Variables).
          </div>
        </div>
      </div>
    );
  }

  // Вошёл, но профиля нет (регистрация без приглашения) — понятный экран
  if (!profile && hasUser) {
    return (
      <ThemeCtx.Provider value={ctxVal}>
        <div style={{ minHeight: "100vh", background: C.bg, color: C.text,
          display: "grid", placeItems: "center", fontFamily: "'Inter',system-ui,sans-serif", padding: 20 }}>
          <div style={{ maxWidth: 420, textAlign: "center", background: C.panel,
            border: `1px solid ${C.line}`, borderRadius: 20, padding: "28px 24px" }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Профиль не найден</div>
            <div style={{ fontSize: 13.5, color: C.sub, lineHeight: 1.6, marginBottom: 18 }}>
              Вы вошли в аккаунт, но он не привязан к компании «Яккасарой».
              Попросите владельца или директора прислать ссылку-приглашение
              (Сотрудники → Приглашения) и откройте её.
            </div>
            <button onClick={handleLogout} style={{ background: C.green, color: C.onAccent,
              border: "none", padding: "12px 22px", borderRadius: 12, fontSize: 14,
              fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              Выйти
            </button>
          </div>
        </div>
      </ThemeCtx.Provider>
    );
  }

  return (
    <ThemeCtx.Provider value={ctxVal}>
      <ErrorBoundary>
        {!profile
          ? <Login onEnter={() => { /* профиль подтянется через onAuthStateChange */ }} />
          : <App onLogout={handleLogout} />}
      </ErrorBoundary>
    </ThemeCtx.Provider>
  );
}
