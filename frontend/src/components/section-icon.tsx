import type { ReactNode } from "react";

// One line-icon per sitemap section (plus "news"). Inherit currentColor.
const PATHS: Record<string, ReactNode> = {
  home: <><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></>,
  music: <><path d="M9 18V5l10-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="16" cy="16" r="3" /></>,
  people: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M16 6.5a3 3 0 0 1 0 5.8" /><path d="M17 14.5a5.5 5.5 0 0 1 3.5 4.5" /></>,
  heritage: <><path d="M4 9h16M5 9v8M9 9v8M15 9v8M19 9v8M3 21h18M3 17h18" /><path d="M12 3 20 7H4Z" /></>,
  culture: <><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>,
  festivals: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /><path d="M8 14l2.5 2.5L16 11" /></>,
  visit: <><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" /></>,
  education: <><path d="M12 4 2 9l10 5 10-5-10-5Z" /><path d="M6 11v5c0 1 3 3 6 3s6-2 6-3v-5" /></>,
  business: <><path d="M3 9l1.5-5h15L21 9" /><path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9" /><path d="M3 9h18M9 20v-6h6v6" /></>,
  property: <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /><path d="M8 10h8" /></>,
  memoriam: <><path d="M12 3c1.6 1.4 1.6 3.2 0 4.6-1.6-1.4-1.6-3.2 0-4.6Z" /><path d="M12 7.6V13" /><rect x="7" y="13" width="10" height="8" rx="1.5" /></>,
  community: <><circle cx="8" cy="9" r="2.4" /><circle cx="16" cy="9" r="2.4" /><path d="M3 19a5 5 0 0 1 9-2.6A5 5 0 0 1 21 19" /></>,
  news: <><path d="M4 5h12v14H5a1 1 0 0 1-1-1Z" /><path d="M16 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1" /><path d="M7 8h6M7 11h6M7 14h4" /></>,
  safety: <><path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6Z" /><path d="M12 8v4" /><path d="M12 15.5v.5" /></>,
  lostfound: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /><path d="M11 8v3l2 2" /></>,
  events: <><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /><path d="M8 14h.01M12 14h.01M16 14h.01" /></>,
  youth: <><circle cx="12" cy="8" r="3.2" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /><path d="m19 4 .8 2 2 .8-2 .8L19 10l-.8-2-2-.8 2-.8Z" /></>,
  diaspora: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a13.6 13.6 0 0 1 0 18" /><path d="M12 3a13.6 13.6 0 0 0 0 18" /></>,
  map: <><path d="M9 4 3 6.2v13.8l6-2.2 6 2.2 6-2.2V3.8l-6 2.2-6-2.2Z" /><path d="M9 4v13.8M15 6.2V20" /></>,
  better: <><path d="M11 14h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 16" /><path d="m7 20 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9" /><path d="m2 15 6 6" /><path d="M19.5 8.5c.7-.7 1.5-1.6 1.5-2.7A2.73 2.73 0 0 0 16 4a2.78 2.78 0 0 0-5 1.8c0 1.2.8 2 1.5 2.8L16 12Z" /></>,
  // Oguaa Outside — a parcel/consignment: procurement, shipping, errands abroad.
  outside: <><path d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="M4 7.5 12 12l8-4.5M12 12v9" /><path d="m8 5.2 8 4.6" /></>,
};

export function SectionIcon({ id, className = "" }: Readonly<{ id: string; className?: string }>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {PATHS[id] ?? PATHS.home}
    </svg>
  );
}
