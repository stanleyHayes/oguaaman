import type { ReactNode } from "react";

// One line-icon per marketing section — mirrors the portal's / Nav's section-icon
// set so the page banners, the menu and the app all read as one product. Each
// glyph inherits currentColor. Used for the animated hero icon and the large
// corner watermark on every page banner.
const PATHS: Record<string, ReactNode> = {
  home: <><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></>,
  history: <><path d="M4 9h16M5 9v8M9 9v8M15 9v8M19 9v8M3 21h18M3 17h18" /><path d="M12 3 20 7H4Z" /></>,
  culture: <><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>,
  festivals: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /><path d="M8 14l2.5 2.5L16 11" /></>,
  education: <><path d="M12 4 2 9l10 5 10-5-10-5Z" /><path d="M6 11v5c0 1 3 3 6 3s6-2 6-3v-5" /></>,
  visit: <><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" /></>,
  leadership: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M16 6.5a3 3 0 0 1 0 5.8" /><path d="M17 14.5a5.5 5.5 0 0 1 3.5 4.5" /></>,
  news: <><path d="M4 5h12v14H5a1 1 0 0 1-1-1Z" /><path d="M16 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1" /><path d="M7 8h6M7 11h6M7 14h4" /></>,
  privacy: <><path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6Z" /><path d="M12 8v4" /><path d="M12 15.5v.5" /></>,
  terms: <><path d="M6 3h9l3 3v15H6Z" /><path d="M15 3v3h3" /><path d="M9 8h3M9 12h6M9 16h6" /></>,
  better: <><path d="M12 21s-7-4.35-7-9.5A3.5 3.5 0 0 1 12 8a3.5 3.5 0 0 1 7 3.5c0 5.15-7 9.5-7 9.5Z" /><path d="m9.5 12 1.8 1.8 3.2-3.4" /></>,
  // "Oguaa Outside" — a globe (your business, out in the world) with a checked
  // marker for the vetted agent who handles it on your behalf.
  outside: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.5 2.6 3.8 5.7 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.7-3.8-9s1.3-6.4 3.8-9Z" /></>,
};

export function SectionIcon({ id, className = "" }: Readonly<{ id: string; className?: string }>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {PATHS[id] ?? PATHS.home}
    </svg>
  );
}
