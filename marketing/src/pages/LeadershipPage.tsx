import { PageHero } from "@/components/page-hero";
import { LighthouseScene } from "@/components/scenes";
import { Leadership } from "@/sections/Leadership";
import { SonsAndDaughters } from "@/sections/SonsAndDaughters";

export function Component() {
  return (
    <>
      <PageHero
        scene={LighthouseScene}
        kicker="Leadership"
        title="The two orders of Oguaa."
        lede="A town held by two leaderships at once — the traditional stool, chosen by lineage, and the civic government, chosen by ballot. The chieftaincy first, then the assembly, each from its summit to its smallest tier."
      />
      <Leadership />
      <SonsAndDaughters />
    </>
  );
}
