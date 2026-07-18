// The town's civic code + the lessons of great civilizations, read LIVE from
// /api/civic (public, no auth). Mirrors the schools.ts hook shape: starts empty
// and fills once the backend answers; on error it stays empty (a marketing page
// never shows an error). Nothing here is hardcoded — every behaviour and lesson
// comes from the database.
import { useEffect, useState } from "react";

export type CivicRing = "self" | "home" | "school" | "work" | "town" | "nation";

export interface CivicBehaviour {
  slug: string;
  ring: CivicRing;
  type: "do" | "stop";
  title: string;
  description: string;
  why: string;
}

export interface CivicLesson {
  slug: string;
  name: string;
  era: string;
  principle: string;
  lesson: string;
}

export interface CivicData {
  behaviors: CivicBehaviour[];
  civilizations: CivicLesson[];
}

const EMPTY: CivicData = { behaviors: [], civilizations: [] };

function isCivicData(v: unknown): v is CivicData {
  if (v == null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return Array.isArray(o.behaviors) && Array.isArray(o.civilizations);
}

/** Read /api/civic live. Starts empty and fills once the backend answers. */
export function useCivic(): CivicData {
  const [data, setData] = useState<CivicData>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/civic", { headers: { Accept: "application/json" } })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("bad response"))))
      .then((d: unknown) => {
        if (!cancelled && isCivicData(d)) setData(d);
      })
      .catch(() => {
        /* stay empty silently */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return data;
}

const PLEDGE_KEY = "oguaa.pledge";

/** Persisted set of pledged behaviour slugs (localStorage on this static site).
 *  Nothing is sent to a server — the pledge is a private promise on the device. */
export function usePledge() {
  const [pledged, setPledged] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(PLEDGE_KEY);
      const arr = raw ? (JSON.parse(raw) as unknown) : [];
      return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : []);
    } catch {
      return new Set();
    }
  });

  const persist = (next: Set<string>) => {
    setPledged(next);
    try {
      window.localStorage.setItem(PLEDGE_KEY, JSON.stringify([...next]));
    } catch {
      /* ignore quota/private-mode errors */
    }
  };

  const toggle = (slug: string) => {
    const next = new Set(pledged);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    persist(next);
  };

  const clear = () => persist(new Set());

  return { pledged, toggle, clear };
}

/** The six rings, ordered from the self outward, with a one-line gloss. */
export const RINGS: { key: CivicRing; label: string; note: string }[] = [
  { key: "self", label: "Self", note: "The habits you keep when no one is watching." },
  { key: "home", label: "Home", note: "The table, the greeting, the household." },
  { key: "school", label: "School", note: "The compound that raises the town." },
  { key: "work", label: "Work", note: "Your word, your trade, your name." },
  { key: "town", label: "Town", note: "The streets, the shore, Kotokuraba." },
  { key: "nation", label: "Nation", note: "The ballot, the toll, the country." },
];
