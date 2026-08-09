// The single source of truth for how Oguaa describes itself to search engines.
//
// Cape Coast answers to many names. Someone searching "Oguaaman", "Obama City"
// or "the ancient capital of Ghana" is looking for this town, and the site has
// to be findable under every one of them. Two mechanisms carry that:
//
//   1. Structured data — a City entity carrying `alternateName` for each name,
//      tied to Wikidata/Wikipedia via `sameAs` so search engines can fuse it
//      with the Cape Coast entity they already know.
//   2. Real prose — /names explains each name honestly (see pages/NamesPage).
//
// Framework-free on purpose: `vite.config.ts` imports this at build time to
// prerender head tags and emit the sitemap, so nothing here may touch React,
// the DOM, or `window`.

/** Names the town itself answers to, most-used first. */
export const CITY_ALIASES = [
  "Oguaa",
  "Oguaaman",
  "Cape Coast",
  "Obama City",
  "the Ancient Capital",
  "Kotokuraba",
  "Cabo Corso",
  "Citadel of Education",
] as const;

/** Names the platform answers to (brand, not town). */
export const BRAND_ALIASES = ["Oguaa", "Oguaaman", "Oguaa Cape Coast", "oguaaman.com"] as const;

/**
 * Head keywords. The `keywords` meta tag carries no ranking weight at Google,
 * but it is still read by several other engines and by internal site search,
 * and it costs nothing. The real work is done by the entity graph below and by
 * the copy on the page.
 */
export const KEYWORDS = [
  "Oguaa",
  "Oguaaman",
  "Cape Coast",
  "Cape Coast Ghana",
  "Obama City",
  "Obama City Ghana",
  "Ancient Capital",
  "ancient capital of Ghana",
  "Kotokuraba",
  "Cabo Corso",
  "Citadel of Education",
  "Central Region Ghana",
  "Fetu Afahye",
  "Cape Coast Castle",
  "Asafo",
  "Fante",
  "Kakum National Park",
  "Elmina",
  "Ghana diaspora",
  "Year of Return",
] as const;

/**
 * Route terms first, then the sitewide set, with case-insensitive duplicates
 * dropped — several routes legitimately repeat a sitewide term, and a keywords
 * tag that says "Oguaa, Oguaaman, Oguaa, Oguaaman" reads as stuffing.
 */
export function mergeKeywords(routeKeywords: readonly string[] = []): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const term of [...routeKeywords, ...KEYWORDS]) {
    const key = term.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(term.trim());
  }
  return out.join(", ");
}

/** Authoritative records for the same real-world place — the entity anchor. */
export const CITY_SAME_AS = [
  "https://www.wikidata.org/wiki/Q221283",
  "https://en.wikipedia.org/wiki/Cape_Coast",
] as const;

export const SITE_NAME = "Oguaa";
export const SITE_TAGLINE = "the home of Cape Coast";
export const DEFAULT_TITLE = "Oguaa (Oguaaman) — the home of Cape Coast, Ghana";
export const DEFAULT_DESCRIPTION =
  "Oguaa is the community home of Cape Coast, Ghana — the town also known as Oguaaman, Kotokuraba, Obama City and the ancient capital of the Gold Coast. Its history, culture, festivals, schools, businesses, people and the ones we remember. Made by us, for us.";

const trimSlash = (s: string) => s.replace(/\/+$/, "");

/**
 * The sitewide entity graph, emitted on every page.
 *
 * The City node is the important one: it declares every alias as an
 * `alternateName` and points `sameAs` at Wikidata/Wikipedia, which is how a
 * search engine learns that the "Obama City" someone typed and the Cape Coast
 * in its knowledge graph are the same place — and that this site is about it.
 */
export function siteGraph(siteUrl: string) {
  const site = trimSlash(siteUrl);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${site}/#website`,
        name: SITE_NAME,
        alternateName: [...BRAND_ALIASES],
        url: `${site}/`,
        description: DEFAULT_DESCRIPTION,
        inLanguage: "en-GH",
        publisher: { "@id": `${site}/#organization` },
        about: { "@id": `${site}/#city` },
      },
      {
        "@type": "Organization",
        "@id": `${site}/#organization`,
        name: SITE_NAME,
        alternateName: [...BRAND_ALIASES],
        url: `${site}/`,
        logo: `${site}/icon.svg`,
        description:
          "The community platform for Cape Coast (Oguaa), Ghana — its music, people, heritage, institutions and remembrance.",
        areaServed: { "@id": `${site}/#city` },
        address: {
          "@type": "PostalAddress",
          addressLocality: "Cape Coast",
          addressRegion: "Central Region",
          addressCountry: "GH",
        },
      },
      {
        "@type": "City",
        "@id": `${site}/#city`,
        name: "Cape Coast",
        alternateName: [...CITY_ALIASES],
        sameAs: [...CITY_SAME_AS],
        description:
          "Cape Coast — Oguaa in Fante — is the capital of Ghana's Central Region: a Fante market town that became the capital of the British Gold Coast from 1821 to 1877, home of Cape Coast Castle, the Fetu Afahye festival and the country's oldest schools.",
        containedInPlace: {
          "@type": "AdministrativeArea",
          name: "Central Region",
          address: { "@type": "PostalAddress", addressCountry: "GH" },
        },
        geo: { "@type": "GeoCoordinates", latitude: 5.1053, longitude: -1.2466 },
      },
    ],
  };
}

/** FAQ structured data — powers the "People also ask" style result on /names. */
export function faqGraph(faqs: ReadonlyArray<{ q: string; a: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

/** Breadcrumb structured data for a non-home page. */
export function breadcrumbGraph(siteUrl: string, path: string, name: string) {
  const site = trimSlash(siteUrl);
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${site}/` },
      { "@type": "ListItem", position: 2, name, item: `${site}${path}` },
    ],
  };
}
