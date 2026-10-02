import { Hero } from "@/sections/Hero";
import { FestivalAnnouncement } from "@/sections/FestivalAnnouncement";
import { Marquee } from "@/sections/Marquee";
import { Discover } from "@/components/discover";
import { HappeningNow } from "@/sections/HappeningNow";
import { Campaigns } from "@/sections/Campaigns";
import { SponsoredCard } from "@/sections/SponsoredCard";
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
      {/* The marketing-card ad slot: loads client-side after paint, renders nothing when empty. */}
      <SponsoredCard section="home" layout="band" />
      <Campaigns />
      <TownGoal />
      <TownCode />
      <FromTheCommunity />
      <Stats />
      <Download />
    </>
  );
}
