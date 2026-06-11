
export function StatChart({ values, color, height = 130 }) {
  const W = 600, H = height, P = 10;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const x = (i) => P + (i * (W - 2 * P)) / (values.length - 1);
  const y = (v) => H - P - ((v - min) / range) * (H - 2 * P - 10);
  const pts = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const area = `${x(0)},${H - P} ${pts} ${x(values.length - 1)},${H - P}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {[0.25, 0.5, 0.75].map((t) => (
        <line key={t} x1={P} x2={W - P} y1={P + t * (H - 2 * P)} y2={P + t * (H - 2 * P)} stroke="currentColor" opacity="0.08" strokeWidth="1" />
      ))}
      <polygon points={area} fill={color} opacity="0.10" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="3.5" fill={color} />)}
    </svg>
  );
}
