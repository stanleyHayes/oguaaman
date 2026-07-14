// Schools are Organization records (kind "school"), not listings — they carry a
// motto, founding year, classification, house colours and an Old Students name.
// The Education page reads them LIVE from /api/schools so any school that builds
// a profile in the admin dashboard appears on the marketing site automatically,
// with the verified core set as a seeded fallback when the backend is offline.
import { useEffect, useState } from "react";

export interface SchoolOrg {
  id: string;
  slug: string;
  name: string;
  motto?: string;
  summary?: string;
  founded?: number;
  classification?: string;
  osaName?: string;
  houseColors?: string[];
  verified?: boolean;
}

function isSchoolArray(v: unknown): v is SchoolOrg[] {
  return (
    Array.isArray(v) &&
    v.every(
      (x) =>
        x != null &&
        typeof x === "object" &&
        typeof (x as SchoolOrg).name === "string" &&
        typeof (x as SchoolOrg).slug === "string",
    )
  );
}

/** Read /api/schools with the verified core set as a fallback. */
export function useSchools(fallback: SchoolOrg[]): SchoolOrg[] {
  const [items, setItems] = useState<SchoolOrg[]>(fallback);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/schools", { headers: { Accept: "application/json" } })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("bad response"))))
      .then((data: unknown) => {
        if (!cancelled && isSchoolArray(data) && data.length > 0) setItems(data);
      })
      .catch(() => {
        /* keep the seeded fallback silently */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return items;
}

/** Two-letter monogram for a school crest. */
export function schoolInitials(name: string): string {
  const words = name.split(/\s+/).filter((w) => /[A-Za-z]/.test(w.charAt(0)));
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return ((words[0]?.[0] ?? "") + (words[words.length - 1]?.[0] ?? "")).toUpperCase();
}

// The verified core set (mirrors backend seed_listings.go orgs), used as the
// fallback. The live endpoint supersedes this — and is the richer list.
export const SCHOOLS_FALLBACK: SchoolOrg[] = [
  { id: "mfantsipim", slug: "mfantsipim", name: "Mfantsipim School", founded: 1876, classification: "Senior High (Methodist, boys)", motto: "Dwen Hwɛ Kan — Think and Look Ahead", osaName: "MOBA", houseColors: ["#A4161A", "#161616"], summary: "The oldest secondary school in Ghana, opened in 1876 on the Castle grounds and now on Kwabotwe Hill. Kofi Annan, class of 1957. It turns 150 in 2026." },
  { id: "adisadel", slug: "adisadel", name: "Adisadel College", founded: 1910, classification: "Senior High (Anglican, boys)", motto: "Vel Primus Vel Cum Primis — Either the First or With the First", osaName: "Santaclausians", houseColors: ["#161616", "#FBFBFB"], summary: "The town's Anglican answer, founded 1910 — second-oldest in Ghana, and proud of every inch of the gap." },
  { id: "wesley-girls", slug: "wesley-girls", name: "Wesley Girls' High School", founded: 1836, classification: "Senior High (Methodist, girls)", motto: "Live Pure, Speak True, Right Wrong, Follow the King", osaName: "Wey Gey Hey OGA", houseColors: ["#1E6B3A", "#E3B23C"], summary: "Traced to 1836 under Harriet Wrigley and reorganised into today's school around 1954 — a by-word for poise and excellence." },
  { id: "st-augustines", slug: "st-augustines", name: "St. Augustine's College", founded: 1930, classification: "Senior High (Catholic, boys)", motto: "Omnia Vincit Labor — Work Conquers All", osaName: "APSU", houseColors: ["#0E7C4A", "#FBFBFB"], summary: "The first Catholic secondary school in Ghana, begun at Amissano in 1930 and moved to Cape Coast. Known as AUGUSCO." },
  { id: "holy-child", slug: "holy-child", name: "Holy Child School", founded: 1946, classification: "Senior High (Catholic, girls)", motto: "Facta Non Verba — Actions Not Words", osaName: "HOPSA", houseColors: ["#6B4423", "#E3B23C"], summary: "The Catholic girls' school on Angel's Hill, opened in 1946. All-boarding; its old girls are Hopsans. 80 years in 2026." },
  { id: "ucc", slug: "ucc", name: "University of Cape Coast", founded: 1962, classification: "Public university", motto: "Veritas Nobis Lumen — Truth, Our Light", osaName: "UCC Alumni", houseColors: ["#0B3D91", "#C7A24A"], summary: "Founded in 1962 to teach the teachers, and a university in its own right by 1971. Its Department of Music & Dance keeps Fante rhythm in the academy." },
  { id: "bakaano-basic", slug: "bakaano-basic", name: "Bakaano M/A Basic School", founded: 1957, classification: "KG · Primary · JHS", motto: "Knowledge and Service", houseColors: ["#123F2D", "#C7A24A"], summary: "The fishing quarter's own school, planted the year of independence, teaching the children of Bakaano within sight of the sea." },
];
