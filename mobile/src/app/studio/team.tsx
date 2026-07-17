// Creator Studio · Team — the mobile port of creator/src/pages/Team.tsx's team
// surface (roster + invitations). A manager picks one of their approved
// institutions and manages its team: invite officers/managers, promote/demote,
// and remove; every signed-in member answers their own pending invitations.
// Content editing (profile, sections, gallery, offices, events) lives on each
// institution's /institutions/[slug]/manage screen.
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { T as Text, TI as TextInput } from "@/components/typography";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth";
import type { Invitation, Organization, TeamMember, TeamView } from "@/lib/types";
import { D, S, initials, withAlpha, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { Loading, ErrorView, Thumb } from "@/ui";
import { EmptyState } from "@/components/empty-state";

export default function StudioTeam() {
  const { member, loading } = useAuth();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);

  if (loading) return <Loading />;
  if (!member) {
    return (
      <View style={s.gate}>
        <Text style={s.gateTitle}>Team</Text>
        <Text style={s.gateBody}>Sign in to manage your institution&apos;s team and answer invitations.</Text>
        <Pressable onPress={() => router.replace("/signin")} style={s.primaryBtn}><Text style={s.primaryBtnText}>Sign in / create account</Text></Pressable>
      </View>
    );
  }
  return <TeamLoaded meId={member.id} />;
}

function TeamLoaded({ meId }: Readonly<{ meId: string }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  // One nonce reloads every list together after any mutation (accepting an
  // invite adds you to a roster; revoking removes a row, etc.).
  const [nonce, setNonce] = useState(0);
  const reloadAll = () => setNonce((n) => n + 1);

  const { data: orgs, loading, error } = useApi<Organization[]>(() => api.myInstitutions(), `team:orgs:${meId}:${nonce}`);
  const { data: invitations } = useApi<Invitation[]>(() => api.myInvitations().catch(() => [] as Invitation[]), `team:invites:${meId}:${nonce}`);

  const [selected, setSelected] = useState<string | null>(null);

  if (loading) return <Loading />;
  if (error) return <ErrorView message={error} />;

  const orgList = orgs ?? [];
  const invites = invitations ?? [];
  const activeSlug = selected && orgList.some((o) => o.slug === selected) ? selected : orgList[0]?.slug ?? null;

  return (
    <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 48 }}>
      <View style={s.header}>
        <Text style={s.headerKicker}>Creator studio</Text>
        <Text style={s.headerTitle}>Team</Text>
        <Text style={s.headerLede}>Invite officers and managers, keep your roster current, and answer invitations sent to you.</Text>
      </View>

      <View style={s.body}>
        <InvitationsPanel items={invites} onChanged={reloadAll} />

        {orgList.length === 0 ? (
          <View style={s.panel}>
            <EmptyState
              glyph="◈"
              title="No institutions yet"
              body="Claim your school, council or association from its page — once a steward approves, its team workspace opens here."
              actionLabel="Browse institutions"
              onAction={() => router.push("/institutions" as never)}
            />
          </View>
        ) : (
          <>
            {orgList.length > 1 ? (
              <View style={s.switcher}>
                {orgList.map((o) => (
                  <Pressable key={o.id} onPress={() => setSelected(o.slug)} style={[s.orgChip, o.slug === activeSlug && s.orgChipOn]}>
                    <Text style={[s.orgChipText, o.slug === activeSlug && s.orgChipTextOn]} numberOfLines={1}>{o.name}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {activeSlug ? <TeamRoster key={`${activeSlug}:${nonce}`} slug={activeSlug} meId={meId} onChanged={reloadAll} /> : null}
          </>
        )}
      </View>
    </ScrollView>
  );
}

// The signed-in member's own pending invitations — accept or decline.
function InvitationsPanel({ items, onChanged }: Readonly<{ items: Invitation[]; onChanged: () => void }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  if (items.length === 0) return null;

  async function respond(id: string, accept: boolean) {
    setBusy(true);
    setFlash(null);
    try {
      await api.respondToInvite(id, accept);
      onChanged();
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={s.panel}>
      <Text style={s.panelTitle}>Invitations for you</Text>
      <View style={{ gap: 10, marginTop: 4 }}>
        {items.map((inv) => (
          <View key={inv.id} style={s.inviteRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.memberName} numberOfLines={1}>{inv.orgName}</Text>
              <Text style={s.memberMeta}>{inv.invitedByName ? `${inv.invitedByName} invited you` : "You're invited"} as {inv.requestedRole}</Text>
            </View>
            <ScopePill scope={inv.scope} />
            <View style={s.inviteActions}>
              <Pressable onPress={() => respond(inv.id, true)} disabled={busy} style={[s.acceptBtn, busy && s.dim]}><Text style={s.acceptBtnText}>Accept</Text></Pressable>
              <Pressable onPress={() => respond(inv.id, false)} disabled={busy} style={[s.declineBtn, busy && s.dim]}><Text style={s.declineBtnText}>Decline</Text></Pressable>
            </View>
          </View>
        ))}
      </View>
      {flash ? <Text style={s.errNote}>{flash}</Text> : null}
    </View>
  );
}

function TeamRoster({ slug, meId, onChanged }: Readonly<{ slug: string; meId: string; onChanged: () => void }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { data, loading, error } = useApi<TeamView>(() => api.orgTeam(slug), `team:roster:${slug}`);

  if (loading) return <View style={s.panel}><Text style={s.help}>Loading team…</Text></View>;
  if (error || !data) return <View style={s.panel}><Text style={s.errNote}>Couldn&apos;t load the team.</Text></View>;

  const isManager = data.viewerScope === "manager";
  const team = data.team ?? [];

  return (
    <View style={s.panel}>
      <Text style={s.panelTitle}>Team</Text>
      <Text style={s.panelIntro}>Managers can edit everything and run the team; officers edit content only (profile, sections, gallery, events).</Text>

      <View style={{ gap: 10 }}>
        {team.map((t) => (
          <TeamRow key={t.claimId} slug={slug} member={t} meId={meId} isManager={isManager} onChanged={onChanged} />
        ))}
        {team.length === 0 ? <Text style={s.help}>No team members yet.</Text> : null}
      </View>

      {isManager ? <InviteForm slug={slug} onChanged={onChanged} /> : null}
    </View>
  );
}

function TeamRow({ slug, member: t, meId, isManager, onChanged }: Readonly<{ slug: string; member: TeamMember; meId: string; isManager: boolean; onChanged: () => void }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setErr("");
    try {
      await action();
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const canAct = isManager && t.memberId !== meId;
  return (
    <View style={s.memberCard}>
      <View style={s.memberTop}>
        <Thumb seed={t.memberSlug || t.memberId} src={t.photoUrl} label={initials(t.memberName || "?")} style={s.avatar} labelStyle={s.avatarText} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.memberName} numberOfLines={1}>{t.memberName || t.memberId}</Text>
          <Text style={s.memberMeta} numberOfLines={1}>
            {t.role}{t.status === "invited" && t.invitedByName ? ` · invited by ${t.invitedByName}` : ""}
          </Text>
        </View>
        <ScopePill scope={t.scope} />
        {t.status === "invited" ? <View style={s.invitedPill}><Text style={s.invitedPillText}>invited</Text></View> : null}
      </View>

      {canAct ? (
        <View style={s.memberActions}>
          <Pressable
            onPress={() => run(() => api.setTeamScope(slug, t.memberId, t.scope === "manager" ? "officer" : "manager"))}
            disabled={busy || t.status !== "approved"}
            style={[s.actionBtn, (busy || t.status !== "approved") && s.dim]}
          >
            <Text style={s.actionBtnText}>{t.scope === "manager" ? "Make officer" : "Make manager"}</Text>
          </Pressable>
          <Pressable onPress={() => run(() => api.revokeTeamMember(slug, t.memberId))} disabled={busy} style={[s.actionBtn, busy && s.dim]}>
            <Text style={[s.actionBtnText, { color: C.clayText }]}>Remove</Text>
          </Pressable>
        </View>
      ) : null}
      {err ? <Text style={s.errNote}>{err}</Text> : null}
    </View>
  );
}

function InviteForm({ slug, onChanged }: Readonly<{ slug: string; onChanged: () => void }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [identifier, setIdentifier] = useState("");
  const [role, setRole] = useState("");
  const [scope, setScope] = useState<"officer" | "manager">("officer");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  async function invite() {
    if (!identifier.trim() || !role.trim()) return;
    setBusy(true);
    setFlash(null);
    try {
      await api.inviteToTeam(slug, { identifier: identifier.trim(), role: role.trim(), scope });
      setFlash({ ok: true, text: "Invitation sent — they'll see it in their app." });
      setIdentifier(""); setRole(""); setScope("officer");
      onChanged();
    } catch (e) {
      setFlash({ ok: false, text: e instanceof Error ? e.message : "Something went wrong." });
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || !identifier.trim() || !role.trim();
  return (
    <View style={s.inviteForm}>
      <Text style={s.subLabel}>Invite someone</Text>
      <View style={{ gap: 10, marginTop: 10 }}>
        <TextInput style={s.input} value={identifier} onChangeText={setIdentifier} placeholder="Their email or phone" placeholderTextColor={C.inkFaint} autoCapitalize="none" keyboardType="email-address" />
        <TextInput style={s.input} value={role} onChangeText={setRole} placeholder="Office (e.g. PTA Chair)" placeholderTextColor={C.inkFaint} />
        <View style={s.scopeRow}>
          <Pressable onPress={() => setScope("officer")} style={[s.scopeChip, scope === "officer" && s.scopeChipOn]}>
            <Text style={[s.scopeChipText, scope === "officer" && s.scopeChipTextOn]}>Officer — content only</Text>
          </Pressable>
          <Pressable onPress={() => setScope("manager")} style={[s.scopeChip, scope === "manager" && s.scopeChipOn]}>
            <Text style={[s.scopeChipText, scope === "manager" && s.scopeChipTextOn]}>Manager — full control</Text>
          </Pressable>
        </View>
        <View style={s.saveRow}>
          <Pressable onPress={invite} disabled={disabled} style={[s.primaryBtn, { marginTop: 0 }, disabled && s.dim]}><Text style={s.primaryBtnText}>Send invitation</Text></Pressable>
          {flash ? <Text style={[s.flash, { color: flash.ok ? C.tealText : C.clayText }]}>{flash.text}</Text> : null}
        </View>
      </View>
    </View>
  );
}

function ScopePill({ scope }: Readonly<{ scope: "manager" | "officer" }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const isManager = scope === "manager";
  return (
    <View style={[s.scopePill, { backgroundColor: isManager ? withAlpha(C.gold, 0.16) : C.sand }]}>
      <Text style={[s.scopePillText, { color: isManager ? C.goldText : C.inkMuted }]}>{scope}</Text>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  gate: { flex: 1, backgroundColor: C.paper, padding: 28, justifyContent: "center", alignItems: "center" },
  gateTitle: { ...D(600), fontSize: 26, color: C.ink, textAlign: "center" },
  gateBody: { color: C.inkMuted, fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 10, maxWidth: 320 },
  primaryBtn: { backgroundColor: C.green, borderRadius: 999, paddingVertical: 11, paddingHorizontal: 22, marginTop: 18 },
  primaryBtnText: { color: C.cream, fontWeight: "700", fontSize: 15 },

  header: { backgroundColor: C.green, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 24, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  headerKicker: { color: C.gold, fontSize: 10, letterSpacing: 2, fontWeight: "700", textTransform: "uppercase" },
  headerTitle: { color: C.cream, ...D(700), fontSize: 28, marginTop: 6 },
  headerLede: { color: C.onDarkText85, fontSize: 14, lineHeight: 20, marginTop: 6 },

  body: { padding: 16, gap: 16 },
  panel: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 16, padding: 16, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  panelTitle: { ...D(700), fontSize: 20, color: C.ink },
  panelIntro: { color: C.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 4, marginBottom: 14 },
  help: { color: C.inkFaint, fontSize: 13, lineHeight: 19 },
  subLabel: { color: C.inkFaint, fontSize: 11, letterSpacing: 1, fontWeight: "700", textTransform: "uppercase" },
  dim: { opacity: 0.5 },
  errNote: { color: C.clayText, fontSize: 13, marginTop: 8 },
  flash: { fontSize: 13, flex: 1, minWidth: 150 },

  switcher: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  orgChip: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.cream, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, maxWidth: "100%" },
  orgChipOn: { borderColor: C.green, backgroundColor: withAlpha(C.green, 0.08) },
  orgChipText: { color: C.inkMuted, fontSize: 13, fontWeight: "600" },
  orgChipTextOn: { color: C.greenText },

  inviteRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, backgroundColor: C.paper, borderWidth: 1, borderColor: C.sand, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  inviteActions: { flexDirection: "row", gap: 8 },
  acceptBtn: { backgroundColor: C.green, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  acceptBtnText: { color: C.cream, fontSize: 13, fontWeight: "700" },
  declineBtn: { borderWidth: 1, borderColor: C.sand, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  declineBtnText: { color: C.inkMuted, fontSize: 13, fontWeight: "700" },

  memberCard: { backgroundColor: C.paper, borderWidth: 1, borderColor: C.sand, borderRadius: 12, padding: 12 },
  memberTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarText: { color: C.cream, ...S(700), fontSize: 15 },
  memberName: { color: C.ink, fontSize: 14, fontWeight: "700" },
  memberMeta: { color: C.inkFaint, fontSize: 12, marginTop: 1 },
  memberActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  actionBtn: { borderWidth: 1, borderColor: C.sand, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  actionBtnText: { color: C.inkMuted, fontSize: 12, fontWeight: "700" },

  invitedPill: { backgroundColor: withAlpha(C.clay, 0.14), borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  invitedPillText: { color: C.clayText, fontSize: 11, fontWeight: "700" },
  scopePill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  scopePillText: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },

  inviteForm: { marginTop: 16, borderTopWidth: 1, borderTopColor: C.sand, paddingTop: 14 },
  input: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.ink },
  scopeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  scopeChip: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.cream, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  scopeChipOn: { borderColor: C.green, backgroundColor: C.green },
  scopeChipText: { color: C.inkMuted, fontSize: 12, fontWeight: "600" },
  scopeChipTextOn: { color: C.cream },
  saveRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 12, marginTop: 2 },
});
