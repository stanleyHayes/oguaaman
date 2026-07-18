import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router-dom";
import { usePageTitle } from "@/lib/use-page-title";
import type { ReactNode } from "react";
import type { Incident, IncidentStatusEntry, Place } from "@/lib/types";
import { api } from "@/lib/api";
import { useRecordView } from "@/lib/use-record-view";
import { Container, Pill, SampleNote } from "@/components/ui";
import { LocationMap } from "@/components/location-map";
import { DetailHero } from "@/components/detail-hero";
import { SectionIcon } from "@/components/section-icon";
import { ReportButton } from "@/components/report-button";
import { formatDate } from "@/lib/format";
import { SAMPLE_NOTICE } from "@/lib/content";
import { CATEGORY_LABEL, STATUS_LABEL } from "@/lib/incidents";

interface Data {
  incident: Incident;
  places: Place[];
}

export async function loader({ params }: LoaderFunctionArgs): Promise<Data> {
  const [incident, places] = await Promise.all([
    api.incident(params.slug!),
    api.places().catch(() => []),
  ]);
  return { incident, places };
}

export function Component() {
  const { incident, places } = useLoaderData() as Data;
  usePageTitle(incident.title);
  useRecordView(incident.id);
  const details = incident.details;
  const town = places.find((place) => place.id === incident.townId);
  const history = (details.statusHistory ?? []).slice().sort((a, b) => a.at.localeCompare(b.at));
  const closed = details.incidentStatus === "resolved" || details.incidentStatus === "recovered";

  return (
    <>
      <DetailHero
        tone="gold"
        backTo="/safety"
        backLabel="Safety"
        sectionId="safety"
        title={incident.title}
        meta={
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>⌖ {details.location}</span>
            <span className="text-cream/40" aria-hidden>•</span>
            <span>Reported {formatDate(incident.createdAt)}</span>
          </p>
        }
      >
        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold capitalize ${heroSeverity(details.severity)}`}>
          {details.severity} severity
        </span>
        <span className="rounded-full border border-cream/25 bg-cream/10 px-3 py-1 text-xs font-medium text-cream backdrop-blur-sm">
          {CATEGORY_LABEL[details.category] ?? details.category}
        </span>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${closed ? "bg-teal text-cream" : "bg-gold-brand text-green-900"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${closed ? "bg-cream" : "bg-green-900"}`} aria-hidden />
          {STATUS_LABEL[details.incidentStatus] ?? details.incidentStatus}
        </span>
        {town && <span className="rounded-full border border-cream/25 bg-cream/10 px-3 py-1 text-xs font-medium text-cream backdrop-blur-sm">{town.name}</span>}
      </DetailHero>

      <Container size="wide" className="grid gap-8 py-10 sm:py-12 lg:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.85fr)] lg:gap-10">
        <div>
          <section className="overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)]">
            <div className={`flex items-center gap-3 border-b border-sand px-5 py-4 ${closed ? "bg-green/[0.05]" : "bg-maroon-900/[0.04]"}`}>
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${closed ? "bg-green/[0.09] text-green-text" : "bg-maroon-900/[0.08] text-maroon-text"}`}>
                <SectionIcon id="safety" className="h-5 w-5" />
              </span>
              <div>
                <p className="eyebrow text-ink-faint">Community report</p>
                <p className="text-sm font-semibold text-ink">{responseCopy(details.incidentStatus)}</p>
              </div>
            </div>
            <div className="p-5 sm:p-7">
              <h2 className="text-2xl font-semibold text-ink">What was reported</h2>
              {details.description ? (
                <p className="mt-4 whitespace-pre-line text-lg leading-relaxed text-ink-muted">{details.description}</p>
              ) : (
                <p className="mt-4 text-sm text-ink-faint">No additional description accompanied this report.</p>
              )}
              {incident.tags.length > 0 && (
                <div className="mt-6 flex flex-wrap gap-2">
                  {incident.tags.map((tag) => <Pill key={tag} tone="clay">#{tag}</Pill>)}
                </div>
              )}
            </div>
          </section>

          <section className="mt-10" aria-labelledby="incident-timeline">
            <div className="flex items-end justify-between gap-4 border-b border-sand pb-4">
              <div>
                <p className="eyebrow text-gold-text">Response log</p>
                <h2 id="incident-timeline" className="mt-2 text-3xl font-semibold text-ink">Status timeline</h2>
              </div>
              <span className="rounded-full bg-sand px-3 py-1 text-xs font-semibold text-ink-muted">{history.length} {history.length === 1 ? "update" : "updates"}</span>
            </div>

            {history.length > 0 ? (
              <ol className="mt-6 space-y-3">
                {history.map((entry, index) => (
                  <TimelineEntry key={`${entry.status}-${entry.at}`} entry={entry} latest={index === history.length - 1} index={index + 1} />
                ))}
              </ol>
            ) : (
              <div className="mt-6 rounded-[var(--radius-card)] border border-dashed border-sand bg-cream px-5 py-6 text-sm text-ink-muted">
                This report is awaiting its first response update. Its current status is <strong className="text-ink">{STATUS_LABEL[details.incidentStatus]}</strong>.
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-[var(--radius-card)] border border-sand bg-cream p-5 shadow-[var(--shadow-card)] lg:sticky lg:top-24">
            <p className="eyebrow text-maroon-text">Incident details</p>
            <dl className="mt-4 divide-y divide-sand">
              <KeyVal label="Current status">{STATUS_LABEL[details.incidentStatus] ?? details.incidentStatus}</KeyVal>
              <KeyVal label="Category">{CATEGORY_LABEL[details.category] ?? details.category}</KeyVal>
              <KeyVal label="Severity"><span className="capitalize">{details.severity}</span></KeyVal>
              <KeyVal label="Location">{details.location}</KeyVal>
              {town && <KeyVal label="Area">{town.name}</KeyVal>}
              {details.contact && <KeyVal label="Reporter contact">{details.contact}</KeyVal>}
              <KeyVal label="Reported">{formatDate(incident.createdAt)}</KeyVal>
            </dl>
            <div className="mt-5 grid gap-2">
              <Link to="/safety/report" className="inline-flex items-center justify-center rounded-full bg-maroon-900 px-5 py-2.5 text-sm font-semibold text-on-green transition-colors hover:bg-clay">
                Report another incident
              </Link>
              <Link to="/safety" className="inline-flex items-center justify-center rounded-full border border-sand px-5 py-2.5 text-sm font-semibold text-ink-muted transition-colors hover:border-green/40 hover:text-ink">
                <span aria-hidden>←</span> All safety reports
              </Link>
            </div>
            <div className="mt-5 border-t border-sand pt-4">
              <ReportButton listingId={incident.id} />
            </div>
          </section>

          {details.location && <LocationMap address={details.location} query={`${incident.title} ${details.location}`} />}
        </aside>
      </Container>

      <Container size="wide" className="pb-12">
        <p className="border-t border-sand pt-5 text-sm text-ink-faint">Curators verify this report and record each response milestone as it happens.</p>
        <SampleNote>{SAMPLE_NOTICE}</SampleNote>
      </Container>
    </>
  );
}

function TimelineEntry({ entry, latest, index }: Readonly<{ entry: IncidentStatusEntry; latest: boolean; index: number }>) {
  return (
    <li className={`grid gap-4 rounded-[var(--radius-card)] border p-4 sm:grid-cols-[3rem_1fr_auto] sm:items-start ${latest ? "border-gold-border/50 bg-gold/[0.06]" : "border-sand bg-cream"}`}>
      <span className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ${latest ? "bg-gold-brand text-green-900" : "bg-green/[0.08] text-green-text"}`} aria-hidden>{String(index).padStart(2, "0")}</span>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-ink">{STATUS_LABEL[entry.status] ?? entry.status}</h3>
          {latest && <span className="rounded-full bg-gold/[0.18] px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-gold-text">Latest</span>}
        </div>
        {entry.note && <p className="mt-1 text-sm leading-relaxed text-ink-muted">{entry.note}</p>}
        <p className="mt-2 text-xs text-ink-faint">Updated by {entry.by}</p>
      </div>
      <time dateTime={entry.at} className="text-xs text-ink-faint sm:text-right">
        {formatDate(entry.at)}{entry.at.includes("T") ? <span className="block">{entry.at.slice(11, 16)} GMT</span> : null}
      </time>
    </li>
  );
}

function KeyVal({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[7.5rem_1fr]">
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="text-sm text-ink sm:text-right">{children}</dd>
    </div>
  );
}

function responseCopy(status: Incident["details"]["incidentStatus"]) {
  if (status === "reported") return "Reported to the community; verification is pending.";
  if (status === "verified") return "Verified by a curator and ready for coordinated response.";
  if (status === "responding") return "A response is underway. Follow the log for updates.";
  if (status === "resolved") return "The immediate incident has been resolved.";
  return "Recovery has been recorded and this incident is now closed.";
}

function heroSeverity(severity: Incident["details"]["severity"]) {
  if (severity === "critical") return "border-maroon-900 bg-maroon-900 text-on-green";
  if (severity === "high") return "border-clay bg-clay text-on-green";
  if (severity === "medium") return "border-gold-brand bg-gold-brand text-green-900";
  return "border-teal bg-teal text-cream";
}
