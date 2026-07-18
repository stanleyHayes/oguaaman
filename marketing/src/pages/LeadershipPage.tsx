import { PageHero } from "@/components/page-hero";
import { LighthouseScene } from "@/components/scenes";
import { Leadership } from "@/sections/Leadership";
import { SonsAndDaughters } from "@/sections/SonsAndDaughters";

export function Component() {
  return (
    <>
      <PageHero
        scene={LighthouseScene}
        coverUrl="/uploads/seed/fetu-procession.jpg"
        kicker="Leadership"
        title="The two orders of Oguaa."
        lede="A town held by two leaderships at once — the traditional stool, chosen by lineage, and the civic government, chosen by ballot. The chieftaincy first, then the assembly, each from its summit to its smallest tier."
      >
        <nav
          aria-label="Leadership page chapters"
          className="grid max-w-3xl overflow-hidden rounded-[1.25rem] border border-cream/20 bg-green-900/65 shadow-lg backdrop-blur-md sm:grid-cols-3"
        >
          <a href="#traditional" className="group border-b border-cream/15 px-5 py-4 text-left transition-colors hover:bg-cream/10 sm:border-b-0 sm:border-r">
            <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-gold">01 · Lineage</span>
            <span className="mt-1 block font-semibold text-cream group-hover:text-gold">The traditional stool</span>
          </a>
          <a href="#civic" className="group border-b border-cream/15 px-5 py-4 text-left transition-colors hover:bg-cream/10 sm:border-b-0 sm:border-r">
            <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-gold">02 · Ballot</span>
            <span className="mt-1 block font-semibold text-cream group-hover:text-gold">The civic order</span>
          </a>
          <a href="#sons-daughters" className="group px-5 py-4 text-left transition-colors hover:bg-cream/10">
            <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-gold">03 · Legacy</span>
            <span className="mt-1 block font-semibold text-cream group-hover:text-gold">Sons &amp; daughters</span>
          </a>
        </nav>
      </PageHero>
      <Leadership />
      <SonsAndDaughters />
    </>
  );
}
