// Превью BarsChart — две серии SVG-столбцов (например, Доходы vs Расходы по неделям ФП).
import { BarsChart } from "yakkasaroy-management";

const wrap = { maxWidth: 540 };
const legend = {
  display: "flex",
  gap: 18,
  flexWrap: "wrap" as const,
  marginBottom: 10,
  fontSize: 13,
  fontWeight: 600,
};
const dot = (c: string) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
});
const box = (c: string) => ({
  width: 11,
  height: 11,
  borderRadius: 3,
  background: c,
  display: "inline-block",
});

// Доходы и расходы по 8 неделям ФП (чт–ср), суммы в смони.
export function IncomeVsExpense() {
  const income = [142000, 158400, 137200, 171500, 165800, 149300, 183600, 176900];
  const expense = [118300, 121700, 129400, 132100, 140500, 126800, 138200, 144700];
  return (
    <div style={wrap}>
      <div style={legend}>
        <span style={dot("#3ddc84")}><span style={box("#3ddc84")} /> Доходы</span>
        <span style={dot("#ff6b5e")}><span style={box("#ff6b5e")} /> Расходы</span>
      </div>
      <BarsChart a={income} b={expense} colorA="#3ddc84" colorB="#ff6b5e" />
    </div>
  );
}

// План против факта пополнения фондов за период, компактная высота.
export function PlanVsFact() {
  const plan = [60000, 45000, 30000, 52000, 38000, 41000];
  const fact = [54200, 47800, 26500, 49100, 35600, 43900];
  return (
    <div style={wrap}>
      <div style={legend}>
        <span style={dot("#3ddc84")}><span style={box("#3ddc84")} /> План</span>
        <span style={dot("#ff6b5e")}><span style={box("#ff6b5e")} /> Факт</span>
      </div>
      <BarsChart a={plan} b={fact} colorA="#3ddc84" colorB="#ff6b5e" height={130} />
    </div>
  );
}
