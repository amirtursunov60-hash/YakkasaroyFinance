// Состояния статистик ХМС (Приложение А ТЗ v2)
export type StatState =
  | "nonexistence" // Несуществование
  | "power"        // Власть
  | "affluence"    // Изобилие
  | "normal"       // Норма
  | "emergency"    // Чрезвычайное положение
  | "danger";      // Опасность

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


export function weekLabels(n: number): string[] {
  const out: string[] = [];
  const end = new Date(2026, 5, 10);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end); d.setDate(end.getDate() - i * 7);
    out.push(`${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}
