import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ROUTES } from "@/lib/routes";
import { push, replace } from "@/lib/router";
import { Alert, Image, Platform, Pressable, ScrollView, Share, StyleSheet, Switch, View } from "react-native";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import { T as Text, TI as TextInput } from "@/components/typography";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useTheme, type ThemeSetting } from "@/lib/theme-context";
import type { Member } from "@/lib/types";
import { D, initials, ON_GREEN, S, withAlpha, type Palette } from "@/theme";
import { SettingsIcon, ShieldIcon, UserIcon } from "@/components/icons";
import { Loading, Thumb, VerifiedBadge } from "@/ui";
import { memberRoleLabel } from "@/lib/member-role";

// The mobile Settings screen — parity with the web creator Settings page
// (creator/src/pages/Settings.tsx) and admin MFA (admin/src/components/mfa.tsx):
// Account summary, Preferences (theme + notification toggles), and Security
// (change password + TOTP two-factor enrol/disable with recovery codes).

type SaveState = "idle" | "saving" | "saved" | "error";

function fmtDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function Settings() {
  const { C, setting } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { member, loading, setMember } = useAuth();

  if (loading) return <Loading />;
  if (!member) {
    return (
      <View style={s.gate}>
        <Text style={s.gateTitle}>Settings</Text>
        <Text style={s.gateBody}>Sign in to manage your password, two-factor sign-in, and preferences.</Text>
        <Pressable accessibilityRole="button" onPress={() => replace(ROUTES.signIn)} style={s.primaryBtn}>
          <Text style={s.primaryBtnText}>Sign in / create account</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: C.paper }}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={s.settingsHero}>
        <View style={s.heroOrb} />
        <Text style={s.kicker}>ACCOUNT CONTROL</Text>
        <Text style={s.pageTitle}>Settings</Text>
        <Text style={s.pageLede}>Your sign-in, privacy and preferences — together, without the clutter.</Text>
        <View style={s.heroStatusRow}>
          <View style={s.heroStatus}><Text style={s.heroStatusKey}>PHONE</Text><Text style={s.heroStatusValue}>{member.phoneVerified ? "Verified" : "Pending"}</Text></View>
          <View style={s.heroStatusRule} />
          <View style={s.heroStatus}><Text style={s.heroStatusKey}>TWO-FACTOR</Text><Text style={s.heroStatusValue}>{member.mfaEnabled ? "On" : "Off"}</Text></View>
          <View style={s.heroStatusRule} />
          <View style={s.heroStatus}><Text style={s.heroStatusKey}>THEME</Text><Text style={s.heroStatusValue}>{setting === "system" ? "System" : setting === "dark" ? "Dark" : "Light"}</Text></View>
        </View>
      </View>

      <Section icon={<UserIcon size={18} color={C.goldText} strokeWidth={2} />} title="Account" description="Who you are in Oguaa.">
        <AccountCard member={member} />
      </Section>

      <Section icon={<SettingsIcon size={18} color={C.goldText} strokeWidth={2} />} title="Preferences" description="How the app looks and what it tells you about.">
        <ThemeControl />
        <View style={{ height: 18 }} />
        <NotificationPrefs />
      </Section>

      <Section icon={<ShieldIcon size={18} color={C.goldText} strokeWidth={2} />} title="Security" description="Your password and two-factor sign-in.">
        <Text style={s.subLabel}>CHANGE PASSWORD</Text>
        <ChangePassword />
        <View style={s.hr} />
        <Text style={s.subLabel}>TWO-FACTOR SIGN-IN (TOTP)</Text>
        <MfaManage member={member} onMember={setMember} />
      </Section>

      <Section icon={<ShieldIcon size={18} color={C.clayText} strokeWidth={2} />} title="Your data" description="Take a copy, or close your account for good.">
        <Text style={s.subLabel}>EXPORT MY DATA</Text>
        <ExportMyData />
        <View style={s.hr} />
        <Text style={s.subLabel}>DELETE MY ACCOUNT</Text>
        <DeleteAccount />
        <View style={s.hr} />
        <Text style={s.subLabel}>POLICIES</Text>
        <View style={s.policyRow}>
          {LEGAL_LINKS.map((l) => (
            <Pressable accessibilityRole="link" key={l.route} onPress={() => push(l.route)} style={s.policyChip}>
              <Text style={s.policyChipText}>{l.label}</Text>
            </Pressable>
          ))}
        </View>
      </Section>
    </ScrollView>
  );
}

// Apple 5.1.1(v) also expects the privacy policy to be reachable inside the app,
// not only from the store listing.
const LEGAL_LINKS = [
  { label: "Privacy", route: ROUTES.legalPrivacy },
  { label: "Terms", route: ROUTES.legalTerms },
  { label: "Acceptable use", route: ROUTES.legalAcceptableUse },
  { label: "Safeguarding", route: ROUTES.legalSafeguarding },
] as const;

// A titled card mirroring the web Section (icon-led header, gold accent).
function Section({ icon, title, description, children }: Readonly<{ icon: ReactNode; title: string; description?: string; children: ReactNode }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={s.section}>
      <View style={s.sectionHead}>
        <View style={s.sectionIcon}>{icon}</View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.sectionTitle}>{title}</Text>
          {description ? <Text style={s.sectionDesc}>{description}</Text> : null}
        </View>
      </View>
      <View style={s.sectionBody}>{children}</View>
    </View>
  );
}

// ── Act 843 data rights / store compliance ──────────────────────────────────

/** Right of access: hand the member their own file, via the OS share sheet. */
function ExportMyData() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [state, setState] = useState<SaveState>("idle");
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setErr(null);
    setState("saving");
    try {
      const json = await api.exportData();
      // Share rather than write to disk: no extra native module, and it lets the
      // member put the file wherever they actually keep things (Files, Drive,
      // mail to themselves). The server sets the download filename for web.
      await Share.share({ message: json, title: "My Oguaa data" });
      setState("saved");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't export your data.");
      setState("error");
    }
  }

  return (
    <View>
      <Text style={s.hint}>
        Everything Oguaa holds about you — profile, listings, tickets, pledges and promotions — as a JSON file.
      </Text>
      {err ? <Text style={s.errNote}>{err}</Text> : null}
      <View style={s.saveRow}>
        <Pressable accessibilityRole="button" onPress={run} disabled={state === "saving"} style={[s.secondaryBtn, state === "saving" && { opacity: 0.6 }]}>
          <Text style={s.secondaryBtnText}>{state === "saving" ? "Preparing…" : "Export my data"}</Text>
        </Pressable>
        {state === "saved" ? <Text style={s.savedNote}>Ready ✓</Text> : null}
      </View>
    </View>
  );
}

/**
 * Right to erasure — and the in-app account deletion both stores require
 * (Apple guideline 5.1.1(v), Google Play's data-deletion policy).
 *
 * This is a SOFT delete and the copy says so in as many words. The server
 * anonymises the member record in place: identifiers unset, profile wiped,
 * account permanently suspended. Approved community content stays up under
 * "Former member" — a memorial or a tribute is other people's memory too, and
 * hard-deleting the row would tear a hole in it. Nothing that survives can be
 * traced back to a person, which is what erasure actually requires.
 *
 * Reviewers check that this path is reachable without contacting support, so it
 * lives in Settings under a plain "Delete my account" label — no email form, no
 * dark pattern.
 */
function DeleteAccount() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { signOut } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setErr(null);
    setBusy(true);
    try {
      await api.deleteAccount(password);
      // Drop the session before navigating: the token still parses, but the
      // account behind it is suspended, so every later call would 401.
      signOut();
      replace(ROUTES.home);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't delete your account.");
      setBusy(false);
    }
  }

  function confirm() {
    Alert.alert(
      "Delete your account?",
      "Your personal details are erased and the account is closed for good. This can't be undone.",
      [
        { text: "Keep my account", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: run },
      ],
    );
  }

  if (!confirming) {
    return (
      <View>
        <Text style={s.hint}>
          Erase your personal data and close your account. Published community content stays, under “Former member”.
        </Text>
        <View style={s.saveRow}>
          <Pressable accessibilityRole="button" onPress={() => setConfirming(true)} style={s.dangerBtnOutline}>
            <Text style={s.dangerBtnOutlineText}>Delete my account</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={s.dangerPanel}>
      <Text style={s.dangerTitle}>This can’t be undone.</Text>
      <Text style={s.dangerBody}>
        Your name, photo, bio, contact details, schooling, date of birth and settings are wiped, and the account is
        closed permanently.
      </Text>
      <Text style={s.dangerBody}>
        Listings and tributes you already had approved stay published under “Former member”, so the town’s memory keeps
        its shape. Anything still in draft or awaiting review is unpublished.
      </Text>
      <View style={{ height: 6 }} />
      <PasswordField
        label="Confirm with your password"
        value={password}
        onChange={(v) => { setPassword(v); setErr(null); }}
        autoComplete="current-password"
        placeholder="Your password"
      />
      {err ? <Text style={s.errNote}>{err}</Text> : null}
      <View style={s.saveRow}>
        <Pressable
          accessibilityRole="button"
          onPress={confirm}
          disabled={busy || password.length === 0}
          style={[s.dangerBtn, (busy || password.length === 0) && { opacity: 0.6 }]}
        >
          <Text style={s.dangerBtnText}>{busy ? "Deleting…" : "Delete my account"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => { setConfirming(false); setPassword(""); setErr(null); }} disabled={busy}>
          <Text style={s.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Account summary ─────────────────────────────────────────────────────────
function AccountCard({ member: m }: Readonly<{ member: Member }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={s.accountCard}>
      <View style={s.accountIntro}>
        <Thumb seed={m.slug} src={m.photoUrl} label={m.initials || initials(m.displayName)} style={s.accountAvatar} labelStyle={s.accountAvatarText} />
        <View style={s.accountIdentity}>
          <View style={s.accountNameRow}>
            <Text style={s.accountName} numberOfLines={2}>{m.displayName}</Text>
            {m.verified ? <VerifiedBadge /> : null}
          </View>
          <Text style={s.accountHandle}>@{m.slug}</Text>
          <View style={s.metaRow}>
            <View style={s.roleChip}><Text style={s.roleChipText}>{memberRoleLabel(m.role)}</Text></View>
            {m.creatorTypes && m.creatorTypes.length > 0 ? (
              <Text style={s.metaFaint}>{m.creatorTypes.length} creator {m.creatorTypes.length === 1 ? "type" : "types"}</Text>
            ) : null}
          </View>
          {m.verified && m.verifiedAs ? <View style={s.accountVerified}><VerifiedBadge label={`Verified · ${m.verifiedAs}`} /></View> : null}
        </View>
      </View>
      {m.joinedAt ? (
        <View style={s.metaLine}>
          <Text style={s.metaKey}>Joined</Text>
          <Text style={s.metaVal}>{fmtDate(m.joinedAt)}</Text>
        </View>
      ) : null}
      <View style={s.metaLine}>
        <Text style={s.metaKey}>Phone</Text>
        <Text style={s.metaVal}>{m.phoneVerified ? "Verified" : "Not verified"}</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={() => push(ROUTES.me)} style={s.profileLink}>
        <Text style={s.profileLinkText}>Edit name, photo, bio & links in your Profile</Text>
        <Text style={s.chevron}>›</Text>
      </Pressable>
    </View>
  );
}

// ── Theme control ───────────────────────────────────────────────────────────
const THEME_OPTIONS: readonly { value: ThemeSetting; label: string; glyph: string }[] = [
  { value: "system", label: "System", glyph: "◐" },
  { value: "light", label: "Light", glyph: "☀" },
  { value: "dark", label: "Dark", glyph: "☾" },
];

function ThemeControl() {
  const { C, theme, setting, setTheme } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View>
      <Text style={s.subLabel}>THEME</Text>
      <View style={s.segment}>
        {THEME_OPTIONS.map((o) => {
          const on = setting === o.value;
          return (
            <Pressable accessibilityRole="button" key={o.value} onPress={() => setTheme(o.value)} style={[s.segmentBtn, on && s.segmentBtnOn]}>
              <Text style={[s.segmentText, on && s.segmentTextOn]}>{o.glyph}  {o.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={s.hint}>
        {setting === "system"
          ? `Follows your device — currently ${theme === "dark" ? "dark" : "light"}.`
          : `Always ${setting}, on this device.`}
      </Text>
    </View>
  );
}

// ── Notification preferences (device-local placeholder, like the web) ─────────
const NOTIFY_KEY = "oguaa.notifications";
const NOTIFY_ITEMS: { id: string; label: string; description: string }[] = [
  { id: "safety", label: "Safety alerts", description: "High & critical directives buzz your phone." },
  { id: "remembrances", label: "Remembrances", description: "Anniversaries of memorials you follow." },
  { id: "community", label: "Community & follows", description: "New followers, classmates and neighbours." },
  { id: "product", label: "Product news", description: "Occasional tips and new features." },
];

function defaultPrefs(): Record<string, boolean> {
  return Object.fromEntries(NOTIFY_ITEMS.map((i) => [i.id, true]));
}

function readPrefsSync(): Record<string, boolean> {
  if (Platform.OS === "web") {
    try {
      const raw = (globalThis as { localStorage?: Storage }).localStorage?.getItem(NOTIFY_KEY);
      if (raw) return { ...defaultPrefs(), ...(JSON.parse(raw) as Record<string, boolean>) };
    } catch { /* fall through to defaults */ }
  }
  return defaultPrefs();
}

function writePrefs(prefs: Record<string, boolean>) {
  const raw = JSON.stringify(prefs);
  if (Platform.OS === "web") {
    (globalThis as { localStorage?: Storage }).localStorage?.setItem(NOTIFY_KEY, raw);
  } else {
    SecureStore.setItemAsync(NOTIFY_KEY, raw).catch(() => {});
  }
}

function NotificationPrefs() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [prefs, setPrefs] = useState<Record<string, boolean>>(() => readPrefsSync());

  // On native the store is async, so hydrate the persisted choice once at mount.
  useEffect(() => {
    if (Platform.OS === "web") return;
    let alive = true;
    SecureStore.getItemAsync(NOTIFY_KEY)
      .then((raw) => {
        if (!alive || !raw) return;
        try { setPrefs({ ...defaultPrefs(), ...(JSON.parse(raw) as Record<string, boolean>) }); } catch { /* keep defaults */ }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  function toggle(id: string, value: boolean) {
    setPrefs((cur) => {
      const next = { ...cur, [id]: value };
      writePrefs(next);
      return next;
    });
  }

  return (
    <View>
      <Text style={s.subLabel}>NOTIFICATIONS</Text>
      {NOTIFY_ITEMS.map((item, i) => (
        <View key={item.id} style={[s.toggleRow, i < NOTIFY_ITEMS.length - 1 && s.toggleRowBorder]}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={s.toggleLabel}>{item.label}</Text>
            <Text style={s.toggleDesc}>{item.description}</Text>
          </View>
          <Switch
            value={prefs[item.id] ?? true}
            onValueChange={(v) => toggle(item.id, v)}
            trackColor={{ true: C.green, false: C.sand }}
            thumbColor={C.cream}
          />
        </View>
      ))}
      <Text style={s.deviceNote}>Saved on this device for now. Account-wide delivery preferences are on the way.</Text>
    </View>
  );
}

// ── Change password ─────────────────────────────────────────────────────────
function PasswordField({ label, value, onChange, autoComplete, placeholder }: Readonly<{
  label: string; value: string; onChange: (v: string) => void;
  autoComplete: "current-password" | "new-password"; placeholder?: string;
}>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [show, setShow] = useState(false);
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <View style={s.inputWrap}>
        <TextInput
          value={value}
          onChangeText={onChange}
          secureTextEntry={!show}
          autoComplete={autoComplete}
          textContentType={autoComplete === "current-password" ? "password" : "newPassword"}
          autoCapitalize="none"
          placeholder={placeholder}
          placeholderTextColor={C.inkFaint}
          style={s.input}
        />
        <Pressable accessibilityRole="button" onPress={() => setShow((v) => !v)} hitSlop={8} accessibilityLabel={show ? "Hide password" : "Show password"}>
          <Text style={s.showText}>{show ? "Hide" : "Show"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ChangePassword() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<SaveState>("idle");
  const [err, setErr] = useState<string | null>(null);

  const canSubmit = current.length > 0 && next.length > 0 && confirm.length > 0 && state !== "saving";

  async function submit() {
    setErr(null);
    if (next.length < 8) { setState("error"); setErr("Your new password must be at least 8 characters."); return; }
    if (next !== confirm) { setState("error"); setErr("The new passwords don't match."); return; }
    if (next === current) { setState("error"); setErr("Choose a new password that's different from your current one."); return; }
    setState("saving");
    try {
      await api.changePassword(current, next);
      setCurrent(""); setNext(""); setConfirm("");
      setState("saved");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't change your password.");
      setState("error");
    }
  }

  return (
    <View>
      <PasswordField label="Current password" value={current} onChange={(v) => { setCurrent(v); setState("idle"); }} autoComplete="current-password" placeholder="Your current password" />
      <PasswordField label="New password" value={next} onChange={(v) => { setNext(v); setState("idle"); }} autoComplete="new-password" placeholder="At least 8 characters" />
      <PasswordField label="Confirm new password" value={confirm} onChange={(v) => { setConfirm(v); setState("idle"); }} autoComplete="new-password" placeholder="Re-enter it" />
      {err ? <Text style={s.errNote}>{err}</Text> : null}
      <View style={s.saveRow}>
        <Pressable accessibilityRole="button" onPress={submit} disabled={!canSubmit} style={[s.primaryBtnSm, !canSubmit && { opacity: 0.6 }]}>
          <Text style={s.primaryBtnSmText}>{state === "saving" ? "Saving…" : "Update password"}</Text>
        </Pressable>
        {state === "saved" ? <Text style={s.savedNote}>Password updated ✓</Text> : null}
      </View>
    </View>
  );
}

// ── Two-factor (MFA) ──────────────────────────────────────────────────────────
function MfaManage({ member, onMember }: Readonly<{ member: Member; onMember: (m: Member) => void }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  if (member.mfaEnabled) {
    return (
      <View>
        <View style={s.mfaStatusRow}>
          <Text style={s.mfaOnPill}>On</Text>
          <Text style={s.mfaStatusText}>Sign-ins need your authenticator app.</Text>
        </View>
        <MfaDisable onMember={onMember} />
      </View>
    );
  }
  return (
    <View style={{ gap: 10 }}>
      <Text style={s.mfaStatusText}>Protect your account with a second sign-in step — any authenticator app works.</Text>
      <MfaEnroll onMember={onMember} />
    </View>
  );
}

type Stage =
  | { step: "start" }
  | { step: "qr"; secret: string; otpauthUrl: string; qr: string }
  | { step: "recovery"; codes: string[] };

function MfaEnroll({ onMember }: Readonly<{ onMember: (m: Member) => void }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [stage, setStage] = useState<Stage>({ step: "start" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function begin() {
    setBusy(true); setErr(null);
    try {
      const res = await api.mfaSetup();
      setStage({ step: "qr", secret: res.secret, otpauthUrl: res.otpauthUrl, qr: res.qr });
      setCode("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't start setup.");
    } finally { setBusy(false); }
  }

  async function confirm() {
    setBusy(true); setErr(null);
    try {
      const res = await api.mfaConfirm(code.trim());
      // Keep the recovery codes on screen; refresh the member only once the user
      // acknowledges (finish), so mfaEnabled flips after they've saved the codes.
      setStage({ step: "recovery", codes: res.recoveryCodes });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That code didn't work.");
    } finally { setBusy(false); }
  }

  async function finish() {
    try { onMember(await api.me()); } catch { /* header will refresh on next load */ }
  }

  if (stage.step === "recovery") {
    return (
      <View style={{ gap: 12 }}>
        <View style={s.recoveryBanner}>
          <Text style={s.recoveryBannerText}>
            <Text style={{ ...S(700) }}>Save these recovery codes now.</Text> Each works once if you lose your phone — they won&apos;t be shown again.
          </Text>
        </View>
        <View style={s.codeGrid}>
          {stage.codes.map((c) => <Text key={c} style={s.recoveryCode}>{c}</Text>)}
        </View>
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Pressable accessibilityRole="button"
            onPress={() => { Share.share({ message: stage.codes.join("\n") }).catch(() => {}); }}
            style={s.secondaryBtn}
          >
            <Text style={s.secondaryBtnText}>Share / save codes</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={finish} style={s.primaryBtnSm}>
            <Text style={s.primaryBtnSmText}>Done ✓</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (stage.step === "qr") {
    return (
      <View style={{ gap: 12 }}>
        <Text style={s.mfaStatusText}>1. Scan this QR in your authenticator app (Google Authenticator, 1Password, Aegis…), or tap to add it.  2. Enter the 6-digit code it shows.</Text>
        <View style={{ flexDirection: "row", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
          <View style={s.qrTile}>
            <Image source={{ uri: stage.qr }} style={{ width: 128, height: 128 }} accessibilityLabel="Authenticator QR code" />
          </View>
          <View style={{ flex: 1, minWidth: 150, gap: 8 }}>
            <Text style={s.subLabel}>CAN&apos;T SCAN? USE THIS KEY</Text>
            <Text selectable style={s.secretText}>{stage.secret}</Text>
            <Pressable accessibilityRole="button" onPress={() => Linking.openURL(stage.otpauthUrl).catch(() => {})} style={s.linkBtn}>
              <Text style={s.linkBtnText}>Open in authenticator app ↗</Text>
            </Pressable>
          </View>
        </View>
        <Text style={s.fieldLabel}>Enter the 6-digit code</Text>
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="123456"
          placeholderTextColor={C.inkFaint}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          maxLength={6}
          style={s.codeInput}
        />
        {err ? <Text style={s.errNote}>{err}</Text> : null}
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          <Pressable accessibilityRole="button" onPress={confirm} disabled={busy || code.trim().length < 6} style={[s.primaryBtnSm, (busy || code.trim().length < 6) && { opacity: 0.6 }]}>
            <Text style={s.primaryBtnSmText}>{busy ? "Verifying…" : "Verify & turn on"}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => { setStage({ step: "start" }); setErr(null); }} hitSlop={6}>
            <Text style={s.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: 8 }}>
      {err ? <Text style={s.errNote}>{err}</Text> : null}
      <Pressable accessibilityRole="button" onPress={begin} disabled={busy} style={[s.primaryBtnSm, { alignSelf: "flex-start" }, busy && { opacity: 0.6 }]}>
        <Text style={s.primaryBtnSmText}>{busy ? "Starting…" : "Set up two-factor"}</Text>
      </Pressable>
    </View>
  );
}

function MfaDisable({ onMember }: Readonly<{ onMember: (m: Member) => void }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function confirm() {
    setBusy(true); setErr(null);
    try {
      await api.mfaDisable(code.trim());
      onMember(await api.me());
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That code didn't work.");
    } finally { setBusy(false); }
  }

  if (!open) {
    return (
      <Pressable accessibilityRole="button" onPress={() => { setOpen(true); setCode(""); setErr(null); setRecovery(false); }} style={s.disableLink}>
        <Text style={s.disableLinkText}>Turn off two-factor</Text>
      </Pressable>
    );
  }
  return (
    <View style={{ gap: 10, marginTop: 12 }}>
      <Text style={s.mfaStatusText}>Enter a current authenticator or recovery code to turn two-factor off.</Text>
      {recovery ? (
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="xxxx-xxxx-xxxx"
          placeholderTextColor={C.inkFaint}
          autoCapitalize="none"
          autoComplete="one-time-code"
          style={s.codeInput}
        />
      ) : (
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="123456"
          placeholderTextColor={C.inkFaint}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          maxLength={6}
          style={s.codeInput}
        />
      )}
      <Pressable accessibilityRole="button" onPress={() => { setRecovery((v) => !v); setCode(""); }} hitSlop={6}>
        <Text style={s.toggleModeText}>{recovery ? "Use an authenticator code instead" : "Use a recovery code instead"}</Text>
      </Pressable>
      {err ? <Text style={s.errNote}>{err}</Text> : null}
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <Pressable accessibilityRole="button" onPress={confirm} disabled={busy || code.trim() === ""} style={[s.dangerBtn, (busy || code.trim() === "") && { opacity: 0.6 }]}>
          <Text style={s.dangerBtnText}>{busy ? "Turning off…" : "Turn off two-factor"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setOpen(false)} hitSlop={6}>
          <Text style={s.cancelText}>Keep it on</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  gate: { flex: 1, backgroundColor: C.paper, padding: 28, justifyContent: "center", alignItems: "center" },
  gateTitle: { ...D(600), fontSize: 26, color: C.ink, textAlign: "center" },
  gateBody: { color: C.inkMuted, fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 10, maxWidth: 320 },
  primaryBtn: { backgroundColor: C.green, borderRadius: 999, paddingVertical: 13, paddingHorizontal: 24, marginTop: 18 },
  primaryBtnText: { color: ON_GREEN, ...S(700), fontSize: 15 },

  content: { padding: 14, paddingBottom: 48, gap: 12 },
  settingsHero: { backgroundColor: C.green900, borderRadius: 22, padding: 18, overflow: "hidden" },
  heroOrb: { position: "absolute", width: 168, height: 168, borderRadius: 84, right: -66, top: -82, backgroundColor: C.goldTint14, borderWidth: 1, borderColor: C.goldBorder35 },
  kicker: { color: C.gold, fontSize: 10, letterSpacing: 2.2, ...S(700) },
  pageTitle: { ...D(700), fontSize: 29, color: ON_GREEN, marginTop: 5 },
  pageLede: { color: C.onDarkText85, fontSize: 13, lineHeight: 19, marginTop: 5, maxWidth: 320 },
  heroStatusRow: { flexDirection: "row", alignItems: "center", marginTop: 17, borderWidth: 1, borderColor: C.onDarkText10, backgroundColor: C.onDarkText10, borderRadius: 13, paddingVertical: 10, paddingHorizontal: 6 },
  heroStatus: { flex: 1, alignItems: "center", minWidth: 0 },
  heroStatusKey: { color: C.onDarkText50, fontSize: 8, letterSpacing: 1.1, ...S(700) },
  heroStatusValue: { color: ON_GREEN, fontSize: 11, ...S(700), marginTop: 3, textAlign: "center" },
  heroStatusRule: { width: StyleSheet.hairlineWidth, height: 27, backgroundColor: C.onDarkText30 },

  section: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 17, padding: 15 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 11 },
  sectionIcon: { width: 34, height: 34, borderRadius: 11, borderWidth: 1, borderColor: C.goldBorder35, backgroundColor: C.goldTint14, alignItems: "center", justifyContent: "center" },
  sectionTitle: { ...D(600), fontSize: 18, color: C.ink },
  sectionDesc: { color: C.inkMuted, fontSize: 12, marginTop: 1 },
  sectionBody: { marginTop: 13 },

  subLabel: { color: C.inkFaint, fontSize: 11, letterSpacing: 1.5, ...S(700), marginBottom: 8 },
  hr: { height: StyleSheet.hairlineWidth, backgroundColor: C.sand, marginVertical: 18 },
  hint: { color: C.inkFaint, fontSize: 12, marginTop: 8, lineHeight: 17 },

  accountCard: { backgroundColor: C.paper, borderWidth: 1, borderColor: C.sand, borderRadius: 14, padding: 13 },
  accountIntro: { flexDirection: "row", alignItems: "center", gap: 12 },
  accountAvatar: { width: 62, height: 62, borderRadius: 19, borderWidth: 2, borderColor: C.goldBorder35 },
  accountAvatarText: { ...S(700), fontSize: 20 },
  accountIdentity: { flex: 1, minWidth: 0 },
  accountNameRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  accountName: { ...S(700), fontSize: 17, color: C.ink, flexShrink: 1 },
  accountHandle: { color: C.inkFaint, fontSize: 12, marginTop: 2 },
  accountVerified: { marginTop: 6 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 6, flexWrap: "wrap" },
  roleChip: { backgroundColor: withAlpha(C.green, 0.1), borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  roleChipText: { color: C.greenText, fontSize: 11, ...S(700) },
  metaFaint: { color: C.inkFaint, fontSize: 12 },
  metaLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10, gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.sand, paddingTop: 10 },
  metaKey: { color: C.inkFaint, fontSize: 11, letterSpacing: 1, ...S(700), textTransform: "uppercase" },
  metaVal: { color: C.ink, fontSize: 14, flexShrink: 1, textAlign: "right" },
  profileLink: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.sand, paddingTop: 12 },
  profileLinkText: { color: C.goldText, fontSize: 13, ...S(600), flex: 1 },
  chevron: { color: C.inkFaint, fontSize: 20, ...S(700) },

  segment: { flexDirection: "row", backgroundColor: C.paper, borderWidth: 1, borderColor: C.sand, borderRadius: 12, padding: 4, gap: 4 },
  segmentBtn: { flex: 1, borderRadius: 9, paddingVertical: 9, alignItems: "center" },
  segmentBtnOn: { backgroundColor: C.green },
  segmentText: { color: C.inkMuted, fontSize: 13, ...S(700) },
  segmentTextOn: { color: ON_GREEN },

  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 },
  toggleRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.sand },
  toggleLabel: { color: C.ink, fontSize: 14, ...S(600) },
  toggleDesc: { color: C.inkFaint, fontSize: 12, marginTop: 2, lineHeight: 16 },
  deviceNote: { color: C.inkFaint, fontSize: 12, lineHeight: 17, marginTop: 12, borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },

  fieldLabel: { color: C.ink, fontSize: 13, ...S(600), marginBottom: 6 },
  inputWrap: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 12, paddingHorizontal: 14 },
  input: { flex: 1, paddingVertical: 12, fontSize: 15, color: C.ink },
  showText: { color: C.goldText, fontSize: 13, ...S(700) },
  codeInput: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: C.ink, fontSize: 18, letterSpacing: 4 },

  saveRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4 },
  primaryBtnSm: { backgroundColor: C.green, borderRadius: 999, paddingVertical: 11, paddingHorizontal: 20 },
  primaryBtnSmText: { color: ON_GREEN, ...S(700), fontSize: 14 },
  secondaryBtn: { borderWidth: 1, borderColor: C.green, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 18 },
  secondaryBtnText: { color: C.greenText, ...S(700), fontSize: 13 },
  cancelText: { color: C.inkMuted, fontSize: 13, ...S(600) },
  savedNote: { color: C.tealText, fontSize: 13, ...S(600) },
  errNote: { color: C.clayText, fontSize: 13, marginBottom: 10, lineHeight: 18 },

  // Data rights / account closure. Destructive actions are clay-bordered rather
  // than clay-filled until the member has committed, so the section reads as
  // serious without shouting at everyone who opens Settings.
  // The opening button is outlined; the committed one reuses the solid
  // `dangerBtn` already defined below for the MFA-disable flow.
  dangerBtnOutline: { borderWidth: 1, borderColor: withAlpha(C.clay, 0.45), borderRadius: 999, paddingVertical: 10, paddingHorizontal: 18 },
  dangerBtnOutlineText: { color: C.clayText, ...S(700), fontSize: 13 },
  dangerPanel: { borderWidth: 1, borderColor: withAlpha(C.clay, 0.3), backgroundColor: withAlpha(C.clay, 0.05), borderRadius: 14, padding: 13, gap: 6 },
  dangerTitle: { color: C.clayText, ...S(700), fontSize: 14 },
  dangerBody: { color: C.inkMuted, fontSize: 13, lineHeight: 19 },
  policyRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  policyChip: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 },
  policyChipText: { color: C.greenText, fontSize: 13, ...S(600) },

  mfaStatusRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  mfaOnPill: { backgroundColor: withAlpha(C.green, 0.1), color: C.greenText, fontSize: 12, ...S(700), borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, overflow: "hidden" },
  mfaStatusText: { color: C.inkMuted, fontSize: 13, lineHeight: 19, flex: 1 },

  qrTile: { padding: 8, backgroundColor: ON_GREEN, borderRadius: 12, borderWidth: 1, borderColor: C.sand },
  secretText: { fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }), color: C.ink, fontSize: 13, borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  linkBtn: { paddingVertical: 4 },
  linkBtnText: { color: C.goldText, fontSize: 13, ...S(700) },

  recoveryBanner: { borderWidth: 1, borderColor: C.goldBorder35, backgroundColor: C.goldTint14, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  recoveryBannerText: { color: C.goldText, fontSize: 13, lineHeight: 19 },
  codeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  recoveryCode: { width: "47%", textAlign: "center", fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }), color: C.ink, fontSize: 13, borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 8, paddingVertical: 8 },
  toggleModeText: { color: C.inkMuted, fontSize: 12, ...S(600), textDecorationLine: "underline" },

  disableLink: { alignSelf: "flex-start" },
  disableLinkText: { color: C.clayText, fontSize: 14, ...S(700) },
  dangerBtn: { backgroundColor: C.clay, borderRadius: 999, paddingVertical: 11, paddingHorizontal: 20 },
  dangerBtnText: { color: C.cream, ...S(700), fontSize: 14 },
});
