import { PageHero } from "@/components/page-hero";
import { MarketScene } from "@/components/scenes";
import { CultureContent } from "@/sections/CultureContent";
import { Identity } from "@/sections/Identity";

export function Component() {
  return (
    <>
      <PageHero
        scene={MarketScene}
        coverUrl="/uploads/seed/fetu-crowd.jpg"
        kicker="Culture"
        title="The festival, the companies, the sound."
        lede="Fetu Afahye and the durbar, the seven Asafo companies, the 77 gods, the music and the food — the living culture of Oguaa."
      >
        <nav aria-label="Culture chapters" className="flex max-w-4xl flex-wrap gap-2">
          {[
            ["#ritual", "01", "Rite"],
            ["#asafo", "02", "Companies"],
            ["#durbar", "03", "Durbar"],
            ["#sound-table", "04", "Sound & table"],
            ["#identity", "05", "Identity"],
          ].map(([href, number, label]) => (
            <a
              key={href}
              href={href}
              className="group inline-flex min-h-11 items-center gap-2 rounded-full border border-cream/25 bg-green-900/35 px-4 text-sm text-cream backdrop-blur-sm transition-colors hover:border-gold hover:bg-gold hover:text-green-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            >
              <span className="text-[0.62rem] font-semibold tracking-[0.15em] text-gold transition-colors group-hover:text-green-900/65" aria-hidden>
                {number}
              </span>
              <span className="font-semibold">{label}</span>
            </a>
          ))}
        </nav>
      </PageHero>
      <CultureContent />
      <Identity />
    </>
  );
}
