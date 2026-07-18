import { Hero } from "@/sections/Hero";
import { Marquee } from "@/sections/Marquee";
import { Discover } from "@/components/discover";
import { HappeningNow } from "@/sections/HappeningNow";
import { TownGoal } from "@/sections/TownGoal";
import { TownCode } from "@/sections/TownCode";
import { FromTheCommunity } from "@/sections/FromTheCommunity";
import { Stats } from "@/sections/Stats";
import { Download } from "@/sections/Download";

/** Home — image-led entry. Teases each area; the depth lives on dedicated pages. */
export function Component() {
  return (
    <>
      <Hero />
      <Marquee />
      <Discover />
      <HappeningNow />
      <TownGoal />
      <TownCode />
      <FromTheCommunity />
      <Stats />
      <Download />
    </>
  );
}
