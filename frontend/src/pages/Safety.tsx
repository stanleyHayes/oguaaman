import { useState } from "react";
import { Link, useLoaderData } from "react-router-dom";
import { usePageTitle } from "@/lib/use-page-title";
import type { Incident, IncidentCategory } from "@/lib/types";
import { api } from "@/lib/api";
import { PageHero } from "@/components/page-hero";
import { Container, CTA as Cta, SampleNote } from "@/components/ui";
import { SectionIcon } from "@/components/section-icon";
import { formatDate } from "@/lib/format";
import { LayoutPill, StaggerItem } from "@/components/motion";
import { EmptyState, EmptyGlyph } from "@/components/empty-state";
import { SAMPLE_NOTICE } from "@/lib/content";
import { INCIDENT_CATEGORIES, CATEGORY_LABEL, SEVERITY_CLASS, STATUS_LABEL } from "@/lib/incidents";

export async function loader() {
  return api.incidents();
}

export function Component() {
  const all = useLoaderData() as Incident[];
  usePageTitle("Safety & Incidents");
  const [cat, setCat] = useState<IncidentCategory | null>(null);
  const shown = cat ? all.filter((incident) => incident.details.category === cat) : all;
  const open = shown.filter((incident) => !isClosed(incident));
  const closed = shown.filter(isClosed);
  const responding = all.filter((incident) => incident.details.incidentStatus === "responding").length;
  const critical = all.filter((incident) => incident.details.severity === "critical" && !isClosed(incident)).length;

  return (
    <>
      <PageHero
        tone="maroon"
        kicker="Community response desk"
        title="Safety in Oguaa"
        symbol="dwennimmen"
        lede="Live reports of floods, fires, accidents and hazards across Cape Coast — shared by neighbours, checked by curators and followed through to recovery."
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Cta to="/safety/report" variant="primary">Report an incident <span aria-hidden>→</span></Cta>
          <p className="max-w-md text-sm leading-relaxed text-ink-muted">
            In immediate danger? Contact the emergency services first, then alert the community here.
          </p>
        </div>
      </PageHero>

      <Container size="wide" className="py-10 sm:py-12">
        <section aria-label="Incident overview" className="grid overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)] sm:grid-cols-3">
          <Metric value={all.filter((incident) => !isClosed(incident)).length} label="Active reports" accent="bg-maroon-900" />
          <Metric value={responding} label="Response underway" accent="bg-gold-brand" />
          <Metric value={critical} label="Critical right now" accent="bg-clay" />
        </section>

        <div className="mt-10 flex flex-col gap-5 border-b border-sand pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="eyebrow text-maroon-text">Incident desk</p>
            <h2 className="mt-2 text-3xl font-semibold text-ink">What is happening now</h2>
            <p className="mt-2 text-sm text-ink-muted" aria-live="polite">
              Showing {shown.length} {shown.length === 1 ? "report" : "reports"}{cat ? ` in ${CATEGORY_LABEL[cat]}` : " across every category"}.
            </p>
          </div>

          <div className="flex max-w-full gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter incidents by category">
            <CategoryButton active={cat === null} label="All reports" onClick={() => setCat(null)} />
            {INCIDENT_CATEGORIES.map((category) => (
              <CategoryButton
                key={category.value}
                active={cat === category.value}
                label={category.label}
                onClick={() => setCat(cat === category.value ? null : category.value)}
              />
            ))}
          </div>
        </div>

        {shown.length === 0 ? (
          <EmptyState icon={<EmptyGlyph name="shield" />} tone="green" title="The town is quiet" description="No incidents have been reported in this category." />
        ) : (
          <div className="space-y-12 pt-8">
            {open.length > 0 && (
              <section aria-labelledby="active-incidents">
                <SectionTitle id="active-incidents" title="Active reports" count={open.length} note="Updates appear here as the response unfolds." />
                <div className="mt-5 grid items-start gap-4 md:grid-cols-2">
                  {open.map((incident, index) => (
                    <StaggerItem key={incident.id} index={index} lift>
                      <IncidentCard incident={incident} />
                    </StaggerItem>
                  ))}
                </div>
              </section>
            )}

            {closed.length > 0 && (
              <section aria-labelledby="resolved-incidents">
                <SectionTitle id="resolved-incidents" title="Resolved & recovered" count={closed.length} note="The community record of incidents brought to a close." />
                <div className="mt-5 grid items-start gap-4 md:grid-cols-2">
                  {closed.map((incident, index) => (
                    <StaggerItem key={incident.id} index={index} lift>
                      <IncidentCard incident={incident} resolved />
                    </StaggerItem>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
        <SampleNote>{SAMPLE_NOTICE}</SampleNote>
      </Container>
    </>
  );
}

function isClosed(incident: Incident) {
  return incident.details.incidentStatus === "resolved" || incident.details.incidentStatus === "recovered";
}

function Metric({ value, label, accent }: Readonly<{ value: number; label: string; accent: string }>) {
  return (
    <div className="relative flex items-center gap-4 border-b border-sand px-5 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <span className={`h-10 w-1 rounded-full ${accent}`} aria-hidden />
      <strong className="text-3xl font-semibold leading-none text-ink">{value}</strong>
      <span className="text-sm leading-tight text-ink-muted">{label}</span>
    </div>
  );
}

function CategoryButton({ active, label, onClick }: Readonly<{ active: boolean; label: string; onClick: () => void }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`relative shrink-0 overflow-hidden rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${active ? "border-green text-on-green" : "border-sand bg-cream text-ink-muted hover:border-green/40 hover:text-ink"}`}
    >
      {active && <LayoutPill layoutId="safety-cat" className="absolute inset-0 rounded-full bg-green" />}
      <span className="relative">{label}</span>
    </button>
  );
}

function SectionTitle({ id, title, count, note }: Readonly<{ id: string; title: string; count: number; note: string }>) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-center gap-3">
        <h2 id={id} className="text-2xl font-semibold text-ink">{title}</h2>
        <span className="inline-flex min-w-7 items-center justify-center rounded-full bg-sand px-2 py-1 text-xs font-semibold text-ink-muted">{count}</span>
      </div>
      <p className="text-sm text-ink-faint">{note}</p>
    </div>
  );
}

function IncidentCard({ incident, resolved = false }: Readonly<{ incident: Incident; resolved?: boolean }>) {
  const details = incident.details;
  return (
    <Link
      to={`/safety/${incident.slug}`}
      className={`group relative block overflow-hidden rounded-[var(--radius-card)] border bg-cream shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:border-gold-border hover:shadow-[var(--shadow-lift)] ${resolved ? "border-sand" : "border-maroon-900/20"}`}
    >
      <span className={`absolute inset-y-0 left-0 w-1.5 ${resolved ? "bg-green" : severityRail(details.severity)}`} aria-hidden />
      <article className="p-5 pl-6">
        <div className="flex items-start gap-4">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${resolved ? "bg-green/[0.07] text-green-text" : "bg-maroon-900/[0.07] text-maroon-text"}`}>
            <SectionIcon id="safety" className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold capitalize ${SEVERITY_CLASS[details.severity]}`}>
                {details.severity} severity
              </span>
              <span className="rounded-full border border-sand bg-paper px-2.5 py-1 text-[0.7rem] text-ink-muted">
                {CATEGORY_LABEL[details.category] ?? details.category}
              </span>
              <span className={`ml-auto inline-flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-[0.12em] ${resolved ? "text-green-text" : "text-gold-text"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${resolved ? "bg-green" : "bg-gold-brand"}`} aria-hidden />
                {STATUS_LABEL[details.incidentStatus] ?? details.incidentStatus}
              </span>
            </div>
            <h3 className="mt-3 text-xl font-semibold leading-tight text-ink transition-colors group-hover:text-maroon-text">{incident.title}</h3>
            {details.description && <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-muted">{details.description}</p>}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-sand pt-3 text-xs text-ink-faint">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <span aria-hidden>⌖</span>
            <span className="truncate">{details.location}</span>
          </span>
          <span>Reported {formatDate(incident.createdAt)}</span>
          <span className="ml-auto font-semibold text-green-text transition-transform group-hover:translate-x-0.5">View update <span aria-hidden>→</span></span>
        </div>
      </article>
    </Link>
  );
}

function severityRail(severity: Incident["details"]["severity"]) {
  if (severity === "critical") return "bg-maroon-900";
  if (severity === "high") return "bg-clay";
  if (severity === "medium") return "bg-gold-brand";
  return "bg-teal";
}
