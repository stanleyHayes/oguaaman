import { Briefcase, Building2, Palette, CalendarDays, Landmark, PenLine, type LucideIcon } from "lucide-react";
import type { Member } from "./types";

/** One selectable creator hat. `id` is the value the API stores in creatorTypes. */
export interface CreatorTypeMeta { id: string; label: string; desc: string; icon: LucideIcon }

/**
 * The creator kinds a member can claim. "writer" is the newsroom hat — it
 * unlocks the compose page and the "Write & publish" tool panel.
 */
export const CREATOR_TYPES: CreatorTypeMeta[] = [
  { id: "business", label: "Business owner", desc: "Shops, services, food & drink", icon: Briefcase },
  { id: "property", label: "Realtor / property manager", desc: "Rentals, rooms and short stays", icon: Building2 },
  { id: "artist", label: "Artist", desc: "Music, craft, performance", icon: Palette },
  { id: "organiser", label: "Event organiser", desc: "Ticketed shows and gatherings", icon: CalendarDays },
  { id: "writer", label: "Writer", desc: "Stories, news, blog", icon: PenLine },
  { id: "institution", label: "Institution manager", desc: "Schools, heritage, civic and community bodies", icon: Landmark },
];

/**
 * A verified manager of an authority org (emergency/security/health/local-gov)
 * — verified with a verifiedAs that isn't the "Curator"/"Steward" role label.
 * These managers publish news directly (no review queue).
 */
export function isAuthorityManager(m: Pick<Member, "verified" | "verifiedAs">): boolean {
  return Boolean(m.verified) && Boolean(m.verifiedAs) && m.verifiedAs !== "Curator" && m.verifiedAs !== "Steward";
}

/** Who may reach the newsroom composer (POST /api/news): writers or authority managers. */
export function canWriteNews(m: Pick<Member, "creatorTypes" | "verified" | "verifiedAs">): boolean {
  return (m.creatorTypes?.includes("writer") ?? false) || isAuthorityManager(m);
}
