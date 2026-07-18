import { useMemo } from "react";
import { Link, useLoaderData, useSearchParams } from "react-router-dom";
import { PageHero } from "@/components/page-hero";
import { Container, CTA as Cta } from "@/components/ui";
import { EmptyGlyph, EmptyState } from "@/components/empty-state";
import { Reveal, StaggerItem } from "@/components/motion";
import { AgentCard, OutsideChoiceMenu, OutsideDisclaimer, serviceLabeller } from "@/components/outside";
import { api } from "@/lib/api";
import type { Agent, AgentService } from "@/lib/types";
import { usePageTitle } from "@/lib/use-page-title";

// ── Oguaa Outside · the directory ─────────────────────────────────────────────
// Public listing of vetted agents. The service filter comes from the live
// /api/agent-services catalogue; the area filter is derived from the union of
// every agent's coverage areas. Filtering is client-side over the whole list
// (mirrors the Business directory) so both filter menus always show every
// option regardless of the current selection.

interface OutsideData {
  agents: Agent[];
  services: AgentService[];
}

export async function loader(): Promise<OutsideData> {
  const [agents, services] = await Promise.all([
    api.agents(),
    api.agentServices().catch(() => [] as AgentService[]),
  ]);
  return { agents, services };
}

export function Component() {
  usePageTitle("Oguaa Outside");
  const { agents, services } = useLoaderData() as OutsideData;
  const [params, setParams] = useSearchParams();
  const service = params.get("service") ?? "";
  const area = params.get("area") ?? "";
  const labelFor = useMemo(() => serviceLabeller(services), [services]);

  // Area options: the union of every agent's coverage areas, alphabetised.
  const areas = useMemo(
    () => [...new Set(agents.flatMap((a) => a.coverageAreas))].filter(Boolean).sort((a, b) => a.localeCompare(b)),
    [agents],
  );

  // Only offer service filters that at least one agent actually provides.
  const offeredServices = useMemo(() => {
    const offered = new Set(agents.flatMap((a) => a.services));
    return services.filter((s) => offered.has(s.slug));
  }, [agents, services]);

  function setFilter(key: "service" | "area", value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  // Verified agents float to the top, then higher-rated, then more experienced.
  const shown = agents
    .filter((a) => (!service || a.services.includes(service)) && (!area || a.coverageAreas.includes(area)))
    .slice()
    .sort((a, b) =>
      Number(b.status === "verified") - Number(a.status === "verified")
      || b.ratingAvg - a.ratingAvg
      || b.jobsCompleted - a.jobsCompleted,
    );

  const hasFilters = Boolean(service || area);

  return (
    <>
      <PageHero
        tone="gold"
        sectionId="outside"
        kicker="Business & errands, wherever you are"
        title="Oguaa Outside"
        symbol="nkyinkyim"
        lede="Find vetted people and offices for procurement, shipping, inspections, travel support and official errands — with managed escrow when money changes hands."
      >
        <div className="flex flex-wrap gap-3">
          <Cta to="/outside/jobs" variant="gold">My requests</Cta>
          <Cta to="/outside/become-an-agent" variant="outline" className="!border-green-text/35 !text-green-text hover:!border-green-text">Become an agent</Cta>
        </div>
      </PageHero>

      <Container size="wide" className="py-10 sm:py-12">
        {/* The disclaimer is the first thing on the directory — deliberately. */}
        <OutsideDisclaimer />

        {/* Compact custom filters — service (live catalogue) + derived area. */}
        {(offeredServices.length > 0 || areas.length > 0) && (
          <section className="relative z-20 mt-7 rounded-[var(--radius-card)] border border-sand bg-cream p-4 shadow-[var(--shadow-card)] sm:p-5" aria-labelledby="agent-filters-title">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0 flex-1">
                <p id="agent-filters-title" className="text-sm font-semibold text-ink">Find the right help</p>
                <p className="mt-1 text-xs text-ink-faint">Choose a service and the area where the errand happens.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:w-[34rem] lg:max-w-[58%]">
                {offeredServices.length > 0 && (
                  <div>
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-ink-faint">Service</span>
                    <OutsideChoiceMenu
                      label="Service"
                      value={service}
                      options={[
                        { value: "", label: "All services" },
                        ...offeredServices.map((item) => ({ value: item.slug, label: item.label })),
                      ]}
                      onChange={(value) => setFilter("service", value)}
                    />
                  </div>
                )}
                {areas.length > 0 && (
                  <div>
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-ink-faint">Area</span>
                    <OutsideChoiceMenu
                      label="Area"
                      value={area}
                      options={[
                        { value: "", label: "Anywhere" },
                        ...areas.map((item) => ({ value: item, label: item })),
                      ]}
                      onChange={(value) => setFilter("area", value)}
                    />
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        <div className="mt-6">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-ink-faint" aria-live="polite">
              {shown.length} {shown.length === 1 ? "agent" : "agents"}
              {hasFilters ? " matching" : " listed"} · Verified first
            </p>
            {hasFilters && (
              <button type="button" onClick={() => setParams({}, { replace: true })} className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-green-text hover:bg-green/[0.06] hover:underline">
                Clear filters
              </button>
            )}
          </div>

          {shown.length > 0 ? (
            <div className="mt-4 grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((agent, i) => (
                <StaggerItem key={agent.id} index={i} lift className="h-fit">
                  <AgentCard agent={agent} serviceLabel={labelFor} />
                </StaggerItem>
              ))}
            </div>
          ) : (
            <EmptyState
              className="mt-4"
              icon={<EmptyGlyph name="users" />}
              title={hasFilters ? "No agents match those filters" : "No agents listed yet"}
              description={hasFilters ? "Try a broader service or area — or clear the filters to see everyone." : "The first vetted agents are being verified. Know the town and travel? Put yourself forward."}
              actions={
                hasFilters
                  ? <button type="button" onClick={() => setParams({}, { replace: true })} className="min-h-11 rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-on-green">Clear filters</button>
                  : <Link to="/outside/become-an-agent" className="inline-flex min-h-11 items-center rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-on-green">Become an agent →</Link>
              }
            />
          )}
        </div>
      </Container>

      {/* How it works + become-an-agent CTA band. */}
      <section className="on-dark on-dark-pin bg-green py-12 text-cream sm:py-14">
        <Container size="wide">
          <Reveal>
            <p className="eyebrow !text-gold">How Oguaa Outside works</p>
            <h2 className="mt-3 max-w-2xl text-3xl font-semibold sm:text-4xl">Vetted agents. Money held in escrow. Released when you&apos;re satisfied.</h2>
          </Reveal>
          <ol className="mt-8 grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-cream/15 bg-cream/15 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["01", "Find an agent", "Filter by service and area, then read reputation and reviews."],
              ["02", "Agree & fund", "Send your request; when the agent quotes, you fund the escrow."],
              ["03", "Agent delivers", "The agent runs the errand and marks it delivered."],
              ["04", "Release or dispute", "You release the escrow when happy — or raise a dispute."],
            ].map(([n, t, c]) => (
              <li key={n} className="bg-green p-5">
                <span className="text-xs font-bold tracking-[0.14em] text-gold">{n}</span>
                <h3 className="mt-2 text-lg font-semibold text-cream">{t}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-cream/75">{c}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8 flex flex-wrap gap-3">
            <Cta to="/outside/become-an-agent" variant="gold">Become an agent</Cta>
            <Cta to="/outside/jobs" variant="outline-dark">Track my requests</Cta>
          </div>
        </Container>
      </section>
    </>
  );
}
