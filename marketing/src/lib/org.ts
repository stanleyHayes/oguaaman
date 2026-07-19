// Organizations carry the rich-page engine — Summary, History, a photo Gallery,
// and author-composed Sections (richtext, gallery, stats, timeline, faq, …). The
// marketing site reads them read-only to render heritage/place detail pages; the
// content is configured in the admin dashboard. Mirrors the backend domain + the
// portal's types. See oguaa/Institution-Pages-Spec.md.
import { useEffect, useState } from "react";
import type { Listing } from "@/lib/listings";
import { apiUrl } from "./api";

export interface MediaAsset {
  id: string;
  url: string;
  kind?: string;
  alt?: string;
  caption?: string;
  credit?: string;
  moderation?: string;
}

export interface SectionItem {
  id?: string;
  label?: string;
  value?: string;
  detail?: string;
  image?: string;
  url?: string;
}

export type ProfileSectionType =
  | "richtext" | "gallery" | "stats" | "team" | "timeline"
  | "faq" | "docs" | "quote" | "cta" | "logos" | "divider"
  | "groups" | "hero" | "testimonials" | "contact"
  | "menu" | "schedule" | "map";

/** A child body shown as a card in a "groups" section (house, department, Asafo company, year group, sub-site). */
export interface SubEntity {
  id: string;
  name: string;
  subtitle?: string;
  crestUrl?: string;
  colors?: string[];
  summary?: string;
  attrs?: SectionItem[];
}

export interface ProfileSection {
  id: string;
  type: ProfileSectionType;
  title?: string;
  anchor?: string;
  tone?: string;
  hidden?: boolean;
  body?: string;
  media?: MediaAsset[];
  items?: SectionItem[];
  groups?: SubEntity[];
}

export interface Organization {
  id: string;
  slug: string;
  kind: string;
  name: string;
  officialTitle?: string;
  motto?: string;
  crestUrl?: string;
  summary: string;
  history?: string;
  founded?: number;
  classification?: string;
  jurisdiction?: string;
  gallery?: MediaAsset[];
  sections?: ProfileSection[];
  houseColors?: string[];
  verified?: boolean;
}

function isOrgArray(v: unknown): v is Organization[] {
  return (
    Array.isArray(v) &&
    v.every((x) => x != null && typeof x === "object" && typeof (x as Organization).slug === "string" && typeof (x as Organization).name === "string")
  );
}

/**
 * Read the town's heritage/visit places live (GET /api/institutions?kind=heritage),
 * so a place added in the admin appears on the Visit page automatically. Starts
 * empty and fills once the backend answers; on error/empty it stays empty.
 * Mirrors the useListings discipline.
 */
export interface HeritageDirectoryState {
  status: "loading" | "ready" | "error";
  items: Organization[];
}

export function useHeritageDirectory(): HeritageDirectoryState {
  const [state, setState] = useState<HeritageDirectoryState>({ status: "loading", items: [] });
  useEffect(() => {
    let cancelled = false;
    fetch(apiUrl("/api/institutions?kind=heritage"), { headers: { Accept: "application/json" } })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("bad response"))))
      .then((data: unknown) => {
        if (cancelled) return;
        setState(isOrgArray(data) ? { status: "ready", items: data } : { status: "error", items: [] });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", items: [] });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

/** Backwards-compatible array-only view for small consumers. */
export function useHeritage(): Organization[] {
  return useHeritageDirectory().items;
}

export interface PlaceView {
  org: Organization;
  officialEvents: Listing[];
}

/**
 * Read one heritage place by slug. GET /api/institutions/{slug} returns a view
 * object { institution, events, officialEvents }. We surface the org plus its
 * official events. Only kind:"heritage" belongs on /visit/:slug — a school or
 * civic org also resolves by slug, so non-heritage is treated as a miss.
 * Returns null on any miss so the page shows a graceful "not found".
 */
export async function fetchPlace(slug: string): Promise<PlaceView | null> {
  try {
    const res = await fetch(apiUrl(`/api/institutions/${slug}`), { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const data = (await res.json()) as { institution?: Organization; officialEvents?: Listing[] } & Partial<Organization>;
    const org = (data && typeof data === "object" && "institution" in data ? data.institution : (data as Organization)) as Organization | undefined;
    if (!org || typeof org.name !== "string" || org.kind !== "heritage") return null;
    const officialEvents = Array.isArray(data.officialEvents) ? data.officialEvents : [];
    return { org, officialEvents };
  } catch {
    return null;
  }
}
