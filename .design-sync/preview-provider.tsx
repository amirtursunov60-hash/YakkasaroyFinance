// Обёртка превью для design-sync.
//
// Компоненты Yakkasaroy получают всё оформление через контекст `useTheme()`
// (`{ C, st, theme, ... }`) — инлайн-стили `st.*` берут цвета прямо из объекта
// `C`, поэтому достаточно дать корректное значение `ThemeCtx.Provider`.
// Дополнительно ставим CSS-переменные `--c-*` (для Tailwind-мостика) и фон
// страницы, чтобы полупрозрачные «стеклянные» поверхности читались правильно.
//
// Форма значения повторяет `ctxVal` из `src/App.jsx`. При изменении формы там —
// обновить здесь (см. .design-sync/NOTES.md → Re-sync risks).
import React from "react";
// ВАЖНО: импортируем тему через подпуть пакета (тот же, что и компоненты:
// `node_modules/yakkasaroy-management/src/theme/*`), а НЕ через `@/...`.
// Алиас `@/` esbuild резолвит в реальный путь репозитория, а компоненты идут
// через симлинк node_modules/<pkg> — это РАЗНЫЕ модули для esbuild, отчего
// theme.js (и `ThemeCtx`) дублируется и контекст провайдера не доходит до
// компонентов (`st` = null → падение). Один и тот же подпуть = один модуль.
import { THEMES, ThemeCtx, applyThemeVars } from "yakkasaroy-management/src/theme/theme";
import { makeStyles } from "yakkasaroy-management/src/theme/styles";
import { makeCss } from "yakkasaroy-management/src/theme/css";

// `useTheme` лежит в theme.js (.js), а синтез-вход берёт только .tsx/.jsx —
// поэтому хук НЕ попадает на window.YakkasaroyDS, и превью, которым нужен `C`/`st`
// (компоненты, принимающие их пропсами: CswRow, ItemCard, DecideModal,
// RequestStatusChips), падали на `useTheme is not a function`. Реэкспортируем
// через тот же подпуть пакета — хук появляется на глобале, тот же модуль/контекст.
export { useTheme } from "yakkasaroy-management/src/theme/theme";

export function DSPreviewProvider({ children }: { children?: React.ReactNode }) {
  const C = THEMES.dark;
  const st = React.useMemo(() => makeStyles(C), [C]);
  React.useLayoutEffect(() => {
    applyThemeVars(C);
    // Глобальный CSS приложения (классы `.gseg`, `.switcher`, hover/фокус,
    // анимации) генерируется JS-строкой `makeCss` и в реальном приложении
    // вставляется <style>-тегом. Конвертер его не включает — инжектим здесь,
    // иначе компоненты на классах (GlassSegment, ThemeSwitcher) без стилей.
    const id = "ds-preview-global-css";
    if (typeof document !== "undefined" && !document.getElementById(id)) {
      const el = document.createElement("style");
      el.id = id;
      // Убираем удалённые @import (Google Fonts Inter) — в песочнице рендера
      // запрос к fonts.googleapis.com висит и ломает networkidle (таймауты,
      // медленный захват). Превью используют системный стек шрифтов (задан на
      // обёртке ниже), Inter как фоллбэк не критичен.
      el.textContent = makeCss(C).replace(/@import\s+url\([^)]*\)\s*;?/g, "");
      document.head.appendChild(el);
    }
  }, [C]);

  const ctxVal = {
    C,
    st,
    theme: "dark",
    setTheme: () => {},
    lang: "ru",
    setLang: () => {},
    sound: false,
    setSound: () => {},
    isMobile: false,
    profile: { id: "preview", full_name: "Демо Пользователь", role: "owner" },
  };

  return (
    <ThemeCtx.Provider value={ctxVal as any}>
      <div
        style={{
          background: C.pageGrad,
          color: C.text,
          padding: 24,
          minHeight: "100%",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Inter', system-ui, sans-serif",
          letterSpacing: "-0.01em",
        }}
      >
        {children}
      </div>
    </ThemeCtx.Provider>
  );
}
