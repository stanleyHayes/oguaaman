import { useState } from "react";
import { Link, useLoaderData } from "react-router-dom";
import { usePageTitle } from "@/lib/use-page-title";
import type { LostFound, LostFoundKind } from "@/lib/types";
import { api } from "@/lib/api";
import { PageHero } from "@/components/page-hero";
import { Thumb } from "@/components/cards";
import { Container, CTA as Cta, SampleNote } from "@/components/ui";
import { SectionIcon } from "@/components/section-icon";
import { formatDate, initials } from "@/lib/format";
import { LayoutPill, StaggerItem } from "@/components/motion";
import { EmptyState, EmptyGlyph } from "@/components/empty-state";
import { SAMPLE_NOTICE } from "@/lib/content";
import { LOST_FOUND_KINDS, KIND_LABEL, LF_STATUS_CLASS, LF_STATUS_LABEL } from "@/lib/lostfound";

export async function loader() {
  return api.lostFoundList();
}

export function Component() {
  const all = useLoaderData() as LostFound[];
  usePageTitle("Lost & Found");
  const [kind, setKind] = useState<LostFoundKind>("lost_item");
  const shown = all.filter((notice) => notice.details.kind === kind);
  const openCount = all.filter((notice) => notice.details.lfStatus === "open").length;
  const reunitedCount = all.filter((notice) => notice.details.lfStatus === "reunited").length;
  const countFor = (value: LostFoundKind) => all.filter((notice) => notice.details.kind === value).length;

  return (
    <>
      <PageHero
        tone="teal"
        kicker="Neighbour-to-neighbour recovery"
        title="Lost & Found"
        symbol="crab"
        lede="A live community board for missing people, misplaced belongings and found items. Notices publish immediately because the right neighbour may already have the answer."
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Cta to="/lost-found/new" variant="primary">Post a notice <span aria-hidden>→</span></Cta>
          <p className="max-w-md text-sm leading-relaxed text-ink-muted">When something comes home, update the notice so everyone knows the search can end.</p>
        </div>
      </PageHero>

      <Container size="wide" className="py-10 sm:py-12">
        <section aria-label="Lost and found overview" className="grid overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)] sm:grid-cols-3">
          <BoardMetric value={openCount} label="Open searches" tone="text-gold-text" />
          <BoardMetric value={countFor("missing_person")} label="Missing people" tone="text-maroon-text" />
          <BoardMetric value={reunitedCount} label="Reunited" tone="text-teal-text" />
        </section>

        <section className="mt-10" aria-labelledby="notice-board-title">
          <div className="flex flex-col gap-5 border-b border-sand pb-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="eyebrow text-teal-text">Community notice board</p>
              <h2 id="notice-board-title" className="mt-2 text-3xl font-semibold text-ink">Help bring it home</h2>
              <p className="mt-2 text-sm text-ink-muted" aria-live="polite">
                {shown.length} {shown.length === 1 ? "notice" : "notices"} in {KIND_LABEL[kind].toLowerCase()}.
              </p>
            </div>

            <div className="flex max-w-full gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter notices by type">
              {LOST_FOUND_KINDS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={kind === item.value}
                  onClick={() => setKind(item.value)}
                  className={`relative shrink-0 overflow-hidden rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${kind === item.value ? "border-green text-on-green" : "border-sand bg-cream text-ink-muted hover:border-green/40 hover:text-ink"}`}
                >
                  {kind === item.value && <LayoutPill layoutId="lf-kind" className="absolute inset-0 rounded-full bg-green" />}
                  <span className="relative">{item.label} <span className="opacity-65">{countFor(item.value)}</span></span>
                </button>
              ))}
            </div>
          </div>

          <div id="lost-found-results" className="pt-8">
            {shown.length === 0 ? (
              <EmptyState icon={<EmptyGlyph name="search" />} title="Nothing posted here" description="There are no notices of this type right now." />
            ) : (
              <div className="grid items-start gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {shown.map((notice, index) => (
                  <StaggerItem key={notice.id} index={index} lift>
                    <NoticeCard notice={notice} />
                  </StaggerItem>
                ))}
              </div>
            )}
          </div>
        </section>
        <SampleNote>{SAMPLE_NOTICE}</SampleNote>
      </Container>
    </>
  );
}

function BoardMetric({ value, label, tone }: Readonly<{ value: number; label: string; tone: string }>) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-sand px-5 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <span className="text-sm text-ink-muted">{label}</span>
      <strong className={`text-3xl font-semibold leading-none ${tone}`}>{value}</strong>
    </div>
  );
}

function NoticeCard({ notice }: Readonly<{ notice: LostFound }>) {
  const details = notice.details;
  const missing = details.kind === "missing_person";
  let seenLabel = "Found";
  if (missing) seenLabel = "Last seen";
  else if (details.kind === "lost_item") seenLabel = "Lost";

  return (
    <Link
      to={`/lost-found/${notice.slug}`}
      className={`group block overflow-hidden rounded-[var(--radius-card)] border bg-cream shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)] ${missing ? "border-maroon-900/35 hover:border-maroon-900/60" : "border-sand hover:border-teal/50"}`}
    >
      <article>
        <div className="relative">
          <Thumb
            seed={notice.slug}
            label={initials(notice.title)}
            src={notice.coverImageUrl}
            rounded="rounded-none"
            className="aspect-[4/3] w-full"
            coverWidth={640}
          />
          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold shadow-sm backdrop-blur-sm ${missing ? "border-maroon-900/30 bg-maroon-900 text-on-green" : "border-cream/30 bg-green/90 text-on-green"}`}>
              {KIND_LABEL[details.kind] ?? details.kind}
            </span>
            <span className={`rounded-full border bg-cream/95 px-3 py-1 text-xs font-semibold shadow-sm backdrop-blur-sm ${LF_STATUS_CLASS[details.lfStatus]}`}>
              {LF_STATUS_LABEL[details.lfStatus] ?? details.lfStatus}
            </span>
          </div>
          {!notice.coverImageUrl && (
            <span className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full border border-cream/25 bg-green/80 text-cream backdrop-blur-sm">
              <SectionIcon id="lostfound" className="h-5 w-5" />
            </span>
          )}
        </div>

        <div className="p-5">
          <h3 className={`text-xl font-semibold leading-tight text-ink transition-colors ${missing ? "group-hover:text-maroon-text" : "group-hover:text-teal-text"}`}>{notice.title}</h3>
          {details.lastSeenLocation && (
            <p className="mt-2 text-sm font-medium text-ink-muted">
              {seenLabel} at {details.lastSeenLocation}{details.lastSeenDate ? ` · ${formatDate(details.lastSeenDate)}` : ""}
            </p>
          )}
          {details.description && <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-faint">{details.description}</p>}
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-sand pt-3 text-xs text-ink-faint">
            <span>Posted {formatDate(notice.createdAt)}</span>
            <span className={`font-semibold transition-transform group-hover:translate-x-0.5 ${missing ? "text-maroon-text" : "text-teal-text"}`}>View notice <span aria-hidden>→</span></span>
          </div>
        </div>
      </article>
    </Link>
  );
}
