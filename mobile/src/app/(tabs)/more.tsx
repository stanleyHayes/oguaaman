import { useMemo } from "react";
import { ROUTES } from "@/lib/routes";
import { push } from "@/lib/router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { T as Text } from "@/components/typography";
import { D, S, SI, ON_GREEN, initials, withAlpha, type Palette } from "@/theme";
import { MapIcon, UserIcon, SparkleIcon, PenIcon, BellIcon, SearchIcon, SettingsIcon, InfoIcon, LogOutIcon, ArrowRightIcon, BriefcaseIcon } from "@/components/icons";
import { Mark, Thumb, VerifiedBadge } from "@/ui";
import { useAuth } from "@/lib/auth";
import { canUseStudio } from "@/lib/api";
import { useLang, LANGS } from "@/lib/i18n";
import { useTheme, type ThemeSetting } from "@/lib/theme-context";
import { memberRoleLabel } from "@/lib/member-role";

// The More tab is the account & settings hub: profile banner, quick links,
// language, legal, and auth. Section navigation lives in the ☰ drawer.

type Row = { icon: React.ReactNode; label: string; href?: string; onPress?: () => void; danger?: boolean };

function MenuCard({ title, rows }: Readonly<{ title?: string; rows: Row[] }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={s.card}>
      {title ? <Text style={s.cardKicker}>{title}</Text> : null}
      {rows.map((r, i) => (
        <View key={r.label}>
          {(i > 0 || title) && <View style={s.separator} />}
          <Pressable accessibilityRole="button"
            onPress={() => (r.onPress ? r.onPress() : r.href && push(r.href))}
            style={({ pressed }) => [s.row, pressed && { backgroundColor: C.sand + "55" }]}
          >
            <View style={s.rowIconWrap}>{r.icon}</View>
            <Text style={[s.rowLabel, r.danger && { color: C.clayText }]}>{r.label}</Text>
            <ArrowRightIcon size={16} color={r.danger ? C.clayText : C.inkFaint} strokeWidth={2.3} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

function ActionGrid({ rows }: Readonly<{ rows: Row[] }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={s.actionGrid}>
      {rows.map((row) => (
        <Pressable
          accessibilityRole="button"
          key={row.label}
          onPress={() => (row.onPress ? row.onPress() : row.href && push(row.href))}
          style={({ pressed }) => [s.actionTile, pressed && { opacity: 0.72 }]}
        >
          <View style={s.actionIcon}>{row.icon}</View>
          <Text style={s.actionLabel}>{row.label}</Text>
          <ArrowRightIcon size={15} color={C.inkFaint} strokeWidth={2.2} />
        </Pressable>
      ))}
    </View>
  );
}

const THEME_OPTIONS: readonly { value: ThemeSetting; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export default function More() {
  const { member, signOut } = useAuth();
  const { lang, setLang } = useLang();
  const { C, setting, setTheme } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);

  const primaryActions: Row[] = member
    ? [
        { icon: <UserIcon size={19} color={C.goldText} strokeWidth={2} />, label: "My profile", href: ROUTES.me },
        ...(canUseStudio(member) ? [{ icon: <SparkleIcon size={19} color={C.goldText} strokeWidth={2} />, label: "Creator studio", href: ROUTES.studio }] : []),
        { icon: <PenIcon size={19} color={C.goldText} strokeWidth={2} />, label: "Contribute", href: ROUTES.submit },
        { icon: <BellIcon size={19} color={C.goldText} strokeWidth={2} />, label: "Notifications", href: ROUTES.notifications },
        { icon: <BriefcaseIcon size={19} color={C.goldText} strokeWidth={2} />, label: "Outside requests", href: ROUTES.outsideJobs },
      ]
    : [
        { icon: <MapIcon size={19} color={C.goldText} strokeWidth={2} />, label: "Explore map", href: ROUTES.explore },
        { icon: <SearchIcon size={19} color={C.goldText} strokeWidth={2} />, label: "Search Oguaa", href: ROUTES.search },
        { icon: <BriefcaseIcon size={19} color={C.goldText} strokeWidth={2} />, label: "Oguaa Outside", href: ROUTES.outside },
      ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.paper }} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      {/* A compact account dossier: identity and the next useful action share one surface. */}
      {member ? (
        <Pressable accessibilityRole="button" onPress={() => push(ROUTES.me)} style={s.identityCard}>
          <View style={[s.bannerCircle, { width: 138, height: 138, right: -48, top: -62 }]} />
          <View style={[s.bannerCircle, { width: 72, height: 72, right: 52, bottom: -47 }]} />
          <View style={s.avatar}>
            {member.photoUrl ? (
              <Thumb seed={member.slug} src={member.photoUrl} label={member.initials || initials(member.displayName)} style={s.avatarMedia} labelStyle={s.avatarInit} />
            ) : (
              <Text style={s.avatarInit}>{member.initials || initials(member.displayName)}</Text>
            )}
          </View>
          <View style={s.identityCopy}>
            <View style={s.identityNameRow}>
              <Text style={s.name} numberOfLines={1}>{member.displayName}</Text>
              {member.verified ? <VerifiedBadge onDark size={16} /> : null}
            </View>
            <Text style={s.handle}>@{member.slug}</Text>
            <View style={s.rolePill}><Text style={s.rolePillText}>{memberRoleLabel(member.role)}</Text></View>
          </View>
          <View style={s.identityArrow}><ArrowRightIcon size={18} color={ON_GREEN} strokeWidth={2.4} /></View>
        </Pressable>
      ) : (
        <View style={s.guestCard}>
          <View style={[s.bannerCircle, { width: 138, height: 138, right: -48, top: -62 }]} />
          <View style={s.guestMark}><Mark size={35} color={C.gold} /></View>
          <Text style={s.guestKicker}>YOUR PLACE IN OGUAA</Text>
          <Text style={s.guestTitle}>A place in the town</Text>
          <Text style={s.guestLede}>Sign in to contribute, follow memorials, and carry your connections with you.</Text>
          <View style={s.authBtnRow}>
            <Pressable accessibilityRole="button" onPress={() => push(ROUTES.signIn)} style={s.btnGold}>
              <Text style={s.btnGoldText}>Sign in</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => push(ROUTES.signIn)} style={s.btnOutline}>
              <Text style={s.btnOutlineText}>Create account</Text>
            </Pressable>
          </View>
        </View>
      )}

      <Text style={s.sectionLabel}>{member ? "QUICK START" : "DISCOVER"}</Text>
      <ActionGrid rows={primaryActions} />

      {member ? (
        <MenuCard
          title="EXPLORE & MANAGE"
          rows={[
            { icon: <MapIcon size={18} color={C.inkMuted} strokeWidth={2} />, label: "Explore the map", href: ROUTES.explore },
            { icon: <SearchIcon size={18} color={C.inkMuted} strokeWidth={2} />, label: "Search", href: ROUTES.search },
            { icon: <BriefcaseIcon size={18} color={C.inkMuted} strokeWidth={2} />, label: "Find an Outside agent", href: ROUTES.outside },
            { icon: <SettingsIcon size={18} color={C.inkMuted} strokeWidth={2} />, label: "Security & settings", href: ROUTES.settings },
          ]}
        />
      ) : null}

      <View style={s.preferenceCard}>
        <View style={s.preferenceHead}>
          <View>
            <Text style={s.cardKickerStandalone}>PREFERENCES</Text>
            <Text style={s.preferenceTitle}>Make Oguaa yours</Text>
          </View>
          <SettingsIcon size={19} color={C.goldText} strokeWidth={2} />
        </View>
        <Text style={s.optionLabel}>LANGUAGE</Text>
        <View style={s.langRow}>
          {LANGS.map((l) => (
            <Pressable accessibilityRole="button" key={l.code} onPress={() => setLang(l.code)} style={[s.langChip, lang === l.code && s.langChipOn]}>
              <Text style={[s.langChipText, lang === l.code && s.langChipTextOn]}>{l.native}</Text>
            </Pressable>
          ))}
        </View>
        <View style={s.preferenceRule} />
        <Text style={s.optionLabel}>APPEARANCE</Text>
        <View style={s.langRow}>
          {THEME_OPTIONS.map((o) => (
            <Pressable accessibilityRole="button" key={o.value} onPress={() => setTheme(o.value)} style={[s.langChip, setting === o.value && s.langChipOn]}>
              <Text style={[s.langChipText, setting === o.value && s.langChipTextOn]}>{o.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Legal */}
      <View>
        <MenuCard
          title="ABOUT & SAFETY"
          rows={[
            { icon: <InfoIcon size={18} color={C.inkMuted} strokeWidth={2} />, label: "Terms of Use", href: ROUTES.legalTerms },
            { icon: <InfoIcon size={18} color={C.inkMuted} strokeWidth={2} />, label: "Privacy Policy", href: ROUTES.legalPrivacy },
            { icon: <InfoIcon size={18} color={C.inkMuted} strokeWidth={2} />, label: "Acceptable Use", href: ROUTES.legalAcceptableUse },
            { icon: <InfoIcon size={18} color={C.inkMuted} strokeWidth={2} />, label: "Safeguarding Policy", href: ROUTES.legalSafeguarding },
          ]}
        />
      </View>

      {/* Auth */}
      <View>
        {member ? (
          <MenuCard title="SESSION" rows={[{ icon: <LogOutIcon size={18} color={C.clayText} strokeWidth={2} />, label: "Sign out", danger: true, onPress: () => signOut() }]} />
        ) : (
          <MenuCard
            title="JOIN THE COMMUNITY"
            rows={[
              { icon: <ArrowRightIcon size={18} color={C.inkMuted} strokeWidth={2} />, label: "Sign In", href: ROUTES.signIn },
              { icon: <PenIcon size={18} color={C.inkMuted} strokeWidth={2} />, label: "Create Account", href: ROUTES.signIn },
            ]}
          />
        )}
      </View>

      <Text style={s.foot}>Yɛn ara asaase ni — this is our own land.</Text>
      <Text style={s.version}>Oguaa v1.0 · an independent community initiative</Text>
      <Text style={s.note}>Made by us, for us. For ages 18+.</Text>
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  content: { padding: 16, paddingBottom: 48, gap: 14 },
  bannerCircle: {
    position: "absolute",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: withAlpha(C.gold, 0.35),
    backgroundColor: withAlpha(C.gold, 0.1),
  },
  identityCard: { minHeight: 116, flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: C.green900, borderRadius: 22, padding: 18, overflow: "hidden" },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: C.greenSlate,
    borderWidth: 2,
    borderColor: C.gold,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarMedia: { width: 64, height: 64, borderRadius: 20 },
  avatarInit: { ...S(700), fontSize: 23, color: ON_GREEN },
  identityCopy: { flex: 1, minWidth: 0 },
  identityNameRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  name: { ...D(700), fontSize: 21, color: ON_GREEN, flexShrink: 1 },
  handle: { color: C.onDarkText60, fontSize: 13, marginTop: 2 },
  rolePill: { alignSelf: "flex-start", marginTop: 8, borderWidth: 1, borderColor: C.goldBorder35, backgroundColor: C.goldTint14, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  rolePillText: { color: C.gold, ...S(700), fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase" },
  identityArrow: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: C.onDarkText30, backgroundColor: C.onDarkText10, alignItems: "center", justifyContent: "center" },
  guestCard: { backgroundColor: C.green900, borderRadius: 22, padding: 20, overflow: "hidden" },
  guestMark: { width: 54, height: 54, borderRadius: 18, borderWidth: 1, borderColor: C.goldBorder35, backgroundColor: C.goldTint14, alignItems: "center", justifyContent: "center", marginBottom: 18 },
  guestKicker: { color: C.gold, fontSize: 10, letterSpacing: 2, ...S(700) },
  guestTitle: { color: ON_GREEN, fontSize: 25, ...D(700), marginTop: 5 },
  guestLede: { color: C.onDarkText85, fontSize: 13, lineHeight: 19, marginTop: 6, maxWidth: 320 },
  authBtnRow: { flexDirection: "row", gap: 10, marginTop: 17 },
  btnGold: { backgroundColor: C.gold, borderRadius: 999, paddingVertical: 11, paddingHorizontal: 22 },
  btnGoldText: { color: C.green900, ...S(700), fontSize: 14 },
  btnOutline: { borderWidth: 1, borderColor: C.gold, borderRadius: 999, paddingVertical: 11, paddingHorizontal: 22 },
  btnOutlineText: { color: C.gold, ...S(700), fontSize: 14 },
  sectionLabel: { color: C.inkFaint, fontSize: 10, letterSpacing: 1.8, ...S(700), marginTop: 2, marginLeft: 2 },
  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  actionTile: { width: "48%", flexGrow: 1, minHeight: 78, flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 15, padding: 12 },
  actionIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: C.goldTint14, borderWidth: 1, borderColor: C.goldBorder35, alignItems: "center", justifyContent: "center" },
  actionLabel: { color: C.ink, fontSize: 13, ...S(700), flex: 1 },
  card: {
    backgroundColor: C.cream,
    borderWidth: 1,
    borderColor: C.sand,
    borderRadius: 17,
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 15, paddingVertical: 13 },
  rowIconWrap: { width: 25, height: 25, borderRadius: 8, backgroundColor: C.paper, alignItems: "center", justifyContent: "center" },
  rowLabel: { fontSize: 14, ...S(600), color: C.ink, flex: 1 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: C.sand, marginLeft: 52 },
  cardKicker: { color: C.inkFaint, fontSize: 10, letterSpacing: 1.7, ...S(700), paddingHorizontal: 15, paddingTop: 13, paddingBottom: 10 },
  preferenceCard: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 17, padding: 15 },
  preferenceHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 15 },
  cardKickerStandalone: { color: C.goldText, fontSize: 10, letterSpacing: 1.7, ...S(700) },
  preferenceTitle: { color: C.ink, fontSize: 18, ...D(700), marginTop: 2 },
  optionLabel: { color: C.inkFaint, fontSize: 10, letterSpacing: 1.5, ...S(700), marginBottom: 8 },
  preferenceRule: { height: StyleSheet.hairlineWidth, backgroundColor: C.sand, marginVertical: 14 },
  langRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  langChip: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  langChipOn: { borderColor: C.green, backgroundColor: C.green },
  langChipText: { color: C.inkMuted, fontSize: 13, ...S(600) },
  langChipTextOn: { color: ON_GREEN },
  foot: { ...SI(), color: C.goldText, textAlign: "center", marginTop: 10, fontSize: 15 },
  version: { color: C.inkMuted, fontSize: 11, textAlign: "center", marginTop: -4, ...S(600) },
  note: { color: C.inkFaint, fontSize: 11, textAlign: "center", marginTop: -8 },
});
