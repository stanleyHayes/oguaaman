import { useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { T as Text } from "@/components/typography";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ROUTES } from "@/lib/routes";
import { useApi } from "@/lib/use-api";
import type { ArtistBooking } from "@/lib/types";
import { D, ON_GREEN, S, withAlpha, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { EmptyState } from "@/components/empty-state";
import { ErrorView, Loading } from "@/ui";

const STATUSES: ArtistBooking["status"][] = ["new", "reviewing", "accepted", "declined"];

export default function ArtistBookings() {
  const { member, loading: authLoading } = useAuth();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);

  if (authLoading) return <Loading />;
  if (!member) return <View style={s.gate}><Text style={s.title}>Artist bookings</Text><Text style={s.body}>Sign in to review private event requests.</Text><Pressable accessibilityRole="button" onPress={() => router.replace(ROUTES.signIn)} style={s.primary}><Text style={s.primaryText}>Sign in</Text></Pressable></View>;
  return <BookingInbox memberId={member.id} />;
}

function BookingInbox({ memberId }: Readonly<{ memberId: string }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [nonce, setNonce] = useState(0);
  const [filter, setFilter] = useState<"all" | ArtistBooking["status"]>("all");
  const [busy, setBusy] = useState("");
  const [actionError, setActionError] = useState("");
  const { data, loading, error } = useApi<ArtistBooking[]>(() => api.artistBookings(), `artist-bookings:${memberId}:${nonce}`);

  if (loading) return <Loading />;
  if (error) return <ErrorView message={error} />;
  const bookings = data ?? [];
  const shown = filter === "all" ? bookings : bookings.filter((booking) => booking.status === filter);

  async function update(booking: ArtistBooking, status: ArtistBooking["status"]) {
    setBusy(booking.id); setActionError("");
    try { await api.updateArtistBooking(booking.id, status, booking.artistNote ?? ""); setNonce((value) => value + 1); }
    catch (updateError) { setActionError(updateError instanceof Error ? updateError.message : "Could not update the request."); }
    finally { setBusy(""); }
  }

  return <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={s.scroll}>
    <View style={s.hero}><Text style={s.kicker}>ARTIST WORKSPACE</Text><Text style={s.title}>Booking inbox</Text><Text style={s.body}>Event requests sent from your public artist pages. Contact details stay private to your studio.</Text><Text style={s.newCount}>{bookings.filter((booking) => booking.status === "new").length} NEW</Text></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>{(["all", ...STATUSES] as const).map((status) => <Pressable accessibilityRole="button" key={status} onPress={() => setFilter(status)} style={[s.filter, filter === status && s.filterOn]}><Text style={[s.filterText, filter === status && s.filterTextOn]}>{status.toUpperCase()}</Text></Pressable>)}</ScrollView>
    {actionError ? <Text style={s.error}>{actionError}</Text> : null}
    <View style={s.list}>{shown.length === 0 ? <View style={s.empty}><EmptyState glyph="◌" title={bookings.length ? "No requests in this view" : "No booking requests yet"} body={bookings.length ? "Choose another status to see more requests." : "When someone requests an artist through Oguaa, their full event brief will appear here."} /></View> : shown.map((booking) => <View key={booking.id} style={s.card}>
      <View style={s.cardHead}><View style={{ flex: 1 }}><Text style={s.artist}>{booking.artistName}</Text><Text style={s.event}>{booking.eventType}</Text><Text style={s.from}>From {booking.requesterName}</Text></View><Text style={[s.status, statusStyle(booking.status, C)]}>{booking.status.toUpperCase()}</Text></View>
      <View style={s.details}><Text style={s.detail}>◫  {new Date(`${booking.eventDate}T12:00:00`).toLocaleDateString()}</Text><Text style={s.detail}>⌖  {booking.location}</Text>{booking.audienceSize ? <Text style={s.detail}>◎  {booking.audienceSize.toLocaleString()} expected</Text> : null}{booking.budgetPesewas ? <Text style={s.detail}>GH₵  {(booking.budgetPesewas / 100).toLocaleString()} budget</Text> : null}</View>
      {booking.message ? <Text style={s.message}>{booking.message}</Text> : null}
      <View style={s.contact}>{booking.requesterEmail ? <Pressable accessibilityRole="link" onPress={() => Linking.openURL(`mailto:${booking.requesterEmail}`)} style={s.outline}><Text style={s.outlineText}>Email</Text></Pressable> : null}{booking.requesterPhone ? <Pressable accessibilityRole="link" onPress={() => Linking.openURL(`tel:${booking.requesterPhone}`)} style={s.outline}><Text style={s.outlineText}>Call</Text></Pressable> : null}</View>
      <Text style={s.moveLabel}>MOVE REQUEST TO</Text><View style={s.actions}>{STATUSES.filter((status) => status !== booking.status).map((status) => <Pressable accessibilityRole="button" key={status} disabled={busy === booking.id} onPress={() => update(booking, status)} style={[s.action, busy === booking.id && { opacity: 0.5 }]}><Text style={s.actionText}>{status}</Text></Pressable>)}</View>
    </View>)}</View>
  </ScrollView>;
}

function statusStyle(status: ArtistBooking["status"], C: Palette) {
  if (status === "accepted") return { color: C.greenText, backgroundColor: withAlpha(C.green, 0.1) };
  if (status === "reviewing") return { color: C.tealText, backgroundColor: withAlpha(C.teal, 0.12) };
  if (status === "declined") return { color: C.maroonText, backgroundColor: withAlpha(C.maroon, 0.1) };
  return { color: C.goldText, backgroundColor: C.goldTint14 };
}

function makeStyles(C: Palette) { return StyleSheet.create({
  scroll: { paddingBottom: 52 }, gate: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: C.paper }, hero: { padding: 24, backgroundColor: C.green }, kicker: { color: C.goldBrand, fontSize: 11, letterSpacing: 1.5, ...S(700) }, title: { marginTop: 5, color: ON_GREEN, fontSize: 30, lineHeight: 36, ...D(700) }, body: { marginTop: 8, color: withAlpha(ON_GREEN, 0.78), fontSize: 14, lineHeight: 21 }, newCount: { alignSelf: "flex-start", marginTop: 16, borderRadius: 999, backgroundColor: C.goldBrand, color: C.green, paddingHorizontal: 12, paddingVertical: 6, fontSize: 11, ...S(700) }, primary: { alignSelf: "flex-start", marginTop: 18, borderRadius: 999, backgroundColor: C.green, paddingHorizontal: 18, paddingVertical: 12 }, primaryText: { color: ON_GREEN, ...S(700) }, filters: { gap: 8, paddingHorizontal: 20, paddingVertical: 16 }, filter: { borderWidth: 1, borderColor: C.sand, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: C.cream }, filterOn: { borderColor: C.green, backgroundColor: C.green }, filterText: { color: C.inkMuted, fontSize: 11, ...S(700) }, filterTextOn: { color: ON_GREEN }, error: { marginHorizontal: 20, marginBottom: 12, borderRadius: 12, backgroundColor: withAlpha(C.maroon, 0.08), color: C.maroonText, padding: 12 }, list: { gap: 14, paddingHorizontal: 20 }, empty: { borderWidth: 1, borderColor: C.sand, borderRadius: 18, backgroundColor: C.cream, padding: 18 }, card: { overflow: "hidden", borderWidth: 1, borderColor: C.sand, borderRadius: 18, backgroundColor: C.cream }, cardHead: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 16, borderBottomWidth: 1, borderBottomColor: C.sand, backgroundColor: C.paper }, artist: { color: C.goldText, fontSize: 10, letterSpacing: 1.2, ...S(700) }, event: { marginTop: 4, color: C.ink, fontSize: 20, ...D(700) }, from: { marginTop: 4, color: C.inkMuted, fontSize: 13 }, status: { overflow: "hidden", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, fontSize: 9, ...S(700) }, details: { gap: 8, padding: 16 }, detail: { color: C.inkMuted, fontSize: 13, lineHeight: 18 }, message: { marginHorizontal: 16, borderRadius: 12, backgroundColor: C.paper, color: C.inkMuted, padding: 13, fontSize: 13, lineHeight: 20 }, contact: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 14 }, outline: { borderWidth: 1, borderColor: C.sand, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 }, outlineText: { color: C.greenText, fontSize: 12, ...S(700) }, moveLabel: { marginHorizontal: 16, marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.sand, color: C.inkFaint, fontSize: 9, letterSpacing: 1.1, ...S(700) }, actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 16, paddingTop: 10 }, action: { borderWidth: 1, borderColor: C.sand, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9 }, actionText: { color: C.inkMuted, fontSize: 11, textTransform: "capitalize", ...S(700) },
}); }
