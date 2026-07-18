import { useEffect, useMemo, useState, type ReactNode } from "react";
import { presentCheckout, sessionFromStartResponse } from "@/lib/payments";
import { route, ROUTES } from "@/lib/routes";
import { push, replace } from "@/lib/router";
import { Platform, Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import { Link } from "expo-router";
import { T as Text, TI as TextInput } from "@/components/typography";
import { api, canWriteNews, canUseStudio } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth";
import type { Member, MemberView, Organization, Place, SchoolStint, Connection, Ticket, Subscription, Promotion, Listing } from "@/lib/types";
import { D, S, initials, ON_GREEN, withAlpha, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { CalendarIcon, ChevronRightIcon, CloseIcon, EyeIcon, FlagIcon, PenIcon, PlusIcon, RefreshIcon, SearchIcon, SettingsIcon, SparkleIcon, TicketIcon, UsersIcon } from "@/components/icons";
import { Loading, ErrorView, Thumb, VerifiedBadge } from "@/ui";
import { ImageField } from "@/components/image-field";
import { DateField } from "@/components/date-field";
import { RevealView } from "@/components/anim";
import { EmptyState } from "@/components/empty-state";
import { SchoolCombobox } from "@/components/school-combobox";
import { memberRoleLabel } from "@/lib/member-role";

type SaveState = "idle" | "saving" | "saved" | "error";

type TabId = "overview" | "profile" | "activity" | "connections" | "account";
const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "profile", label: "Profile" },
  { id: "activity", label: "Activity" },
  { id: "connections", label: "Connections" },
  { id: "account", label: "Account" },
] as const;

export default function Me() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { member, loading, signOut } = useAuth();
  if (loading) return <Loading />;
  if (!member) {
    return (
      <View style={s.gate}>
        <Text style={s.gateTitle}>Your profile</Text>
        <Text style={s.gateBody}>Sign in to build your profile, connect with classmates and neighbours, and rep your town.</Text>
        <Pressable accessibilityRole="button" onPress={() => replace(ROUTES.signIn)} style={s.primaryBtn}><Text style={s.primaryBtnText}>Sign in / create account</Text></Pressable>
      </View>
    );
  }
  return <MeLoaded slug={member.slug} onSignOut={signOut} />;
}

function fmtDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function money(pesewas: number): string {
  return `GH₵ ${(pesewas / 100).toLocaleString("en-GH", { maximumFractionDigits: 2 })}`;
}

function MeLoaded({ slug, onSignOut }: Readonly<{ slug: string; onSignOut: () => void }>) {
  const { data, error, loading } = useApi<MemberView>(() => api.member(slug), `me:${slug}`);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "Couldn't load your profile"} />;
  return <Profile view={data} onSignOut={onSignOut} />;
}

function TabBar({ active, onChange }: Readonly<{ active: TabId; onChange: (id: TabId) => void }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={s.tabBar}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabBarContent}>
        {TABS.map((t) => {
          const isActive = active === t.id;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.label}
              accessibilityState={{ selected: isActive }}
              key={t.id}
              onPress={() => onChange(t.id)}
              style={[s.tab, isActive && s.tabActive]}
            >
              <Text style={[s.tabText, isActive && s.tabTextActive]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function TabPanel({ id, active, visited, children }: Readonly<{ id: TabId; active: TabId; visited: Set<TabId>; children: ReactNode }>) {
  const isVisible = active === id || visited.has(id);
  if (!isVisible) return null;
  return <View style={{ display: active === id ? "flex" : "none" }}>{children}</View>;
}

function Profile({ view, onSignOut }: Readonly<{ view: MemberView; onSignOut: () => void }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { member: authMember, setMember } = useAuth();
  const m = view.member;
  const self = authMember ?? m;
  const places = view.places ?? [];

  const quarters = places.filter((p) => p.kind !== "asafo");
  const asafos = places.filter((p) => p.kind === "asafo");
  const [townId, setTownId] = useState(m.townId ?? "");
  const [asafoId, setAsafoId] = useState(m.asafoId ?? "");
  const quarter = quarters.find((p) => p.id === townId);
  const asafo = asafos.find((p) => p.id === asafoId);

  const [connKey, setConnKey] = useState(0);

  const [photo, setPhoto] = useState(m.photoUrl ?? "");
  const [photoSave, setPhotoSave] = useState<SaveState>("idle");
  const [verified, setVerified] = useState(m.phoneVerified);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyState, setVerifyState] = useState<SaveState>("idle");
  const [verifyError, setVerifyError] = useState("");
  const [verifySentCode, setVerifySentCode] = useState("");
  const [verifyExpiresAt, setVerifyExpiresAt] = useState("");

  const { data: ticketsData, error: ticketsError, loading: ticketsLoading } = useApi<Ticket[]>(() => api.myTickets(), "me:tickets");
  const { data: subsData, error: subsError, loading: subsLoading } = useApi<Subscription[]>(() => api.mySubscriptions(), "me:subscriptions");
  const tickets = ticketsData ?? [];
  const subscriptions = subsData ?? [];

  const [tab, setTab] = useState<TabId>("overview");
  const [visited, setVisited] = useState<Set<TabId>>(new Set(["overview"]));
  const selectTab = (id: TabId) => {
    setTab(id);
    setVisited((prev) => new Set(prev).add(id));
  };

  async function chooseQuarter(id: string) {
    const next = townId === id ? "" : id;
    setTownId(next);
    try { await api.setAffiliations({ townId: next, asafoId }); } catch { /* keep optimistic */ }
  }
  async function chooseAsafo(id: string) {
    const next = asafoId === id ? "" : id;
    setAsafoId(next);
    try { await api.setAffiliations({ townId, asafoId: next }); } catch { /* keep optimistic */ }
  }
  async function savePhoto(url: string) {
    setPhoto(url);
    setPhotoSave("saving");
    try {
      await api.setPhoto(url);
      setPhotoSave("saved");
    } catch { setPhotoSave("error"); }
  }
  async function startVerification() {
    setVerifyError("");
    setVerifyState("saving");
    try {
      const res = await api.startPhoneVerification();
      setVerified(res.member.phoneVerified);
      setMember(res.member);
      setVerifySentCode(res.code ?? "");
      setVerifyExpiresAt(res.expiresAt ?? "");
      setVerifyCode("");
      setVerifyState("saved");
    } catch (e) {
      setVerifyError(e instanceof Error ? e.message : "Could not send a verification code.");
      setVerifyState("error");
    }
  }
  async function confirmVerification() {
    setVerifyError("");
    setVerifyState("saving");
    try {
      const res = await api.confirmPhoneVerification(verifyCode);
      setVerified(res.member.phoneVerified);
      setMember(res.member);
      setVerifySentCode("");
      setVerifyExpiresAt("");
      setVerifyCode("");
      setVerifyState("saved");
    } catch (e) {
      setVerifyError(e instanceof Error ? e.message : "Could not confirm the verification code.");
      setVerifyState("error");
    }
  }

  return (
    <ScrollView
      style={{ backgroundColor: C.paper }}
      contentContainerStyle={{ paddingBottom: 48 }}
      stickyHeaderIndices={[1]}
      showsVerticalScrollIndicator={false}
    >
      {/* Compact identity dossier — photo, standing and useful actions in one view. */}
      <View style={s.header}>
        <View style={s.headerOrbLarge} />
        <View style={s.headerOrbSmall} />
        <Text style={s.headerEyebrow}>YOUR ACCOUNT</Text>
        <View style={s.identityRow}>
          <View style={s.avatarFrame}>
            {photo
              ? <Thumb seed={m.slug} src={photo} label={m.initials || initials(m.displayName)} style={s.avatar} labelStyle={s.avatarText} />
              : <View style={s.avatar}><Text style={s.avatarText}>{m.initials || initials(m.displayName)}</Text></View>}
          </View>
          <View style={s.identityCopy}>
            <View style={s.nameRow}>
              <Text style={s.name} numberOfLines={2}>{m.displayName}</Text>
              {m.verified ? <VerifiedBadge onDark size={18} /> : null}
            </View>
            <Text style={s.role}>{memberRoleLabel(m.role)}{m.joinedAt ? ` · joined ${fmtDate(m.joinedAt)}` : ""}</Text>
            {m.verified && m.verifiedAs ? (
              <View style={s.verifiedRow}><VerifiedBadge onDark label={`Verified · ${m.verifiedAs}`} /></View>
            ) : null}
            <View style={s.chipRow}>
              {quarter ? <View style={s.darkChip}><Text style={s.darkChipText}>{quarter.name}</Text></View> : null}
              {asafo ? <View style={s.darkChip}><Text style={s.darkChipText}>{asafo.name}</Text></View> : null}
            </View>
          </View>
        </View>
        {!verified && <View style={s.warnChip}><Text style={s.warnChipText}>Verification needed</Text></View>}
        <View style={s.headerActions}>
          <Pressable accessibilityRole="button" onPress={() => selectTab("profile")} style={s.headerBtnPrimary}>
            <PenIcon size={16} color={C.green900} strokeWidth={2.2} />
            <Text style={s.headerBtnPrimaryText}>Edit profile</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => push(route.member(m.slug))} style={s.headerBtn}>
            <EyeIcon size={16} color={ON_GREEN} strokeWidth={2.2} />
            <Text style={s.headerBtnText}>Public profile</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => push(ROUTES.settings)} style={s.headerBtn}>
            <SettingsIcon size={16} color={ON_GREEN} strokeWidth={2.2} />
            <Text style={s.headerBtnText}>Settings</Text>
          </Pressable>
        </View>
      </View>

      <TabBar active={tab} onChange={selectTab} />

      <View style={s.body}>
        <TabPanel id="overview" active={tab} visited={visited}>
          <View style={s.panelStack}>
            {!verified && (
              <Pressable accessibilityRole="button" onPress={() => selectTab("account")} style={s.nudge}>
                <Text style={s.nudgeTitle}>Verify your contact</Text>
                <Text style={s.nudgeBody}>Unlock listings, incidents and reports by confirming your phone number.</Text>
                <Text style={s.nudgeCta}>Go to Account →</Text>
              </Pressable>
            )}

            <View style={s.statsGrid}>
              <StatCard value={String(view.listings?.length ?? 0)} label="Listings" tone="green" />
              <StatCard value={ticketsLoading ? "…" : String(tickets.length)} label="Tickets" tone="teal" />
              <StatCard value={subsLoading ? "…" : String(subscriptions.length)} label="Subscriptions" tone="gold" />
              <StatCard value={verified ? "Verified" : "Pending"} label="Contact" tone={verified ? "green" : "clay"} />
            </View>

            <QuickActions member={self} />

            <Section title="Recent listings" help="Your latest contributions.">
              <ListingsPreview listings={view.listings ?? []} limit={3} onShowAll={() => selectTab("activity")} />
            </Section>

            <Section title="Upcoming tickets" help="Your event tickets and gate codes.">
              <TicketsList tickets={tickets} limit={3} loading={ticketsLoading} error={ticketsError} onEvent={(slug) => push(route.event(slug))} onShowAll={() => selectTab("activity")} />
            </Section>

            <Section title="Active subscriptions" help="Your Supporter subscriptions — each payment adds a month to the business.">
              <SubscriptionsList subscriptions={subscriptions} limit={3} loading={subsLoading} error={subsError} onBusiness={(slug) => push(route.business(slug))} onShowAll={() => selectTab("activity")} />
            </Section>
          </View>
        </TabPanel>

        <TabPanel id="profile" active={tab} visited={visited}>
          <View style={s.panelStack}>
            <Section title="Your photo" help="Put a face to your name. It shows on your profile and across the community.">
              <ImageField value={photo} onChange={savePhoto} />
              {photoSave === "saving" && <Text style={[s.help, { marginTop: 8 }]}>Saving…</Text>}
              {photoSave === "saved" && <Text style={[s.savedNote, { marginTop: 8 }]}>Saved ✓</Text>}
              {photoSave === "error" && <Text style={[s.errNote, { marginTop: 8 }]}>Couldn&apos;t save your photo</Text>}
            </Section>

            <Section title="Your bio" help="A short line about you — it shows on your public profile.">
              <BioCard member={self} onSaved={setMember} />
            </Section>

            <Section title="Rep your town" help={"Wear your community pride — your quarter and your Asafo company." + (quarter ? ` You rep ${quarter.name}.` : "")}>
              <Text style={s.subLabel}>Quarter</Text>
              <RepChips places={quarters} selectedId={townId} variant="green" onChoose={chooseQuarter} />
              <Text style={[s.subLabel, { marginTop: 14 }]}>Asafo company</Text>
              <RepChips places={asafos} selectedId={asafoId} variant="clay" onChoose={chooseAsafo} />
            </Section>

            <Section title="Your birthday" help="If you turn this on, your followers get a gentle note on your day. Off by default — it's yours to choose.">
              <BirthdayCard member={m} />
            </Section>

            <Section title="Oguaa abroad" help="A son or daughter of the Castle living away from home? Add yourself to the diaspora — the bridge for homecomings and giving back. Off by default.">
              <DiasporaCard member={m} />
            </Section>
          </View>
        </TabPanel>

        <TabPanel id="activity" active={tab} visited={visited}>
          <View style={s.panelStack}>
            <Section title="Your listings" help="Everything you've contributed, with its review status. Promote an approved listing to feature it on the front pages — GH₵ 10 per day.">
              <MyListings listings={view.listings ?? []} />
            </Section>
            <Section title="My tickets" help="Your event tickets and gate codes. Show the code at the entrance.">
              <TicketsList tickets={tickets} loading={ticketsLoading} error={ticketsError} onEvent={(slug) => push(route.event(slug))} />
            </Section>
            <Section title="My subscriptions" help="Your Supporter subscriptions — each payment adds a month to the business.">
              <SubscriptionsList subscriptions={subscriptions} loading={subsLoading} error={subsError} onBusiness={(slug) => push(route.business(slug))} />
            </Section>
          </View>
        </TabPanel>

        <TabPanel id="connections" active={tab} visited={visited}>
          <View style={s.panelStack}>
            <Section title="Your schooling" help="Add the schools you attended and the years you were there. Classmates who overlapped with you appear below.">
              <SchoolingEditor member={m} schools={view.schools ?? []} onSaved={() => setConnKey((k) => k + 1)} />
            </Section>
            <Section title="People you may know" help="Classmates, neighbours from your quarter, and members of your Asafo.">
              <PeopleYouMayKnow refreshKey={connKey} />
            </Section>
          </View>
        </TabPanel>

        <TabPanel id="account" active={tab} visited={visited}>
          <View style={s.panelStack}>
            {!verified && (
              <Section title="Contact verification" help="Submissions stay blocked until your account is verified. Send a code, then enter it here to unlock the submit form.">
                <Pressable accessibilityRole="button" onPress={startVerification} disabled={verifyState === "saving"} style={[s.primaryBtn, { alignSelf: "flex-start" }, verifyState === "saving" && { opacity: 0.6 }]}>
                  <Text style={s.primaryBtnText}>{verifyState === "saving" ? "Sending…" : "Send code"}</Text>
                </Pressable>
                {verifySentCode ? (
                  <View style={{ gap: 10, marginTop: 12 }}>
                    <TextInput
                      value={verifyCode}
                      onChangeText={setVerifyCode}
                      placeholder="123456"
                      keyboardType="number-pad"
                      autoComplete="one-time-code"
                      style={s.codeInput}
                    />
                    <View style={{ flexDirection: "row", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <Pressable accessibilityRole="button"
                        onPress={confirmVerification}
                        disabled={verifyState === "saving" || verifyCode.trim() === ""}
                        style={[s.secondaryBtn, (verifyState === "saving" || verifyCode.trim() === "") && { opacity: 0.6 }]}
                      >
                        <Text style={s.secondaryBtnText}>{verifyState === "saving" ? "Checking…" : "Confirm code"}</Text>
                      </Pressable>
                      {verifyExpiresAt ? <Text style={s.help}>Expires: {verifyExpiresAt}</Text> : null}
                    </View>
                    <Text style={s.help}>Dev mode shows the code here: <Text style={s.mono}>{verifySentCode}</Text></Text>
                  </View>
                ) : null}
                {verifyError ? <Text style={[s.errNote, { marginTop: 10 }]}>{verifyError}</Text> : null}
              </Section>
            )}

            <Section title="Newsroom" help="Writers can publish stories in the Oguaa Newsroom.">
              <WriterCard member={self} onUpdated={setMember} />
            </Section>

            <Section title="Rent & Stay" help="Realtors and property managers can publish rooms, homes and short stays for the town.">
              <PropertyCreatorCard member={self} onUpdated={setMember} />
            </Section>

            <Section title="Account">
              {canUseStudio(self) && (
                <Pressable accessibilityRole="button" onPress={() => push(ROUTES.studio)} style={s.linkRow}><Text style={s.linkRowText}>Creator studio</Text><ChevronRightIcon size={20} color={C.inkFaint} strokeWidth={2} /></Pressable>
              )}
              <Pressable accessibilityRole="button" onPress={() => push(ROUTES.settings)} style={s.linkRow}><Text style={s.linkRowText}>Settings — security & preferences</Text><ChevronRightIcon size={20} color={C.inkFaint} strokeWidth={2} /></Pressable>
              <Pressable accessibilityRole="button" onPress={() => push(ROUTES.notifications)} style={s.linkRow}><Text style={s.linkRowText}>Notifications</Text><ChevronRightIcon size={20} color={C.inkFaint} strokeWidth={2} /></Pressable>
              <Pressable accessibilityRole="button" onPress={() => push(ROUTES.submit)} style={s.linkRow}><Text style={s.linkRowText}>Contribute a listing</Text><ChevronRightIcon size={20} color={C.inkFaint} strokeWidth={2} /></Pressable>
              <Pressable accessibilityRole="button" onPress={() => push(route.member(m.slug))} style={s.linkRow}><Text style={s.linkRowText}>View my public profile</Text><ChevronRightIcon size={20} color={C.inkFaint} strokeWidth={2} /></Pressable>
              <Pressable accessibilityRole="button" onPress={onSignOut} style={s.signOut}><Text style={s.signOutText}>Sign out</Text></Pressable>
            </Section>
          </View>
        </TabPanel>
      </View>
    </ScrollView>
  );
}

// Dashboard section card — display title + optional help text wrapping a body slot.
function Section({ title, help, children }: Readonly<{ title: string; help?: string; children: ReactNode }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <RevealView style={s.section}>
      <View style={s.sectionHeading}>
        <View style={s.sectionMarker} />
        <Text style={s.sectionTitle}>{title}</Text>
      </View>
      {help ? <Text style={s.help}>{help}</Text> : <View style={s.sectionSpacer} />}
      {children}
    </RevealView>
  );
}

function StatCard({ value, label, tone }: Readonly<{ value: string; label: string; tone: "green" | "teal" | "gold" | "clay" }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const tones: Record<string, object> = {
    green: { backgroundColor: withAlpha(C.green, 0.08), borderColor: withAlpha(C.green, 0.2) },
    teal: { backgroundColor: withAlpha(C.teal, 0.09), borderColor: withAlpha(C.teal, 0.25) },
    gold: { backgroundColor: withAlpha(C.gold, 0.14), borderColor: withAlpha(C.gold, 0.3) },
    clay: { backgroundColor: withAlpha(C.clay, 0.08), borderColor: withAlpha(C.clay, 0.25) },
  };
  return (
    <View style={[s.statCard, tones[tone]]}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function QuickActions({ member }: Readonly<{ member: Member }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const actions = [
    { label: "Add listing", icon: <PlusIcon size={18} color={C.goldText} strokeWidth={2} />, onPress: () => push(ROUTES.submit) },
    { label: "Report incident", icon: <FlagIcon size={18} color={C.goldText} strokeWidth={2} />, onPress: () => push(ROUTES.safetyReport) },
    { label: "Lost & found", icon: <SearchIcon size={18} color={C.goldText} strokeWidth={2} />, onPress: () => push(ROUTES.lostFoundNew) },
    { label: "Events", icon: <CalendarIcon size={18} color={C.goldText} strokeWidth={2} />, onPress: () => push(ROUTES.browseEvents) },
  ] as const;
  return (
    <View style={s.quickActionsContent}>
      {actions.map((a) => (
        <Pressable accessibilityRole="button" key={a.label} onPress={a.onPress} style={s.quickChip}>
          <View style={s.quickChipIcon}>{a.icon}</View>
          <Text style={s.quickChipText}>{a.label}</Text>
          <ChevronRightIcon size={15} color={C.inkFaint} strokeWidth={2.2} />
        </Pressable>
      ))}
      {canUseStudio(member) && (
        <Pressable accessibilityRole="button" onPress={() => push(ROUTES.studio)} style={s.quickChip}>
          <View style={s.quickChipIcon}><SparkleIcon size={18} color={C.goldText} strokeWidth={2} /></View>
          <Text style={s.quickChipText}>Creator studio</Text>
          <ChevronRightIcon size={15} color={C.inkFaint} strokeWidth={2.2} />
        </Pressable>
      )}
      {canWriteNews(member) && (
        <Pressable accessibilityRole="button" onPress={() => push(ROUTES.write)} style={s.quickChip}>
          <View style={s.quickChipIcon}><PenIcon size={18} color={C.goldText} strokeWidth={2} /></View>
          <Text style={s.quickChipText}>Write a story</Text>
          <ChevronRightIcon size={15} color={C.inkFaint} strokeWidth={2.2} />
        </Pressable>
      )}
    </View>
  );
}

// Shared chip row for "rep your quarter" / "rep your Asafo" (spec §8.6).
function RepChips({ places, selectedId, variant, onChoose }: Readonly<{ places: Place[]; selectedId: string; variant: "green" | "clay"; onChoose: (id: string) => void }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={s.chipWrap}>
      {places.map((p) => (
        <Pressable accessibilityRole="button" key={p.id} onPress={() => onChoose(p.id)} style={[s.repChip, p.id === selectedId && (variant === "green" ? s.repChipOnGreen : s.repChipOnClay)]}>
          {p.colors?.[0] ? <View style={[s.asafoDot, { backgroundColor: p.colors[0] }]} /> : null}
          <Text style={[s.repChipText, p.id === selectedId && s.repChipTextOn]}>{p.name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// Short profile bio — POST /api/me/profile keeps the display name and updates
// the bio, returning the fresh member so the whole app reflects the change.
function BioCard({ member: m, onSaved }: Readonly<{ member: Member; onSaved: (m: Member) => void }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [bio, setBio] = useState(m.bio ?? "");
  const [save, setSave] = useState<SaveState>("idle");
  async function persist() {
    setSave("saving");
    try {
      const updated = await api.setProfile({ displayName: m.displayName, bio: bio.trim() });
      onSaved(updated);
      setSave("saved");
    } catch { setSave("error"); }
  }
  return (
    <>
      <TextInput
        style={s.bioInput}
        value={bio}
        onChangeText={(v) => { setBio(v); setSave("idle"); }}
        placeholder="Tell the town a little about yourself"
        placeholderTextColor={C.inkFaint}
        multiline
        maxLength={280}
      />
      <View style={s.saveRow}>
        <Pressable accessibilityRole="button" onPress={persist} disabled={save === "saving"} style={[s.bdaySaveBtn, save === "saving" && { opacity: 0.6 }]}>
          <Text style={s.saveBtnText}>{save === "saving" ? "Saving…" : "Save"}</Text>
        </Pressable>
        {save === "saved" && <Text style={s.savedNote}>Saved ✓</Text>}
        {save === "error" && <Text style={s.errNote}>Couldn&apos;t save</Text>}
      </View>
    </>
  );
}

// Newsroom access — eligible members (writers or verified-authority managers)
// get a link to compose; everyone else can opt in to the "writer" creator type.
function WriterCard({ member: m, onUpdated }: Readonly<{ member: Member; onUpdated: (m: Member) => void }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (canWriteNews(m)) {
    return (
      <Pressable accessibilityRole="button" onPress={() => push(ROUTES.write)} style={s.linkRow}>
        <Text style={s.linkRowText}>Write a story for the Newsroom</Text><ChevronRightIcon size={20} color={C.inkFaint} strokeWidth={2} />
      </Pressable>
    );
  }
  async function becomeWriter() {
    setBusy(true); setErr("");
    try {
      const next = Array.from(new Set([...(m.creatorTypes ?? []), "writer"]));
      const updated = await api.setCreatorTypes(next);
      onUpdated(updated);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't update.");
    } finally { setBusy(false); }
  }
  return (
    <View style={{ gap: 10 }}>
      <Text style={s.help}>Become a writer to publish in the Newsroom. Your drafts go to the newsroom for review before they appear.</Text>
      <Pressable accessibilityRole="button" onPress={becomeWriter} disabled={busy} style={[s.primaryBtn, { alignSelf: "flex-start", marginTop: 0 }, busy && { opacity: 0.6 }]}>
        <Text style={s.primaryBtnText}>{busy ? "Saving…" : "Become a writer"}</Text>
      </Pressable>
      {err ? <Text style={s.errNote}>{err}</Text> : null}
    </View>
  );
}

function PropertyCreatorCard({ member: m, onUpdated }: Readonly<{ member: Member; onUpdated: (m: Member) => void }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const enabled = m.creatorTypes?.includes("property") ?? false;

  async function becomePropertyManager() {
    setBusy(true); setErr("");
    try {
      const next = Array.from(new Set([...(m.creatorTypes ?? []), "property"]));
      onUpdated(await api.setCreatorTypes(next));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't update.");
    } finally { setBusy(false); }
  }

  if (enabled) {
    return (
      <View style={{ gap: 8 }}>
        <Pressable accessibilityRole="button" onPress={() => push(ROUTES.rentStay)} style={s.linkRow}>
          <Text style={s.linkRowText}>Browse Rent & Stay</Text><ChevronRightIcon size={20} color={C.inkFaint} strokeWidth={2} />
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => push(`${ROUTES.submit}?type=property`)} style={s.linkRow}>
          <Text style={s.linkRowText}>List a property</Text><ChevronRightIcon size={20} color={C.inkFaint} strokeWidth={2} />
        </Pressable>
      </View>
    );
  }
  return (
    <View style={{ gap: 10 }}>
      <Text style={s.help}>Add the realtor / property manager hat to your creator profile. Listings still go through the same local curator review.</Text>
      <Pressable accessibilityRole="button" onPress={becomePropertyManager} disabled={busy} style={[s.primaryBtn, { alignSelf: "flex-start", marginTop: 0 }, busy && { opacity: 0.6 }]}>
        <Text style={s.primaryBtnText}>{busy ? "Saving…" : "I manage properties"}</Text>
      </Pressable>
      {err ? <Text style={s.errNote}>{err}</Text> : null}
    </View>
  );
}

// Birthday + follower-broadcast opt-in (spec §8.11).
function BirthdayCard({ member: m }: Readonly<{ member: Member }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [birthday, setBirthday] = useState(m.birthday ? m.birthday.slice(0, 10) : "");
  const [broadcast, setBroadcast] = useState(!!m.broadcastBirthday);
  const [bdaySave, setBdaySave] = useState<SaveState>("idle");
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  async function saveBirthday() {
    setBdaySave("saving");
    try {
      await api.setBirthday({ birthday: birthday.trim(), broadcast });
      setBdaySave("saved");
    } catch { setBdaySave("error"); }
  }
  return (
    <>
      <DateField
        value={birthday}
        onChange={(v) => { setBirthday(v); setBdaySave("idle"); }}
        placeholder="Your birthday"
        maxDate={todayIso}
      />
      <View style={[s.diaRow, { marginTop: 10 }]}>
        <Text style={s.diaLabel}>Let my followers know</Text>
        <Switch value={broadcast} onValueChange={(v) => { setBroadcast(v); setBdaySave("idle"); }} trackColor={{ true: C.green, false: C.sand }} thumbColor={C.cream} />
      </View>
      <View style={s.saveRow}>
        <Pressable accessibilityRole="button" onPress={saveBirthday} disabled={bdaySave === "saving"} style={[s.bdaySaveBtn, bdaySave === "saving" && { opacity: 0.6 }]}>
          <Text style={s.saveBtnText}>{bdaySave === "saving" ? "Saving…" : "Save"}</Text>
        </Pressable>
        {bdaySave === "saved" && <Text style={s.savedNote}>Saved ✓</Text>}
        {bdaySave === "error" && <Text style={s.errNote}>Add a valid date first</Text>}
      </View>
    </>
  );
}

// Diaspora opt-in (Phase 2 foundation).
function DiasporaCard({ member: m }: Readonly<{ member: Member }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [abroad, setAbroad] = useState(!!m.diaspora?.abroad);
  const [city, setCity] = useState(m.diaspora?.city ?? "");
  const [country, setCountry] = useState(m.diaspora?.country ?? "");
  const [diaSave, setDiaSave] = useState<SaveState>("idle");

  async function saveDiaspora() {
    setDiaSave("saving");
    try {
      await api.setDiaspora({ abroad, city: city.trim(), country: country.trim() });
      setDiaSave("saved");
    } catch { setDiaSave("error"); }
  }

  return (
    <>
      <View style={s.diaRow}>
        <Text style={s.diaLabel}>I live abroad / outside Cape Coast</Text>
        <Switch value={abroad} onValueChange={(v) => { setAbroad(v); setDiaSave("idle"); }} trackColor={{ true: C.teal, false: C.sand }} thumbColor={C.cream} />
      </View>
      {abroad && (
        <View style={{ gap: 8, marginTop: 10 }}>
          <TextInput style={s.diaInput} value={city} onChangeText={(v) => { setCity(v); setDiaSave("idle"); }} placeholder="City (e.g. London)" placeholderTextColor={C.inkFaint} />
          <TextInput style={s.diaInput} value={country} onChangeText={(v) => { setCountry(v); setDiaSave("idle"); }} placeholder="Country (e.g. United Kingdom)" placeholderTextColor={C.inkFaint} />
        </View>
      )}
      <View style={s.saveRow}>
        <Pressable accessibilityRole="button" onPress={saveDiaspora} disabled={diaSave === "saving"} style={[s.diaSaveBtn, diaSave === "saving" && { opacity: 0.6 }]}>
          <Text style={s.saveBtnText}>{diaSave === "saving" ? "Saving…" : "Save"}</Text>
        </Pressable>
        {diaSave === "saved" && <Text style={s.savedNote}>Saved ✓</Text>}
        {diaSave === "error" && <Text style={s.errNote}>Couldn&apos;t save</Text>}
      </View>
    </>
  );
}

// Schooling editor — stints drive the "people you may know" suggestions,
// so onSaved bumps the refresh key in the parent.
function SchoolingEditor({ member: m, schools, onSaved }: Readonly<{ member: Member; schools: Organization[]; onSaved: () => void }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [stints, setStints] = useState<SchoolStint[]>(m.schooling ?? []);
  const [save, setSave] = useState<SaveState>("idle");
  const schoolName = (id: string) => schools.find((x) => x.id === id)?.name ?? id;
  const available = schools.filter((sc) => !stints.some((st) => st.schoolId === sc.id));

  function setYear(i: number, key: "fromYear" | "toYear", val: string) {
    const n = val ? Number.parseInt(val, 10) : undefined;
    setStints((cur) => cur.map((st, idx) => (idx === i ? { ...st, [key]: Number.isFinite(n) ? n : undefined } : st)));
    setSave("idle");
  }
  function add(schoolId: string) { setStints((cur) => [...cur, { schoolId }]); setSave("idle"); }
  function remove(i: number) { setStints((cur) => cur.filter((_, idx) => idx !== i)); setSave("idle"); }

  async function persist() {
    setSave("saving");
    try {
      await api.setSchooling({ schooling: stints.filter((st) => st.schoolId) });
      setSave("saved");
      onSaved();
    } catch { setSave("error"); }
  }

  return (
    <>
      {stints.map((st, i) => (
        <View key={`${st.schoolId}-${i}`} style={s.stint}>
          <View style={{ flex: 1 }}>
            <Text style={s.stintName}>{schoolName(st.schoolId)}</Text>
            <View style={s.yearRow}>
              <TextInput style={s.yearInput} value={st.fromYear ? String(st.fromYear) : ""} onChangeText={(v) => setYear(i, "fromYear", v)} placeholder="From" placeholderTextColor={C.inkFaint} keyboardType="number-pad" maxLength={4} />
              <Text style={s.dash}>–</Text>
              <TextInput style={s.yearInput} value={st.toYear ? String(st.toYear) : ""} onChangeText={(v) => setYear(i, "toYear", v)} placeholder="To" placeholderTextColor={C.inkFaint} keyboardType="number-pad" maxLength={4} />
            </View>
          </View>
          <Pressable accessibilityRole="button" onPress={() => remove(i)} hitSlop={8} style={s.removeBtn}><CloseIcon size={18} color={C.clayText} strokeWidth={2.2} /></Pressable>
        </View>
      ))}

      {available.length > 0 && (
        <View style={s.addWrap}>
          <Text style={s.addLabel}>Add a school</Text>
          <SchoolCombobox schools={available} onSelect={add} />
        </View>
      )}

      {stints.length > 0 && (
        <View style={s.saveRow}>
          <Pressable accessibilityRole="button" onPress={persist} disabled={save === "saving"} style={[s.saveBtn, save === "saving" && { opacity: 0.6 }]}>
            <Text style={s.saveBtnText}>{save === "saving" ? "Saving…" : "Save schooling"}</Text>
          </Pressable>
          {save === "saved" && <Text style={s.savedNote}>Saved ✓</Text>}
          {save === "error" && <Text style={s.errNote}>Couldn&apos;t save</Text>}
        </View>
      )}
    </>
  );
}

const LISTING_HREF: Record<string, string> = {
  artist: "/music/", memorial: "/memoriam/", business: "/business/", person: "/people/", project: "/projects/", event: "/events/",
  property: "/rent-stay/",
};

function listingHref(listing: Listing): string | null {
  if (listing.status !== "approved") return null;
  if (listing.type === "memory") return ROUTES.browseMemories;
  if (listing.type === "opportunity") return ROUTES.browseOpportunities;
  const base = LISTING_HREF[listing.type];
  return base ? `${base}${listing.slug}` : null;
}

function ListingsPreview({ listings, limit, onShowAll }: Readonly<{ listings: Listing[]; limit?: number; onShowAll?: () => void }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  if (listings.length === 0) {
    return (
      <Pressable accessibilityRole="button" onPress={() => push(ROUTES.submit)} style={s.linkRow}>
        <Text style={s.linkRowText}>Nothing yet — add your first</Text><ChevronRightIcon size={20} color={C.inkFaint} strokeWidth={2} />
      </Pressable>
    );
  }
  const list = limit ? listings.slice(0, limit) : listings;
  return (
    <View style={{ gap: 8 }}>
      {list.map((l) => <ListingPreviewRow key={l.id} listing={l} />)}
      {limit && listings.length > limit && onShowAll ? (
        <Pressable accessibilityRole="button" onPress={onShowAll} style={s.viewAllBtn}>
          <Text style={s.viewAllText}>View all {listings.length} →</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ListingPreviewRow({ listing: l }: Readonly<{ listing: Listing }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const href = listingHref(l);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${l.title}, ${l.status}`}
      onPress={href ? () => push(href) : undefined}
      disabled={!href}
      style={({ pressed }) => [s.listingRow, !href && { opacity: 0.9 }, pressed && s.listingRowPressed]}
    >
      <Thumb seed={l.slug} src={l.coverImageUrl} label={initials(l.title)} style={s.previewThumb} labelStyle={s.previewThumbText} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.listingTitle} numberOfLines={1}>{l.title}</Text>
        <Text style={s.listingType}>{l.type}</Text>
      </View>
      <StatusChip status={l.status} />
    </Pressable>
  );
}

// Everything the member has contributed, with review status + promote control.
function MyListings({ listings }: Readonly<{ listings: Listing[] }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  if (listings.length === 0) {
    return (
      <Pressable accessibilityRole="button" onPress={() => push(ROUTES.submit)} style={s.linkRow}>
        <Text style={s.linkRowText}>Nothing yet — add your first</Text><ChevronRightIcon size={20} color={C.inkFaint} strokeWidth={2} />
      </Pressable>
    );
  }
  return (
    <View style={{ gap: 8 }}>
      {listings.map((l) => <ListingRow key={l.id} listing={l} />)}
      <Pressable accessibilityRole="button" onPress={() => push(ROUTES.submit)} style={s.addListingBtn}>
        <Text style={s.addListingText}>+ Add a listing</Text>
      </Pressable>
    </View>
  );
}

function ListingRow({ listing: l }: Readonly<{ listing: Listing }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const href = listingHref(l);
  const inner = (
    <View style={s.listingRow}>
      <Thumb seed={l.slug} src={l.coverImageUrl} label={initials(l.title)} style={s.previewThumb} labelStyle={s.previewThumbText} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.listingTitle} numberOfLines={1}>{l.title}</Text>
        <Text style={s.listingType}>{l.type}</Text>
      </View>
      <StatusChip status={l.status} />
    </View>
  );
  return (
    <View style={s.listingWrap}>
      {href ? (
        <Pressable accessibilityRole="button" onPress={() => push(href)}>{inner}</Pressable>
      ) : (
        <View>{inner}</View>
      )}
      {l.status === "approved" && (
        <View style={s.promoSlot}>
          {l.featuredUntil && l.featuredUntil > new Date().toISOString() ? (
            <Text style={s.featuredNote}>★ Featured until {fmtDate(l.featuredUntil)}</Text>
          ) : null}
          <PromoteControl listing={l} />
        </View>
      )}
    </View>
  );
}

function StatusChip({ status }: Readonly<{ status: string }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const chip: Record<string, { bg: object; color: string }> = {
    approved: { bg: s.statusOk, color: C.greenText },
    pending: { bg: s.statusPending, color: C.goldText },
    rejected: { bg: s.statusBad, color: C.maroonText },
  };
  const v = chip[status] ?? { bg: s.statusMuted, color: C.inkMuted };
  return (
    <View style={[s.statusChip, v.bg]}>
      <Text style={[s.statusText, { color: v.color }]}>{status}</Text>
    </View>
  );
}

function TicketsList({ tickets, limit, loading, error, onEvent, onShowAll }: Readonly<{ tickets: Ticket[]; limit?: number; loading?: boolean; error?: string | null; onEvent: (slug: string) => void; onShowAll?: () => void }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  if (loading) return <Text style={s.help}>Loading your tickets…</Text>;
  if (error) return <Text style={s.help}>Couldn&apos;t load your tickets.</Text>;
  if (tickets.length === 0) return <EmptyState compact icon={<TicketIcon size={20} color={C.goldText} strokeWidth={1.8} />} title="No tickets yet" body="See what's on under Events." />;
  const list = limit ? tickets.slice(0, limit) : tickets;
  return (
    <View style={{ gap: 8 }}>
      {list.map((t) => (
        <Pressable accessibilityRole="button" accessibilityLabel={`Ticket for ${t.eventTitle}`} key={t.id} onPress={() => onEvent(t.eventSlug)} style={({ pressed }) => [s.listingRow, pressed && s.listingRowPressed]}>
          <View style={[s.activityIcon, { backgroundColor: withAlpha(C.teal, 0.12) }]}>
            <TicketIcon size={18} color={C.tealText} strokeWidth={2} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.listingTitle} numberOfLines={1}>{t.eventTitle}</Text>
            <Text style={s.listingType}>{t.qty} × {t.tier} · {fmtDate(t.createdAt)}</Text>
          </View>
          {t.status === "success" && t.code ? (
            <View style={s.codeChip}><Text style={s.codeText}>{t.code}</Text></View>
          ) : (
            <View style={[s.statusChip, t.status === "pending" ? s.statusPending : s.statusBad]}>
              <Text style={[s.statusText, t.status === "pending" ? { color: C.goldText } : { color: C.maroonText }]}>{t.status}</Text>
            </View>
          )}
        </Pressable>
      ))}
      {limit && tickets.length > limit && onShowAll ? (
        <Pressable accessibilityRole="button" onPress={onShowAll} style={s.viewAllBtn}>
          <Text style={s.viewAllText}>View all {tickets.length} →</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function SubscriptionsList({ subscriptions, limit, loading, error, onBusiness, onShowAll }: Readonly<{ subscriptions: Subscription[]; limit?: number; loading?: boolean; error?: string | null; onBusiness: (slug: string) => void; onShowAll?: () => void }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  if (loading) return <Text style={s.help}>Loading your subscriptions…</Text>;
  if (error) return <Text style={s.help}>Couldn&apos;t load your subscriptions.</Text>;
  if (subscriptions.length === 0) return <EmptyState compact icon={<RefreshIcon size={20} color={C.goldText} strokeWidth={1.8} />} title="No subscriptions yet" />;
  const list = limit ? subscriptions.slice(0, limit) : subscriptions;
  return (
    <View style={{ gap: 8 }}>
      {list.map((sub) => {
        const subChip = sub.status === "pending" ? s.statusPending : s.statusBad;
        const subColor = sub.status === "pending" ? { color: C.goldText } : { color: C.maroonText };
        return (
          <Pressable accessibilityRole="button" accessibilityLabel={`Subscription to ${sub.listingTitle}`} key={sub.id} onPress={() => onBusiness(sub.listingSlug)} style={({ pressed }) => [s.listingRow, pressed && s.listingRowPressed]}>
            <View style={[s.activityIcon, { backgroundColor: withAlpha(C.gold, 0.16) }]}>
              <RefreshIcon size={18} color={C.goldText} strokeWidth={2} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.listingTitle} numberOfLines={1}>{sub.listingTitle}</Text>
              <Text style={s.listingType}>
                {money(sub.amountPesewas)}{sub.periodEnd ? ` · until ${fmtDate(sub.periodEnd)}` : ""}
              </Text>
            </View>
            <View style={[s.statusChip, sub.status === "success" ? s.statusOk : subChip]}>
              <Text style={[s.statusText, sub.status === "success" ? { color: C.greenText } : subColor]}>{sub.status}</Text>
            </View>
          </Pressable>
        );
      })}
      {limit && subscriptions.length > limit && onShowAll ? (
        <Pressable accessibilityRole="button" onPress={onShowAll} style={s.viewAllBtn}>
          <Text style={s.viewAllText}>View all {subscriptions.length} →</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// Paid featured placement on an owned listing — GH₵ 10/day, Paystack handoff
// with a manual verify step, mirroring the projects pledge flow.
function PromoteControl({ listing }: Readonly<{ listing: Listing }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [pendingRef, setPendingRef] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Promotion | null>(null);

  async function promote(days: number) {
    setBusy(true); setErr("");
    try {
      const r = await api.promoteListing(listing.id, days);
      const amountPesewas = days * 10 * 100;
      const result = await presentCheckout(
        sessionFromStartResponse(r, { amountPesewas, flow: "promotion", metadata: { listingId: listing.id, days: String(days) } })
      );
      if (result.kind === "error") {
        setErr(result.message);
      } else if (result.kind === "cancelled") {
        // keep the picker open
      } else if (result.provider === "simulated") {
        const p = await api.confirmPromotion(r.reference);
        setConfirmed(p);
        setOpen(false);
      } else if (result.provider === "stripe") {
        const p = await api.confirmPromotion(r.reference);
        setConfirmed(p);
        setOpen(false);
      } else {
        setPendingRef(r.reference);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start the payment.");
    } finally { setBusy(false); }
  }

  async function verify() {
    if (!pendingRef) return;
    setBusy(true); setErr("");
    try {
      const p = await api.confirmPromotion(pendingRef);
      setConfirmed(p);
      setPendingRef(null);
      setOpen(false);
    } catch {
      setErr("Payment not confirmed yet. Finish paying in the browser, then verify again.");
    } finally { setBusy(false); }
  }

  if (confirmed) {
    return <Text style={s.promoDone}>★ Featured {confirmed.days}d ✓</Text>;
  }
  if (pendingRef) {
    return (
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        <Pressable accessibilityRole="button" onPress={verify} disabled={busy} style={[s.promoBtn, busy && { opacity: 0.6 }]}>
          <Text style={s.promoBtnText}>{busy ? "Checking…" : "I've paid — verify"}</Text>
        </Pressable>
        {err !== "" && <Text style={s.promoErr}>{err}</Text>}
      </View>
    );
  }
  if (open) {
    return (
      <View style={{ alignItems: "flex-end", gap: 6 }}>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {[7, 14, 30].map((d) => (
            <Pressable accessibilityRole="button" key={d} onPress={() => promote(d)} disabled={busy} style={[s.promoDayBtn, busy && { opacity: 0.6 }]}>
              <Text style={s.promoDayText}>{d}d</Text>
              <Text style={s.promoDayPrice}>GH₵{d * 10}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable accessibilityRole="button" onPress={() => { setOpen(false); setErr(""); }} hitSlop={6} style={{ minHeight: 32, justifyContent: "center" }}>
          <Text style={s.promoCancel}>Cancel</Text>
        </Pressable>
        {err !== "" && <Text style={s.promoErr}>{err}</Text>}
      </View>
    );
  }
  return (
    <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={s.promoBtn}>
      <Text style={s.promoBtnText}>Promote</Text>
    </Pressable>
  );
}

function PeopleYouMayKnow({ refreshKey }: Readonly<{ refreshKey: number }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { data, error, loading } = useApi<Connection[]>(() => api.connections(), `connections:${refreshKey}`);
  if (loading) return <Text style={s.help}>Finding your people…</Text>;
  if (error) return <Text style={s.help}>Couldn&apos;t load suggestions.</Text>;
  const list = data ?? [];
  if (list.length === 0) {
    return <EmptyState compact icon={<UsersIcon size={20} color={C.goldText} strokeWidth={1.8} />} title="No suggestions yet" body="Add your schooling, quarter and Asafo and we'll connect you with classmates and neighbours." />;
  }
  return (
    <View style={{ gap: 10 }}>
      {list.map((c) => (
        <View key={c.member.id} style={s.connCard}>
          <Link href={route.member(c.member.slug)} asChild>
            <Pressable style={s.connAvatar} accessibilityRole="button" accessibilityLabel={c.member.displayName}>
              {c.member.photoUrl
                ? <Thumb seed={c.member.slug} src={c.member.photoUrl} label={c.member.initials || initials(c.member.displayName)} style={s.connAvatarBox} labelStyle={s.connAvatarText} />
                : <View style={s.connAvatarBox}><Text style={s.connAvatarText}>{c.member.initials || initials(c.member.displayName)}</Text></View>}
            </Pressable>
          </Link>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Link href={route.member(c.member.slug)} asChild>
              <Pressable accessibilityRole="button" accessibilityLabel={c.member.displayName}><Text style={s.connName}>{c.member.displayName}</Text></Pressable>
            </Link>
            <View style={s.reasonWrap}>
              {c.reasons.map((r) => <View key={r} style={s.reason}><Text style={s.reasonText}>{r}</Text></View>)}
            </View>
          </View>
          <FollowChip slug={c.member.slug} />
        </View>
      ))}
    </View>
  );
}

function FollowChip({ slug }: Readonly<{ slug: string }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    api.memberFollowState(slug).then((r) => { if (alive) setFollowing(r.following); }).catch(() => {});
    return () => { alive = false; };
  }, [slug]);
  async function toggle() {
    if (busy) return;
    setBusy(true);
    const next = !following;
    setFollowing(next);
    try { const r = next ? await api.followMember(slug) : await api.unfollowMember(slug); setFollowing(r.following); }
    catch { setFollowing(!next); }
    finally { setBusy(false); }
  }
  return (
    <Pressable accessibilityRole="button" onPress={toggle} disabled={busy} style={[s.followChip, following && s.followChipOn]}>
      <Text style={[s.followChipText, following && s.followChipTextOn]}>{following ? "Following" : "Follow"}</Text>
    </Pressable>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  gate: { flex: 1, backgroundColor: C.paper, padding: 28, justifyContent: "center", alignItems: "center" },
  gateTitle: { ...D(600), fontSize: 26, color: C.ink, textAlign: "center" },
  gateBody: { color: C.inkMuted, fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 10, maxWidth: 320 },
  primaryBtn: { backgroundColor: C.green, borderRadius: 999, paddingVertical: 13, paddingHorizontal: 24, marginTop: 18 },
  primaryBtnText: { color: ON_GREEN, ...S(700), fontSize: 15 },

  header: { backgroundColor: C.green900, paddingTop: 18, paddingBottom: 16, paddingHorizontal: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, overflow: "hidden" },
  headerOrbLarge: { position: "absolute", width: 176, height: 176, borderRadius: 88, right: -72, top: -78, borderWidth: 1, borderColor: C.goldBorder35, backgroundColor: C.goldTint14 },
  headerOrbSmall: { position: "absolute", width: 84, height: 84, borderRadius: 42, right: 64, bottom: -56, borderWidth: 1, borderColor: C.onDarkText10 },
  headerEyebrow: { color: C.gold, fontSize: 10, letterSpacing: 2.2, ...S(700), marginBottom: 12 },
  identityRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatarFrame: { width: 82, height: 82, borderRadius: 25, padding: 3, borderWidth: 1, borderColor: C.gold, backgroundColor: C.onDarkText10 },
  avatar: { width: 74, height: 74, borderRadius: 21, backgroundColor: C.greenSlate, alignItems: "center", justifyContent: "center" },
  avatarText: { color: ON_GREEN, ...S(700), fontSize: 27 },
  identityCopy: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  name: { ...D(700), fontSize: 24, lineHeight: 28, color: ON_GREEN, flexShrink: 1 },
  role: { color: C.gold, fontSize: 10, letterSpacing: 0.9, marginTop: 4, textTransform: "uppercase", ...S(700) },
  verifiedRow: { marginTop: 7 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 9 },
  warnChip: { alignSelf: "flex-start", marginTop: 12, borderWidth: 1, borderColor: C.goldBorder35, backgroundColor: C.goldTint14, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5 },
  warnChipText: { color: C.gold, fontSize: 12, ...S(700) },
  darkChip: { borderWidth: 1, borderColor: C.onDarkText30, backgroundColor: C.onDarkText10, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  darkChipText: { color: ON_GREEN, fontSize: 12 },
  headerActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 15 },
  headerBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: C.onDarkText30, backgroundColor: C.onDarkText10, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 13 },
  headerBtnPrimary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, flexGrow: 1, backgroundColor: C.gold, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16 },
  headerBtnPrimaryText: { color: C.green900, ...S(700), fontSize: 13 },
  headerBtnText: { color: ON_GREEN, ...S(700), fontSize: 12 },

  tabBar: { backgroundColor: C.paper, borderBottomWidth: 1, borderBottomColor: C.sand, zIndex: 20, elevation: 3 },
  tabBarContent: { flexDirection: "row", gap: 7, paddingHorizontal: 14, paddingVertical: 10 },
  tab: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.cream, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 8 },
  tabActive: { backgroundColor: C.gold, borderColor: C.gold },
  tabText: { color: C.inkMuted, ...S(600), fontSize: 13 },
  tabTextActive: { color: C.green900 },

  body: { padding: 14 },
  panelStack: { gap: 12 },
  section: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 17, padding: 15 },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 9 },
  sectionMarker: { width: 4, height: 19, borderRadius: 2, backgroundColor: C.gold },
  sectionTitle: { ...D(700), fontSize: 18, color: C.ink, flex: 1 },
  sectionSpacer: { height: 9 },
  subLabel: { color: C.inkFaint, fontSize: 11, letterSpacing: 1.5, ...S(700), textTransform: "uppercase", marginBottom: 8 },
  help: { color: C.inkMuted, fontSize: 12, lineHeight: 18, marginTop: 5, marginBottom: 11 },

  nudge: { backgroundColor: withAlpha(C.gold, 0.1), borderWidth: 1, borderColor: withAlpha(C.goldBrand, 0.35), borderRadius: 16, padding: 16 },
  nudgeTitle: { color: C.goldText, ...S(700), fontSize: 14 },
  nudgeBody: { color: C.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  nudgeCta: { color: C.goldText, ...S(700), fontSize: 13, marginTop: 8 },

  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statCard: { flex: 1, minWidth: 112, borderWidth: 1, borderRadius: 14, padding: 12 },
  statValue: { ...D(700), fontSize: 22, color: C.ink },
  statLabel: { ...S(600), fontSize: 11, color: C.inkFaint, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 4 },

  quickActionsContent: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  quickChip: { width: "48%", flexGrow: 1, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 14, paddingHorizontal: 11, paddingVertical: 11 },
  quickChipIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: C.goldTint14, borderWidth: 1, borderColor: C.goldBorder35, alignItems: "center", justifyContent: "center" },
  quickChipText: { color: C.ink, fontSize: 12, ...S(700), flex: 1 },

  viewAllBtn: { alignSelf: "center", paddingVertical: 8, paddingHorizontal: 12, marginTop: 2 },
  viewAllText: { color: C.greenText, ...S(700), fontSize: 13 },

  previewThumb: { width: 46, height: 46, borderRadius: 13 },
  previewThumbText: { color: ON_GREEN, ...S(700), fontSize: 14 },

  stint: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.paper, borderWidth: 1, borderColor: C.sand, borderRadius: 12, padding: 12, marginBottom: 10 },
  stintName: { ...S(700), fontSize: 16, color: C.ink },
  yearRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  yearInput: { width: 78, borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, color: C.ink, fontSize: 14 },
  dash: { color: C.inkFaint },
  removeBtn: { padding: 6 },
  removeText: { color: C.clayText, fontSize: 16, ...S(700) },

  addWrap: { marginTop: 2 },
  addLabel: { color: C.inkFaint, fontSize: 12, ...S(600), marginBottom: 8 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },

  diaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, backgroundColor: C.paper, borderWidth: 1, borderColor: C.sand, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  diaLabel: { color: C.ink, fontSize: 14, flex: 1 },
  diaInput: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: C.ink, fontSize: 14 },
  bioInput: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: C.ink, fontSize: 14, minHeight: 88, textAlignVertical: "top", ...S(400) },
  codeInput: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: C.ink, fontSize: 14, letterSpacing: 2 },
  diaSaveBtn: { backgroundColor: C.teal, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 20 },
  secondaryBtn: { backgroundColor: C.paper, borderWidth: 1, borderColor: C.green, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16 },
  secondaryBtnText: { color: C.greenText, ...S(700), fontSize: 13 },

  repChip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  repChipOnGreen: { backgroundColor: C.green, borderColor: C.green },
  repChipOnClay: { backgroundColor: C.clay, borderColor: C.clay },
  repChipText: { color: C.inkMuted, fontSize: 13, ...S(600) },
  repChipTextOn: { color: ON_GREEN },
  asafoDot: { width: 9, height: 9, borderRadius: 5 },
  bdaySaveBtn: { backgroundColor: C.green, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 20 },

  listingRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 64, backgroundColor: C.paper, borderWidth: 1, borderColor: C.sand, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 9 },
  listingRowPressed: { opacity: 0.72 },
  listingWrap: { gap: 6 },
  promoSlot: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 10, paddingRight: 4 },
  promoBtn: { borderWidth: 1, borderColor: C.goldBrand, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, minHeight: 36, justifyContent: "center" },
  promoBtnText: { color: C.goldText, fontSize: 12, ...S(700) },
  promoDayBtn: { borderWidth: 1, borderColor: C.green, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, alignItems: "center", minWidth: 52, minHeight: 44, justifyContent: "center" },
  promoDayText: { color: C.greenText, fontSize: 13, ...S(700) },
  promoDayPrice: { color: C.inkFaint, fontSize: 10, marginTop: 1 },
  promoCancel: { color: C.inkFaint, fontSize: 12, ...S(600) },
  promoErr: { color: C.clayText, fontSize: 11, maxWidth: 220, textAlign: "right" },
  promoDone: { color: C.goldText, fontSize: 12, ...S(700) },
  featuredNote: { color: C.goldText, fontSize: 12, ...S(700), flex: 1 },
  codeChip: { backgroundColor: withAlpha(C.green, 0.08), borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  codeText: { color: C.greenText, fontSize: 15, ...S(700), letterSpacing: 2 },
  activityIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  listingTitle: { color: C.ink, fontSize: 14, ...S(700) },
  listingType: { color: C.inkFaint, fontSize: 10.5, ...S(500), textTransform: "capitalize", marginTop: 2 },
  statusChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusOk: { backgroundColor: withAlpha(C.green, 0.08) },
  statusPending: { backgroundColor: withAlpha(C.gold, 0.16) },
  statusBad: { backgroundColor: withAlpha(C.maroon, 0.08) },
  statusMuted: { backgroundColor: C.sand },
  statusText: { fontSize: 11, ...S(700), textTransform: "capitalize" },
  addListingBtn: { borderWidth: 1, borderStyle: "dashed", borderColor: C.goldBrand, borderRadius: 999, paddingVertical: 10, alignItems: "center", marginTop: 2 },
  addListingText: { color: C.goldText, fontSize: 13, ...S(700) },

  saveRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14 },
  saveBtn: { backgroundColor: C.maroon, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 20 },
  saveBtnText: { color: ON_GREEN, ...S(700), fontSize: 14 },
  savedNote: { color: C.tealText, fontSize: 13, ...S(600) },
  errNote: { color: C.clayText, fontSize: 13 },
  mono: { fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }), color: C.greenText },

  connCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.paper, borderWidth: 1, borderColor: C.sand, borderRadius: 12, padding: 12 },
  connAvatar: { borderRadius: 22 },
  connAvatarBox: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.green, alignItems: "center", justifyContent: "center" },
  connAvatarText: { color: ON_GREEN, ...S(700), fontSize: 16 },
  connName: { ...S(700), fontSize: 17, color: C.ink },
  reasonWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  reason: { backgroundColor: C.sand, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  reasonText: { color: C.inkMuted, fontSize: 11, ...S(500) },
  followChip: { borderWidth: 1, borderColor: C.green, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  followChipOn: { backgroundColor: C.green },
  followChipText: { color: C.greenText, ...S(700), fontSize: 13 },
  followChipTextOn: { color: ON_GREEN },

  linkRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: C.paper, borderWidth: 1, borderColor: C.sand, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 8 },
  linkRowText: { color: C.ink, fontSize: 15, ...S(600) },
  chevron: { color: C.inkFaint, fontSize: 20, ...S(700) },
  signOut: { borderWidth: 1, borderColor: C.sand, borderRadius: 999, paddingVertical: 12, alignItems: "center", marginTop: 8 },
  signOutText: { color: C.clayText, ...S(700) },
});
