import { useMemo } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { T as Text } from "@/components/typography";
import { AlertTriangleIcon } from "@/components/icons";
import { useTheme } from "@/lib/theme-context";
import { type Palette, S } from "@/theme";

// Small, shared compliance notices: sponsored labels (K18), the emergency
// callout (not an emergency service, call 112) and the investment disclaimer.

/** True while a paid promotion is running on the listing (K18). */
export function isSponsored(l: Readonly<{ promotedUntil?: string }>): boolean {
  if (!l.promotedUntil) return false;
  const until = Date.parse(l.promotedUntil);
  return Number.isFinite(until) && until > Date.now();
}

/** An outlined "Sponsored" chip for paid placements. Renders nothing otherwise. */
export function SponsoredChip({ listing }: Readonly<{ listing: { promotedUntil?: string } }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  if (!isSponsored(listing)) return null;
  return (
    <View style={s.sponsored} accessibilityLabel="Sponsored listing">
      <Text style={s.sponsoredText}>SPONSORED</Text>
    </View>
  );
}

function call112() {
  Linking.openURL("tel:112").catch(() => {});
}

/**
 * "Oguaa is not an emergency service" with a tap-to-call 112 button (A021).
 * Shown on the safety hub, the report form and every incident / lost & found page.
 */
export function EmergencyCallout() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={s.callout} accessibilityRole="summary">
      <View style={s.calloutHead}>
        <AlertTriangleIcon size={16} color={C.clayText} strokeWidth={2.2} />
        <Text style={s.calloutTitle}>Not an emergency service</Text>
      </View>
      <Text style={s.calloutBody}>
        Posting on Oguaa does not alert the police, fire service or ambulance. In an emergency, call 112.
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Call 112, Ghana's emergency number" onPress={call112} style={s.callBtn}>
        <Text style={s.callText}>Call 112</Text>
      </Pressable>
    </View>
  );
}

/**
 * Shown to the poster when a safety post is held for curator review (K12/D3):
 * crime and medical incidents, missing children and screened posts.
 */
export function HeldNotice() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={s.held}>
      <Text style={s.heldTitle}>Sent to curators for review</Text>
      <Text style={s.heldBody}>This isn&apos;t public yet. A curator checks it before anyone else can see it, and no town-wide alert goes out until then.</Text>
    </View>
  );
}

/** A listing is awaiting curator review (not public). */
export function isHeld(l: Readonly<{ held?: boolean; status?: string }>): boolean {
  return l.held === true || l.status === "pending";
}

/** The government non-affiliation statement for alerts and the About card (P061). */
export const NOT_GOVERNMENT = "Oguaa is an independent community platform. It is not a government app and does not represent any government body. Each notice names the authority that issued it and, where one exists, links to its official source.";

export const INVESTMENT_DISCLAIMER =
  "Information only. Oguaa is not a broker, custodian, lender or investment adviser — do your own due diligence before committing money.";

/** The "not a broker" line for investment opportunities (A044). */
export function InvestmentNote() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return <Text style={s.investment}>{INVESTMENT_DISCLAIMER}</Text>;
}

const makeStyles = (C: Palette) => StyleSheet.create({
  sponsored: { alignSelf: "flex-start", borderWidth: 1, borderColor: C.goldText, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1, marginTop: 4 },
  sponsoredText: { color: C.goldText, fontSize: 9, letterSpacing: 1, ...S(700) },
  callout: { borderWidth: 1, borderColor: C.clay, backgroundColor: C.clayTint, borderRadius: 14, padding: 14, gap: 8 },
  calloutHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  calloutTitle: { color: C.clayText, fontSize: 14, ...S(700) },
  calloutBody: { color: C.ink, fontSize: 13, lineHeight: 19 },
  callBtn: { alignSelf: "flex-start", backgroundColor: C.clay, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  callText: { color: C.cream, fontSize: 13, ...S(700) },
  held: { borderWidth: 1, borderColor: C.goldText, backgroundColor: C.goldTint14, borderRadius: 12, padding: 14, gap: 4 },
  heldTitle: { color: C.goldText, fontSize: 14, ...S(700) },
  heldBody: { color: C.ink, fontSize: 13, lineHeight: 19 },
  investment: { color: C.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 6, fontStyle: "italic" },
});
