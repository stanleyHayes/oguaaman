import { LIGHT, type Palette } from "@/theme";
import type { LostFoundKind, LostFoundStatus } from "./types";

// Shared labels & palette for the lost & found screens. Missing people get the
// maroon accent (time-critical); items stay calm (teal). Colour maps take the
// active palette (Phase D) so the screens can follow the theme.

export const LOST_FOUND_KINDS: { value: LostFoundKind; label: string }[] = [
  { value: "lost_item", label: "Lost item" },
  { value: "found_item", label: "Found item" },
  { value: "missing_person", label: "Missing person" },
];

export const KIND_LABEL: Record<LostFoundKind, string> = Object.fromEntries(
  LOST_FOUND_KINDS.map((x) => [x.value, x.label]),
) as Record<LostFoundKind, string>;

export const LF_STATUS_LABEL: Record<LostFoundStatus, string> = {
  open: "Open",
  reunited: "Reunited",
  closed: "Closed",
};

export const lfStatusColor = (C: Palette): Record<LostFoundStatus, string> => ({
  open: C.goldText,
  reunited: C.green,
  closed: C.inkMuted,
});

/** Badge colour per kind — missing people stand out in maroon. */
export const kindColor = (C: Palette): Record<LostFoundKind, string> => ({
  lost_item: C.tealText,
  found_item: C.tealText,
  missing_person: C.maroon,
});

/**
 * @deprecated Static light-palette map kept for screens not yet migrated to
 * useTheme() (lost-found/new). Use `kindColor(C)` instead.
 */
export const KIND_COLOR: Record<LostFoundKind, string> = kindColor(LIGHT);
