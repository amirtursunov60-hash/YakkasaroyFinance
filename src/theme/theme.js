import React from "react";

// ============================================================================
//  ЯККАСАРОЙ · Единое приложение · Дизайн Apple HIG + Liquid Glass
//  Палитра построена на стеклянных поверхностях: полупрозрачные панели,
//  градиентный фон страницы (pageGrad), светлые грани (glassBorder/glassHi),
//  плотный фон для оверлеев (solid). Семантические статусы сохранены.
// ============================================================================

export const THEMES = {
  dark: {
    scheme: "dark",
    // Фон страницы — насыщенный градиент, чтобы стекло «играло»
    pageGrad: "linear-gradient(160deg, #0b1f3a 0%, #0e2a44 22%, #102a2e 50%, #0d1f33 78%, #0a1526 100%)",
    bg: "transparent",
    // Стеклянные поверхности
    panel: "rgba(28, 34, 44, 0.55)", panel2: "rgba(255,255,255,0.06)", line: "rgba(255,255,255,0.10)",
    glassBorder: "rgba(255,255,255,0.14)", glassHi: "rgba(255,255,255,0.22)",
    green: "#3ddc84", greenSoft: "#2bb673", text: "#f5f8fa", sub: "#a8b2bd", faint: "#6b7682",
    // money — отдельный зелёный для денежных сумм (приход/рост), чтобы брендовый
    // green не означал «всё сразу»: бренд/кнопки/активная вкладка ≠ деньги.
    money: "#2fbf6f",
    inputBg: "rgba(255,255,255,0.07)", rowChild: "rgba(255,255,255,0.02)", rowHover: "rgba(255,255,255,0.05)",
    navHover: "rgba(255,255,255,0.06)", heroGrad: "linear-gradient(135deg, rgba(61,220,132,0.16) 0%, rgba(40,140,200,0.12) 50%, rgba(255,255,255,0.03) 100%)",
    heroLabel: "#c8e6d6", heroStat: "#a8c4d4", barBg: "rgba(255,255,255,0.10)", danger: "#ff6b5e",
    blueLink: "#7fb4ff", menuHover: "rgba(255,255,255,0.07)", shadow: "rgba(0,0,0,0.45)",
    solid: "#141a24", solid2: "#1b2330",
    // Моноширинный шрифт для денежных сумм (плотные поверхности данных)
    mono: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace',
    // Семантические цвета статусов (единые для всех модулей)
    info: "#5b8def", warning: "#e8911c", success: "#2f9e44", successSoft: "#7bd88f",
    // Доп. акценты для типов операций Реестра (адаптивны к теме)
    gold: "#d6c14a", violet: "#9c6ade", teal: "#5bd6c9",
    // Палитра категориальных графиков (доходы/расходы) — из неё же пресеты фондов
    chartPalette: ["#3ddc84", "#5b8def", "#e8911c", "#ff6b5e", "#9c6ade", "#5bd6c9", "#d6c14a", "#7bd88f", "#d64ad6"],
  },
  light: {
    scheme: "light",
    pageGrad: "linear-gradient(160deg, #d4e4fb 0%, #cfe0f3 18%, #d2efe0 46%, #e0ecfa 74%, #e6f0fb 100%)",
    bg: "transparent",
    // Контраст усилен (дизайн-ревью): графитовые подписи вместо светло-серых,
    // заметнее бордеры и зебра — плотные данные читаются без «мыла».
    panel: "rgba(255, 255, 255, 0.55)", panel2: "rgba(255,255,255,0.45)", line: "rgba(15,40,70,0.16)",
    glassBorder: "rgba(255,255,255,0.85)", glassHi: "rgba(255,255,255,0.95)",
    green: "#0aa552", greenSoft: "#0aa552", text: "#0b1722", sub: "#45525e", faint: "#717c87",
    money: "#0a8f48", // деньги (приход/рост) — чуть глубже брендового зелёного
    inputBg: "rgba(255,255,255,0.65)", rowChild: "rgba(15,40,70,0.035)", rowHover: "rgba(255,255,255,0.6)",
    navHover: "rgba(255,255,255,0.5)", heroGrad: "linear-gradient(135deg, rgba(10,165,82,0.18) 0%, rgba(40,120,210,0.14) 50%, rgba(255,255,255,0.35) 100%)",
    heroLabel: "#1a6e46", heroStat: "#2a6f7d", barBg: "rgba(15,40,70,0.12)", danger: "#dc3b30",
    blueLink: "#1565e0", menuHover: "rgba(255,255,255,0.55)", shadow: "rgba(31,55,90,0.16)",
    solid: "#ffffff", solid2: "#eef3f9",
    // Моноширинный шрифт для денежных сумм (плотные поверхности данных)
    mono: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace',
    // Семантические цвета статусов — затемнены под светлый фон для контраста
    info: "#2f6fdb", warning: "#c47d10", success: "#2f9e44", successSoft: "#3d9e5f",
    // Доп. акценты для типов операций Реестра — затемнены под светлый фон (контраст)
    gold: "#a8881a", violet: "#7a4fc0", teal: "#0f9b8e",
    // Палитра категориальных графиков — затемнена под светлый фон (контраст)
    chartPalette: ["#0aa552", "#2f6fdb", "#c47d10", "#dc3b30", "#7a4fc0", "#0f9b8e", "#a8881a", "#3d9e5f", "#b13bb1"],
  },
  // «Dim» — мягкий тёмный режим (сине-серые поверхности вместо почти чёрного),
  // как третий вариант темы. Акценты/статусы те же, что в dark.
  dim: {
    scheme: "dark",
    pageGrad: "linear-gradient(160deg, #1b2836 0%, #1d2c3c 26%, #1b2b31 52%, #182530 80%, #16212d 100%)",
    bg: "transparent",
    panel: "rgba(42, 54, 68, 0.60)", panel2: "rgba(255,255,255,0.05)", line: "rgba(255,255,255,0.11)",
    glassBorder: "rgba(255,255,255,0.15)", glassHi: "rgba(255,255,255,0.20)",
    green: "#3ddc84", greenSoft: "#2bb673", text: "#e9eef3", sub: "#aab6c2", faint: "#74808d",
    money: "#2fbf6f",
    inputBg: "rgba(255,255,255,0.06)", rowChild: "rgba(255,255,255,0.02)", rowHover: "rgba(255,255,255,0.05)",
    navHover: "rgba(255,255,255,0.06)", heroGrad: "linear-gradient(135deg, rgba(61,220,132,0.15) 0%, rgba(40,140,200,0.12) 50%, rgba(255,255,255,0.04) 100%)",
    heroLabel: "#c8e6d6", heroStat: "#a8c4d4", barBg: "rgba(255,255,255,0.11)", danger: "#ff6b5e",
    blueLink: "#7fb4ff", menuHover: "rgba(255,255,255,0.07)", shadow: "rgba(0,0,0,0.40)",
    solid: "#1c2733", solid2: "#23303e",
    mono: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace',
    info: "#5b8def", warning: "#e8911c", success: "#2f9e44", successSoft: "#7bd88f",
    gold: "#d6c14a", violet: "#9c6ade", teal: "#5bd6c9",
    chartPalette: ["#3ddc84", "#5b8def", "#e8911c", "#ff6b5e", "#9c6ade", "#5bd6c9", "#d6c14a", "#7bd88f", "#d64ad6"],
  },
};

// Мост палитры → CSS-переменные (--c-*) для Tailwind/shadcn. Вызывается при
// смене темы: и инлайн-`st` (берёт C напрямую), и классы Tailwind (через
// @theme в index.css) получают один и тот же цвет. Имена синхронны с @theme.
const TW_VAR_KEYS = ["bg", "panel", "panel2", "line", "text", "sub", "faint", "green", "money", "danger", "info", "warning", "success"];
export function applyThemeVars(C) {
  if (typeof document === "undefined" || !C) return;
  const r = document.documentElement.style;
  for (const k of TW_VAR_KEYS) r.setProperty(`--c-${k}`, C[k]);
}

export const ThemeCtx = React.createContext({ C: THEMES.dark, st: null, theme: "dark", setTheme: () => {}, lang: "ru", setLang: () => {}, isMobile: false });

export const useTheme = () => React.useContext(ThemeCtx);
