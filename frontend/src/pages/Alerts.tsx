import { useEffect, useState } from "react";
import { useLoaderData } from "react-router-dom";
import { usePageTitle } from "@/lib/use-page-title";
import type { Directive } from "@/lib/types";
import { api } from "@/lib/api";
import { PageHero } from "@/components/page-hero";
import { Container, SampleNote } from "@/components/ui";
import { StaggerItem } from "@/components/motion";
import { EmptyState, EmptyGlyph } from "@/components/empty-state";
import { formatDate } from "@/lib/format";
import { SAMPLE_NOTICE } from "@/lib/content";
import {
  ALERT_STYLE,
  DIRECTIVE_KIND_LABEL,
  DIRECTIVE_SEVERITY_CLASS,
  SEVERITY_LABEL,
  countdown,
  isLive,
} from "@/lib/directives";

export async function loader() {
  // active + computed-expired (non-cancelled), server-sorted most-severe first.
  return api.directives(false);
}

/** Date + local time, e.g. "16 Jul 2026, 06:00". */
function dateTime(iso?: string): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const d = new Date(t);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${formatDate(iso)}, ${hh}:${mm}`;
}

function windowLabel(d: Directive): string {
  const from = dateTime(d.effectiveFrom);
  if (d.effectiveUntil) return `${from} → ${dateTime(d.effectiveUntil)}`;
  return `From ${from} · open-ended`;
}

export function Component() {
  const all = useLoaderData() as Directive[];
  usePageTitle("Alerts & directives");
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const active = all.filter((d) => isLive(d, nowMs));
  const past = all.filter((d) => !isLive(d, nowMs));

  return (
    <>
      <PageHero
        tone="maroon"
        kicker="Official alerts & directives"
        title="Alerts"
        symbol="dwennimmen"
        lede="Advisories and directives issued by Cape Coast's emergency, security, health and local-government authorities. Active notices are pinned to the top of every page — this is the full record."
      />
      <Container size="wide" className="py-12">
        {all.length === 0 ? (
          <EmptyState
            icon={<EmptyGlyph name="megaphone" />}
            tone="green"
            title="All clear"
            description="No advisories or directives are in effect right now."
          />
        ) : (
          <div className="space-y-12">
            <section>
              <div className="mb-5 flex items-baseline gap-3">
                <h2 className="text-2xl font-semibold text-ink">In effect now</h2>
                <span className="text-sm text-ink-faint">{active.length}</span>
              </div>
              {active.length === 0 ? (
                <p className="rounded-[var(--radius-card)] border border-sand bg-cream px-5 py-6 text-sm text-ink-muted">
                  Nothing active at the moment. Recent and expired notices are listed below.
                </p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {active.map((d, idx) => (
                    <StaggerItem key={d.id} index={idx} lift>
                      <DirectiveCard d={d} nowMs={nowMs} />
                    </StaggerItem>
                  ))}
                </div>
              )}
            </section>

            {past.length > 0 && (
              <section>
                <div className="mb-5 flex items-baseline gap-3">
                  <h2 className="text-2xl font-semibold text-ink">Recent &amp; expired</h2>
                  <span className="text-sm text-ink-faint">{past.length}</span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {past.map((d, idx) => (
                    <StaggerItem key={d.id} index={idx} lift>
                      <DirectiveCard d={d} nowMs={nowMs} expired />
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

function DirectiveCard({
  d,
  nowMs,
  expired = false,
}: Readonly<{ d: Directive; nowMs: number; expired?: boolean }>) {
  const s = ALERT_STYLE[d.severity];
  const untilMs = d.effectiveUntil ? Date.parse(d.effectiveUntil) : NaN;
  const cd = !expired && !Number.isNaN(untilMs) ? countdown(untilMs, nowMs) : null;

  return (
    <article
      className={`relative flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border bg-cream p-5 shadow-[var(--shadow-card)] ${
        expired ? "border-sand opacity-80" : s.wrap
      }`}
    >
      {!expired && <span className={`absolute inset-y-0 left-0 w-1.5 ${s.rail}`} aria-hidden />}
      <div className={`flex flex-wrap items-center gap-2 ${expired ? "" : "pl-2"}`}>
        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${DIRECTIVE_SEVERITY_CLASS[d.severity]}`}>
          {SEVERITY_LABEL[d.severity]}
        </span>
        <span className="rounded-full border border-sand bg-paper px-3 py-1 text-xs text-ink-muted">
          {DIRECTIVE_KIND_LABEL[d.kind]}
        </span>
        {cd ? (
          <span className={`ml-auto rounded-full border border-sand bg-paper px-3 py-1 text-xs font-semibold tabular-nums ${s.accent}`}>
            {cd}
          </span>
        ) : (
          expired && (
            <span className="ml-auto rounded-full border border-sand bg-paper px-3 py-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Expired
            </span>
          )
        )}
      </div>
      <h3 className={`mt-3 text-xl font-semibold text-ink ${expired ? "" : "pl-2"}`}>{d.title}</h3>
      <p className={`mt-1 text-sm font-medium text-ink-muted ${expired ? "" : "pl-2"}`}>
        Issued by {d.issuedByName}
      </p>
      {d.body && <p className={`mt-2 whitespace-pre-line text-sm text-ink-muted ${expired ? "" : "pl-2"}`}>{d.body}</p>}
      {d.action && (
        <p className={`mt-3 rounded-lg border px-3 py-2 text-sm font-medium ${s.badge} ${expired ? "" : "ml-2"}`}>
          {d.action}
        </p>
      )}
      <div className={`mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-xs text-ink-faint ${expired ? "" : "pl-2"}`}>
        {d.area && <span>{d.area}</span>}
        <span>{windowLabel(d)}</span>
      </div>
    </article>
  );
}
