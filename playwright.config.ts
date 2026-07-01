import { defineConfig, devices } from "@playwright/test";

// E2E-смоук (Playwright). Адрес приложения — E2E_BASE_URL
// (продакшен/превью Vercel или локальный dev-сервер).
// Для авторизованного обхода вкладок нужны E2E_EMAIL / E2E_PASSWORD.
// В облачной среде Claude Code браузер предустановлен — путь передаётся через
// E2E_CHROMIUM_PATH (например /opt/pw-browsers/chromium); локально достаточно
// `npx playwright install chromium`.
const executablePath = process.env.E2E_CHROMIUM_PATH || undefined;

// Уважаем HTTPS_PROXY (в облачной среде исходящий трафик идёт через прокси;
// на обычной машине переменная не задана — прокси не используется).
const proxyServer = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || undefined;

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  retries: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:5173",
    screenshot: "only-on-failure",
    locale: "ru-RU",
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      // MITM-шлюз прокси обрывает TLS 1.3 ClientHello Chromium (ERR_CONNECTION_CLOSED).
      // Только при работе через прокси ограничиваем TLS до 1.2 — на обычной
      // машине/CI прокси нет и флаг не применяется.
      ...(proxyServer ? { args: ["--ssl-version-max=tls1.2"] } : {}),
    },
    proxy: proxyServer ? { server: proxyServer } : undefined,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // Управляющие работают с телефона — смоук гоняем и в мобильном вьюпорте.
    // Профиль на Chromium (Pixel), а не iPhone: WebKit не ставим.
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
