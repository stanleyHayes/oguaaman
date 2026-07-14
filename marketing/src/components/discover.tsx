import type { ComponentType } from "react";
import { Link } from "react-router-dom";
import { Section, SectionHeading } from "./ui";
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

export function Discover() {
  return (
    <Section id="discover" tone="paper" size="wide">
      <SectionHeading
        kicker="DISCOVER CAPE COAST"
        title="Wander the town."
        lede="No login needed — explore Oguaa's story, its culture, its landmarks and its leaders, and see what the community is doing right now."
      />
      <div className="mt-12 grid gap-5 sm:grid-cols-2">
        {CARDS.map(({ to, scene: Scene, title, text }) => (
          <Link
            key={to}
            to={to}
            className="group relative block aspect-[16/9] overflow-hidden rounded-[var(--radius-card)] border border-sand shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]"
          >
            <div className="absolute inset-0 bg-sand transition-transform duration-500 group-hover:scale-105">
              <Scene />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-green-900/85 via-green-900/30 to-transparent" />
            <div className="on-dark absolute bottom-0 left-0 p-6 text-cream">
              <h3 className="text-2xl font-semibold sm:text-3xl">{title}</h3>
              <p className="mt-1 max-w-md text-sm text-cream/85">{text}</p>
              <span className="mt-2 inline-block text-sm font-semibold text-gold">Explore →</span>
            </div>
          </Link>
        ))}
      </div>
    </Section>
  );
}
