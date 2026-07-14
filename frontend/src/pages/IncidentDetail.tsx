import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router-dom";
import type { ReactNode } from "react";
import type { Incident, IncidentStatusEntry, Place } from "@/lib/types";
import { api } from "@/lib/api";
import { Container, Pill } from "@/components/ui";
import { PageHero } from "@/components/page-hero";
import { formatDate } from "@/lib/format";
import { CATEGORY_LABEL, SEVERITY_CLASS, STATUS_LABEL } from "@/lib/incidents";

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
  const { incident: i, places } = useLoaderData() as Data;
  const d = i.details;
  const town = places.find((p) => p.id === i.townId);
  const history = (d.statusHistory ?? []).slice().sort((a, b) => a.at.localeCompare(b.at));

  return (
    <>
      <PageHero tone="maroon" kicker="Safety · incident" title={i.title} lede={d.description}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${SEVERITY_CLASS[d.severity]}`}>
            {d.severity} severity
          </span>
          <Pill tone="neutral">{CATEGORY_LABEL[d.category] ?? d.category}</Pill>
          <Pill tone="gold">{STATUS_LABEL[d.incidentStatus] ?? d.incidentStatus}</Pill>
          {town && <Pill tone="green">{town.name}</Pill>}
        </div>
      </PageHero>
      <Container size="narrow" className="py-12">
        <dl className="rounded-[var(--radius-card)] border border-sand bg-cream p-6">
          <KeyVal label="Location">{d.location}</KeyVal>
          {d.contact && <KeyVal label="Reporter contact">{d.contact}</KeyVal>}
          <KeyVal label="Reported">{formatDate(i.createdAt)}</KeyVal>
        </dl>

        <h2 className="mb-5 mt-10 font-display text-2xl font-semibold text-ink">Status timeline</h2>
        <ol className="space-y-0 border-l-2 border-sand pl-5">
          {history.map((e: IncidentStatusEntry, idx) => (
            <li key={idx} className="relative pb-6 last:pb-0">
              <span className={`absolute -left-[1.83rem] h-3.5 w-3.5 rounded-full border-2 border-cream ${idx === history.length - 1 ? "bg-gold-brand" : "bg-green"}`} aria-hidden />
              <p className="font-semibold capitalize text-ink">{STATUS_LABEL[e.status] ?? e.status}</p>
              {e.note && <p className="mt-0.5 text-sm text-ink-muted">{e.note}</p>}
              <p className="mt-0.5 text-xs text-ink-faint">{formatDate(e.at)}{e.at.includes("T") ? ` · ${e.at.slice(11, 16)} GMT` : ""}</p>
            </li>
          ))}
        </ol>

        <p className="mt-10 border-t border-sand pt-5 text-sm text-ink-faint">
          Curators verify and update this incident as the response unfolds.
          <Link to="/safety" className="ml-2 font-semibold text-green hover:underline">← All incidents</Link>
        </p>
      </Container>
    </>
  );
}

function KeyVal({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-sand py-3 last:border-0 sm:flex-row sm:gap-4">
      <dt className="w-40 shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="text-sm text-ink">{children}</dd>
    </div>
  );
}
