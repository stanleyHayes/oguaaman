import { PageHero } from "@/components/page-hero";
import { MarketScene } from "@/components/scenes";
import { CultureContent } from "@/sections/CultureContent";
import { Identity } from "@/sections/Identity";

export function Component() {
  return (
    <>
      <PageHero
        scene={MarketScene}
        kicker="Culture"
        title="The festival, the companies, the sound."
        lede="Fetu Afahye and the durbar, the seven Asafo companies, the 77 gods, the music and the food — the living culture of Oguaa."
      />
      <CultureContent />
      <Identity />
    </>
  );
}
