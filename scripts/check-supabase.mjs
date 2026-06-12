#!/usr/bin/env node
// Диагностика подключения к Supabase: npm run db:check
// Проверяет .env, доступность проекта и применённость миграций (таблица profiles).
import { readFileSync, existsSync } from "node:fs";

function loadDotEnv() {
  if (!existsSync(".env")) return {};
  const out = {};
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    if (line.trim().startsWith("#")) continue;
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = { ...loadDotEnv(), ...process.env };
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_KEY;

let failed = false;
const ok = (msg) => console.log("  ✓", msg);
const fail = (msg, hint) => {
  failed = true;
  console.log("  ✗", msg);
  if (hint) console.log("    →", hint);
};

console.log("Диагностика Supabase\n");

if (!existsSync(".env")) {
  fail("Файл .env не найден", "выполните: cp .env.example .env — и заполните ключи (Project Settings → API)");
}
if (!url || url.includes("your-project")) {
  fail("VITE_SUPABASE_URL не задан", "Project URL из панели Supabase (Project Settings → API)");
} else {
  ok(`VITE_SUPABASE_URL: ${url}`);
}
if (!key || key.includes("your-anon")) {
  fail("VITE_SUPABASE_KEY не задан", "anon public ключ из панели Supabase (Project Settings → API)");
} else {
  ok("VITE_SUPABASE_KEY задан");
}

if (!failed) {
  // Доступность проекта (auth-сервис)
  try {
    const r = await fetch(`${url}/auth/v1/health`, { headers: { apikey: key } });
    if (r.ok) ok("Проект доступен, auth-сервис отвечает");
    else if (r.status === 401) fail("Auth-сервис отверг ключ (401)", "проверьте, что в .env именно anon public ключ");
    else fail(`Auth-сервис ответил ${r.status}`, "проверьте URL проекта");
  } catch (e) {
    fail(`Проект недоступен: ${e.message}`, "проверьте URL и сетевое подключение");
  }

  // Применённость миграций: таблица profiles
  try {
    const r = await fetch(`${url}/rest/v1/profiles?select=id&limit=0`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    const body = await r.json().catch(() => ({}));
    if (r.ok) {
      ok("Таблица profiles на месте — миграции применены");
    } else if (body.code === "PGRST205" || body.code === "42P01") {
      fail("Таблица profiles не найдена — миграции не применены", "выполните: npm run db:link и npm run db:push");
    } else if (r.status === 401 || r.status === 403) {
      ok("Таблица profiles на месте (доступ без входа закрыт RLS — это норма)");
    } else {
      fail(`REST API ответил ${r.status}: ${body.message || JSON.stringify(body)}`);
    }
  } catch (e) {
    fail(`REST API недоступен: ${e.message}`);
  }
}

console.log(failed
  ? "\nЕсть проблемы — следуйте подсказкам выше (подробности в README, раздел «Настройка Supabase»)."
  : "\nВсё в порядке: можно запускать npm run dev и входить в приложение.");
process.exit(failed ? 1 : 0);
