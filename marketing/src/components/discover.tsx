import type { ComponentType } from "react";
import { Link } from "react-router-dom";
import { Section, SectionHeading } from "./ui";
import { Reveal3D } from "./motion";
import { CastleScene, MarketScene, CanopyScene, LighthouseScene, DurbarScene, CollegeScene } from "./scenes";

interface Card { to: string; scene: ComponentType<{ className?: string }>; title: string; text: string }

const CARDS: Card[] = [
  { to: "/history", scene: CastleScene, title: "History", text: "From a crab market to a castle, a colonial capital, and a place of return." },
  { to: "/culture", scene: MarketScene, title: "Culture", text: "The seven Asafo companies, the posuban shrines and frankaa flags, the 77 gods and the Adinkra grammar." },
  { to: "/festivals", scene: DurbarScene, title: "Festivals", text: "Fetu Afahye, the durbar and the diaspora's homecoming — when the town stops to remember." },
  { to: "/education", scene: CollegeScene, title: "Education", text: "The oldest school in Ghana, and the seven foundations that taught a country." },
  { to: "/visit", scene: CanopyScene, title: "Visit", text: "The Castle, Kakum's canopy walk, the lagoon, the coast and the old forts." },
  { to: "/leadership", scene: LighthouseScene, title: "Leadership", text: "The two orders of Oguaa — the traditional stool and the civic assembly." },
];

const CARD_ACCENTS = ["gold", "clay", "teal", "green", "teal", "gold"] as const;

export function Discover() {
  return (
    <Section id="discover" tone="paper" size="wide">
      <SectionHeading
        kicker="DISCOVER CAPE COAST"
        title="Wander the town."
        lede="No login needed — explore Oguaa's story, its culture, its landmarks and its leaders, and see what the community is doing right now."
      />
      <div className="mt-12 grid gap-5 sm:grid-cols-2">
        {CARDS.map(({ to, scene: Scene, title, text }, i) => (
          <Reveal3D key={to} className="group" delay={Math.min(i, 8) * 0.07}>
            <Link
              to={to}
              className={`og-card og-card-dark on-dark-pin og-card-media og-card-interactive og-card-accent-${CARD_ACCENTS[i]} relative block min-h-[21rem] sm:aspect-[16/10] sm:min-h-0`}
            >
              <div className="absolute inset-0 bg-sand transition-transform duration-700 motion-safe:group-hover:scale-[1.035] motion-safe:group-focus-visible:scale-[1.035]">
                <Scene />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-green-900 via-green-900/45 to-transparent" />
              <span className="absolute left-5 top-5 z-[5] grid h-10 w-10 place-items-center rounded-full border border-cream/20 bg-green-900/55 font-mono text-[0.62rem] font-semibold tracking-[0.1em] text-gold backdrop-blur-sm" aria-hidden>
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="on-dark absolute inset-x-0 bottom-0 z-[4] p-6 text-cream sm:p-7">
                <p className="inline-flex w-fit rounded-full border border-gold/35 bg-green-900/85 px-2.5 py-1 font-mono text-[0.66rem] font-bold uppercase tracking-[0.16em] text-gold shadow-sm backdrop-blur-sm">
                  Oguaa field guide
                </p>
                <h3 className="mt-2 text-2xl font-semibold sm:text-3xl">{title}</h3>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-cream/82">{text}</p>
                <span className="mt-4 flex min-h-11 items-center justify-between border-t border-cream/15 pt-3 text-sm font-semibold text-gold">
                  <span>Explore chapter</span>
                  <span className="og-card-action-mark border-gold/30 bg-gold/10 text-gold" aria-hidden>→</span>
                </span>
              </div>
            </Link>
          </Reveal3D>
        ))}
      </div>
    </Section>
  );
}
