// Состояния статистик ХМС (Приложение А ТЗ v2)
export type StatState =
  | "nonexistence" // Несуществование
  | "power"        // Власть
  | "affluence"    // Изобилие
  | "normal"       // Норма
  | "emergency"    // Чрезвычайное положение
  | "danger";      // Опасность

// Справочник состояний ХМС: метка для UI и цвет индикатора. Фиксированные
// определения (Приложение А ТЗ v2) — не данные из БД, а доменные константы.
export const STAT_STATES: Record<StatState, { label: string; color: string }> = {
  power: { label: "Власть", color: "#1fd65f" },
  affluence: { label: "Изобилие", color: "#7bd88f" },
  normal: { label: "Норма", color: "#5b8def" },
  emergency: { label: "Чрезвычайное положение", color: "#e8911c" },
  danger: { label: "Опасность", color: "#ff6b5e" },
  nonexistence: { label: "Несуществование", color: "#8b9296" },
};

// Коэффициенты состояния для расчёта ЗП по баллам (Этап 3 ТЗ): эффективные
// баллы = баллы поста × коэффициент состояния статистики.
export const STATE_COEF: Record<StatState, number> = {
  power: 1.3, affluence: 1.15, normal: 1.0, emergency: 0.85, danger: 0.7, nonexistence: 0.9,
};

// Эффективные баллы поста для ЗП по результату: баллы × коэффициент
// состояния ХМС; для неизвестного состояния коэффициент = 1.
export function effectivePoints(points: number, state: string): number {
  return points * (STATE_COEF[state as StatState] ?? 1);
}

// Автоопределение состояния по тренду последних 4 недель
export function calcState(values: number[] | null | undefined, invert?: boolean): StatState {
  if (!values || values.length < 4) return "nonexistence";
  const v = invert ? values.map((x) => -x) : values.slice();
  const last = v.slice(-4);
  const slope = (last[3] - last[0]) / 3;
  const avg = last.reduce((a, b) => a + b, 0) / 4;
  const rel = avg !== 0 ? slope / Math.abs(avg) : 0;
  const isRecord = v[v.length - 1] >= Math.max(...v);
  if (rel > 0.07 && isRecord) return "power";
  if (rel > 0.04) return "affluence";
  if (rel > 0.004) return "normal";
  if (rel > -0.04) return "emergency";
  return "danger";
}


// Выполнение квоты (плана) статистики за период: процент факта к плану и флаг
// «план выполнен». Для invert-статистик (рост — это плохо: расходы, жалобы)
// план считается выполненным, когда факт не выше квоты.
export interface QuotaAchievement { pct: number; met: boolean }
export function quotaAchievement(
  fact: number | null | undefined,
  quota: number | null | undefined,
  invert?: boolean,
): QuotaAchievement | null {
  if (fact == null || quota == null || quota === 0) return null;
  const pct = (fact / quota) * 100;
  const met = invert ? fact <= quota : fact >= quota;
  return { pct, met };
}


// Типы статистик ManaJet (`Stat.stat_type` — integer). Полный справочник из 33
// значений у ManaJet ещё не задокументирован; ниже — подтверждённые типы из
// комментария к колонке. Неизвестные значения показываем как «Тип N».
export const STAT_TYPES: Record<number, string> = {
  1: "Счётная",
  8: "Доход / выручка",
  11: "Дивиденд",
  12: "Активы / резервы",
};
export function statTypeLabel(t: number | null | undefined): string | null {
  if (t == null) return null;
  return STAT_TYPES[t] || `Тип ${t}`;
}


export function weekLabels(n: number): string[] {
  const out: string[] = [];
  const end = new Date(2026, 5, 10);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end); d.setDate(end.getDate() - i * 7);
    out.push(`${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}
