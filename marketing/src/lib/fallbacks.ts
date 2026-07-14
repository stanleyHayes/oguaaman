// Seeded fallbacks for the live community rows — real, verified entries drawn
// from the app's seed data so every section renders something true before the
// backend answers (and if it never does). Slugs match the portal's routes so
// the cards deep-link correctly. Keep these in step with backend seed_listings.go.
import type { Listing } from "@/lib/listings";
import type { Organization } from "@/lib/org";

export const ARTISTS_FALLBACK: Listing[] = [
  { id: "a-esi-sunshine", type: "artist", slug: "esi-sunshine", title: "Esi Sunshine", details: { genres: ["Gospel Highlife", "Gospel"] } },
  { id: "a-kojo-castle", type: "artist", slug: "kojo-castle", title: "Kojo Castle", details: { genres: ["Hiplife", "Drill"] } },
  { id: "a-nana-tone", type: "artist", slug: "nana-tone", title: "Nana Tone", details: { genres: ["Highlife", "Palm-wine"] } },
  { id: "a-abena-wave", type: "artist", slug: "abena-wave", title: "Abena Wave", details: { genres: ["Afrobeats", "R&B"] } },
  { id: "a-frankaa-band", type: "artist", slug: "frankaa-band", title: "The Frankaa Band", details: { genres: ["Asafo Fusion", "Highlife"] } },
  { id: "a-kweku-brass", type: "artist", slug: "kweku-brass", title: "Kweku Brass", details: { genres: ["Jazz", "Brass"] } },
];

export const BUSINESSES_FALLBACK: Listing[] = [
  { id: "b-castleview", type: "business", slug: "castle-view-guesthouse", title: "Castle View Guesthouse", details: { category: "Hospitality & Lodging" } },
  { id: "b-fish", type: "business", slug: "kotokuraba-fresh-fish", title: "Esi's Fresh Fish — Kotokuraba", details: { category: "Market & Fishing" } },
  { id: "b-kenkey", type: "business", slug: "bakaano-kenkey-junction", title: "Bakaano Kenkey Junction", details: { category: "Food & Drink" } },
];

export const PEOPLE_FALLBACK: Listing[] = [
  { id: "p-kofi-annan", type: "person", slug: "kofi-annan", title: "Kofi Annan", details: { era: "1938–2018", whyNotable: "Seventh Secretary-General of the United Nations and Nobel Peace laureate — old boy of Mfantsipim." } },
  { id: "p-ck-mann", type: "person", slug: "ck-mann", title: "C.K. Mann", details: { era: "1936–2018", whyNotable: "“Osodehene” — he turned the fishermen's osode rhythm into national highlife." } },
  { id: "p-ebo-taylor", type: "person", slug: "ebo-taylor", title: "Ebo Taylor", details: { era: "1936–2026", whyNotable: "Highlife and Afro-funk pioneer of the Central Region coast; carried the sound to the world." } },
  { id: "p-sarbah", type: "person", slug: "john-mensah-sarbah", title: "John Mensah Sarbah", details: { era: "1864–1910", whyNotable: "Pioneering lawyer and a founder of the Aborigines' Rights Protection Society in Cape Coast." } },
  { id: "p-omanhene", type: "person", slug: "osabarimba-kwesi-atta-ii", title: "Osabarimba Kwesi Atta II", details: { era: "living", whyNotable: "Omanhene of Oguaa and custodian of Fetu Afahye and the 77 gods." } },
];

export const MEMORIALS_FALLBACK: Listing[] = [
  { id: "mem-adwoa", type: "memorial", slug: "madam-adwoa-mensah", title: "Adwoa Mensah", details: { honorific: "Madam" } },
  { id: "mem-kobina", type: "memorial", slug: "opanyin-kobina-eshun", title: "Kobina Eshun", details: { honorific: "Opanyin" } },
];

export const OPPORTUNITIES_FALLBACK: Listing[] = [
  { id: "op-moba", type: "opportunity", slug: "moba-scholarship-2026", title: "MOBA Needs-Based Scholarship", details: { kind: "scholarship", deadline: "2026-07-31" } },
  { id: "op-fisheries", type: "opportunity", slug: "coastal-fisheries-apprenticeship", title: "Coastal Fisheries Apprenticeship", details: { kind: "apprenticeship", deadline: "2026-06-30" } },
  { id: "op-coding", type: "opportunity", slug: "ucc-summer-coding", title: "UCC Summer Coding Programme", details: { kind: "training", deadline: "2026-07-15" } },
];

export const EVENTS_FALLBACK: Listing[] = [
  { id: "e-fetu", type: "event", slug: "fetu-afahye-2026", title: "Oguaa Fetu Afahye 2026", details: { startsAt: "2026-09-05", venue: "Victoria Park & across Cape Coast" } },
  { id: "e-soundlive", type: "event", slug: "the-oguaa-sound-live", title: "The Oguaa Sound — Live at the Castle Gardens", details: { startsAt: "2026-08-15", venue: "Cape Coast Castle Gardens" } },
  { id: "e-funmatch", type: "event", slug: "mfantsipim-adisadel-fun-games", title: "Mfantsipim–Adisadel Fun Games", details: { startsAt: "2026-07-18", venue: "Cape Coast Sports Stadium" } },
  { id: "e-bakaano-prize", type: "event", slug: "bakaano-prize-giving", title: "68th Speech & Prize-Giving Day", details: { startsAt: "2026-11-22", venue: "School park, Bakaano" } },
];

// The town's heritage/visit places (Visit page grid) — mirrors the seeded
// kind:"heritage" orgs. The live /api/institutions?kind=heritage supersedes this.
export const HERITAGE_FALLBACK: Organization[] = [
  { id: "h-castle", slug: "cape-coast-castle", kind: "heritage", name: "Cape Coast Castle", classification: "UNESCO World Heritage · castle & museum", summary: "The white castle on the rock — slave dungeons, the Door of No Return, and a museum that holds the weight of the Atlantic crossing. The reason the world returns to Oguaa." },
  { id: "h-kakum", slug: "kakum-national-park", kind: "heritage", name: "Kakum National Park", classification: "Rainforest national park · canopy walkway", summary: "A tropical rainforest a short drive north, crossed by a famous canopy walkway — seven rope bridges strung up to forty metres above the forest floor." },
  { id: "h-elmina", slug: "elmina-castle", kind: "heritage", name: "Elmina Castle (St. George's)", classification: "UNESCO World Heritage · built 1482", summary: "St. George's Castle at Elmina, a short drive west — built by the Portuguese in 1482, and by most accounts the oldest surviving European-built structure in sub-Saharan Africa." },
  { id: "h-fort-william", slug: "fort-william-lighthouse", kind: "heritage", name: "Fort William Lighthouse", classification: "19th-century fort & lighthouse", summary: "The hilltop fort-turned-lighthouse above Cape Coast, its beam sweeping the coast — climb the hill for the best view of all of Oguaa." },
  { id: "h-fosu", slug: "fosu-lagoon", kind: "heritage", name: "Fosu Lagoon", classification: "Lagoon · birdlife & rite", summary: "The quiet lagoon behind the coastline, fringed with mangroves and herons — and tied to the rites of Fetu Afahye each September." },
  { id: "h-kotokuraba", slug: "kotokuraba-market", kind: "heritage", name: "Kotokuraba Market", classification: "Central market · the crab market", summary: "The town's beating heart — the crab-sellers' market that gave Oguaa its name, and still the busiest trading ground on the coast." },
  { id: "h-assin-manso", slug: "assin-manso-slave-river", kind: "heritage", name: "Assin Manso Slave River", classification: "Ancestral memorial site", summary: "Donkor Nsuo, where the captured took their last bath on home soil before the march to the coast. A place of return, walked barefoot and in silence." },
  { id: "h-bakaano-shore", slug: "bakaano-fishing-shore", kind: "heritage", name: "Bakaano & the fishing shore", classification: "Fishing harbour & landing beach", summary: "Brightly painted canoes drawn up on the sand at dawn, the catch coming in, and the Atlantic that has shaped Oguaa life for centuries." },
];

// The mixed "Right now in Oguaa" rail (Home — HappeningNow).
export const FEATURED_FALLBACK: Listing[] = [
  EVENTS_FALLBACK[0],
  EVENTS_FALLBACK[1],
  BUSINESSES_FALLBACK[0],
  BUSINESSES_FALLBACK[2],
  ARTISTS_FALLBACK[0],
  MEMORIALS_FALLBACK[0],
];
