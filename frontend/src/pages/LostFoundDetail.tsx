import { useState } from "react";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router-dom";
import { usePageTitle } from "@/lib/use-page-title";
import type { ReactNode } from "react";
import type { LostFound, LostFoundStatus, Place } from "@/lib/types";
import { api } from "@/lib/api";
import { useRecordView } from "@/lib/use-record-view";
import { useAuth } from "@/lib/auth";
import { Container, Pill, SampleNote } from "@/components/ui";
import { Thumb } from "@/components/cards";
import { LocationMap } from "@/components/location-map";
import { DetailHero } from "@/components/detail-hero";
import { SectionIcon } from "@/components/section-icon";
import { ReportButton } from "@/components/report-button";
import { formatDate, initials } from "@/lib/format";
import { SAMPLE_NOTICE } from "@/lib/content";
import { KIND_LABEL, LF_STATUS_LABEL } from "@/lib/lostfound";

interface Data {
  notice: LostFound;
  places: Place[];
}

export async function loader({ params }: LoaderFunctionArgs): Promise<Data> {
  const [notice, places] = await Promise.all([
    api.lostFound(params.slug!),
    api.places().catch(() => []),
  ]);
  return { notice, places };
}

export function Component() {
  const { notice, places } = useLoaderData() as Data;
  usePageTitle(notice.title);
  useRecordView(notice.id);
  const { member } = useAuth();
  const [lfStatus, setLfStatus] = useState<LostFoundStatus>(notice.details.lfStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const details = notice.details;
  const missing = details.kind === "missing_person";
  const town = places.find((place) => place.id === notice.townId);
  const isOwner = member?.id === notice.ownerId;
  const canResolve = isOwner || member?.role === "curator" || member?.role === "steward";
  const contactLink = contactHref(details.contact);
  let seenLabel = "Found at";
  if (missing) seenLabel = "Last seen at";
  else if (details.kind === "lost_item") seenLabel = "Lost at";

  async function resolve(status: LostFoundStatus) {
    setBusy(true);
    setError(null);
    try {
      await api.resolveLostFound(notice.slug, status);
      setLfStatus(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the notice — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DetailHero
        tone={missing ? "gold" : "teal"}
        backTo="/lost-found"
        backLabel="Lost & Found"
        sectionId="lostfound"
        title={notice.title}
        meta={
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {details.lastSeenLocation && <span>⌖ {seenLabel} {details.lastSeenLocation}</span>}
            {details.lastSeenLocation && <span className="text-cream/40" aria-hidden>•</span>}
            <span>Posted {formatDate(notice.createdAt)}</span>
          </p>
        }
      >
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${missing ? "bg-maroon-900 text-on-green" : "bg-teal text-cream"}`}>
          {KIND_LABEL[details.kind] ?? details.kind}
        </span>
        <span className="rounded-full border border-cream bg-cream px-3 py-1 text-xs font-semibold text-green-900">
          {LF_STATUS_LABEL[lfStatus] ?? lfStatus}
        </span>
        {town && <span className="rounded-full border border-cream/25 bg-cream/10 px-3 py-1 text-xs font-medium text-cream backdrop-blur-sm">{town.name}</span>}
      </DetailHero>

      <Container size="wide" className="grid gap-8 py-10 sm:py-12 lg:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.85fr)] lg:gap-10">
        <div>
          <div className={`overflow-hidden rounded-[var(--radius-card)] border bg-cream shadow-[var(--shadow-card)] ${missing ? "border-maroon-900/30" : "border-sand"}`}>
            <div className="relative">
              <Thumb
                seed={notice.slug}
                label={initials(notice.title)}
                src={notice.coverImageUrl}
                rounded="rounded-none"
                className="aspect-[16/10] w-full max-h-[34rem]"
                coverWidth={960}
              />
              {!notice.coverImageUrl && (
                <span className="absolute bottom-4 right-4 flex h-12 w-12 items-center justify-center rounded-full border border-cream/25 bg-green/80 text-cream backdrop-blur-sm">
                  <SectionIcon id="lostfound" className="h-6 w-6" />
                </span>
              )}
              {missing && lfStatus === "open" && (
                <span className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-maroon-900 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-on-green shadow-lg">
                  <span className="h-2 w-2 rounded-full bg-gold" aria-hidden /> Active search
                </span>
              )}
            </div>

            <section className="p-5 sm:p-7" aria-labelledby="notice-description">
              <p className={`eyebrow ${missing ? "text-maroon-text" : "text-teal-text"}`}>Notice details</p>
              <h2 id="notice-description" className="mt-2 text-3xl font-semibold text-ink">What to look for</h2>
              <p className="mt-4 whitespace-pre-line text-lg leading-relaxed text-ink-muted">{details.description}</p>
              {notice.tags.length > 0 && (
                <div className="mt-6 flex flex-wrap gap-2">
                  {notice.tags.map((tag) => <Pill key={tag} tone={missing ? "clay" : "teal"}>#{tag}</Pill>)}
                </div>
              )}
            </section>
          </div>

          {details.lastSeenLocation && (
            <section className="mt-8" aria-labelledby="notice-location">
              <div className="mb-4">
                <p className="eyebrow text-gold-text">Search area</p>
                <h2 id="notice-location" className="mt-2 text-2xl font-semibold text-ink">{seenLabel} {details.lastSeenLocation}</h2>
              </div>
              <LocationMap address={details.lastSeenLocation} query={`${notice.title} ${details.lastSeenLocation}`} />
            </section>
          )}
        </div>

        <aside className="space-y-5">
          <section className={`rounded-[var(--radius-card)] border bg-cream p-5 shadow-[var(--shadow-card)] lg:sticky lg:top-24 ${missing ? "border-maroon-900/25" : "border-sand"}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className={`eyebrow ${missing ? "text-maroon-text" : "text-teal-text"}`}>At a glance</p>
                <h2 className="mt-2 text-xl font-semibold text-ink">{LF_STATUS_LABEL[lfStatus] ?? lfStatus}</h2>
              </div>
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${missing ? "bg-maroon-900/[0.08] text-maroon-text" : "bg-teal/[0.09] text-teal-text"}`}>
                <SectionIcon id="lostfound" className="h-5 w-5" />
              </span>
            </div>

            <dl className="mt-4 divide-y divide-sand border-y border-sand">
              <KeyVal label="Notice">{KIND_LABEL[details.kind] ?? details.kind}</KeyVal>
              {details.lastSeenLocation && <KeyVal label={seenLabel}>{details.lastSeenLocation}</KeyVal>}
              {details.lastSeenDate && <KeyVal label="When">{formatDate(details.lastSeenDate)}</KeyVal>}
              {town && <KeyVal label="Area">{town.name}</KeyVal>}
              <KeyVal label="Posted">{formatDate(notice.createdAt)}</KeyVal>
            </dl>

            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Have useful information?</p>
              {contactLink ? (
                <a href={contactLink} className={`mt-2 inline-flex w-full items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition-colors ${missing ? "bg-maroon-900 text-on-green hover:bg-clay" : "bg-teal text-cream hover:bg-teal-text"}`}>
                  Contact the poster <span className="ml-2" aria-hidden>↗</span>
                </a>
              ) : (
                <p className={`mt-2 rounded-xl border px-4 py-3 text-sm font-semibold ${missing ? "border-maroon-900/25 bg-maroon-900/[0.05] text-maroon-text" : "border-teal/25 bg-teal/[0.06] text-teal-text"}`}>{details.contact}</p>
              )}
              {contactLink && <p className="mt-2 break-all text-center text-xs text-ink-faint">{details.contact}</p>}
            </div>

            {canResolve && lfStatus === "open" && (
              <div className="mt-5 border-t border-sand pt-5">
                <h2 className="text-lg font-semibold text-ink">Resolve this notice</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
                  {missing ? "Found them safe? Mark this reunited so the community search can stand down." : "Back with its owner? Mark it reunited, or close the notice if the search has ended."}
                </p>
                <div className="mt-4 grid gap-2">
                  <button type="button" disabled={busy} onClick={() => resolve("reunited")} className="rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-on-green transition-colors hover:bg-green-900 disabled:opacity-60">
                    {busy ? "Updating…" : "Mark as reunited"}
                  </button>
                  <button type="button" disabled={busy} onClick={() => resolve("closed")} className="rounded-full border border-sand px-5 py-2.5 text-sm font-semibold text-ink-muted transition-colors hover:border-green/40 hover:text-ink disabled:opacity-60">
                    Close notice
                  </button>
                </div>
                {error && <p role="alert" className="mt-3 text-sm text-maroon-text">{error}</p>}
              </div>
            )}

            {lfStatus === "reunited" && (
              <div className="mt-5 rounded-xl border border-green/30 bg-green/[0.06] p-4">
                <p className="font-semibold text-green-text">Reunited in Oguaa</p>
                <p className="mt-1 text-sm text-ink-muted">This notice has a happy ending. Thank you to everyone who helped.</p>
              </div>
            )}
          </section>
        </aside>
      </Container>

      <Container size="wide" className="pb-12">
        <div className="flex flex-col gap-4 border-t border-sand pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-faint">{isOwner ? "You posted this notice." : "Only its poster or a curator can change this notice's status."}</p>
          <div className="flex flex-wrap items-center gap-4">
            <ReportButton listingId={notice.id} />
            <Link to="/lost-found" className="text-sm font-semibold text-green-text hover:underline"><span aria-hidden>←</span> All notices</Link>
          </div>
        </div>
        <SampleNote>{SAMPLE_NOTICE}</SampleNote>
      </Container>
    </>
  );
}

function KeyVal({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[6.5rem_1fr]">
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="text-sm text-ink sm:text-right">{children}</dd>
    </div>
  );
}

function contactHref(contact: string) {
  const value = contact.trim();
  const email = value.match(/[^\s@]+@[^\s@]+\.[^\s@]+/)?.[0];
  if (email) return `mailto:${email}`;
  const phone = value.match(/\+?\d[\d()\s-]{5,}\d/)?.[0];
  if (phone) return `tel:${phone.replace(/[^+\d]/g, "")}`;
  return null;
}
