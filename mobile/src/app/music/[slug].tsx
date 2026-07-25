import { ROUTES, route } from "@/lib/routes";
import { useMemo, useState } from "react";
import { push } from "@/lib/router";
import { Linking, StyleSheet, View, Pressable } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import Animated from "react-native-reanimated";
import { T as Text, TI as TextInput } from "@/components/typography";
import { api } from "@/lib/api";
import { useRecordView } from "@/lib/use-record-view";
import { useApi } from "@/lib/use-api";
import type { ArtistRelease, Listing } from "@/lib/types";
import { ON_GREEN, D, S, initials, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { Loading, ErrorView, PhotoHero, Pill, Thumb } from "@/ui";
import { ReportButton } from "@/report-button";
import { RevealView, useHeroParallax } from "@/components/anim";
import { ArrowUpRightIcon, MusicIcon } from "@/components/icons";
import { DateField } from "@/components/date-field";
import { useAuth } from "@/lib/auth";

// "Reps <school>" — resolves the artist's first school affiliation to its
// institution page, hiding itself if the lookup fails (mirrors the web page).
function SchoolLink({ orgId }: Readonly<{ orgId: string }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { data } = useApi(() => api.institution(orgId), `artist-school:${orgId}`);
  if (!data) return null;
  return (
    <Pressable accessibilityRole="button" onPress={() => push(route.institution(data.institution.slug))} style={s.school}>
      <Text style={s.schoolText}>Reps <Text style={{ ...S(700), color: C.maroonText }}>{data.institution.name}</Text> ›</Text>
    </Pressable>
  );
}

export default function Artist() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data, error, loading } = useApi<Listing>(() => api.artist(slug), `artist:${slug}`);
  const { scrollY, onScroll } = useHeroParallax();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  useRecordView(data?.id);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "Not found"} />;
  const d = data.details;
  const releases: ArtistRelease[] = d.releases && d.releases.length > 0
    ? d.releases
    : d.latestRelease ? [{ ...d.latestRelease, kind: "single" }] : [];
  const latest = releases[0];

  return (
    <>
      <Stack.Screen options={{ title: d.actName ?? data.title }} />
      <Animated.ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 40 }} onScroll={onScroll} scrollEventThrottle={16}>
      <PhotoHero
        image={data.coverImageUrl}
        tone={C.goldBrand}
        kicker={d.spotlight ? "Oguaa spotlight" : "Cape Coast artist"}
        title={d.actName ?? data.title}
        lede={latest ? `Latest release · ${latest.title}${latest.year ? ` · ${latest.year}` : ""}` : "An artist from the Cape Coast music community"}
        scrollY={scrollY}
        icon={<MusicIcon size={24} color={C.gold} strokeWidth={1.8} />}
      >
        {(d.genres ?? []).length > 0 ? (
          <View style={s.genres}>
            {(d.genres ?? []).map((g) => (
              <View key={g} style={s.genrePill}><Text style={s.genrePillText}>{g}</Text></View>
            ))}
          </View>
        ) : null}
      </PhotoHero>

      <RevealView delay={100} style={s.body}>
        <View style={s.storyCard}>
          <View style={s.portraitFrame}>
            <Thumb seed={data.slug} src={data.coverImageUrl} label={initials(d.actName ?? data.title)} style={s.portrait} labelStyle={s.thumbInit} />
            <View style={s.musicSeal}><MusicIcon size={18} color={ON_GREEN} strokeWidth={2} /></View>
          </View>
          <View style={s.storyCopy}>
            <Text style={s.kicker}>ARTIST STORY</Text>
            <Text style={s.sectionTitle}>The voice behind the sound.</Text>
            <View style={s.clayRule} />
            <Text style={s.bio}>{d.bio || "This artist is building their Oguaa profile. Check back for their story, influences and the music they are making from the coast."}</Text>
          </View>
        </View>

        {releases.length > 0 && (
          <View style={s.discography}>
            <Text style={s.kicker}>DISCOGRAPHY</Text>
            <Text style={s.discographyTitle}>Music from the artist.</Text>
            <Text style={s.discographyLede}>Albums, EPs and songs are catalogued here. Listening opens on the artist&apos;s chosen platform.</Text>
            <View style={s.releaseGrid}>
              {releases.map((release, index) => (
                <View key={release.id ?? `${release.title}-${index}`} style={s.releaseCard}>
                  <Thumb seed={release.id ?? release.title} src={release.coverImageUrl} label={initials(release.title)} style={s.releaseArt} labelStyle={s.releaseArtText} />
                  <View style={s.releaseContent}>
                    <View style={s.releaseMetaRow}>
                      <Text style={s.releaseKind}>{String(index + 1).padStart(2, "0")} · {(release.kind ?? "release").toUpperCase()}</Text>
                      {release.year ? <Text style={s.releaseYear}>{release.year}</Text> : null}
                    </View>
                    <Text style={s.releaseTitle}>{release.title}</Text>
                    {release.description ? <Text style={s.releaseBody}>{release.description}</Text> : null}
                    {(release.tracks?.length ?? 0) > 0 ? (
                      <View style={s.trackList}>
                        {release.tracks?.slice(0, 5).map((track, trackIndex) => (
                          <View key={`${track.title}-${trackIndex}`} style={s.track}>
                            <Text style={s.trackNumber}>{String(trackIndex + 1).padStart(2, "0")}</Text>
                            <Text style={s.trackTitle}>{track.title}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    {(release.tracks?.length ?? 0) > 5 ? <Text style={s.moreTracks}>+ {(release.tracks?.length ?? 0) - 5} more tracks</Text> : null}
                    {release.url ? <Pressable accessibilityRole="button" accessibilityLabel={`Find ${release.title}`} onPress={() => Linking.openURL(release.url as string)} style={s.releaseLink}><Text style={s.releaseLinkText}>Find this release</Text><ArrowUpRightIcon size={16} color={ON_GREEN} strokeWidth={2} /></Pressable> : null}
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={s.listenPanel}>
          <View style={s.listenHead}>
            <View style={s.listenIcon}><MusicIcon size={18} color={C.clayText} strokeWidth={1.9} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.kicker}>LISTEN</Text>
              <Text style={s.linkNote}>We link out — no audio is hosted here.</Text>
            </View>
          </View>
          <View style={s.streams}>
            {(d.streamingLinks ?? []).map((l) => (
              <Pressable accessibilityRole="button" accessibilityLabel={`Open ${l.label}`} key={l.label} style={s.stream} onPress={() => Linking.openURL(l.url)}>
                <View style={s.serviceIcon}><MusicIcon size={16} color={C.clayText} strokeWidth={1.9} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.streamLabel}>{l.label}</Text>
                  <Text style={s.streamMeta}>Open in {l.label}</Text>
                </View>
                <ArrowUpRightIcon size={16} color={C.inkFaint} strokeWidth={1.8} />
              </Pressable>
            ))}
            {(d.streamingLinks ?? []).length === 0 ? <Text style={s.emptyLinks}>No streaming links yet — check back soon.</Text> : null}
          </View>
        </View>

        <MobileArtistBooking artistSlug={data.slug} artistName={d.actName ?? data.title} />

        {(d.booking || (d.socials?.length ?? 0) > 0) ? (
          <View style={s.connectPanel}>
            <Text style={s.kicker}>CONNECT</Text>
            <Text style={s.connectTitle}>Management &amp; socials</Text>
            {d.booking ? (/^(https?:\/\/|mailto:|tel:)/i.test(d.booking) ? <Pressable accessibilityRole="button" onPress={() => Linking.openURL(d.booking as string)} style={s.externalBookingButton}><Text style={s.externalBookingText}>External management page</Text><ArrowUpRightIcon size={16} color={C.greenText} strokeWidth={2} /></Pressable> : <Text style={s.bookingText}>{d.booking}</Text>) : null}
            {(d.socials?.length ?? 0) > 0 ? <View style={s.socials}>{d.socials?.map((link, index) => <Pressable key={`${link.label}-${index}`} accessibilityRole="button" onPress={() => Linking.openURL(link.url)} style={s.socialChip}><Text style={s.socialChipText}>{link.label} ↗</Text></Pressable>)}</View> : null}
          </View>
        ) : null}

        {data.tags.length > 0 && (
          <View style={s.tagsSection}>
            <Text style={s.tagsTitle}>Sounds &amp; influences</Text>
            <View style={s.tags}>{data.tags.map((t) => <Pill key={t} label={`#${t}`} color={C.clayText} bg={C.cream} border={C.sand} />)}</View>
          </View>
        )}

        {data.schoolIds?.[0] ? <SchoolLink orgId={data.schoolIds[0]} /> : null}

        <View style={{ marginTop: 22, alignItems: "center" }}>
          <ReportButton listingId={data.id} />
        </View>
      </RevealView>
      </Animated.ScrollView>
    </>
  );
}

const EVENT_TYPES = ["Wedding", "Festival", "Corporate event", "Church programme", "Private celebration", "Concert or live show", "Other event"];

function MobileArtistBooking({ artistSlug, artistName }: Readonly<{ artistSlug: string; artistName: string }>) {
  const { member } = useAuth();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [open, setOpen] = useState(false);
  const [eventType, setEventType] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [location, setLocation] = useState("");
  const [budget, setBudget] = useState("");
  const [audience, setAudience] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit() {
    if (!eventType || !eventDate || location.trim().length < 2) { setError("Add the event type, date and location."); return; }
    if (!email.trim() && !phone.trim()) { setError("Add an email address or phone number so the artist can reply."); return; }
    const budgetNumber = Number(budget.replace(/,/g, ""));
    const audienceNumber = Number.parseInt(audience, 10);
    setBusy(true); setError("");
    try {
      await api.requestArtistBooking(artistSlug, { eventType, eventDate, location: location.trim(), contactEmail: email.trim(), contactPhone: phone.trim(), message: message.trim(), ...(Number.isFinite(budgetNumber) && budgetNumber > 0 ? { budgetPesewas: Math.round(budgetNumber * 100) } : {}), ...(Number.isFinite(audienceNumber) && audienceNumber > 0 ? { audienceSize: audienceNumber } : {}) });
      setSent(true);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not send the booking request."); }
    finally { setBusy(false); }
  }

  return <View style={s.bookingCard}>
    <Text style={s.kicker}>BOOK THIS ARTIST</Text><Text style={s.bookingCardTitle}>Bring {artistName} to your event.</Text><Text style={s.bookingCardBody}>Send the event brief directly to the artist&apos;s private creator dashboard.</Text>
    {!member ? <Pressable accessibilityRole="button" onPress={() => push(ROUTES.signIn)} style={s.bookingButton}><Text style={s.bookingButtonText}>Sign in to request a booking</Text></Pressable> : sent ? <View style={s.bookingSent}><Text style={s.bookingSentTitle}>Request sent</Text><Text style={s.bookingCardBody}>{artistName} can now review it in the creator dashboard.</Text></View> : !open ? <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={s.bookingButton}><Text style={s.bookingButtonText}>Request a booking</Text></Pressable> : <View style={s.bookingForm}>
      <Text style={s.formLabel}>EVENT TYPE</Text><View style={s.eventTypes}>{EVENT_TYPES.map((item) => <Pressable accessibilityRole="button" key={item} onPress={() => setEventType(item)} style={[s.eventType, eventType === item && s.eventTypeOn]}><Text style={[s.eventTypeText, eventType === item && s.eventTypeTextOn]}>{item}</Text></Pressable>)}</View>
      <Text style={s.formLabel}>EVENT DATE</Text><DateField value={eventDate} onChange={setEventDate} placeholder="Choose date" minDate={new Date().toISOString().slice(0, 10)} />
      <Text style={s.formLabel}>LOCATION</Text><TextInput style={s.formInput} value={location} onChangeText={setLocation} placeholder="Venue, town or region" placeholderTextColor={C.inkFaint} />
      <View style={s.formPair}><View style={{ flex: 1 }}><Text style={s.formLabel}>BUDGET (GH₵)</Text><TextInput style={s.formInput} value={budget} onChangeText={setBudget} keyboardType="numeric" placeholder="Optional" placeholderTextColor={C.inkFaint} /></View><View style={{ flex: 1 }}><Text style={s.formLabel}>AUDIENCE</Text><TextInput style={s.formInput} value={audience} onChangeText={setAudience} keyboardType="number-pad" placeholder="Optional" placeholderTextColor={C.inkFaint} /></View></View>
      <Text style={s.formLabel}>EMAIL</Text><TextInput style={s.formInput} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="you@example.com" placeholderTextColor={C.inkFaint} />
      <Text style={s.formLabel}>PHONE OR WHATSAPP</Text><TextInput style={s.formInput} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+233…" placeholderTextColor={C.inkFaint} />
      <Text style={s.formLabel}>EVENT NOTES</Text><TextInput style={[s.formInput, s.formArea]} value={message} onChangeText={setMessage} multiline placeholder="Timing, set length and anything the artist should know." placeholderTextColor={C.inkFaint} />
      {error ? <Text style={s.formError}>{error}</Text> : null}<Pressable accessibilityRole="button" disabled={busy} onPress={submit} style={[s.bookingButton, busy && { opacity: 0.6 }]}><Text style={s.bookingButtonText}>{busy ? "Sending…" : "Send booking request"}</Text></Pressable>
    </View>}
  </View>;
}

const makeStyles = (C: Palette) => StyleSheet.create({
  thumbInit: { color: ON_GREEN, ...S(700), fontSize: 36 },
  genres: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  genrePill: { borderWidth: 1, borderColor: C.onDarkText50, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  genrePillText: { color: ON_GREEN, fontSize: 12 },
  body: { padding: 20 },
  storyCard: { gap: 24 },
  portraitFrame: { position: "relative", alignSelf: "center", width: 232, height: 232, borderWidth: 1, borderColor: C.goldBorder35, borderRadius: 24, padding: 8, transform: [{ rotate: "1.5deg" }], backgroundColor: C.goldTint14 },
  portrait: { width: "100%", height: "100%", borderRadius: 18, alignItems: "center", justifyContent: "center" },
  musicSeal: { position: "absolute", right: -7, bottom: -7, width: 48, height: 48, borderRadius: 24, borderWidth: 4, borderColor: C.paper, backgroundColor: C.clay, alignItems: "center", justifyContent: "center" },
  storyCopy: { paddingTop: 2 },
  kicker: { color: C.clayText, fontSize: 10, letterSpacing: 1.8, ...S(700) },
  sectionTitle: { color: C.ink, ...D(700), fontSize: 30, lineHeight: 35, marginTop: 7 },
  clayRule: { width: 52, height: 4, borderRadius: 2, backgroundColor: C.clay, marginTop: 12 },
  bio: { color: C.inkMuted, ...S(400), fontSize: 16, lineHeight: 25, marginTop: 16 },
  discography: { marginTop: 32 },
  discographyTitle: { ...D(700), fontSize: 28, lineHeight: 34, color: C.ink, marginTop: 7 },
  discographyLede: { color: C.inkMuted, fontSize: 13, lineHeight: 20, marginTop: 8 },
  releaseGrid: { gap: 16, marginTop: 18 },
  releaseCard: { overflow: "hidden", backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 16 },
  releaseArt: { width: "100%", aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  releaseArtText: { color: ON_GREEN, ...S(700), fontSize: 44 },
  releaseContent: { padding: 18 },
  releaseMetaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  releaseKind: { color: C.goldText, fontSize: 10, letterSpacing: 1.3, ...S(700) },
  releaseYear: { color: C.green900, backgroundColor: C.goldBrand, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, fontSize: 11, ...S(700) },
  releaseTitle: { ...D(700), fontSize: 23, lineHeight: 29, color: C.ink, marginTop: 10 },
  releaseBody: { color: C.inkMuted, fontSize: 12.5, lineHeight: 18, marginTop: 8 },
  trackList: { marginTop: 14, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.sand },
  track: { flexDirection: "row", gap: 10, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.sand },
  trackNumber: { width: 22, color: C.inkFaint, fontSize: 11, ...S(500) },
  trackTitle: { flex: 1, color: C.ink, fontSize: 13, ...S(600) },
  moreTracks: { color: C.inkFaint, fontSize: 11, marginTop: 7 },
  releaseLink: { marginTop: 15, minHeight: 44, borderRadius: 999, backgroundColor: C.green, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  releaseLinkText: { color: ON_GREEN, fontSize: 13, ...S(700) },
  listenPanel: { marginTop: 22, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 14, padding: 14 },
  listenHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  listenIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: C.clayTint, alignItems: "center", justifyContent: "center" },
  linkNote: { color: C.inkFaint, fontSize: 12, marginTop: 4 },
  streams: { gap: 8, marginTop: 13 },
  stream: { flexDirection: "row", gap: 10, alignItems: "center", borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 11, paddingHorizontal: 11, paddingVertical: 10 },
  serviceIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.clayTint, alignItems: "center", justifyContent: "center" },
  streamLabel: { color: C.ink, fontSize: 13, ...S(700) },
  streamMeta: { color: C.inkFaint, fontSize: 10.5, marginTop: 1 },
  emptyLinks: { color: C.inkFaint, fontSize: 12.5, lineHeight: 18, paddingVertical: 6, ...S(400) },
  connectPanel: { marginTop: 22, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 14, padding: 16 },
  connectTitle: { color: C.ink, ...D(700), fontSize: 22, marginTop: 5 },
  bookingButton: { marginTop: 14, minHeight: 44, borderRadius: 999, backgroundColor: C.green, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  bookingButtonText: { color: ON_GREEN, fontSize: 13, ...S(700) },
  externalBookingButton: { marginTop: 14, minHeight: 44, borderRadius: 999, borderWidth: 1, borderColor: C.green, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  externalBookingText: { color: C.greenText, fontSize: 13, ...S(700) },
  bookingText: { marginTop: 12, color: C.inkMuted, fontSize: 13, lineHeight: 19 },
  bookingCard: { marginTop: 24, borderWidth: 1, borderColor: C.gold, borderRadius: 16, backgroundColor: C.goldTint14, padding: 16 },
  bookingCardTitle: { marginTop: 5, color: C.ink, fontSize: 22, lineHeight: 27, ...D(700) },
  bookingCardBody: { marginTop: 7, color: C.inkMuted, fontSize: 13, lineHeight: 19 },
  bookingSent: { marginTop: 14, borderRadius: 12, backgroundColor: C.goldTint14, padding: 13 },
  bookingSentTitle: { color: C.greenText, fontSize: 15, ...S(700) },
  bookingForm: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.goldBorder35 },
  formLabel: { marginTop: 12, marginBottom: 6, color: C.inkFaint, fontSize: 10, letterSpacing: 1.3, ...S(700) },
  formInput: { minHeight: 46, borderWidth: 1, borderColor: C.sand, borderRadius: 10, backgroundColor: C.paper, paddingHorizontal: 12, color: C.ink, fontSize: 14, ...S(400) },
  formArea: { minHeight: 100, paddingTop: 12, textAlignVertical: "top" },
  formPair: { flexDirection: "row", gap: 8 },
  formError: { marginTop: 10, color: C.maroonText, fontSize: 12, ...S(600) },
  eventTypes: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  eventType: { borderWidth: 1, borderColor: C.sand, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: C.paper },
  eventTypeOn: { borderColor: C.green, backgroundColor: C.green },
  eventTypeText: { color: C.inkMuted, fontSize: 11, ...S(600) },
  eventTypeTextOn: { color: ON_GREEN },
  socials: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  socialChip: { borderWidth: 1, borderColor: C.sand, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  socialChipText: { color: C.inkMuted, fontSize: 12, ...S(600) },
  tagsSection: { marginTop: 26 },
  tagsTitle: { color: C.ink, ...D(700), fontSize: 22 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 11 },
  school: { marginTop: 20, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  schoolText: { color: C.inkMuted, fontSize: 14 },
});
