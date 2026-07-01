import { defineConfig, devices } from "@playwright/test";

// E2E-смоук (Playwright). Адрес приложения — E2E_BASE_URL (продакшен/превью
// Vercel); без него поднимается локальный dev-сервер (webServer ниже).
// Для авторизованного обхода вкладок нужны E2E_EMAIL / E2E_PASSWORD.
//
// Облачная среда Claude Code: браузер предустановлен — путь передаётся через
// E2E_CHROMIUM_PATH (например /opt/pw-browsers/chromium). Эта же переменная —
// маркер облака: только при ней включаем прокси из HTTPS_PROXY и ограничение
// TLS до 1.2 (MITM-шлюз среды рвёт TLS 1.3 ClientHello Chromium). На обычной
// машине/CI, даже с корпоративным HTTPS_PROXY, конфиг ничего не навязывает.
const executablePath = process.env.E2E_CHROMIUM_PATH || undefined;
const cloudProxy = executablePath ? (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) : undefined;

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  retries: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:5173",
    screenshot: "only-on-failure",
    trace: "on-first-retry", // упавшая первая попытка оставляет полный трейс
    locale: "ru-RU",
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      ...(cloudProxy ? { args: ["--ssl-version-max=tls1.2"] } : {}),
    },
    proxy: cloudProxy ? { server: cloudProxy } : undefined,
  },
  // Локальный запуск без E2E_BASE_URL сам поднимает dev-сервер
  // (нужны VITE_SUPABASE_URL/KEY в .env, как для npm run dev).
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: "npm run dev -- --no-open",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // Управляющие работают с телефона — смоук гоняем и в мобильном вьюпорте.
    // Профиль на Chromium (Pixel), а не iPhone: WebKit не ставим.
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
