import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: { port: 5173, open: true },
  build: {
    rollupOptions: {
      output: {
        // Разбиваем тяжёлые зависимости в отдельные чанки: лучше кэш между
        // деплоями и меньше парсинга при первичной загрузке (особенно на мобиле).
        manualChunks: {
          react: ["react", "react-dom"],
          supabase: ["@supabase/supabase-js"],
          icons: ["lucide-react"],
        },
      },
    },
  },
});
