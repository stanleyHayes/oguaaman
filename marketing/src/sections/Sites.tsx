import { Link } from "react-router-dom";
import { Section, SectionHeading, Pill, Card } from "@/components/ui";
import { CircularReveal, Stagger, StaggerItem } from "@/components/motion";
import { sceneForSlug } from "@/components/scenes";
import { useHeritage } from "@/lib/org";
import { HERITAGE_FALLBACK } from "@/lib/fallbacks";

// The pill accent cycles for visual variety across the grid.
const TONES = ["gold", "green", "teal", "clay"] as const;

/**
 * The places to see in and around Cape Coast — read LIVE from the platform
 * (kind:"heritage" institutions), so a place added in the admin appears here
 * automatically. Each card opens its detail page (/visit/:slug). Seeded with the
 * known sites as a fallback so the grid is never empty.
 */
export function Sites() {
  const places = useHeritage(HERITAGE_FALLBACK);

  return (
    <Section id="visit" tone="paper" size="wide" className="pb-10 sm:pb-14">
      <SectionHeading
        kicker="SEE CAPE COAST"
        title="Castle, canopy and shore."
        lede="Castles and forts, rainforest canopy and lagoon, market and shore — Cape Coast packs Ghana's history and natural wonder into one short stretch of the Gulf of Guinea. Tap any place for its full guide."
      />

      <Stagger className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {places.map((p, i) => {
          const Scene = sceneForSlug(p.slug);
          return (
            <StaggerItem key={p.slug} index={i} className="h-full">
              <Link to={`/visit/${p.slug}`} className="group block h-full">
                <Card className="flex h-full flex-col overflow-hidden transition-shadow duration-300 hover:shadow-[var(--shadow-lift)]">
                  <CircularReveal className="aspect-[16/10] w-full overflow-hidden border-b border-sand bg-sand">
                    <div className="h-full w-full transition-transform duration-500 group-hover:scale-105">
                      <Scene />
                    </div>
                  </CircularReveal>
                  <div className="flex flex-1 flex-col p-6">
                    {p.classification && (
                      <Pill tone={TONES[i % TONES.length]} className="self-start">{p.classification}</Pill>
                    )}
                    <h3 className="mt-3 text-xl font-semibold text-ink">{p.name}</h3>
                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-muted">{p.summary}</p>
                    <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-green opacity-0 transition-opacity group-hover:opacity-100">
                      Explore →
                    </span>
                  </div>
                </Card>
              </Link>
            </StaggerItem>
          );
        })}
      </Stagger>

      <p className="mt-10 text-center text-sm text-ink-faint">
        Nearby too: the Hans Cottage crocodile pond, the calm beaches of Brenu Akyinim and Anomabo,
        and the chain of old forts along the Central Region coast.
      </p>
    </Section>
  );
}
