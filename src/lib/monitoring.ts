// Мониторинг ошибок фронта — два независимых канала (ADR-0009):
// 1) Журнал в БД (client_errors): работает всегда у вошедших пользователей,
//    смотрят финадмины в «Журнал аудита» → «Ошибки фронта».
// 2) Sentry: включается только при заданном VITE_SENTRY_DSN — без DSN SDK
//    не попадает в основной бандл (динамический импорт).
// Всё best-effort: сбой мониторинга никогда не должен влиять на приложение.

import { supabase } from "./supabase";

type SentryModule = typeof import("@sentry/react");

let sentry: SentryModule | null = null;

// Страховка от лавины: не больше N записей в БД за сессию вкладки
// (циклическая ошибка рендера иначе зальёт таблицу).
const DB_LIMIT_PER_SESSION = 20;
let dbReported = 0;

async function logToDb(error: unknown, componentStack?: string): Promise<void> {
  if (dbReported >= DB_LIMIT_PER_SESSION) return;
  dbReported++;
  try {
    const { data } = await supabase.auth.getSession();
    const uid = data?.session?.user?.id;
    if (!uid) return; // не вошёл — писать не можем (RLS), Sentry подхватит если включён
    const e = error instanceof Error ? error : new Error(String(error));
    await supabase.from("client_errors").insert({
      profile_id: uid,
      message: String(e.message || e).slice(0, 2000),
      stack: e.stack ? String(e.stack).slice(0, 8000) : null,
      component_stack: componentStack ? String(componentStack).slice(0, 8000) : null,
      url: (window.location.hash || window.location.pathname).slice(0, 500),
      user_agent: navigator.userAgent.slice(0, 400),
    });
  } catch {
    // Мониторинг не должен ронять приложение.
  }
}

export async function initMonitoring(): Promise<void> {
  // Необработанные исключения и promise-реджекты — в журнал БД
  window.addEventListener("error", (ev) => {
    void logToDb(ev.error ?? ev.message);
  });
  window.addEventListener("unhandledrejection", (ev) => {
    void logToDb(ev.reason ?? "unhandledrejection");
  });

  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  try {
    const mod = await import("@sentry/react");
    mod.init({
      dsn,
      environment: import.meta.env.MODE,
      sendDefaultPii: false,
    });
    sentry = mod;
  } catch {
    // Нет сети/блокировщик — работаем без Sentry.
  }
}

// Ручная отправка ошибки (ErrorBoundary, критичные catch-ветки).
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  try {
    void logToDb(error, context?.componentStack as string | undefined);
    sentry?.captureException(error, context ? { extra: context } : undefined);
  } catch {
    // Мониторинг не должен ронять приложение.
  }
}
