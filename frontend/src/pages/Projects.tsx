import { Link, useLoaderData } from "react-router-dom";
import { usePageTitle } from "@/lib/use-page-title";
import type { Listing } from "@/lib/types";
import { api } from "@/lib/api";
import { PageHero } from "@/components/page-hero";
import { Container } from "@/components/ui";
import { Thumb } from "@/components/cards";
import { StaggerItem } from "@/components/motion";
import { EmptyState, EmptyGlyph } from "@/components/empty-state";
import { initials } from "@/lib/format";

export async function loader() {
  return api.projects();
}

export const cedis = (pesewas?: number) =>
  `GH₵ ${((pesewas ?? 0) / 100).toLocaleString("en-GH", { maximumFractionDigits: 0 })}`;

export function ProgressBar({ raised, goal }: Readonly<{ raised?: number; goal?: number }>) {
  const pct = goal ? Math.min(100, Math.round(((raised ?? 0) / goal) * 100)) : 0;
  return (
    <div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-sand">
        <div className="h-full rounded-full bg-green transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1.5 flex items-baseline justify-between text-xs">
        <span className="font-semibold text-green-text">{cedis(raised)} raised</span>
        <span className="text-ink-faint">{pct}% of {cedis(goal)}</span>
      </div>
    </div>
  );
}

export function Component() {
  const projects = useLoaderData() as Listing[];
  usePageTitle("Community Projects");
  return (
    <>
      <PageHero
        tone="green"
        kicker="Adopt a project"
        title="Pride that builds something"
        symbol="funtunfunefu"
        image="/uploads/seed/town-view.jpg"
        lede="Concrete, costed improvements for Cape Coast — proposed by verified institutions, funded by residents and the diaspora together. Every project publishes its receipts."
      />
      <Container className="py-12">
        {projects.length === 0 ? (
          <EmptyState icon={<EmptyGlyph name="heart" />} title="No open projects yet" description="The first campaigns are being costed with their institutions." />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p, i) => (
              <StaggerItem key={p.id} index={i} lift>
                <Link to={`/projects/${p.slug}`} className="group flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]">
                  <Thumb seed={p.slug} src={p.coverImageUrl} label={initials(p.title)} rounded="rounded-none" className="aspect-[16/9] w-full" />
                  <div className="flex flex-1 flex-col p-5">
                    <h3 className="text-xl font-semibold text-ink group-hover:text-green-text">{p.title}</h3>
                    {p.details.organiser && <p className="mt-1 text-xs text-gold-text">{p.details.organiser}</p>}
                    <p className="mt-2 line-clamp-2 text-sm text-ink-muted">{p.details.description}</p>
                    <div className="mt-auto pt-4">
                      <ProgressBar raised={p.details.raisedPesewas} goal={p.details.goalPesewas} />
                      <p className="mt-2 text-xs text-ink-faint">{p.details.backers ?? 0} backers{p.details.deadline ? ` · closes ${p.details.deadline}` : ""}</p>
                    </div>
                  </div>
                </Link>
              </StaggerItem>
            ))}
          </div>
        )}
      </Container>
    </>
  );
}
