import { formatCount, shortDate } from "@/lib/ads";
import type { AdDailyDelivery } from "@/lib/types";

// Daily viewable impressions for one campaign: a single series, so one hue and
// no legend (the heading names it). Each bar shows its day, views and clicks on
// hover or keyboard focus, and the same numbers are available as a table.

export function DeliveryChart({ days }: Readonly<{ days: AdDailyDelivery[] }>) {
  const max = Math.max(1, ...days.map((d) => d.views));
  return (
    <div>
      <ol aria-label="Viewable impressions per day" className="flex h-40 items-end gap-[2px] border-b border-ink-faint/30 pt-8">
        {days.map((d) => {
          const pct = Math.max(2, Math.round((d.views / max) * 100));
          const label = `${shortDate(d.day)}: ${formatCount(d.views)} views, ${formatCount(d.clicks)} clicks`;
          return (
            <li
              key={d.day}
              tabIndex={0}
              aria-label={label}
              className="group relative flex h-full min-w-[6px] flex-1 items-end rounded-t-[4px] outline-none focus-visible:ring-2 focus-visible:ring-teal/60"
            >
              <span
                aria-hidden
                className="block w-full rounded-t-[4px] bg-green transition-opacity duration-200 group-hover:opacity-80 group-focus-visible:opacity-80"
                style={{ height: `${pct}%` }}
              />
              <span
                aria-hidden
                className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-sand bg-paper px-2 py-1 text-[0.7rem] text-ink shadow-[var(--shadow-card)] group-hover:block group-focus-visible:block"
              >
                <span className="font-semibold tabular-nums">{shortDate(d.day)}</span>
                <span className="tabular-nums text-ink-muted"> · {formatCount(d.views)} views · {formatCount(d.clicks)} clicks</span>
              </span>
            </li>
          );
        })}
      </ol>
      <div className="mt-1.5 flex justify-between text-[0.7rem] tabular-nums text-ink-faint">
        <span>{shortDate(days[0].day)}</span>
        {days.length > 1 && <span>{shortDate(days.at(-1)!.day)}</span>}
      </div>
      <details className="mt-3 text-sm">
        <summary className="min-h-9 cursor-pointer text-xs font-semibold text-teal-text">Show the numbers</summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-sand">
          <table className="w-full text-left text-xs">
            <thead className="bg-cream text-ink-faint">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">Day</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Views</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Clicks</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.day} className="border-t border-sand">
                  <th scope="row" className="px-3 py-1.5 font-normal tabular-nums text-ink">{shortDate(d.day)}</th>
                  <td className="px-3 py-1.5 text-right tabular-nums text-ink">{formatCount(d.views)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-ink-muted">{formatCount(d.clicks)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
