import { useState, type SubmitEvent } from "react";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router-dom";
import { usePageTitle } from "@/lib/use-page-title";
import type { ReactNode } from "react";
import type { LostFound, LostFoundStatus, Place } from "@/lib/types";
import { api } from "@/lib/api";
import { useRecordView } from "@/lib/use-record-view";
import { useAuth } from "@/lib/auth";
import { Container, Pill } from "@/components/ui";
import { Thumb } from "@/components/cards";
import { LocationMap } from "@/components/location-map";
import { DetailHero } from "@/components/detail-hero";
import { SectionIcon } from "@/components/section-icon";
import { ReportButton } from "@/components/report-button";
import { EmergencyCallout } from "@/components/emergency-callout";
import { formatDate, initials } from "@/lib/format";
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

      {(missing || notice.held || notice.status === "pending") && (
        <Container size="wide" className="space-y-4 pt-8">
          {missing && <EmergencyCallout />}
          {(notice.held || notice.status === "pending") && (
            <p role="status" className="rounded-[var(--radius-card)] border border-gold-border/50 bg-gold/[0.08] px-5 py-3 text-sm text-gold-text">
              <strong className="font-semibold">Sent to curators for review.</strong> Only you and Oguaa&rsquo;s safety curators can see this notice until a curator publishes it.
            </p>
          )}
        </Container>
      )}
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
              {details.contact ? (
                // Only the poster and safety staff receive the contact (D3).
                <>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Contact on this notice (private)</p>
                  <p className="mt-2 break-all rounded-xl border border-sand bg-paper px-4 py-3 text-sm text-ink">{details.contact}</p>
                  <p className="mt-1.5 text-xs text-ink-faint">Never shown publicly. People with information message you through Oguaa.</p>
                </>
              ) : (
                <ContactPoster slug={notice.slug} missing={missing} open={lfStatus === "open"} signedIn={member != null} />
              )}
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

/**
 * Message the poster through Oguaa (POST /api/lost-found/{slug}/contact). The
 * poster's own number is never shown to the public.
 */
function ContactPoster({ slug, missing, open, signedIn }: Readonly<{ slug: string; missing: boolean; open: boolean; signedIn: boolean }>) {
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const btnCls = `inline-flex w-full items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition-colors disabled:opacity-60 ${missing ? "bg-maroon-900 text-on-green hover:bg-clay" : "bg-teal text-cream hover:bg-teal-text"}`;

  if (!open) return null;
  if (!signedIn) {
    return (
      <>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Have useful information?</p>
        <Link to={`/signin?next=${encodeURIComponent(`/lost-found/${slug}`)}`} className={`mt-2 ${btnCls}`}>Sign in to message the poster</Link>
      </>
    );
  }
  if (state === "sent") {
    return <p role="status" className="rounded-xl border border-green/30 bg-green/[0.06] px-4 py-3 text-sm text-green-text">Message sent. The poster will see it in their Oguaa notifications. They can only reach you using any contact details you included.</p>;
  }

  async function send(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("sending");
    setError(null);
    try {
      await api.contactLostFound(slug, message.trim());
      setState("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send your message — please try again.");
      setState("idle");
    }
  }

  return (
    <form onSubmit={send} className="space-y-2">
      <label htmlFor="lf-message" className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Have useful information?</label>
      <textarea
        id="lf-message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        required
        maxLength={1000}
        rows={3}
        placeholder="Tell the poster what you know."
        className="w-full rounded-lg border border-sand bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-green focus:outline-none"
      />
      <p className="text-xs text-ink-faint">Sent to the poster through Oguaa with your name. They can&rsquo;t reply through Oguaa, so add how to reach you if you want them to get back to you.</p>
      {error && <p role="alert" className="text-sm text-maroon-text">{error}</p>}
      <button type="submit" disabled={state === "sending" || !message.trim()} className={btnCls}>
        {state === "sending" ? "Sending…" : "Message the poster"}
      </button>
    </form>
  );
}
