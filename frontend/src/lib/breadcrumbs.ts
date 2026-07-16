import { SECTIONS } from "./sections";

// Route → banner-chrome derivation shared by PageHero and DetailHero. Kept out
// of the component file so React Fast Refresh stays happy (components-only).

export interface Crumb {
  label: string;
  to?: string;
}

// Section ids the icon set covers (see components/section-icon.tsx PATHS).
const KNOWN_SECTIONS = new Set([
  "home", "music", "people", "heritage", "culture", "festivals", "visit",
  "education", "business", "memoriam", "community", "news", "safety",
  "lostfound", "events", "youth", "diaspora",
]);

// A few route segments don't match a section id 1:1, or are utility routes
// that borrow the closest section glyph.
const SEGMENT_TO_SECTION: Record<string, string> = {
  "lost-found": "lostfound",
  projects: "community",
  investment: "business",
  mentorship: "youth",
  alerts: "safety",
  submit: "community",
  search: "home",
  me: "people",
  members: "people",
  signin: "home",
};

/** First route segment → a SectionIcon id, defaulting to "home". */
export function sectionIdFromPath(pathname: string): string {
  const seg = pathname.split("/").filter(Boolean)[0];
  if (!seg) return "home";
  if (SEGMENT_TO_SECTION[seg]) return SEGMENT_TO_SECTION[seg];
  const norm = seg.replace(/-/g, "");
  if (KNOWN_SECTIONS.has(seg)) return seg;
  if (KNOWN_SECTIONS.has(norm)) return norm;
  return "home";
}

function titleCase(seg: string): string {
  return seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Prefer the sitemap's human label for a known section href.
const HREF_LABEL = new Map(SECTIONS.map((s) => [s.href, s.label]));

/** Derive Home / <Section> / <Page> crumbs from a pathname. `finalLabel`
 *  (e.g. the hero title, when it's a plain string) names the current page more
 *  nicely than a title-cased slug would. */
export function deriveCrumbs(pathname: string, finalLabel?: string): Crumb[] {
  const segs = pathname.split("/").filter(Boolean);
  const crumbs: Crumb[] = [{ label: "Home", to: "/" }];
  let acc = "";
  segs.forEach((seg, i) => {
    acc += `/${seg}`;
    const isLast = i === segs.length - 1;
    const label = HREF_LABEL.get(acc) ?? (isLast && finalLabel ? finalLabel : titleCase(seg));
    crumbs.push({ label, to: isLast ? undefined : acc });
  });
  return crumbs;
}
