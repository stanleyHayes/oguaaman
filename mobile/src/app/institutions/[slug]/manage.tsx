// Manage an institution's official page (Creator plan §4.1.3) — the mobile port
// of creator/src/pages/Team.tsx's workspace + creator/src/components/institution-panels.tsx.
// A manager edits the profile, custom sections, gallery, offices, and posts
// official events, all against the same full-replace endpoints the web creator
// app calls. Team roster/invites live in the separate /studio/team screen.
// Also folds in "request a new institution" (creator/src/pages/Institutions.tsx).
import { useMemo, useState } from "react";
import { route, ROUTES } from "@/lib/routes";
import { push } from "@/lib/router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { T as Text, TI as TextInput } from "@/components/typography";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth";
import type { InstitutionKind, InstitutionRequest, InstitutionView, Organization } from "@/lib/types";
import { D, S, withAlpha, ON_GREEN, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { Loading, ErrorView, VerifiedBadge } from "@/ui";
import { EventPanel, GalleryPanel, OfficesPanel, ProfilePanel, SectionsPanel } from "@/components/institution-panels";

export default function ManageInstitution() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { member, loading } = useAuth();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);

  if (loading) return <Loading />;
  if (!member) {
    return (
      <View style={s.gate}>
        <Text style={s.gateTitle}>Manage your institution</Text>
        <Text style={s.gateBody}>Sign in to edit the official page of a school, council or association you manage.</Text>
        <Pressable accessibilityRole="button" onPress={() => router.replace(ROUTES.signIn)} style={s.primaryBtn}><Text style={s.primaryBtnText}>Sign in / create account</Text></Pressable>
      </View>
    );
  }
  return <ManageGate slug={slug} memberId={member.id} />;
}

// Authoritative check: the slug must be one of the member's managed institutions.
function ManageGate({ slug, memberId }: Readonly<{ slug: string; memberId: string }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { data: orgs, loading, error } = useApi<Organization[]>(() => api.myInstitutions(), `manage:orgs:${memberId}`);

  if (loading) return <Loading />;
  if (error) return <ErrorView message={error} />;
  const manages = (orgs ?? []).some((o) => o.slug === slug);
  if (!manages) {
    return (
      <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={s.notYours}>
        <Text style={s.notYouTitle}>Not your institution to manage</Text>
        <Text style={s.notYouBody}>You don&apos;t manage this institution yet. Open its page and request management — a steward reviews every claim.</Text>
        <Pressable accessibilityRole="button" onPress={() => push(route.institution(slug))} style={s.secondaryBtn}><Text style={s.secondaryBtnText}>View institution page</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => push(ROUTES.studio)} style={[s.linkBtn]}><Text style={s.linkBtnText}>Back to studio</Text></Pressable>
      </ScrollView>
    );
  }
  return <ManageWorkspace slug={slug} />;
}

function ManageWorkspace({ slug }: Readonly<{ slug: string }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { data: view, loading, error } = useApi<InstitutionView>(() => api.institution(slug), `manage:view:${slug}`);

  if (loading) return <Loading />;
  if (error || !view) return <ErrorView message={error ?? "Couldn't load the institution"} />;

  const org = view.institution;
  const verified = !!org.verified;

  return (
    <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 48 }}>
      <View style={s.header}>
        <Text style={s.headerKicker}>{verified ? "Verified institution" : "Pending verification"}</Text>
        <View style={s.headerTitleRow}>
          <Text style={s.headerTitle}>{org.name}</Text>
          {verified ? <VerifiedBadge onDark size={18} /> : null}
        </View>
        <Text style={s.headerLede}>Keep the official profile current, manage your offices, and post events.</Text>
        <View style={s.headerActions}>
          <Pressable accessibilityRole="button" onPress={() => push(route.institution(slug))} hitSlop={6}><Text style={s.headerLink}>View public page ›</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => push(ROUTES.studioTeam)} hitSlop={6}><Text style={s.headerLink}>Team & invites ›</Text></Pressable>
        </View>
      </View>

      <View style={s.body}>
        <ProfilePanel slug={slug} org={org} />
        <SectionsPanel slug={slug} initial={org.sections} />
        <GalleryPanel slug={slug} initial={org.gallery} />
        <OfficesPanel slug={slug} initial={org.offices} />
        <EventPanel slug={slug} verified={verified} />
        <RequestInstitutionPanel />
      </View>
    </ScrollView>
  );
}

const STATUS_TONE: Record<string, "gold" | "green" | "clay"> = { pending: "gold", approved: "green", rejected: "clay" };

// Request-a-new-institution (Creator plan §4.1.1) — a steward creates + verifies
// the org on approve, and the requester becomes its first manager.
function RequestInstitutionPanel() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { data: kinds } = useApi<InstitutionKind[]>(() => api.institutionKinds().catch(() => [] as InstitutionKind[]), "manage:kinds");
  const [nonce, setNonce] = useState(0);
  const { data: requests } = useApi<InstitutionRequest[]>(() => api.myInstitutionRequests().catch(() => [] as InstitutionRequest[]), `manage:reqs:${nonce}`);

  const kindList = kinds ?? [];
  const reqList = requests ?? [];
  const [name, setName] = useState("");
  const [kind, setKind] = useState("");
  const [seat, setSeat] = useState("");
  const [role, setRole] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const activeKind = kind || kindList[0]?.slug || "school";

  async function submit() {
    setBusy(true);
    setFlash(null);
    try {
      await api.requestInstitution({ name: name.trim(), kind: activeKind, seat: seat.trim(), role: role.trim(), note: note.trim() });
      setFlash({ ok: true, text: "Request sent — a steward reviews it. Once approved, the page is created and you're its first manager." });
      setName(""); setSeat(""); setRole(""); setNote("");
      setNonce((n) => n + 1);
    } catch (e) {
      setFlash({ ok: false, text: e instanceof Error ? e.message : "Couldn't send the request." });
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || name.trim().length < 2 || !seat.trim();
  const kindLabel = (slug: string) => kindList.find((k) => k.slug === slug)?.label ?? slug;

  return (
    <View style={s.panel}>
      <Text style={s.panelTitle}>Request a new institution</Text>
      <Text style={s.panelIntro}>Can&apos;t find your school, council or association? Tell us — a steward creates and verifies the page, and you become its first manager.</Text>

      <View style={{ gap: 14 }}>
        <View>
          <Text style={s.label}>Institution name</Text>
          <TextInput style={s.input} value={name} onChangeText={setName} placeholder="e.g. Aboom Methodist JHS" placeholderTextColor={C.inkFaint} />
        </View>
        {kindList.length > 0 ? (
          <View>
            <Text style={s.label}>Kind</Text>
            <View style={s.chips}>
              {kindList.map((k) => (
                <Pressable accessibilityRole="button" key={k.slug} onPress={() => setKind(k.slug)} style={[s.chip, activeKind === k.slug && s.chipOn]}>
                  <Text style={[s.chipText, activeKind === k.slug && s.chipTextOn]}>{k.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
        <View>
          <Text style={s.label}>Seat (town / quarter)</Text>
          <TextInput style={s.input} value={seat} onChangeText={setSeat} placeholder="e.g. Aboom, Cape Coast" placeholderTextColor={C.inkFaint} />
        </View>
        <View>
          <Text style={s.label}>Your office (optional)</Text>
          <TextInput style={s.input} value={role} onChangeText={setRole} placeholder="e.g. Founder, Headteacher" placeholderTextColor={C.inkFaint} />
        </View>
        <View>
          <Text style={s.label}>Note for the steward (optional)</Text>
          <TextInput style={[s.input, s.inputArea]} value={note} onChangeText={setNote} placeholder="Anything that helps verify the institution — a GES number, a chief's palace, a website…" placeholderTextColor={C.inkFaint} multiline />
        </View>
        <View style={s.saveRow}>
          <Pressable accessibilityRole="button" onPress={submit} disabled={disabled} style={[s.primaryBtn, disabled && s.dim]}><Text style={s.primaryBtnText}>Send request</Text></Pressable>
          {flash ? <Text style={[s.flash, { color: flash.ok ? C.tealText : C.clayText }]}>{flash.text}</Text> : null}
        </View>
      </View>

      {reqList.length > 0 ? (
        <View style={s.requestsWrap}>
          <Text style={s.subLabel}>Your requests</Text>
          <View style={{ gap: 8, marginTop: 10 }}>
            {reqList.map((r) => (
              <View key={r.id} style={s.requestRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.requestName} numberOfLines={1}>{r.newOrg.name}</Text>
                  <Text style={s.requestMeta}>{kindLabel(r.newOrg.kind)} · {r.newOrg.seat} · as {r.requestedRole}</Text>
                </View>
                <StatusPill status={r.status} />
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function StatusPill({ status }: Readonly<{ status: string }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const tone = STATUS_TONE[status] ?? "gold";
  const map = {
    gold: { bg: withAlpha(C.gold, 0.16), color: C.goldText },
    green: { bg: withAlpha(C.green, 0.08), color: C.greenText },
    clay: { bg: withAlpha(C.maroon, 0.08), color: C.maroonText },
  }[tone];
  return <View style={[s.statusPill, { backgroundColor: map.bg }]}><Text style={[s.statusPillText, { color: map.color }]}>{status}</Text></View>;
}

const makeStyles = (C: Palette) => StyleSheet.create({
  gate: { flex: 1, backgroundColor: C.paper, padding: 28, justifyContent: "center", alignItems: "center" },
  gateTitle: { ...D(600), fontSize: 26, color: C.ink, textAlign: "center" },
  gateBody: { color: C.inkMuted, fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 10, maxWidth: 320 },
  primaryBtn: { backgroundColor: C.green, borderRadius: 999, paddingVertical: 11, paddingHorizontal: 22, marginTop: 18 },
  primaryBtnText: { color: ON_GREEN, ...S(700), fontSize: 15 },

  notYours: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  notYouTitle: { ...D(700), fontSize: 24, color: C.ink, textAlign: "center" },
  notYouBody: { color: C.inkMuted, fontSize: 14, lineHeight: 21, textAlign: "center", maxWidth: 340 },
  secondaryBtn: { backgroundColor: C.green, borderRadius: 999, paddingVertical: 11, paddingHorizontal: 22, marginTop: 8 },
  secondaryBtnText: { color: ON_GREEN, ...S(700), fontSize: 14 },
  linkBtn: { paddingVertical: 8 },
  linkBtnText: { color: C.greenText, ...S(700), fontSize: 14 },

  header: { backgroundColor: C.green, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 24, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  headerKicker: { color: C.gold, fontSize: 10, letterSpacing: 2, ...D(700), textTransform: "uppercase" },
  headerTitleRow: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 6 },
  headerTitle: { color: ON_GREEN, ...D(700), fontSize: 26 },
  headerLede: { color: C.onDarkText85, fontSize: 14, lineHeight: 20, marginTop: 8 },
  headerActions: { flexDirection: "row", flexWrap: "wrap", gap: 18, marginTop: 12 },
  headerLink: { color: C.gold, fontSize: 13, ...S(700) },

  body: { padding: 16, gap: 16 },

  panel: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 16, padding: 16, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  panelTitle: { ...D(700), fontSize: 20, color: C.ink, marginBottom: 4 },
  panelIntro: { color: C.inkMuted, fontSize: 13, lineHeight: 19, marginBottom: 14 },
  label: { color: C.inkFaint, fontSize: 11, letterSpacing: 1.5, ...S(700), textTransform: "uppercase", marginBottom: 8 },
  subLabel: { color: C.inkFaint, fontSize: 11, letterSpacing: 1, ...S(700), textTransform: "uppercase" },
  input: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.ink },
  inputArea: { minHeight: 84, textAlignVertical: "top", ...S(400) },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chipOn: { borderColor: C.green, backgroundColor: C.green },
  chipText: { color: C.inkMuted, fontSize: 13, ...S(600) },
  chipTextOn: { color: ON_GREEN },

  saveRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 12, marginTop: 2 },
  dim: { opacity: 0.5 },
  flash: { fontSize: 13, flex: 1, minWidth: 160 },

  requestsWrap: { marginTop: 18, borderTopWidth: 1, borderTopColor: C.sand, paddingTop: 14 },
  requestRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.paper, borderWidth: 1, borderColor: C.sand, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11 },
  requestName: { color: C.ink, fontSize: 14, ...S(600) },
  requestMeta: { color: C.inkFaint, fontSize: 11, marginTop: 1 },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusPillText: { fontSize: 11, ...S(700), textTransform: "capitalize" },
});
