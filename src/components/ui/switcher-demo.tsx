"use client";

import React, { useEffect, useState } from "react";
import { ThemeSwitcher } from "./apple-liquid-glass-switcher";
import { THEMES, applyThemeVars } from "@/theme/theme";
import "./switcher.css";

type Theme = "light" | "dark" | "dim";

// Демо фундамента Tailwind+shadcn: liquid-glass свитчер + карточка на
// Tailwind-классах с НАШИМИ цветами (через мост палитры C → CSS-переменные).
// Открывается по адресу <app>/#switcher, рабочее приложение не затрагивает.
export default function SwitcherDemo() {
  const [theme, setTheme] = useState<Theme>("dark");

  // Выставляем --c-* из нашей палитры, чтобы Tailwind-классы (bg-panel и т.п.)
  // и сам свитчер взяли цвета активной темы (light / dark / dim).
  useEffect(() => {
    applyThemeVars(THEMES[theme]);
  }, [theme]);

  return (
    <div className="tw-scope theme-provider" data-theme={theme}>
      <ThemeSwitcher value={theme} onValueChange={setTheme} />

      {/* Карточка на Tailwind-утилитах + наши мостовые цвета */}
      <div className="w-full max-w-[680px] rounded-2xl border border-line bg-panel p-5 backdrop-blur-xl shadow-lg">
        <div className="text-sm text-sub">Tailwind + мост палитры</div>
        <div className="mt-1 text-2xl font-extrabold text-text">
          20 000,00 <span className="text-money">TJS</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
          <span className="rounded-full bg-brand/15 px-3 py-1 text-brand">Бренд</span>
          <span className="rounded-full bg-info/15 px-3 py-1 text-info">Инфо</span>
          <span className="rounded-full bg-warning/15 px-3 py-1 text-warning">Внимание</span>
          <span className="rounded-full bg-danger/15 px-3 py-1 text-danger">Опасность</span>
        </div>
        <div className="mt-3 text-sm text-faint">
          Цвета берутся из нашей палитры <code>C</code> и следуют переключению темы выше.
        </div>
      </div>

      <article className="article">
        <h1>Liquid glass + Tailwind foundation</h1>
        <p>
          Фундамент готов: Tailwind v4 + shadcn-готовность подключены, цвета связаны с нашей палитрой{" "}
          <code>C</code> (единый источник). Переключатель сверху меняет тему — карточка на
          Tailwind-классах перекрашивается вместе с ней. Рабочее приложение Яккасарой не затронуто
          (демо изолировано по адресу <a href="#switcher">#switcher</a>).
        </p>
        <figure>
          <img
            src="https://images.unsplash.com/photo-1706720094773-d91e070e4b90?q=80&w=2515&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
            alt="Photo by Neeqolah Creative Works on Unsplash"
          />
          <figcaption>
            Photo by Neeqolah Creative Works on{" "}
            <a href="https://unsplash.com/photos/A2kyFEwh3zo">Unsplash</a>
          </figcaption>
        </figure>
        <blockquote>
          Теперь можно брать любой Tailwind/shadcn-компонент и адаптировать под нашу тёмную тему.
        </blockquote>
        <p className="box">
          Команда установки готовых компонентов shadcn: <code>npx shadcn@latest add &lt;component&gt;</code> —
          компонент появится в <code>src/components/ui</code>, а цвета можно привязать к нашей палитре.
        </p>
        <p>
          Made with love by <a href="//codepen.io/DedaloD">Den Dionigi | UX Designer</a>
        </p>
      </article>
    </div>
  );
}
