import React from "react";
import { createRoot } from "react-dom/client";
import YakkasaroyFinance from "./App";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <YakkasaroyFinance />
  </React.StrictMode>
);
