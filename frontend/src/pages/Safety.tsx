import { useState } from "react";
import { Link, useLoaderData } from "react-router-dom";
import type { Incident, IncidentCategory } from "@/lib/types";
import { api } from "@/lib/api";
import { PageHero } from "@/components/page-hero";
import { Container, CTA as Cta, SampleNote } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { SAMPLE_NOTICE } from "@/lib/content";
import { INCIDENT_CATEGORIES, CATEGORY_LABEL, SEVERITY_CLASS, STATUS_LABEL } from "@/lib/incidents";

export async function loader() {
  return api.incidents();
}

export function Component() {
  const all = useLoaderData() as Incident[];
  const [cat, setCat] = useState<IncidentCategory | null>(null);
  const shown = cat ? all.filter((i) => i.details.category === cat) : all;
  const open = shown.filter((i) => i.details.incidentStatus !== "resolved" && i.details.incidentStatus !== "recovered");
  const closed = shown.filter((i) => i.details.incidentStatus === "resolved" || i.details.incidentStatus === "recovered");

  return (
    <>
      <PageHero tone="maroon" kicker="Rescue & early recovery" title="Safety" symbol="dwennimmen" lede="Floods, fires, accidents and hazards across Cape Coast — reported by neighbours, verified by curators, and followed through to recovery. In an emergency, call the services first, then post here so the town can help.">
        <Cta to="/safety/report" variant="primary">Report an incident</Cta>
      </PageHero>
      <Container size="wide" className="py-12">
        <div className="mb-8 flex flex-wrap gap-2">
          <button
            onClick={() => setCat(null)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${cat === null ? "border-green bg-green text-cream" : "border-sand bg-cream text-ink-muted hover:border-green/40"}`}
          >
            All
          </button>
          {INCIDENT_CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setCat(cat === c.value ? null : c.value)}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${cat === c.value ? "border-green bg-green text-cream" : "border-sand bg-cream text-ink-muted hover:border-green/40"}`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <p className="rounded-[var(--radius-card)] border border-dashed border-sand p-10 text-center text-sm text-ink-faint">
            No incidents reported in this category — the town is quiet.
          </p>
        ) : (
          <div className="space-y-10">
            {open.length > 0 && (
              <section>
                <h2 className="mb-5 font-display text-2xl font-semibold text-ink">Active</h2>
                <div className="grid gap-4 sm:grid-cols-2">{open.map((i) => <IncidentCard key={i.id} incident={i} />)}</div>
              </section>
            )}
            {closed.length > 0 && (
              <section>
                <h2 className="mb-5 font-display text-2xl font-semibold text-ink">Resolved & recovered</h2>
                <div className="grid gap-4 sm:grid-cols-2">{closed.map((i) => <IncidentCard key={i.id} incident={i} />)}</div>
              </section>
            )}
          </div>
        )}
        <SampleNote>{SAMPLE_NOTICE}</SampleNote>
      </Container>
    </>
  );
}

function IncidentCard({ incident: i }: Readonly<{ incident: Incident }>) {
  return (
    <Link
      to={`/safety/${i.slug}`}
      className="block rounded-[var(--radius-card)] border border-sand bg-cream p-5 shadow-[var(--shadow-card)] transition-colors hover:border-gold-border"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${SEVERITY_CLASS[i.details.severity]}`}>
          {i.details.severity}
        </span>
        <span className="rounded-full border border-sand bg-paper px-3 py-1 text-xs text-ink-muted">
          {CATEGORY_LABEL[i.details.category] ?? i.details.category}
        </span>
        <span className="ml-auto text-xs font-semibold uppercase tracking-wide text-gold-text">
          {STATUS_LABEL[i.details.incidentStatus] ?? i.details.incidentStatus}
        </span>
      </div>
      <h3 className="mt-3 font-display text-xl font-semibold text-ink">{i.title}</h3>
      <p className="mt-1.5 text-sm text-ink-muted">{i.details.location}</p>
      {i.details.description && <p className="mt-2 line-clamp-2 text-sm text-ink-faint">{i.details.description}</p>}
      <p className="mt-3 text-xs text-ink-faint">Reported {formatDate(i.createdAt)}</p>
    </Link>
  );
}
