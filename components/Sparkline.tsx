import type { Bar } from "@/lib/types";

/**
 * Price context, not a trading chart. One year of closes, no axes, no gridlines -
 * enough to tell the investor which way the stock has been going while they read
 * what management promised.
 */
export function Sparkline({ bars, height = 44 }: { bars: Bar[]; height?: number }) {
  if (bars.length < 2) return null;

  const W = 300;
  const closes = bars.map((b) => b.close);
  const lo = Math.min(...closes);
  const hi = Math.max(...closes);
  const span = hi - lo || 1;

  const pts = closes.map((c, i) => {
    const x = (i / (closes.length - 1)) * W;
    const y = height - ((c - lo) / span) * (height - 4) - 2;
    return [x, y] as const;
  });

  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${d} L${W},${height} L0,${height} Z`;

  const first = closes[0];
  const last = closes.at(-1)!;
  const up = last >= first;
  const colour = up ? "var(--up)" : "var(--down)";
  const changePct = ((last - first) / first) * 100;

  return (
    <div className="mt-1">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={`One-year price trend, ${changePct >= 0 ? "up" : "down"} ${Math.abs(changePct).toFixed(0)} percent`}
      >
        <defs>
          <linearGradient id={`g-${up ? "u" : "d"}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colour} stopOpacity="0.22" />
            <stop offset="100%" stopColor={colour} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#g-${up ? "u" : "d"})`} />
        <path d={d} fill="none" stroke={colour} strokeWidth="1.6" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex items-baseline justify-between text-[10.5px]" style={{ color: "var(--ink-faint)" }}>
        <span>1Y</span>
        <span className="tnum" style={{ color: colour }}>
          {changePct >= 0 ? "+" : ""}
          {changePct.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}
