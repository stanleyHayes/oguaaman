import { FORMAT_SIZES, formatBps, formatCount, formatGhs, PLACEMENT_WHERE } from "@/lib/ads";
import { formatDate } from "@/lib/format";
import type { AdRateCard } from "@/lib/types";

const FORMAT_NAME = { banner: "Banner", card: "Card", rect: "Rectangle" } as const;

/** Net price, tax and total for an example order, using the published rates. */
function example(card: AdRateCard) {
  const placement = card.placements.find((p) => p.active && p.slug === "portal-feed-card") ?? card.placements.find((p) => p.active);
  if (!placement) return null;
  const impressions = Math.max(10_000, card.minImpressions);
  const net = Math.ceil((impressions * placement.cpmPesewas) / 1000);
  const tax = Math.round((net * card.taxRateBps) / 10_000);
  return { placement, impressions, net, tax, total: net + tax };
}

/**
 * The public rate card: one price per placement for every advertiser
 * (NMC equal rates), per 1,000 viewable impressions.
 */
export function RateCardTable({ card }: Readonly<{ card: AdRateCard }>) {
  const showPolitical = card.politicalEnabled;
  const ex = example(card);
  const taxNote = card.taxRateBps > 0
    ? `${card.taxLabel} at ${formatBps(card.taxRateBps)} is added to the net price and shown in every quote.`
    : "No tax is charged at present. If that changes, the tax is shown in every quote before you pay.";

  return (
    <div>
      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-sand bg-paper shadow-[var(--shadow-card)]">
        <table className="w-full min-w-[19rem] border-collapse text-left text-sm">
          <caption className="sr-only">Oguaa advertising rate card, in Ghana cedis per 1,000 viewable impressions</caption>
          <thead>
            <tr className="border-b border-sand bg-cream/70 text-[0.7rem] uppercase tracking-[0.14em] text-ink-faint">
              <th scope="col" className="px-4 py-3 font-semibold sm:px-5">Placement</th>
              <th scope="col" className="hidden px-4 py-3 font-semibold md:table-cell">Creative</th>
              <th scope="col" className="whitespace-nowrap px-4 py-3 text-right font-semibold">
                <span className="sm:hidden">Per 1,000</span>
                <span className="hidden sm:inline">Per 1,000 views</span>
              </th>
              {showPolitical && <th scope="col" className="hidden px-4 py-3 text-right font-semibold sm:table-cell sm:pr-5">Political</th>}
            </tr>
          </thead>
          <tbody>
            {card.placements.map((p) => (
              <tr key={p.slug} className={`border-b border-sand last:border-0 ${p.active ? "" : "text-ink-faint"}`}>
                <th scope="row" className="px-4 py-4 align-top font-normal sm:px-5">
                  <span className={`block font-semibold ${p.active ? "text-ink" : "text-ink-muted"}`}>{p.name}</span>
                  <span className="mt-1 block max-w-sm text-pretty text-xs leading-relaxed text-ink-muted">{PLACEMENT_WHERE[p.slug] ?? p.description}</span>
                  <span className="mt-1.5 block text-xs text-ink-faint md:hidden">
                    {FORMAT_NAME[p.format]} · {FORMAT_SIZES[p.format]}
                  </span>
                  {!p.active && (
                    <span className="mt-2 inline-block rounded-sm border border-sand px-1.5 py-px text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                      Not available yet
                    </span>
                  )}
                </th>
                <td className="hidden px-4 py-4 align-top text-xs leading-relaxed text-ink-muted md:table-cell">
                  <span className="block font-medium text-ink">{FORMAT_NAME[p.format]}</span>
                  {FORMAT_SIZES[p.format]}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-right align-top font-semibold tabular-nums text-ink">
                  {formatGhs(p.cpmPesewas)}
                  {showPolitical && <span className="mt-1 block text-xs font-normal text-ink-muted sm:hidden">Political {formatGhs(p.politicalCpmPesewas)}</span>}
                </td>
                {showPolitical && <td className="hidden whitespace-nowrap px-4 py-4 text-right align-top tabular-nums text-ink-muted sm:table-cell sm:pr-5">{formatGhs(p.politicalCpmPesewas)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="mt-6 grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div className="border-t border-sand pt-3">
          <dt className="text-xs text-ink-faint">Smallest order</dt>
          <dd className="mt-1 font-medium tabular-nums text-ink">{formatGhs(card.minOrderPesewas)} in total</dd>
        </div>
        <div className="border-t border-sand pt-3">
          <dt className="text-xs text-ink-faint">Impressions</dt>
          <dd className="mt-1 font-medium tabular-nums text-ink">
            {formatCount(card.minImpressions)} to {formatCount(card.maxImpressionsPerOrder)}, in steps of {formatCount(card.impressionStep)}
          </dd>
        </div>
        <div className="border-t border-sand pt-3">
          <dt className="text-xs text-ink-faint">Campaign length</dt>
          <dd className="mt-1 font-medium tabular-nums text-ink">
            Up to {card.maxCampaignDays} days, starting at least {card.minLeadDays} {card.minLeadDays === 1 ? "day" : "days"} ahead
          </dd>
        </div>
      </dl>

      <div className="mt-6 grid gap-4 text-sm leading-relaxed text-ink-muted lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <p className="text-pretty">
          A viewable impression means at least half of the ad was on screen for one full second. {taxNote} These prices apply to every advertiser,
          including every party and candidate
          {card.effectiveFrom ? <>, and have been in force since <span className="tabular-nums">{formatDate(card.effectiveFrom)}</span></> : null}.
        </p>
        {ex && (
          <p className="rounded-xl border border-sand bg-cream/60 px-4 py-3 text-pretty">
            <span className="font-semibold text-ink">Example.</span> {formatCount(ex.impressions)} views on the {ex.placement.name.toLowerCase()} cost{" "}
            <span className="tabular-nums">{formatGhs(ex.net)}</span>
            {ex.tax > 0 && <> plus <span className="tabular-nums">{formatGhs(ex.tax)}</span> tax</>}, so{" "}
            <span className="font-semibold tabular-nums text-ink">{formatGhs(ex.total)}</span> in total.
          </p>
        )}
      </div>
    </div>
  );
}
