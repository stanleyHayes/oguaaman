import { PageHero } from "@/components/page-hero";
import { CastleScene } from "@/components/scenes";
import { History } from "@/sections/History";
import { Stories } from "@/sections/Stories";

export function Component() {
  return (
    <>
      <PageHero
        scene={CastleScene}
        coverUrl="/uploads/seed/castle-courtyard.jpg"
        kicker="History"
        title="Oguaa, through the centuries."
        lede="A Fante market that became a castle, a colonial capital, the nation's Citadel of Education, and a place of return for the African diaspora."
      >
        <div className="max-w-4xl">
          <nav aria-label="History chapters" className="grid grid-cols-2 overflow-hidden rounded-[var(--radius-card)] border border-cream/25 sm:grid-cols-5">
            {[
              ["#history", "15th c.", "Origins"],
              ["#castle-memory", "17th–19th c.", "Castle & crossing"],
              ["#civic-order", "1700s", "Civic order"],
              ["#citadel", "1876", "The citadel"],
              ["#stories", "Living", "Oral archive"],
            ].map(([href, era, label]) => (
              <a
                key={href}
                href={href}
                className="group flex min-h-14 items-center gap-3 border-b border-r border-cream/15 px-3 py-2 transition-colors last:col-span-2 hover:bg-cream/10 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gold sm:border-b-0 sm:last:col-span-1 sm:last:border-r-0"
              >
                <span className="text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-gold">{era}</span>
                <span className="text-sm font-semibold text-cream group-hover:text-gold">{label}</span>
              </a>
            ))}
          </nav>
          <p className="mt-3 text-[0.68rem] text-cream/60">
            Hero photograph:{" "}
            <a href="https://commons.wikimedia.org/wiki/File%3ACape_Coast_Castle%2C_Cape_Coast%2C_Ghana.JPG" target="_blank" rel="noreferrer" className="underline decoration-cream/30 underline-offset-2 hover:text-cream">Rjruiziii</a>
            {" · "}
            <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noreferrer" className="underline decoration-cream/30 underline-offset-2 hover:text-cream">CC BY-SA 3.0</a>
          </p>
        </div>
      </PageHero>
      <History />
      <Stories />
    </>
  );
}
