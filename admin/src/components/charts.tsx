import { useId } from "react";
import { motion } from "motion/react";

// Bespoke, dependency-free charts in the Oguaa palette. All animate on data
// change (transition on width/height) so the live-refreshing dashboard feels
// alive without a charting library. PALETTE points at the theme tokens —
// inline styles and SVG attributes accept var() — so charts retint in dark mode.
const PALETTE = {
  green: "var(--color-green)", greenLt: "var(--color-green-slate)", gold: "var(--color-gold-brand)", goldLt: "var(--color-gold)",
  clay: "var(--color-clay)", teal: "var(--color-teal)", maroon: "var(--color-maroon-900)", sand: "var(--color-sand)",
};
export const CHART_COLORS = [
  PALETTE.green, PALETTE.gold, PALETTE.clay, PALETTE.teal, PALETTE.maroon, PALETTE.goldLt, PALETTE.greenLt,
];

export interface Datum {
  label: string;
  value: number;
  color?: string;
}

/** Horizontal bars — categorical comparisons (content mix, institutions by kind). */
export function BarsH({ data, className = "" }: Readonly<{ data: Datum[]; className?: string }>) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <EmptyChart />;
  return (
    <div className={`space-y-2.5 ${className}`}>
      {data.map((d, i) => (
        <div key={d.label} className="flex items-center gap-3">
          <span className="w-24 shrink-0 truncate text-xs text-ink-muted" title={d.label}>{d.label}</span>
          <div className="relative h-5 flex-1 overflow-hidden rounded bg-sand/60">
            <motion.div
              className="absolute inset-y-0 left-0 rounded"
              initial={{ width: 0 }}
              animate={{ width: `${(d.value / max) * 100}%` }}
              transition={{ duration: 0.7, ease: "easeOut" }}
              style={{ backgroundColor: d.color ?? CHART_COLORS[i % CHART_COLORS.length] }}
            />
          </div>
          <span className="w-7 shrink-0 text-right text-xs font-semibold tabular-nums text-ink">{d.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Vertical bars over a time axis — submissions/activity per month. */
export function Histogram({ data, color = PALETTE.gold, className = "" }: Readonly<{ data: Datum[]; color?: string; className?: string }>) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <EmptyChart />;
  return (
    <div className={`flex h-full flex-col ${className}`}>
      <div className="flex h-full min-h-[8rem] items-end gap-1.5">
        {data.map((d) => (
          <motion.div
            key={d.label}
            className="group relative flex-1 rounded-t"
            initial={{ height: "0%" }}
            animate={{ height: `${Math.max(2, (d.value / max) * 100)}%` }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            style={{ backgroundColor: color }}
            title={`${d.label}: ${d.value}`}
          >
            <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[0.6rem] font-semibold tabular-nums text-ink opacity-0 transition-opacity group-hover:opacity-100">{d.value}</span>
          </motion.div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {data.map((d) => (
          <span key={d.label} className="flex-1 truncate text-center text-[0.55rem] uppercase tracking-wide text-ink-faint">{d.label}</span>
        ))}
      </div>
    </div>
  );
}

/** Smooth area/line — cumulative growth over time. */
export function AreaLine({ points, color = PALETTE.green, className = "h-44" }: Readonly<{ points: Datum[]; color?: string; className?: string }>) {
  const id = useId();
  if (points.length < 2) return <EmptyChart label="Not enough history yet" />;
  const W = 600, H = 200, pad = 6;
  const max = Math.max(1, ...points.map((p) => p.value));
  const n = points.length;
  const x = (i: number) => pad + (i / (n - 1)) * (W - 2 * pad);
  const y = (v: number) => H - pad - (v / max) * (H - 2 * pad);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(n - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`;
  return (
    <div className={`flex flex-col ${className}`}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full" role="img" aria-label="Cumulative growth">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${id})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div className="mt-1 flex justify-between text-[0.55rem] uppercase tracking-wide text-ink-faint">
        <span>{points[0]?.label}</span>
        <span className="font-semibold text-ink-muted">now · {points[n - 1]?.value}</span>
      </div>
    </div>
  );
}

/** Donut with centre total + legend — proportional breakdowns (status, kind). */
export function Donut({ data, label, className = "" }: Readonly<{ data: Datum[]; label?: string; className?: string }>) {
  const sum = data.reduce((s, d) => s + d.value, 0);
  const R = 42, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className={`flex items-center gap-5 ${className}`}>
      <div className="relative h-28 w-28 shrink-0">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={R} fill="none" stroke={PALETTE.sand} strokeWidth="13" />
          {sum > 0 && data.map((d, i) => {
            const len = (d.value / sum) * C;
            const seg = (
              <circle
                key={d.label} cx="50" cy="50" r={R} fill="none"
                stroke={d.color ?? CHART_COLORS[i % CHART_COLORS.length]} strokeWidth="13"
                strokeDasharray={`${len.toFixed(2)} ${(C - len).toFixed(2)}`}
                strokeDashoffset={(-offset).toFixed(2)}
                className="transition-all duration-700 ease-out"
              />
            );
            offset += len;
            return seg;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold leading-none text-ink">{sum}</span>
          {label && <span className="mt-0.5 text-[0.55rem] uppercase tracking-wide text-ink-faint">{label}</span>}
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: d.color ?? CHART_COLORS[i % CHART_COLORS.length] }} />
            <span className="min-w-0 flex-1 truncate text-ink-muted">{d.label}</span>
            <span className="shrink-0 font-semibold tabular-nums text-ink">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyChart({ label = "No data yet" }: Readonly<{ label?: string }>) {
  return <div className="flex h-40 items-center justify-center text-sm text-ink-faint">{label}</div>;
}
