import type { Point } from "@/lib/types";

/** Tiny server-rendered SVG of the last few weeks of prices. */
export function Sparkline({
  points,
  className,
  stroke = "currentColor",
  width = 120,
  height = 32,
}: {
  points: Point[];
  className?: string;
  stroke?: string;
  width?: number;
  height?: number;
}) {
  if (points.length < 2) return null;
  const ps = points.map((x) => x.p);
  const lo = Math.min(...ps);
  const hi = Math.max(...ps);
  const span = hi - lo || 1;
  const pad = 2;
  const xy = points.map((pt, i) => {
    const x = pad + (i / (points.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (pt.p - lo) / span) * (height - pad * 2);
    return [x, y] as const;
  });
  const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lx, ly] = xy[xy.length - 1];
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      aria-hidden
      preserveAspectRatio="none"
    >
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={2.25} fill={stroke} />
    </svg>
  );
}
