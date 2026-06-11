
// ---------------------------------------------------------------- ОТЧЁТЫ
export function BarsChart({ a, b, colorA, colorB, height = 170 }) {
  const W = 600, H = height, P = 8;
  const max = Math.max(...a, ...b) || 1;
  const n = a.length;
  const gw = (W - 2 * P) / n;
  const bw = gw * 0.3;
  const hOf = (v) => (v / max) * (H - 2 * P);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {[0.25, 0.5, 0.75].map((t) => (
        <line key={t} x1={P} x2={W - P} y1={H - P - t * (H - 2 * P)} y2={H - P - t * (H - 2 * P)} stroke="currentColor" opacity="0.08" strokeWidth="1" />
      ))}
      {a.map((v, i) => <rect key={"a" + i} x={P + i * gw + gw / 2 - bw - 1.5} y={H - P - hOf(v)} width={bw} height={hOf(v)} rx="3" fill={colorA} />)}
      {b.map((v, i) => <rect key={"b" + i} x={P + i * gw + gw / 2 + 1.5} y={H - P - hOf(v)} width={bw} height={hOf(v)} rx="3" fill={colorB} />)}
    </svg>
  );
}
