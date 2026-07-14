import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth";
import type { MemberView } from "@/lib/types";
import { C, serif, initials } from "@/theme";
import { Loading, ErrorView, Thumb } from "@/ui";

function FollowButton({ slug }: Readonly<{ slug: string }>) {
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

function roleLabel(role: string): string {
  if (role === "curator") return "Curator";
  if (role === "steward") return "Steward";
  return "Member";
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
      <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={s.header}>
          {m.photoUrl ? (
            <Thumb seed={m.slug} src={m.photoUrl} label={m.initials || initials(m.displayName)} style={s.avatar} labelStyle={s.avatarText} />
          ) : (
            <View style={s.avatar}><Text style={s.avatarText}>{m.initials || initials(m.displayName)}</Text></View>
          )}
          <Text style={s.name}>{m.displayName}</Text>
          <Text style={s.role}>{roleLabel(m.role)}{m.joinedAt ? ` · joined ${m.joinedAt}` : ""}</Text>
          {m.bio ? <Text style={s.bio}>{m.bio}</Text> : null}
          {(quarter || asafo || stints.length > 0) && (
            <View style={s.chipRow}>
              {quarter ? <View style={s.chip}><Text style={s.chipText}>{quarter.name}</Text></View> : null}
              {asafo ? <View style={s.chip}><Text style={s.chipText}>{asafo.name}</Text></View> : null}
              {stints.map((label) => (
                <View key={label} style={s.chip}><Text style={s.chipText}>{label}</Text></View>
              ))}
            </View>
          )}
          <FollowButton slug={m.slug} />
        </View>

        <View style={s.body}>
          <View style={s.sectionCard}>
            <Text style={s.sectionTitle}>Contributions</Text>
            <Text style={s.sectionHelp}>Everything {m.displayName.split(" ")[0]} has shared with the town.</Text>
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
          </View>
        </View>
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  header: { backgroundColor: C.green, alignItems: "center", paddingVertical: 28, paddingHorizontal: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: C.greenSlate, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: C.goldBrand },
  avatarText: { color: C.cream, fontFamily: serif, fontSize: 32, fontWeight: "700" },
  name: { fontFamily: serif, fontSize: 26, fontWeight: "700", color: C.cream, marginTop: 12 },
  role: { color: C.gold, fontSize: 12, letterSpacing: 1, marginTop: 2, textTransform: "uppercase" },
  bio: { color: "rgba(246,241,231,0.8)", fontSize: 14, lineHeight: 20, textAlign: "center", marginTop: 8, maxWidth: 320 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12, justifyContent: "center" },
  chip: { borderWidth: 1, borderColor: "rgba(246,241,231,0.3)", backgroundColor: "rgba(246,241,231,0.1)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { color: C.cream, fontSize: 12, fontWeight: "600" },
  follow: { marginTop: 16, borderWidth: 1, borderColor: "rgba(246,241,231,0.5)", borderRadius: 999, paddingVertical: 9, paddingHorizontal: 26 },
  followOn: { backgroundColor: C.gold, borderColor: C.gold },
  followText: { color: C.cream, fontWeight: "700" },
  followTextOn: { color: C.green900 },
  body: { padding: 16 },
  sectionCard: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 16, padding: 16, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  sectionTitle: { fontFamily: serif, fontSize: 20, fontWeight: "700", color: C.ink },
  sectionHelp: { color: C.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 4, marginBottom: 12 },
  empty: { color: C.inkFaint, fontStyle: "italic" },
  card: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.paper, borderWidth: 1, borderColor: C.sand, borderRadius: 12, padding: 12, marginBottom: 10 },
  cardThumb: { width: 48, height: 48, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  cardThumbInit: { color: C.cream, fontFamily: serif, fontSize: 18, fontWeight: "700" },
  cardType: { color: C.goldText, fontSize: 10, letterSpacing: 1, fontWeight: "700", textTransform: "uppercase" },
  cardTitle: { fontFamily: serif, fontSize: 18, color: C.ink, marginTop: 2 },
});
