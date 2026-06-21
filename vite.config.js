import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// ЭКСПЕРИМЕНТ (ветка claude/experiment-tailwind-switcher): добавлен Tailwind v4
// для пробы liquid-glass свитчера. В main НЕ сливаем без отдельного решения.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, open: true },
});
