// Чистая доменная логика оргсхемы (ТЗ v2 §4.3–4.4): сводные счётчики постов.
// Без React/Supabase — покрыто unit-тестами (org.test.ts).

export type HatStatus = "none" | "learning" | "done";

export interface OrgHolder {
  id: string;
  name?: string | null;
  hatStatus: HatStatus;
  isMain?: boolean;
}

export interface OrgPosition {
  id: string;
  holders: OrgHolder[];
}

export interface OrgDivision {
  id: string;
  positions: OrgPosition[];
}

export interface OrgCounts {
  total: number;   // всего постов на схеме
  filled: number;  // постов с держателем
  vacant: number;  // вакансий
  hatPct: number;  // % постов, где шляпа изучена (есть держатель со статусом done)
}

/** Сводка по оргсхеме для героя модуля. */
export function orgCounts(divisions: OrgDivision[]): OrgCounts {
  const posts = divisions.flatMap((d) => d.positions);
  const total = posts.length;
  const filled = posts.filter((p) => p.holders.length > 0).length;
  const done = posts.filter((p) => p.holders.some((h) => h.hatStatus === "done")).length;
  return {
    total,
    filled,
    vacant: total - filled,
    hatPct: total ? Math.round((done / total) * 100) : 0,
  };
}

/** Следующий статус шляпы по кругу: нет → в обучении → изучена → нет. */
export function nextHatStatus(s: HatStatus): HatStatus {
  return s === "none" ? "learning" : s === "learning" ? "done" : "none";
}
