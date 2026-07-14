// The sitemap (spec §8.4) + per-section accent system (agent_plan.md §2.2).

export type SectionId =
  | "home" | "music" | "people" | "heritage" | "culture" | "festivals"
  | "visit" | "education" | "business" | "memoriam" | "community" | "youth"
  | "news" | "events" | "safety" | "lostfound";

export type LaunchDepth = "deep" | "live" | "stub";
export type Tone = "green" | "clay" | "gold" | "maroon" | "teal";

export interface ToneClasses {
  text: string;
  solid: string;
  border: string;
  soft: string;
  dot: string;
}

export const TONES: Record<Tone, ToneClasses> = {
  green: { text: "text-green", solid: "bg-green", border: "border-green", soft: "bg-green/[0.06]", dot: "bg-green" },
  clay: { text: "text-clay-text", solid: "bg-clay", border: "border-clay", soft: "bg-clay/[0.08]", dot: "bg-clay" },
  gold: { text: "text-gold-text", solid: "bg-gold-brand", border: "border-gold-border", soft: "bg-gold/[0.12]", dot: "bg-gold-brand" },
  maroon: { text: "text-maroon-900", solid: "bg-maroon-900", border: "border-maroon-900", soft: "bg-maroon-900/[0.07]", dot: "bg-maroon-900" },
  teal: { text: "text-teal-text", solid: "bg-teal", border: "border-teal", soft: "bg-teal/[0.09]", dot: "bg-teal" },
};

export interface NavSection {
  id: SectionId;
  href: string;
  label: string;
  fanteName?: string;
  tagline: string;
  tone: Tone;
  depth: LaunchDepth;
  primary?: boolean;
}

export const SECTIONS: NavSection[] = [
  { id: "home", href: "/", label: "Home", tagline: "The mirror — this is who we are.", tone: "green", depth: "deep" },
  { id: "music", href: "/music", label: "Music", fanteName: "The Oguaa Sound", tagline: "The flagship. Our artists, our sound, our spotlight.", tone: "clay", depth: "deep", primary: true },
  { id: "people", href: "/people", label: "People", tagline: "Sons & daughters — icons past and living.", tone: "gold", depth: "stub", primary: true },
  { id: "heritage", href: "/heritage", label: "Heritage", tagline: "The Castle, the Confederacy, the Asafo.", tone: "green", depth: "stub", primary: true },
  { id: "culture", href: "/culture", label: "Culture", tagline: "Fetu Afahye, the durbar, the Traditional Council.", tone: "gold", depth: "stub", primary: true },
  { id: "festivals", href: "/festivals", label: "Festivals", tagline: "Fetu Afahye, Bakatue, PANAFEST — every edition, archived.", tone: "gold", depth: "live", primary: true },
  { id: "visit", href: "/visit", label: "Visit", tagline: "The Castle, Kakum, the coast, the food.", tone: "teal", depth: "stub" },
  { id: "education", href: "/education", label: "Education", tagline: "The Citadel of Education — rep your school.", tone: "maroon", depth: "live", primary: true },
  { id: "business", href: "/business", label: "Business", tagline: "The working city — markets, fishing, trade.", tone: "teal", depth: "live" },
  { id: "memoriam", href: "/memoriam", label: "In Memoriam", fanteName: "Yɛnkae", tagline: "Let us remember — a home for those who have passed.", tone: "gold", depth: "deep", primary: true },
  { id: "community", href: "/community", label: "Community", tagline: "Get involved — events, youth opportunities, join us.", tone: "teal", depth: "live", primary: true },
  { id: "youth", href: "/youth", label: "Youth", tagline: "Opportunities board & young-talent spotlight.", tone: "teal", depth: "live", primary: true },
  { id: "safety", href: "/safety", label: "Safety", tagline: "Incidents, rescue & recovery — keeping Oguaa safe.", tone: "maroon", depth: "live" },
  { id: "lostfound", href: "/lost-found", label: "Lost & Found", tagline: "Lost items, found items, missing people — the town helps.", tone: "teal", depth: "live" },
];

export const SHOWCASE_SECTIONS = SECTIONS.filter((s) => s.id !== "home");
