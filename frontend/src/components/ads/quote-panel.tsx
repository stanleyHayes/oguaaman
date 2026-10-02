import { adErrorMessage, apiErrorLatestEnd, apiErrorNumber, daysInclusive, formatBps, formatCount, formatGhs, shortDate } from "@/lib/ads";
import type { QuoteState } from "@/lib/use-ad-quote";
import type { AdDraft } from "@/lib/ad-draft";
import type { AdRateCard, AdRateCardPlacement } from "@/lib/types";
import { Skeleton } from "@/components/skeleton";

type Props = Readonly<{
  card: AdRateCard;
  draft: AdDraft;
  placement?: AdRateCardPlacement;
  state: QuoteState;
  /** Offer to use the largest order that fits (inventory_unavailable). */
  onUseMax?: (n: number) => void;
}>;

function Row({ label, value, strong = false }: Readonly<{ label: string; value: string; strong?: boolean }>) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={strong ? "font-semibold text-ink" : "text-ink-muted"}>{label}</dt>
      <dd className={`shrink-0 whitespace-nowrap tabular-nums ${strong ? "text-xl font-semibold tracking-tight text-ink" : "text-ink"}`}>{value}</dd>
    </div>
  );
}

/** Why there is no price yet, or what went wrong pricing it. */
function QuoteProblem({ state, card, onUseMax }: Readonly<{ state: QuoteState; card: AdRateCard; onUseMax?: (n: number) => void }>) {
  const max = apiErrorNumber(state.error, "maxAvailable");
  const min = apiErrorNumber(state.error, "minOrderPesewas") ?? card.minOrderPesewas;
  const latest = apiErrorLatestEnd(state.error);
  const code = (state.error as { data?: { error?: string } } | null)?.data?.error;
  let detail: string | null = null;
  if (code === "below_minimum_order") detail = `The smallest order is ${formatGhs(min)} in total.`;
  if (latest) detail = `The latest end date is ${shortDate(latest)}.`;
  return (
    <div role="status" className="rounded-lg border border-clay/30 bg-clay/[0.06] px-3.5 py-3 text-sm text-clay-text">
      <p>{adErrorMessage(state.error, "We couldn't price that. Try again.")}</p>
      {detail && <p className="mt-1">{detail}</p>}
      {max !== undefined && max > 0 && onUseMax && (
        <button type="button" onClick={() => onUseMax(max)} className="mt-2 inline-flex min-h-11 items-center rounded-full border border-clay/40 px-4 text-xs font-semibold tabular-nums transition-[background-color,transform] hover:bg-clay/[0.08] active:scale-[0.98]">
          Use {formatCount(max)} impressions
        </button>
      )}
    </div>
  );
}

function QuoteBody({ card, draft, placement, state, onUseMax }: Props) {
  const cpm = placement ? (draft.political ? placement.politicalCpmPesewas : placement.cpmPesewas) : 0;
  const days = daysInclusive(draft.startDate, draft.endDate);
  const q = state.quote;

  if (!placement) {
    return <p className="text-sm leading-relaxed text-ink-muted">Choose a placement to see its price. Every advertiser pays the same published rate.</p>;
  }

  return (
    <div className="space-y-4 text-sm">
      <dl className="space-y-2">
        <Row label="Placement" value={placement.name} />
        <Row label="Rate" value={`${formatGhs(cpm)} per 1,000`} />
        {days > 0 && <Row label="Dates" value={`${shortDate(draft.startDate)} – ${shortDate(draft.endDate)}`} />}
        {days > 0 && <Row label="Length" value={`${days} ${days === 1 ? "day" : "days"}`} />}
        <Row label="Viewable impressions" value={formatCount(draft.impressions)} />
      </dl>

      {state.error ? (
        <QuoteProblem state={state} card={card} onUseMax={onUseMax} />
      ) : (
        <div className={`border-t border-sand pt-4 transition-opacity duration-200 ${state.loading ? "opacity-55" : ""}`} aria-busy={state.loading}>
          {q ? (
            <>
              <dl className="space-y-2">
                <Row label="Net" value={formatGhs(q.price.netPesewas)} />
                <Row label={q.price.taxRateBps > 0 ? `${card.taxLabel} (${formatBps(q.price.taxRateBps)})` : "Tax"} value={formatGhs(q.price.taxPesewas)} />
              </dl>
              <dl className="mt-3 border-t border-dashed border-sand pt-3">
                <Row label="Total" value={formatGhs(q.price.totalPesewas)} strong />
              </dl>
              <p className="mt-3 text-xs leading-relaxed text-ink-faint">
                {formatCount(q.available)} impressions are free on these dates.
                {q.latestEndDate && <> Political ads for this election must end by {shortDate(q.latestEndDate)}.</>}
              </p>
            </>
          ) : (
            <div className="space-y-2" aria-hidden>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="mt-3 h-6 w-2/3" />
            </div>
          )}
        </div>
      )}
      <p className="text-xs leading-relaxed text-ink-faint">You pay only after a reviewer approves the ad. The price is locked when you send it for review.</p>
    </div>
  );
}

/** The live quote beside the wizard (sticky on wide screens). */
export function QuotePanel(props: Props) {
  return (
    <section aria-labelledby="quote-heading" aria-live="polite" className="relative overflow-hidden rounded-[var(--radius-card)] border border-sand bg-paper p-5 shadow-[var(--shadow-card)]">
      <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-gold-brand via-gold to-gold-brand/40" />
      <p className="eyebrow text-gold-text">Live quote</p>
      <h2 id="quote-heading" className="mt-1 text-lg font-semibold text-ink">Your price</h2>
      <div className="mt-4">
        <QuoteBody {...props} />
      </div>
    </section>
  );
}

/** The same quote as a collapsible summary for phones. */
export function QuoteSummary(props: Props) {
  const total = props.state.quote && !props.state.error ? formatGhs(props.state.quote.price.totalPesewas) : null;
  return (
    <details className="group rounded-[var(--radius-card)] border border-sand bg-paper shadow-[var(--shadow-card)]">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="text-sm font-semibold text-ink">Your price</span>
        <span className="flex items-center gap-2 text-sm">
          <span className={`tabular-nums ${total ? "font-semibold text-ink" : "text-ink-faint"}`}>{total ?? "Not priced yet"}</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-gold-brand transition-transform duration-200 group-open:rotate-180" aria-hidden>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </summary>
      <div className="border-t border-sand px-4 py-4">
        <QuoteBody {...props} />
      </div>
    </details>
  );
}
