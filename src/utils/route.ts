// Навигация ↔ URL-hash: #/<модуль>/<раздел> (например, #/finance/register).
// Чистая логика без React и без импорта справочника навигации — карта разделов
// передаётся параметром, поэтому модуль легко тестировать.

export interface Route {
  module: string;
  // null — раздел в hash не указан или не существует: вызывающий подставит дефолтный
  section: string | null;
}

export type NavMap = Record<string, ReadonlyArray<{ key: string }>>;

// Разбор hash. null — hash пустой/чужой/с неизвестным модулем.
export function parseHash(hash: string, nav: NavMap): Route | null {
  const m = /^#\/([\w-]+)(?:\/([\w-]+))?\/?$/.exec(hash || "");
  if (!m) return null;
  const sections = nav[m[1]];
  if (!sections || sections.length === 0) return null;
  const section = m[2] && sections.some((s) => s.key === m[2]) ? m[2] : null;
  return { module: m[1], section };
}

export function buildHash(module: string, section: string): string {
  return `#/${module}/${section}`;
}
