import React from "react";


// ============================================================================
//  ЯККАСАРОЙ · Единое приложение · модуль «Финансовое планирование»
//  Один каркас, контент переключается по сайдбару. Стиль Alif. Данные в памяти.
// ============================================================================

export const THEMES = {
  dark: {
    bg: "#0e1011", panel: "#16191a", panel2: "#202425", line: "#23282a",
    green: "#1fd65f", greenSoft: "#19b35c", text: "#f2f5f4", sub: "#8b9296", faint: "#5b6164",
    inputBg: "#0e1011", rowChild: "rgba(255,255,255,0.012)", rowHover: "#0f1714",
    navHover: "#121915", heroGrad: "linear-gradient(135deg,#0a2e26 0%,#0c3a2c 30%,#0e2820 60%,#0e1011 100%)",
    heroLabel: "#bfe8d2", heroStat: "#9fc7b3", barBg: "#1a2620", danger: "#ff6b5e",
    blueLink: "#9fc4ff", menuHover: "#1a1f20", shadow: "rgba(0,0,0,0.5)",
  },
  light: {
    bg: "#f4f6f5", panel: "#ffffff", panel2: "#eef2f0", line: "#e2e8e5",
    green: "#16b35c", greenSoft: "#16b35c", text: "#0e1a14", sub: "#5e6b64", faint: "#9aa6a0",
    inputBg: "#f4f6f5", rowChild: "rgba(0,0,0,0.015)", rowHover: "#f0f5f2",
    navHover: "#eef2f0", heroGrad: "linear-gradient(135deg,#d6f5e4 0%,#c3ecd9 35%,#e8f5ef 70%,#ffffff 100%)",
    heroLabel: "#2c7a52", heroStat: "#3d8a62", barBg: "#dfeae4", danger: "#e0463b",
    blueLink: "#2563c9", menuHover: "#eef2f0", shadow: "rgba(0,0,0,0.15)",
  },
};


export const ThemeCtx = React.createContext({ C: THEMES.dark, st: null, theme: "dark", setTheme: () => {}, lang: "ru", setLang: () => {}, isMobile: false });

export const useTheme = () => React.useContext(ThemeCtx);
