import { StyleSheet } from "react-native";
import { ON_GREEN, D, LIGHT, S, type Palette } from "@/theme";

/**
 * Shared styling for the contribution form screens (submit a listing, report an
 * incident, post a lost & found notice): a cream card on paper with paper inputs,
 * uppercase labels, and the centred gate screen for signed-out / done states.
 *
 * Phase D: theme-aware. Call `makeFormStyles(C)` with the active palette from
 * useTheme() (memoized on [C] in the screen).
 */
export const makeFormStyles = (C: Palette) => StyleSheet.create({
  // shadowColor stays pure black — a shadow, theme-independent by design.
  formCard: { margin: 16, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 16, padding: 16, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  label: { color: C.inkFaint, fontSize: 11, letterSpacing: 2, ...S(700), marginTop: 18, marginBottom: 8 },
  hint: { color: C.inkFaint, fontSize: 12, marginTop: -4, marginBottom: 8, lineHeight: 17 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { color: C.inkMuted, fontSize: 13, ...S(600) },
  input: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.ink },
  area: { minHeight: 110, textAlignVertical: "top", ...S(400) },
  error: { color: C.clayText, marginTop: 12, fontSize: 13 },
  note: { color: C.inkFaint, fontSize: 12, textAlign: "center", marginTop: 12, lineHeight: 18 },
  btnText: { color: ON_GREEN, ...S(700), fontSize: 15 },
  gate: { flex: 1, backgroundColor: C.paper, padding: 28, justifyContent: "center", alignItems: "center" },
  gateTitle: { ...D(600), fontSize: 26, color: C.ink, textAlign: "center" },
  gateBody: { color: C.inkMuted, fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 10, maxWidth: 320 },
});

/**
 * @deprecated Static light-palette snapshot kept for the screens that have not
 * migrated to useTheme() yet (safety/report, lost-found/new). Migrated screens
 * should build styles with `makeFormStyles(C)` instead.
 */
export const formStyles = makeFormStyles(LIGHT);
