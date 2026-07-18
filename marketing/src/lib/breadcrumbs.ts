// Route → banner-chrome derivation for the marketing site's PageHero. Mirrors the
// portal's frontend/src/lib/breadcrumbs.ts, adapted to the marketing routes and
// labels. Deliberately duplicated (the two apps don't share code) and kept out of
// the component file so React Fast Refresh stays happy (components-only there).

export interface Crumb {
  label: string;
  to?: string;
}

// First route segment → a SectionIcon id (see components/section-icon.tsx PATHS)
// and the human label shown in the breadcrumb trail. Anything unmapped falls back
// to "home" / a title-cased slug.
const SECTIONS: Record<string, { icon: string; label: string }> = {
  history: { icon: "history", label: "History" },
  culture: { icon: "culture", label: "Culture" },
  festivals: { icon: "festivals", label: "Festivals" },
  education: { icon: "education", label: "Education" },
  visit: { icon: "visit", label: "Visit" },
  leadership: { icon: "leadership", label: "Leadership" },
  better: { icon: "better", label: "Build a better Oguaa" },
  news: { icon: "news", label: "News" },
  privacy: { icon: "privacy", label: "Privacy" },
  terms: { icon: "terms", label: "Terms" },
};

/** First route segment → a SectionIcon id, defaulting to "home". */
export function sectionIdFromPath(pathname: string): string {
  const seg = pathname.split("/").filter(Boolean)[0];
  if (!seg) return "home";
  return SECTIONS[seg]?.icon ?? "home";
}

function titleCase(seg: string): string {
  return seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Derive Home / <Section> / <Page> crumbs from a pathname. `finalLabel` (e.g.
 *  a detail page's title — a place or article name) names the current leaf more
 *  nicely than a title-cased slug would; it's ignored for known top-level
 *  sections, which keep their short section name. */
export function deriveCrumbs(pathname: string, finalLabel?: string): Crumb[] {
  const segs = pathname.split("/").filter(Boolean);
  const crumbs: Crumb[] = [{ label: "Home", to: "/" }];
  let acc = "";
  segs.forEach((seg, i) => {
    acc += `/${seg}`;
    const isLast = i === segs.length - 1;
    const known = SECTIONS[seg]?.label;
    const label = known ?? (isLast && finalLabel ? finalLabel : titleCase(seg));
    crumbs.push({ label, to: isLast ? undefined : acc });
  });
  return crumbs;
}
