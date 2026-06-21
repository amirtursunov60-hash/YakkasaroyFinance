
// values — ряд факта; quota (необязательно) — ряд плана, выровненный по тем же
// неделям (может содержать null там, где плана нет). План рисуется пунктиром
// поверх факта в общем масштабе.
export function StatChart({ values, quota, color, planColor = "#8b9296", height = 130 }) {
  const W = 600, H = height, P = 10;
  const quotaVals = (quota || []).filter((q) => q != null);
  const all = [...values, ...quotaVals];
  const min = Math.min(...all), max = Math.max(...all);
  const range = max - min || 1;
  const single = values.length < 2;
  const x = (i) => (single ? W / 2 : P + (i * (W - 2 * P)) / (values.length - 1));
  const y = (v) => H - P - ((v - min) / range) * (H - 2 * P - 10);
  const pts = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const area = `${x(0)},${H - P} ${pts} ${x(values.length - 1)},${H - P}`;
  const planPts = quota
    ? quota.map((q, i) => (q != null ? `${x(i)},${y(q)}` : null)).filter(Boolean).join(" ")
    : "";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {[0.25, 0.5, 0.75].map((t) => (
        <line key={t} x1={P} x2={W - P} y1={P + t * (H - 2 * P)} y2={P + t * (H - 2 * P)} stroke="currentColor" opacity="0.08" strokeWidth="1" />
      ))}
      <polygon points={area} fill={color} opacity="0.10" />
      {/* План (квота) — пунктиром под фактом */}
      {planPts && <polyline points={planPts} fill="none" stroke={planColor} strokeWidth="2" strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round" opacity="0.85" />}
      {quota && quota.map((q, i) => (q != null ? <circle key={"q" + i} cx={x(i)} cy={y(q)} r="2.6" fill={planColor} opacity="0.85" /> : null))}
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="3.5" fill={color} />)}
    </svg>
  );
}
