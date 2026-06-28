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
import { THEMES, ThemeCtx, applyThemeVars } from "@/theme/theme";
import { makeStyles } from "@/theme/styles";
import { makeCss } from "@/theme/css";

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
      el.textContent = makeCss(C);
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
