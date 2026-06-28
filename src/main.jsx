import React from "react";
import { createRoot } from "react-dom/client";
import YakkasaroyFinance from "./App";
import "./index.css";

// Монтируемся только если есть точка входа #root. В обычном приложении она
// всегда есть (index.html), поэтому поведение в проде не меняется. Защита нужна,
// чтобы модуль можно было безопасно импортировать вне DOM (инструменты сборки,
// дизайн-снимки) — без падения `createRoot(null)`.
const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(
    <React.StrictMode>
      <YakkasaroyFinance />
    </React.StrictMode>
  );
}
