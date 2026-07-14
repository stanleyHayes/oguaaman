import { PageHero } from "@/components/page-hero";
import { CanopyScene } from "@/components/scenes";
import { Sites } from "@/sections/Sites";
import { PlanYourVisit } from "@/sections/PlanYourVisit";

export function Component() {
  return (
    <>
      <PageHero
        scene={CanopyScene}
        kicker="Visit"
        title="A coast worth crossing the world for."
        lede="The Castle and the forts, Kakum's canopy walk, the lagoon and the fishing shore — Ghana's history and natural wonder on one short stretch of coast."
      />
      <Sites />
      <PlanYourVisit />
    </>
  );
}
