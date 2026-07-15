import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import Animated from "react-native-reanimated";
import { T as Text } from "@/components/typography";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth";
import type { LostFound, LostFoundStatus } from "@/lib/types";
import { KIND_LABEL, LF_STATUS_LABEL } from "@/lib/lostfound";
import { C, D, S } from "@/theme";
import { Loading, ErrorView } from "@/ui";
import { HeroParallax, RevealView, useHeroParallax } from "@/components/anim";

function fmtDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function locationLabel(d: LostFound["details"], missing: boolean): string {
  if (missing) return "LAST SEEN AT";
  return d.kind === "lost_item" ? "LOST AT" : "FOUND AT";
}

export default function LostFoundDetail() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data, error, loading } = useApi<LostFound>(() => api.lostFound(slug), `lost-found:${slug}`);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "Not found"} />;
  return <Detail notice={data} />;
}

function Detail({ notice }: Readonly<{ notice: LostFound }>) {
  const { member } = useAuth();
  const { scrollY, onScroll } = useHeroParallax();
  const d = notice.details;
  const missing = d.kind === "missing_person";
  const [lfStatus, setLfStatus] = useState<LostFoundStatus>(d.lfStatus);
  const isOwner = member?.id === notice.ownerId;
  const canResolve = isOwner || member?.role === "curator" || member?.role === "steward";

  return (
    <>
      <Stack.Screen options={{ title: "Lost & Found" }} />
      <Animated.ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 48 }} onScroll={onScroll} scrollEventThrottle={16}>
        <View style={[s.hero, { backgroundColor: missing ? C.maroon : C.teal }]}>
          <HeroParallax scrollY={scrollY}>
            <Text style={s.heroKicker}>LOST &amp; FOUND · {(KIND_LABEL[d.kind] ?? d.kind).toUpperCase()}</Text>
            <Text style={s.heroTitle}>{notice.title}</Text>
            <View style={s.heroChipRow}>
              <View style={s.heroChip}>
                <Text style={s.heroChipText}>{LF_STATUS_LABEL[lfStatus] ?? lfStatus}</Text>
              </View>
            </View>
          </HeroParallax>
        </View>

        <View style={s.body}>
          {d.description ? <Text style={s.desc}>{d.description}</Text> : null}

          <RevealView delay={100} style={s.facts}>
            {d.lastSeenLocation ? (
              <View style={s.factRow}>
                <Text style={s.factLabel}>{locationLabel(d, missing)}</Text>
                <Text style={s.factValue}>{d.lastSeenLocation}</Text>
              </View>
            ) : null}
            {d.lastSeenDate ? (
              <View style={s.factRow}><Text style={s.factLabel}>WHEN</Text><Text style={s.factValue}>{fmtDate(d.lastSeenDate)}</Text></View>
            ) : null}
            <View style={s.factRow}><Text style={s.factLabel}>POSTED</Text><Text style={s.factValue}>{fmtDate(notice.createdAt)}</Text></View>
          </RevealView>

          <RevealView delay={160} style={[s.contactBox, missing && { borderColor: C.maroon }]}>
            <Text style={s.contactLabel}>CONTACT</Text>
            <Text style={s.contactValue}>{d.contact}</Text>
            <Text style={s.contactHint}>{missing ? "Any information, however small — reach out." : "Reach out directly to arrange a handover."}</Text>
          </RevealView>

          {canResolve && lfStatus === "open" && (
            <ResolveBox slug={notice.slug} missing={missing} onResolved={setLfStatus} />
          )}

          {lfStatus === "reunited" && (
            <View style={s.happyBox}>
              <Text style={s.happyText}>Reunited — this notice has a happy ending. Thank you, Oguaa.</Text>
            </View>
          )}

          <Text style={s.foot}>
            {isOwner ? "You posted this notice." : "Only the person who posted this notice or a curator can resolve it."}
          </Text>
        </View>
      </Animated.ScrollView>
    </>
  );
}

// Owner/curator-only resolution — marks the notice reunited or closed.
function ResolveBox({ slug, missing, onResolved }: Readonly<{ slug: string; missing: boolean; onResolved: (status: LostFoundStatus) => void }>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function resolve(status: LostFoundStatus) {
    setBusy(true);
    setError("");
    try {
      await api.resolveLostFound(slug, status);
      onResolved(status);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the notice — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={s.resolveBox}>
      <Text style={s.resolveTitle}>Resolve this notice</Text>
      <Text style={s.resolveHelp}>
        {missing ? "Found them safe? Mark it reunited so the search can stand down." : "Back with its owner? Mark it reunited — or close the notice if it has run its course."}
      </Text>
      <View style={s.resolveRow}>
        <Pressable onPress={() => resolve("reunited")} disabled={busy} style={[s.resolveBtn, busy && { opacity: 0.6 }]}>
          <Text style={s.resolveBtnText}>Mark as reunited</Text>
        </Pressable>
        <Pressable onPress={() => resolve("closed")} disabled={busy} style={[s.resolveBtnOutline, busy && { opacity: 0.6 }]}>
          <Text style={s.resolveBtnOutlineText}>Close</Text>
        </Pressable>
      </View>
      {error !== "" && <Text style={s.error}>{error}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  hero: { paddingHorizontal: 20, paddingVertical: 26 },
  heroKicker: { color: "rgba(246,241,231,0.85)", fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  heroTitle: { color: C.cream, ...D(700), fontSize: 24, lineHeight: 30, marginTop: 8 },
  heroChipRow: { flexDirection: "row", marginTop: 12 },
  heroChip: { borderWidth: 1, borderColor: "rgba(246,241,231,0.4)", backgroundColor: "rgba(246,241,231,0.1)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  heroChipText: { color: C.cream, fontSize: 12, fontWeight: "700" },
  body: { padding: 20 },
  desc: { ...S(400), fontSize: 16, lineHeight: 25, color: C.ink },
  facts: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 12, padding: 14, marginTop: 16 },
  factRow: { flexDirection: "row", gap: 12, paddingVertical: 7 },
  factLabel: { color: C.inkFaint, fontSize: 11, letterSpacing: 1, fontWeight: "700", width: 100 },
  factValue: { color: C.ink, fontSize: 14, flex: 1, lineHeight: 20 },
  contactBox: { marginTop: 16, borderWidth: 1, borderColor: C.teal, backgroundColor: C.cream, borderRadius: 12, padding: 16 },
  contactLabel: { color: C.inkFaint, fontSize: 11, letterSpacing: 2, fontWeight: "700" },
  contactValue: { color: C.ink, ...S(700), fontSize: 18, marginTop: 6 },
  contactHint: { color: C.inkMuted, fontSize: 12, marginTop: 6 },
  resolveBox: { marginTop: 22, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 12, padding: 16 },
  resolveTitle: { ...S(700), fontSize: 18, color: C.ink },
  resolveHelp: { color: C.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  resolveRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14 },
  resolveBtn: { backgroundColor: C.green, borderRadius: 999, paddingVertical: 11, paddingHorizontal: 20, minHeight: 44, justifyContent: "center" },
  resolveBtnText: { color: C.cream, fontWeight: "700", fontSize: 14 },
  resolveBtnOutline: { borderWidth: 1, borderColor: C.sand, borderRadius: 999, paddingVertical: 11, paddingHorizontal: 20, minHeight: 44, justifyContent: "center" },
  resolveBtnOutlineText: { color: C.inkMuted, fontWeight: "600", fontSize: 14 },
  error: { color: C.clayText, fontSize: 13, marginTop: 10 },
  happyBox: { marginTop: 22, backgroundColor: "rgba(18,63,45,0.06)", borderWidth: 1, borderColor: "rgba(18,63,45,0.3)", borderRadius: 12, padding: 16 },
  happyText: { color: C.green, fontSize: 14, lineHeight: 20 },
  foot: { color: C.inkFaint, fontSize: 12, lineHeight: 18, marginTop: 26, borderTopWidth: 1, borderTopColor: C.sand, paddingTop: 14 },
});
