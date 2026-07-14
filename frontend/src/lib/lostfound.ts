import type { LostFoundKind, LostFoundStatus } from "./types";

// Shared labels & palette for the lost & found pages. Missing people get the
// maroon accent (time-critical), items stay calm (teal).

export const LOST_FOUND_KINDS: { value: LostFoundKind; label: string }[] = [
  { value: "lost_item", label: "Lost item" },
  { value: "found_item", label: "Found item" },
  { value: "missing_person", label: "Missing person" },
];

export const LOST_FOUND_STATUSES: { value: LostFoundStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "reunited", label: "Reunited" },
  { value: "closed", label: "Closed" },
];

export const KIND_LABEL: Record<LostFoundKind, string> = Object.fromEntries(
  LOST_FOUND_KINDS.map((k) => [k.value, k.label]),
) as Record<LostFoundKind, string>;

export const LF_STATUS_LABEL: Record<LostFoundStatus, string> = Object.fromEntries(
  LOST_FOUND_STATUSES.map((s) => [s.value, s.label]),
) as Record<LostFoundStatus, string>;

/** Badge classes per status, mirroring the Pill palette in components/ui. */
export const LF_STATUS_CLASS: Record<LostFoundStatus, string> = {
  open: "border-gold-border/40 bg-gold/[0.12] text-gold-text",
  reunited: "border-green/30 bg-green/[0.06] text-green",
  closed: "border-sand bg-paper text-ink-muted",
};
