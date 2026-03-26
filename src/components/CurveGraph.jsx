import { calcStroke } from "../svg.js";

export default function CurveGraph({ intensity, refSize, refStroke, sizes }) {
  const W = 200, H = 80, pad = 24;
  const minS = Math.min(...sizes, refSize), maxS = Math.max(...sizes, refSize);
  const x = (s) => pad + ((s - minS) / (maxS - minS)) * (W - pad * 2);
  const maxSw = refStroke * Math.pow(refSize / minS, Math.max(intensity, 0.01));
  const minSw = refStroke * Math.pow(refSize / maxS, Math.max(intensity, 0.01));
  const swRange = Math.max(maxSw - minSw, 0.1);
  const y = (sw) => H - pad - ((sw - minSw + 0.2) / (swRange + 0.4)) * (H - pad * 2);

  const pts = [];
  for (let s = minS; s <= maxS; s += 0.5) {
    const sw = calcStroke(refStroke, refSize, s, intensity);
    pts.push(`${x(s)},${y(sw)}`);
  }

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="#222" strokeWidth="1" />
      <line x1={pad} y1={pad} x2={pad} y2={H - pad} stroke="#222" strokeWidth="1" />
      <polyline points={pts.join(" ")} fill="none" stroke="#c9a55a" strokeWidth="1.5" opacity="0.7" />
      {sizes.map((s) => {
        const sw = calcStroke(refStroke, refSize, s, intensity);
        return (
          <g key={s}>
            <circle cx={x(s)} cy={y(sw)} r={s === refSize ? 3.5 : 2.5} fill={s === refSize ? "#f0f0f0" : "#c9a55a"} />
            <text x={x(s)} y={H - 6} textAnchor="middle" fontSize="7" fill="#888">{s}</text>
          </g>
        );
      })}
      <text x={4} y={10} fontSize="7" fill="#888">sw</text>
      <text x={W - pad} y={H - 6} fontSize="7" fill="#888" textAnchor="end">px</text>
    </svg>
  );
}
