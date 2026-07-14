import { PageHero } from "@/components/page-hero";
import { CastleScene } from "@/components/scenes";
import { History } from "@/sections/History";
import { Stories } from "@/sections/Stories";

export function Component() {
  return (
    <>
      <PageHero
        scene={CastleScene}
        kicker="History"
        title="Oguaa, through the centuries."
        lede="A Fante market that became a castle, a colonial capital, the nation's Citadel of Education, and a place of return for the African diaspora."
      />
      <History />
      <Stories />
    </>
  );
}
