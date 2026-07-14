import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth";
import type { MemberView } from "@/lib/types";
import { C, serif, initials } from "@/theme";
import { Loading, ErrorView, Thumb } from "@/ui";

function FollowButton({ slug }: { slug: string }) {
  const { member } = useAuth();
  const [following, setFollowing] = useState(false);
  const [followers, setFollowers] = useState<number | null>(null); // known after a toggle
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!member) return;
    let alive = true;
    api.memberFollowState(slug).then((r) => { if (alive) setFollowing(r.following); }).catch(() => {});
    return () => { alive = false; };
  }, [member, slug]);

  if (!member || member.slug === slug) return null;

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const next = !following;
    setFollowing(next);
    try {
      const r = next ? await api.followMember(slug) : await api.unfollowMember(slug);
      setFollowing(r.following);
      setFollowers(r.followers);
    } catch {
      setFollowing(!next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Pressable onPress={toggle} disabled={busy} style={[s.follow, following && s.followOn]}>
      <Text style={[s.followText, following && s.followTextOn]}>
        {following ? "Following" : "Follow"}{followers != null ? ` · ${followers}` : ""}
      </Text>
    </Pressable>
  );
}

export default function MemberProfile() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data, error, loading } = useApi<MemberView>(() => api.member(slug), `member:${slug}`);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "Not found"} />;

  const { member: m, listings } = data;
  const published = listings.filter((l) => l.status === "approved");
  const places = data.places ?? [];
  const schools = data.schools ?? [];
  const quarter = places.find((p) => p.id === m.townId && p.kind !== "asafo");
  const asafo = places.find((p) => p.id === m.asafoId);
  const stints = (m.schooling ?? []).map((st) => {
    const name = schools.find((sc) => sc.id === st.schoolId)?.name ?? st.schoolId;
    const years = [st.fromYear, st.toYear].filter(Boolean).join("–");
    return years ? `${name} · ${years}` : name;
  });

  return (
    <>
      <Stack.Screen options={{ title: m.displayName }} />
      <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <View style={s.header}>
          {m.photoUrl ? (
            <Thumb seed={m.slug} src={m.photoUrl} label={m.initials || initials(m.displayName)} style={s.avatar} labelStyle={s.avatarText} />
          ) : (
            <View style={s.avatar}><Text style={s.avatarText}>{m.initials || initials(m.displayName)}</Text></View>
          )}
          <Text style={s.name}>{m.displayName}</Text>
          <Text style={s.role}>{m.role === "curator" ? "Curator" : m.role === "steward" ? "Steward" : "Member"}</Text>
          {m.bio ? <Text style={s.bio}>{m.bio}</Text> : null}
          {(quarter || asafo || stints.length > 0) && (
            <View style={s.chipRow}>
              {quarter ? <View style={s.chip}><Text style={s.chipText}>{quarter.name}</Text></View> : null}
              {asafo ? <View style={[s.chip, s.chipClay]}><Text style={[s.chipText, { color: C.clayText }]}>{asafo.name}</Text></View> : null}
              {stints.map((label) => (
                <View key={label} style={[s.chip, s.chipMaroon]}><Text style={[s.chipText, { color: C.maroon }]}>{label}</Text></View>
              ))}
            </View>
          )}
          {m.joinedAt ? <Text style={s.joined}>Joined {m.joinedAt}</Text> : null}
          <FollowButton slug={m.slug} />
        </View>

        <Text style={s.kicker}>CONTRIBUTIONS</Text>
        {published.length === 0 && <Text style={s.empty}>No public contributions yet.</Text>}
        {published.map((l) => (
          <View key={l.id} style={s.card}>
            <Thumb seed={l.slug} src={l.coverImageUrl} label={initials(l.title)} style={s.cardThumb} labelStyle={s.cardThumbInit} />
            <View style={{ flex: 1 }}>
              <Text style={s.cardType}>{l.type}</Text>
              <Text style={s.cardTitle}>{l.title}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  header: { alignItems: "center", marginBottom: 22 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: C.green, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: C.goldBrand },
  avatarText: { color: C.cream, fontFamily: serif, fontSize: 30, fontWeight: "700" },
  name: { fontFamily: serif, fontSize: 26, fontWeight: "700", color: C.ink, marginTop: 12 },
  role: { color: C.goldText, fontSize: 12, letterSpacing: 1, marginTop: 2, textTransform: "uppercase" },
  bio: { color: C.inkMuted, fontSize: 14, lineHeight: 20, textAlign: "center", marginTop: 8, maxWidth: 320 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10, justifyContent: "center" },
  chip: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.cream, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipClay: { borderColor: "rgba(176,80,60,0.35)" },
  chipMaroon: { borderColor: "rgba(124,45,45,0.3)" },
  chipText: { color: C.green, fontSize: 12, fontWeight: "600" },
  joined: { color: C.inkFaint, fontSize: 12, marginTop: 8 },
  follow: { marginTop: 14, borderWidth: 1, borderColor: C.green, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 24 },
  followOn: { backgroundColor: C.gold, borderColor: C.gold },
  followText: { color: C.green, fontWeight: "700" },
  followTextOn: { color: C.green900 },
  kicker: { color: C.inkFaint, fontSize: 11, letterSpacing: 2, fontWeight: "700", marginBottom: 10 },
  empty: { color: C.inkFaint, fontStyle: "italic" },
  card: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 12, padding: 14, marginBottom: 10 },
  cardThumb: { width: 48, height: 48, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  cardThumbInit: { color: C.cream, fontFamily: serif, fontSize: 18, fontWeight: "700" },
  cardType: { color: C.goldText, fontSize: 10, letterSpacing: 1, fontWeight: "700", textTransform: "uppercase" },
  cardTitle: { fontFamily: serif, fontSize: 18, color: C.ink, marginTop: 2 },
});
