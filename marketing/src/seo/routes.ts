// Per-route SEO metadata — the single source of truth for three consumers:
//
//   • router.tsx        → route `handle`s, which RootLayout applies on navigation
//   • vite.config.ts    → prerendered <head> per route + sitemap.xml, at build time
//   • the no-JS shell   → the <noscript> summary a crawler sees before hydration
//
// Keep it framework-free (see seo/site.ts for why).

export interface RouteSeo {
  /** Route path, leading slash, no trailing slash ("/" for home). */
  path: string;
  /** Full <title>. Front-load the distinct words; keep under ~65 chars. */
  title: string;
  description: string;
  /** Headline a crawler sees in the no-JS shell — mirror the page's real h1. */
  h1: string;
  /** Route-specific search terms, appended to the sitewide keyword set. */
  keywords?: string[];
  changefreq: "daily" | "weekly" | "monthly" | "yearly";
  priority: number;
}

const SUFFIX = "Oguaa";

export const ROUTE_SEO: RouteSeo[] = [
  {
    path: "/",
    title: "Oguaa (Oguaaman) — the home of Cape Coast, Ghana",
    description:
      "The community home of Cape Coast (Oguaa), Ghana — its history, culture, festivals, schools, people, businesses and the ones we remember. Made by us, for us.",
    h1: "This is Oguaa — the home of Cape Coast",
    keywords: ["Oguaa", "Oguaaman", "Cape Coast", "Obama City", "Cape Coast Ghana"],
    changefreq: "daily",
    priority: 1.0,
  },
  {
    path: "/names",
    title: "Oguaa, Oguaaman, Obama City — the names of Cape Coast",
    description:
      "Why Cape Coast is called Oguaa, Oguaaman, Kotokuraba, Cabo Corso, Obama City, the Ancient Capital and the Citadel of Education — where each name came from and who still uses it.",
    h1: "The names of Cape Coast",
    keywords: [
      "Oguaa meaning",
      "Oguaaman meaning",
      "why is Cape Coast called Obama City",
      "Obama City Ghana",
      "ancient capital of Ghana",
      "Kotokuraba meaning",
      "Cabo Corso",
      "Citadel of Education",
      "Cape Coast nickname",
      "Cape Coast other names",
    ],
    changefreq: "monthly",
    priority: 0.9,
  },
  {
    path: "/history",
    title: `History of Cape Coast — the ancient capital — ${SUFFIX}`,
    description:
      "A Fante market that became a castle, the capital of the British Gold Coast from 1821 to 1877, the nation's Citadel of Education, and a place of return for the African diaspora.",
    h1: "The history of Cape Coast",
    keywords: [
      "Cape Coast history",
      "ancient capital of Ghana",
      "Gold Coast capital",
      "Cape Coast Castle history",
      "Door of No Return",
    ],
    changefreq: "weekly",
    priority: 0.9,
  },
  {
    path: "/culture",
    title: `Culture of Oguaa — Asafo, posuban & the 77 gods — ${SUFFIX}`,
    description:
      "Fetu Afahye, the seven Asafo companies, the posuban shrines and frankaa flags, the 77 gods and the durbar — the living culture of Oguaa, Cape Coast.",
    h1: "The living culture of Oguaa",
    keywords: ["Asafo companies", "posuban shrine", "Fante culture", "Oguaa culture", "frankaa"],
    changefreq: "weekly",
    priority: 0.8,
  },
  {
    path: "/festivals",
    title: `Fetu Afahye & the festivals of Cape Coast — ${SUFFIX}`,
    description:
      "Fetu Afahye and the grand durbar, the diaspora's homecoming, and the wider coastal calendar — when Cape Coast stops to remember.",
    h1: "Festivals of Oguaa",
    keywords: ["Fetu Afahye", "Cape Coast festival", "Oguaa Fetu Afahye", "Ghana festivals", "durbar"],
    changefreq: "weekly",
    priority: 0.8,
  },
  {
    path: "/education",
    title: `Cape Coast schools — the Citadel of Education — ${SUFFIX}`,
    description:
      "The oldest school in Ghana and the foundations that taught a country — Mfantsipim, Adisadel, Wesley Girls', St. Augustine's, Holy Child and the University of Cape Coast.",
    h1: "The Citadel of Education",
    keywords: [
      "Citadel of Education",
      "Cape Coast schools",
      "Mfantsipim",
      "Adisadel College",
      "Wesley Girls",
      "University of Cape Coast",
    ],
    changefreq: "weekly",
    priority: 0.8,
  },
  {
    path: "/visit",
    title: `Visit Cape Coast — Castle, Kakum & the coast — ${SUFFIX}`,
    description:
      "Plan your visit to Cape Coast: the Castle and the Door of No Return, Kakum's canopy walk, Elmina and Assin Manso — how to get there, when to come, and what to eat.",
    h1: "Visit Cape Coast",
    keywords: [
      "visit Cape Coast",
      "Cape Coast Castle",
      "Kakum National Park",
      "Elmina Castle",
      "things to do in Cape Coast",
    ],
    changefreq: "monthly",
    priority: 0.9,
  },
  {
    path: "/leadership",
    title: `Leadership of Oguaa — the Omanhene & the Assembly — ${SUFFIX}`,
    description:
      "The traditional chieftaincy and the civic government of Cape Coast, shown as two living hierarchies — from the Omanhene and the Asafo to the Metropolitan Assembly.",
    h1: "The two orders of Oguaa",
    keywords: ["Oguaa Omanhene", "Oguaa Traditional Council", "Cape Coast Metropolitan Assembly"],
    changefreq: "weekly",
    priority: 0.7,
  },
  {
    path: "/better",
    title: `Build a better Oguaa — the civic code — ${SUFFIX}`,
    description:
      "The civic code of Cape Coast — the habits, from the self to the nation, that build a better town — and a pledge you can make today.",
    h1: "Build a better Oguaa",
    keywords: ["better Cape Coast", "civic pledge Ghana", "community development Cape Coast"],
    changefreq: "weekly",
    priority: 0.7,
  },
  {
    path: "/outside",
    title: `Oguaa Outside — trusted agents who act for you — ${SUFFIX}`,
    description:
      "A network of vetted, background-checked agents who handle business and errands for Cape Coast people beyond the town — procurement, shipping, inspection, travel and official errands — with managed escrow.",
    h1: "Oguaa Outside",
    keywords: ["Ghana diaspora errands", "Cape Coast agent", "diaspora services Ghana"],
    changefreq: "weekly",
    priority: 0.7,
  },
  {
    path: "/news",
    title: `Cape Coast news — the Oguaa Newsroom — ${SUFFIX}`,
    description:
      "Festivals, scholarships, homecomings and announcements from Cape Coast and its institutions. Free to read.",
    h1: "The Oguaa Newsroom",
    keywords: ["Cape Coast news", "Central Region news", "Ghana community news"],
    changefreq: "daily",
    priority: 0.8,
  },
  {
    path: "/about",
    title: `About Oguaa — the community home of Cape Coast — ${SUFFIX}`,
    description:
      "What Oguaa is building for Cape Coast and the diaspora: a living cultural archive, civic platform, and community home.",
    h1: "About Oguaa",
    keywords: ["about Oguaa", "Oguaaman platform", "Cape Coast community platform"],
    changefreq: "monthly",
    priority: 0.6,
  },
  {
    path: "/contact",
    title: `Contact Oguaa — ${SUFFIX}`,
    description:
      "How to reach the Oguaa team for support, partnerships, corrections, and stewardship of Cape Coast's public memory.",
    h1: "Contact Oguaa",
    changefreq: "yearly",
    priority: 0.4,
  },
  {
    path: "/privacy",
    title: `Privacy — ${SUFFIX}`,
    description: "How Oguaa handles your data, in plain language, under Ghana's Data Protection Act 843.",
    h1: "Privacy",
    changefreq: "yearly",
    priority: 0.2,
  },
  {
    path: "/terms",
    title: `Terms — ${SUFFIX}`,
    description: "The terms of use for Oguaa, the community platform for Cape Coast.",
    h1: "Terms",
    changefreq: "yearly",
    priority: 0.2,
  },
];

/** Lookup by path, for the router handles. */
export const seoFor = (path: string): RouteSeo | undefined => ROUTE_SEO.find((r) => r.path === path);
