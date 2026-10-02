import { useEffect, useId, useState, type ReactNode, type SubmitEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PageHero } from "@/components/page-hero";
import { Container } from "@/components/ui";
import { Pagination } from "@/components/pagination";
import { EmptyState, EmptyGlyph } from "@/components/empty-state";
import { Skeleton } from "@/components/skeleton";
import { AdFrame } from "@/components/ad-slot";
import { ReportButton } from "@/components/report-button";
import { AdStatusTag } from "@/components/ads/fields";
import { buttonClass } from "@/components/ads/styles";
import { api } from "@/lib/api";
import { formatCount, formatGhs } from "@/lib/ads";
import { formatDate } from "@/lib/format";
import { LEGAL } from "@/lib/legal";
import type { AdLibraryItem, AdLibraryPage } from "@/lib/types";
import { usePageTitle } from "@/lib/use-page-title";
import { scrollBehavior } from "@/lib/use-media-query";

// /ads/library — the public register of ads (spec §3.10): every political ad
// that ran (kept for seven years, removed ones included, with the reason), and
// every ad running now. Each entry shows the creative as it ran, the sponsor,
// the dates, the views and the exact amount paid.

type Tab = "political" | "running";

const TABS: { id: Tab; label: string; blurb: string }[] = [
  { id: "political", label: "Political ads", blurb: "Every political and election ad that has run on Oguaa, kept for seven years." },
  { id: "running", label: "Running now", blurb: "Every ad live on Oguaa today, political or not." },
];

const PLACEMENT_NAME: Record<string, string> = {
  "portal-home-banner": "Portal home banner",
  "portal-feed-card": "Portal news and events lists",
  "portal-article-rect": "Beside news articles",
  "marketing-card": "oguaaman.com",
  "app-card": "Oguaa app",
};

function Fact({ label, children, wide = false }: Readonly<{ label: string; children: ReactNode; wide?: boolean }>) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <dt className="text-[0.7rem] uppercase tracking-[0.12em] text-ink-faint">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{children}</dd>
    </div>
  );
}

/**
 * Whose ad it is, as the entry heading. Political entries carry the verified
 * legal name; commercial entries carry only the name readers saw on the ad
 * ("Sponsored · name"), so that is what the register shows.
 */
function sponsorName(item: AdLibraryItem, political: boolean): string {
  if (political && item.legalName) return item.legalName;
  return item.sponsorLine.replace(/^Sponsored\s*·\s*/u, "").trim() || item.sponsorLine;
}

function Entry({ item }: Readonly<{ item: AdLibraryItem }>) {
  const political = item.political || item.chip === "Political ad";
  const name = sponsorName(item, political);
  const ad = {
    format: item.format,
    imageUrl: item.imageUrl,
    imageUrlDesktop: item.imageUrlDesktop,
    imageUrlMobile: item.imageUrlMobile,
    headline: item.headline,
    body: item.body,
    alt: item.alt?.trim() || item.headline || `Ad by ${name}`,
    chip: item.chip,
    sponsorLine: item.sponsorLine,
    political,
    electionName: item.electionName,
    syntheticMedia: item.syntheticMedia,
  };
  const net = item.amountPaidPesewas - item.refundedPesewas;
  return (
    <article className="grid gap-6 border-b border-sand py-8 first:pt-2 last:border-0 md:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] md:gap-10">
      <div className={item.format === "rect" ? "max-w-[19rem]" : ""}>
        <AdFrame ad={ad} why="the page it ran on" preview bannerVariant={item.format === "banner" ? "mobile" : undefined} />
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <AdStatusTag status={item.status} />
          <span className="text-xs tabular-nums text-ink-faint">{formatDate(item.startDate)} – {formatDate(item.endDate)}</span>
        </div>
        <h2 className="mt-2 text-xl font-semibold tracking-[-0.01em] text-ink">{name}</h2>
        <p className="mt-0.5 text-sm text-ink-muted">{item.sponsorLine}</p>
        {item.status === "removed" && item.removalReason && (
          <p className="mt-3 rounded-lg border border-clay/25 bg-clay/[0.05] px-3 py-2 text-sm text-ink-muted">
            <span className="font-semibold text-clay-text">Removed by Oguaa:</span> {item.removalReason}
          </p>
        )}
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          {item.partyName && <Fact label="Party">{item.partyName}</Fact>}
          {item.candidateName && <Fact label="Candidate">{item.candidateName}</Fact>}
          {item.constituency && <Fact label="Constituency">{item.constituency}</Fact>}
          {item.electionName && <Fact label="Election" wide>{item.electionName}</Fact>}
          <Fact label="Where">{PLACEMENT_NAME[item.placement] ?? item.placement}</Fact>
          <Fact label="Views"><span className="tabular-nums">{formatCount(item.delivered)}</span></Fact>
          {/* Spend is public for political ads only. */}
          {political && <Fact label="Paid"><span className="font-semibold tabular-nums">{formatGhs(item.amountPaidPesewas)}</span></Fact>}
          {political && item.refundedPesewas > 0 && (
            <>
              <Fact label="Refunded"><span className="tabular-nums">{formatGhs(item.refundedPesewas)}</span></Fact>
              <Fact label="Net spend"><span className="tabular-nums">{formatGhs(net)}</span></Fact>
            </>
          )}
        </dl>
        {item.syntheticMedia && <p className="mt-4 text-xs text-ink-faint">The sponsor declared AI-generated or altered media in this ad.</p>}
      </div>
    </article>
  );
}

/** Campaign ids are short opaque tokens; anything else in ?report= is ignored. */
function reportTarget(raw: string | null): string | null {
  const id = raw?.trim() ?? "";
  return /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : null;
}

/**
 * Readers arrive here from "Report this ad" on oguaaman.com with ?report={id}.
 * The report form for that ad opens straight away; it works for any ad, not
 * only the political ones listed below.
 */
function ReportCallout({ id }: Readonly<{ id: string }>) {
  return (
    <section
      aria-labelledby="report-ad-heading"
      className="mb-8 flex flex-col gap-4 rounded-[var(--radius-card)] border border-clay/30 bg-clay/[0.05] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
    >
      <div className="min-w-0">
        <h2 id="report-ad-heading" className="text-lg font-semibold text-ink">Report the ad you saw</h2>
        <p className="mt-1 max-w-[58ch] text-pretty text-sm leading-relaxed text-ink-muted">
          Tell a steward what&rsquo;s wrong with it. We review every report within 24 hours.
        </p>
      </div>
      <ReportButton target={{ type: "ad", id }} label="Report this ad" defaultOpen triggerClassName={buttonClass("danger")} className="shrink-0 self-end sm:self-auto" />
    </section>
  );
}

function LoadingEntries() {
  return (
    <output aria-label="Loading the ad library" className="block divide-y divide-sand">
      {["a", "b", "c"].map((k) => (
        <div key={k} className="grid gap-6 py-8 md:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] md:gap-10">
          <Skeleton className="aspect-[1200/760] w-full rounded-md" />
          <div className="space-y-3">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <div className="grid grid-cols-3 gap-4 pt-3">
              <Skeleton className="h-9" /><Skeleton className="h-9" /><Skeleton className="h-9" />
            </div>
          </div>
        </div>
      ))}
    </output>
  );
}

export function Component() {
  usePageTitle("Ad library");
  const searchId = useId();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "running" ? "running" : "political";
  const q = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const reportId = reportTarget(params.get("report"));
  const key = `${tab}|${q}|${page}`;
  const [result, setResult] = useState<{ key: string; data: AdLibraryPage | null; failed: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [draftQ, setDraftQ] = useState(q);

  useEffect(() => {
    let alive = true;
    api.adLibrary({ tab, q, page })
      .then((data) => { if (alive) setResult({ key, data, failed: false }); })
      .catch(() => { if (alive) setResult({ key, data: null, failed: true }); });
    return () => { alive = false; };
  }, [key, tab, q, page, attempt]);

  const current = result?.key === key ? result : null;
  const data = current?.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / (data.perPage || 20))) : 1;

  function update(next: { tab?: Tab; q?: string; page?: number }) {
    const p = new URLSearchParams(params);
    const t = next.tab ?? tab;
    const query = next.q ?? q;
    p.set("tab", t);
    if (query) p.set("q", query);
    else p.delete("q");
    if ((next.page ?? 1) > 1) p.set("page", String(next.page));
    else p.delete("page");
    setParams(p, { replace: next.page === undefined });
  }

  function search(e: SubmitEvent) {
    e.preventDefault();
    update({ q: draftQ.trim(), page: 1 });
  }

  const blurb = TABS.find((t) => t.id === tab)?.blurb;

  return (
    <>
      <PageHero
        tone="gold"
        kicker="Transparency"
        title="Ad library"
        symbol="nkyinkyim"
        lede="A public record of the ads on Oguaa. Political ads show the sponsor’s legal name and the exact amount paid; ads running now show the advertiser’s name as readers saw it. Anyone can search it."
      />

      <Container size="wide" className="py-10 sm:py-12">
        {reportId && <ReportCallout id={reportId} />}
        <div className="flex flex-col gap-5 border-b border-sand pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div role="group" aria-label="Which ads" className="inline-flex w-fit rounded-full border border-sand bg-cream p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={tab === t.id}
                onClick={() => { setDraftQ(""); update({ tab: t.id, q: "", page: 1 }); }}
                className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold transition-[background-color,color,transform] duration-200 active:scale-[0.98] ${tab === t.id ? "bg-green text-on-green" : "text-ink-muted hover:text-ink"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <form role="search" onSubmit={search} className="flex w-full max-w-md gap-2">
            <label htmlFor={searchId} className="sr-only">Search by sponsor name</label>
            <input
              id={searchId}
              type="search"
              value={draftQ}
              onChange={(e) => setDraftQ(e.target.value)}
              placeholder="Search by sponsor name"
              className="min-h-11 w-full rounded-full border border-sand bg-paper px-4 text-sm text-ink placeholder:text-ink-faint focus:border-green focus:outline-none focus:ring-2 focus:ring-green/15"
            />
            <button type="submit" className="min-h-11 shrink-0 rounded-full bg-green px-5 text-sm font-semibold text-on-green transition-[background-color,transform] hover:bg-green-900 active:scale-[0.98]">Search</button>
          </form>
        </div>
        <p className="mt-4 max-w-[62ch] text-sm text-ink-muted">
          {blurb}{" "}
          {data && <span className="tabular-nums">{formatCount(data.total)} {data.total === 1 ? "entry" : "entries"}{q ? ` matching “${q}”` : ""}.</span>}
        </p>

        <section aria-live="polite" aria-busy={!current} className="mt-4">
          {!current && <LoadingEntries />}
          {current?.failed && (
            <div role="alert" className="my-10 rounded-[var(--radius-card)] border border-clay/30 bg-clay/[0.05] p-6">
              <p className="font-semibold text-ink">We couldn&rsquo;t load the Ad library.</p>
              <p className="mt-1 text-sm text-ink-muted">Check your connection and try again.</p>
              <button type="button" onClick={() => { setResult(null); setAttempt((n) => n + 1); }} className="mt-4 min-h-11 rounded-full bg-green px-5 text-sm font-semibold text-on-green hover:bg-green-900">Try again</button>
            </div>
          )}
          {data && data.items.length === 0 && (
            <EmptyState
              icon={<EmptyGlyph name="search" />}
              title={q ? "No sponsor by that name" : tab === "political" ? "No political ads yet" : "No ads are running right now"}
              description={q ? "Check the spelling, or search for part of the name." : "When ads run on Oguaa, they are listed here with their sponsor and the amount paid."}
            />
          )}
          {data && data.items.length > 0 && data.items.map((item) => <Entry key={item.id} item={item} />)}
        </section>
        {data && <Pagination page={page} totalPages={totalPages} onPageChange={(p) => { update({ page: p }); window.scrollTo({ top: 0, behavior: scrollBehavior() }); }} />}

        <aside className="mt-14 grid gap-4 rounded-[var(--radius-card)] border border-sand bg-cream/70 p-6 text-sm leading-relaxed text-ink-muted sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <p className="max-w-[64ch] text-pretty">
            Political sponsors are verified before their ads run, and the same rates apply to everyone. Amounts include any tax. Spot an ad that breaks the rules? Select the &#9432; on the ad, then &ldquo;Report this ad&rdquo;, or email hello@oguaaman.com.
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link to={LEGAL.advertising} className="font-semibold text-teal-text hover:underline">Advertising Policy</Link>
            <Link to="/advertise" className="font-semibold text-teal-text hover:underline">Advertise</Link>
          </div>
        </aside>
      </Container>
    </>
  );
}
