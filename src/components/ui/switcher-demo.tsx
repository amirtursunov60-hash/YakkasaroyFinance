"use client";

import React, { useState } from "react";
import { ThemeSwitcher } from "./apple-liquid-glass-switcher";
import "./switcher.css";

type Theme = "light" | "dark" | "dim";

// ЭКСПЕРИМЕНТ: демо liquid-glass свитчера (ветка claude/experiment-tailwind-switcher).
// Открывается по адресу <app>/#switcher, рабочее приложение не затрагивает.
export default function SwitcherDemo() {
  const [theme, setTheme] = useState<Theme>("dark");

  return (
    <div className="theme-provider" data-theme={theme}>
      <ThemeSwitcher value={theme} onValueChange={setTheme} />
      <article className="article">
        <h1>Liquid glass</h1>
        <p>
          Демонстрация присланного компонента «Apple Liquid Glass» переключателя темы в нашей сборке
          (Tailwind v4 + TypeScript, экспериментальная ветка). Переключатель сверху меняет тему страницы —{" "}
          <a href="#switcher">светлая / тёмная / dim</a>. Это изолированная демо-страница; рабочее
          приложение Яккасарой не затронуто.
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
        <p>
          Lorem ipsum dolor sit amet consectetur adipisicing elit. Qui maxime optio quam debitis autem,
          maiores odio tenetur dicta aperiam aliquam, iusto nisi ipsum tempore dolore doloremque facere
          non culpa sint sequi ducimus corporis veritatis cumque corrupti sed.
        </p>
        <blockquote>
          Et aliquam libero deserunt maxime! Perspiciatis neque deserunt sequi deleniti!
        </blockquote>
        <h2>Doloremque nisi eius quis</h2>
        <p>
          Magnam quo voluptate vitae voluptatem expedita vel illum ut. Tempore, sed? Sunt distinctio
          minus dolore, consequuntur eos qui eveniet error rerum tempora, autem et quaerat, ea
          repellendus unde iure.
        </p>
        <figure>
          <img
            src="https://images.unsplash.com/photo-1734606901283-489b25f7aa9b?q=80&w=2360&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
            alt="Photo by Irene Demetri on Unsplash"
          />
          <figcaption>
            Photo by Irene Demetri on <a href="https://unsplash.com/photos/A2kyFEwh3zo">Unsplash</a>
          </figcaption>
        </figure>
        <p className="box">
          Perspiciatis sapiente eum velit inventore illum accusamus eos at esse mollitia debitis quae
          rem odit, ipsam nam. Voluptas beatae, velit voluptatum dolor obcaecati a nobis consequuntur
          quis id eaque!
        </p>
        <p>
          Made with love by <a href="//codepen.io/DedaloD">Den Dionigi | UX Designer</a>
        </p>
      </article>
    </div>
  );
}
