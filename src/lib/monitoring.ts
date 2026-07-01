// Мониторинг ошибок фронта (Sentry). Включается только при заданном VITE_SENTRY_DSN:
// без DSN модуль ничего не делает, SDK не попадает в основной бандл (динамический импорт).
// Best-effort: сбой мониторинга никогда не должен влиять на работу приложения.

type SentryModule = typeof import("@sentry/react");

let sentry: SentryModule | null = null;

export async function initMonitoring(): Promise<void> {
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
    // Нет сети/блокировщик — работаем без мониторинга.
  }
}

// Ручная отправка ошибки (ErrorBoundary, критичные catch-ветки).
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  try {
    sentry?.captureException(error, context ? { extra: context } : undefined);
  } catch {
    // Мониторинг не должен ронять приложение.
  }
}
