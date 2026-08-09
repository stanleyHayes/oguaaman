import { Hero } from "@/sections/Hero";
import { FestivalAnnouncement } from "@/sections/FestivalAnnouncement";
import { Marquee } from "@/sections/Marquee";
import { Discover } from "@/components/discover";
import { HappeningNow } from "@/sections/HappeningNow";
import { Campaigns } from "@/sections/Campaigns";
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
      {/* Time-boxed: self-removes after the festival — see FestivalAnnouncement. */}
      <FestivalAnnouncement />
      <Marquee />
      <Discover />
      <HappeningNow />
      <Campaigns />
      <TownGoal />
      <TownCode />
      <FromTheCommunity />
      <Stats />
      <Download />
    </>
  );
}
