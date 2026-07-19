// Schools are Organization records (kind "school"), not listings — they carry a
// motto, founding year, classification, house colours and an Old Students name.
// The Education page reads them LIVE from /api/schools so any school that builds
// a profile in the admin dashboard appears on the marketing site automatically.
// There is no client-side fallback: the list starts empty and fills from the API.
import { useEffect, useState } from "react";
import { apiUrl } from "./api";

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

/**
 * Read /api/schools live. Starts empty and fills once the backend answers;
 * on error/empty it stays empty (the Education page skips the grid).
 */
export function useSchools(): SchoolOrg[] {
  const [items, setItems] = useState<SchoolOrg[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(apiUrl("/api/schools"), { headers: { Accept: "application/json" } })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("bad response"))))
      .then((data: unknown) => {
        if (!cancelled && isSchoolArray(data)) setItems(data);
      })
      .catch(() => {
        /* stay empty silently — a marketing page shows no errors */
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
  return ((words[0]?.[0] ?? "") + (words.at(-1)?.[0] ?? "")).toUpperCase();
}
