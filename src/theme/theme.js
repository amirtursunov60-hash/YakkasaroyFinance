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
    // Фон страницы — плоский сплошной, цвет как в оригинале liquid-glass (--c-bg dark)
    pageGrad: "#1b1b1d",
    bg: "transparent",
    // Стеклянные поверхности
    panel: "rgba(28, 34, 44, 0.55)", panel2: "rgba(255,255,255,0.06)", line: "rgba(255,255,255,0.10)",
    glassBorder: "rgba(255,255,255,0.14)", glassHi: "rgba(255,255,255,0.22)",
    // «green» — фирменный бренд-акцент Яккасарой (зелёный)
    // faint поднят до WCAG AA (~4.7:1 на pageGrad): используется и для плейсхолдеров (input::placeholder)
    green: "#3ddc84", greenSoft: "#2bb673", onAccent: "#04130a", text: "#f5f8fa", sub: "#a8b2bd", faint: "#7e8794",
    // money — отдельный зелёный для денежных сумм (приход/рост), чтобы брендовый
    // green не означал «всё сразу»: бренд/кнопки/активная вкладка ≠ деньги.
    money: "#2fbf6f",
    inputBg: "rgba(255,255,255,0.07)", rowChild: "rgba(255,255,255,0.02)", rowHover: "rgba(255,255,255,0.05)",
    navHover: "rgba(255,255,255,0.06)", heroGrad: "rgba(28, 34, 44, 0.55)",
    heroLabel: "#c8e6d6", heroStat: "#a8c4d4", barBg: "rgba(255,255,255,0.10)", danger: "#ff6b5e",
    blueLink: "#7fb4ff", menuHover: "rgba(255,255,255,0.07)", shadow: "rgba(0,0,0,0.45)",
    solid: "#141a24", solid2: "#1b2330",
    // Параметры «жидкого стекла» свитчера для этой темы (трек/пилюля вкладок берут их же)
    glass: { c: "#bbbbbc", light: "#fff", dark: "#000", rl: 0.3, rd: 2, sat: "150%" },
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
    pageGrad: "#e8e8e9", // фон как в оригинале liquid-glass (--c-bg light)
    bg: "transparent",
    // Контраст усилен (дизайн-ревью): графитовые подписи вместо светло-серых,
    // заметнее бордеры и зебра — плотные данные читаются без «мыла».
    panel: "rgba(255, 255, 255, 0.55)", panel2: "rgba(255,255,255,0.45)", line: "rgba(15,40,70,0.16)",
    glassBorder: "rgba(255,255,255,0.85)", glassHi: "rgba(255,255,255,0.95)",
    // бренд-акцент Яккасарой (зелёный)
    green: "#0aa552", greenSoft: "#0aa552", onAccent: "#04130a", text: "#0b1722", sub: "#45525e", faint: "#5c6670",
    money: "#0a8f48", // деньги (приход/рост) — чуть глубже брендового зелёного
    inputBg: "rgba(255,255,255,0.65)", rowChild: "rgba(15,40,70,0.035)", rowHover: "rgba(255,255,255,0.6)",
    navHover: "rgba(255,255,255,0.5)", heroGrad: "rgba(255, 255, 255, 0.55)",
    heroLabel: "#1a6e46", heroStat: "#2a6f7d", barBg: "rgba(15,40,70,0.12)", danger: "#dc3b30",
    blueLink: "#1565e0", menuHover: "rgba(255,255,255,0.55)", shadow: "rgba(31,55,90,0.16)",
    solid: "#ffffff", solid2: "#eef3f9",
    glass: { c: "#bbbbbc", light: "#fff", dark: "#000", rl: 1, rd: 1, sat: "150%" },
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
    pageGrad: "#152433", // фон как в оригинале liquid-glass (--c-bg dim)
    bg: "transparent",
    panel: "rgba(42, 54, 68, 0.60)", panel2: "rgba(255,255,255,0.05)", line: "rgba(255,255,255,0.11)",
    glassBorder: "rgba(255,255,255,0.15)", glassHi: "rgba(255,255,255,0.20)",
    // бренд-акцент Яккасарой (зелёный)
    green: "#3ddc84", greenSoft: "#2bb673", onAccent: "#04130a", text: "#e9eef3", sub: "#aab6c2", faint: "#818b98",
    money: "#2fbf6f",
    inputBg: "rgba(255,255,255,0.06)", rowChild: "rgba(255,255,255,0.02)", rowHover: "rgba(255,255,255,0.05)",
    navHover: "rgba(255,255,255,0.06)", heroGrad: "rgba(42, 54, 68, 0.60)",
    heroLabel: "#c8e6d6", heroStat: "#a8c4d4", barBg: "rgba(255,255,255,0.11)", danger: "#ff6b5e",
    blueLink: "#7fb4ff", menuHover: "rgba(255,255,255,0.07)", shadow: "rgba(0,0,0,0.40)",
    solid: "#1c2733", solid2: "#23303e",
    glass: { c: "hsl(222 65% 70% / 1)", light: "#99deff", dark: "#001022", rl: 0.7, rd: 2, sat: "200%" },
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
