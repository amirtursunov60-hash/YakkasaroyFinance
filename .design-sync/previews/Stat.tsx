// Превью Stat — сводное число со знаком/здоровьем (label/value/unit/tone).
import { Stat } from "yakkasaroy-management";

const row = { display: "flex", gap: 36, flexWrap: "wrap" as const };

export function Revenue() {
  return (
    <div style={row}>
      <Stat label="Выручка за неделю" value="148 200,00" unit="смони" />
      <Stat label="Маржинальный доход" value="92 450,00" unit="смони" tone="success" />
    </div>
  );
}

export function SignedValues() {
  return (
    <div style={row}>
      <Stat label="Дефицит ФОТ" value="−12 300,00" unit="смони" />
      <Stat label="Расхождение по сверке" value="−540,00" unit="смони" tone="warning" />
      <Stat label="Чистая прибыль" value="38 900,00" unit="смони" tone="success" />
    </div>
  );
}
