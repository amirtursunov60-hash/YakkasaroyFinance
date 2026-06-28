// Превью StatChart — спарклайн факта со штриховой линией плана (квоты).
import { StatChart } from "yakkasaroy-management";

export function FactVsQuota() {
  return (
    <div style={{ maxWidth: 540 }}>
      <StatChart
        values={[12, 18, 15, 22, 28, 26, 34]}
        quota={[15, 15, 20, 20, 25, 25, 30]}
        color="#3ddc84"
      />
    </div>
  );
}

export function FactOnly() {
  return (
    <div style={{ maxWidth: 540 }}>
      <StatChart values={[44, 41, 47, 52, 49, 58, 55]} color="#5b8def" />
    </div>
  );
}
