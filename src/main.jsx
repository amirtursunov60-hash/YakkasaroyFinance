import React from "react";
import { createRoot } from "react-dom/client";
import YakkasaroyFinance from "./App";
import { initMonitoring } from "./lib/monitoring";
import "./index.css";

initMonitoring();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <YakkasaroyFinance />
  </React.StrictMode>
);
