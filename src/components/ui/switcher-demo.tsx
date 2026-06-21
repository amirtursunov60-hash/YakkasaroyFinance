"use client";

import React, { useState } from "react";
import { ThemeSwitcher } from "./apple-liquid-glass-switcher";
import "./switcher-original.css";

type Theme = "light" | "dark" | "dim";

// Точная копия оригинального демо (CodePen DenDionigi/JodwNzX): фиксированный
// свитчер поверх прокручиваемой статьи с картинками — только так видно
// преломление «жидкого стекла» (backdrop-filter работает по фону под ним).
// Изолировано по адресу <app>/#switcher, рабочее приложение не затрагивает.
export default function SwitcherDemo() {
  const [theme, setTheme] = useState<Theme>("light");

  return (
    <div className="switcher-demo-root" data-theme={theme}>
      <ThemeSwitcher value={theme} onValueChange={setTheme} />
      <article className="article">
        <h1>Liquid glass</h1>
        <p>
          Lorem ipsum dolor sit amet consectetur adipisicing elit. Qui maxime optio quam debitis
          autem, maiores odio tenetur dicta aperiam aliquam, iusto nisi ipsum tempore dolore
          doloremque facere non culpa sint sequi ducimus corporis veritatis cumque corrupti sed.
          Ipsa dolor quod alias dicta dolores. Ducimus pariatur nostrum quo, impedit{" "}
          <a href="#">facilis voluptatibus</a>! Non doloremque, facere neque dolorem animi earum odio
          placeat quae voluptatem nisi nihil deleniti voluptatibus harum magnam adipisci tenetur.
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
          Sit amet consectetur adipisicing elit. Quibusdam illum in voluptates omnis reprehenderit
          inventore perferendis dolores, architecto doloribus. Quam error qui nam quis! Dolorum,
          dolore saepe ipsam quae aliquam tenetur dolores dolor repellendus facere a quasi soluta
          voluptate provident earum cum. Nostrum consequuntur corporis quibusdam tempora amet, animi
          inventore dicta voluptas nisi placeat ut illum explicabo!
        </p>
        <blockquote>
          Et aliquam libero deserunt maxime! Perspiciatis neque deserunt sequi deleniti!
        </blockquote>
        <p>
          Recusandae doloribus, ullam inventore esse culpa cupiditate dignissimos qui ducimus
          possimus ipsum reprehenderit, suscipit debitis nihil sit. Animi eligendi sed molestiae.
          Repellat, est ut eos voluptates tempora quisquam corporis mollitia, excepturi commodi cum
          dolore asperiores eaque debitis fuga quidem!
        </p>
        <h2>Doloremque nisi eius quis</h2>
        <p>
          Magnam quo voluptate vitae voluptatem expedita vel illum ut. Tempore, sed? Sunt distinctio
          minus dolore, consequuntur eos qui eveniet error rerum tempora, autem et quaerat, ea
          repellendus unde iure. Fuga ad tempore cupiditate animi iste, eius nam beatae, aliquid quae
          id iusto perspiciatis.
        </p>
        <figure>
          <img
            src="https://images.unsplash.com/photo-1734606901283-489b25f7aa9b?q=80&w=2360&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
            alt="Photo by Irene Demetri on Unsplash"
          />
          <figcaption>
            Photo by Irene Demetri on{" "}
            <a href="https://unsplash.com/photos/A2kyFEwh3zo">Unsplash</a>
          </figcaption>
        </figure>
        <p>
          Quod iste recusandae sed labore corporis ea provident debitis hic maxime placeat alias rem
          cumque animi explicabo laboriosam, dicta molestias? Corporis quibusdam, aliquam asperiores
          quo officia reiciendis nemo aspernatur similique voluptatibus in tempora? Laborum
          temporibus ipsa at exercitationem ullam labore tempore neque.
        </p>
        <p>
          Made with love by <a href="//codepen.io/DedaloD">Den Dionigi | UX Designer</a>
        </p>
      </article>
    </div>
  );
}
