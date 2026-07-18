import { useMemo } from "react";
import { ROUTES } from "@/lib/routes";
import { push } from "@/lib/router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { T as Text } from "@/components/typography";
import { D, S, SI, ON_GREEN, initials, withAlpha, type Palette } from "@/theme";
import { MapIcon, UserIcon, SparkleIcon, PenIcon, BellIcon, SearchIcon, SettingsIcon, InfoIcon, LogOutIcon, ArrowRightIcon } from "@/components/icons";
import { Mark } from "@/ui";
import { useAuth } from "@/lib/auth";
import { canUseStudio } from "@/lib/api";
import { useLang, LANGS } from "@/lib/i18n";
import { useTheme, type ThemeSetting } from "@/lib/theme-context";

// The More tab is the account & settings hub: profile banner, quick links,
// language, legal, and auth. Section navigation lives in the ☰ drawer.

type Row = { icon: React.ReactNode; label: string; href?: string; onPress?: () => void; danger?: boolean };

function MenuCard({ rows }: Readonly<{ rows: Row[] }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={s.card}>
      {rows.map((r, i) => (
        <View key={r.label}>
          {i > 0 && <View style={s.separator} />}
          <Pressable accessibilityRole="button"
            onPress={() => (r.onPress ? r.onPress() : r.href && push(r.href))}
            style={({ pressed }) => [s.row, pressed && { backgroundColor: C.sand + "55" }]}
          >
            <View style={[s.rowIconWrap, r.danger && { color: C.clayText }]}>{r.icon}</View>
            <Text style={[s.rowLabel, r.danger && { color: C.clayText }]}>{r.label}</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const THEME_OPTIONS: readonly { value: ThemeSetting; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function roleLabel(role: string): string {
  if (role === "curator") return "Curator";
  if (role === "steward") return "Steward";
  return "Member";
}

export default function More() {
  const { member, signOut } = useAuth();
  const { lang, setLang } = useLang();
  const { C, setting, setTheme } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.paper }} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      {/* Banner + avatar */}
      <View style={s.bannerWrap}>
        <View style={s.banner}>
          <View style={[s.bannerCircle, { width: 150, height: 150, right: -30, top: -50 }]} />
          <View style={[s.bannerCircle, { width: 90, height: 90, left: 30, bottom: -40 }]} />
        </View>
        <View style={s.avatar}>
          {member ? (
            <Text style={s.avatarInit}>{initials(member.displayName)}</Text>
          ) : (
            <Mark size={30} color={C.green900} />
          )}
        </View>
      </View>

      {member ? (
        <Pressable accessibilityRole="button" onPress={() => router.push(ROUTES.me)} style={s.nameRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.name} numberOfLines={1}>{member.displayName}</Text>
            <Text style={s.handle}>@{member.slug} · {roleLabel(member.role)}</Text>
          </View>
          <ArrowRightIcon size={20} color={C.inkFaint} strokeWidth={2.5} />
        </Pressable>
      ) : (
        <View>
          <Text style={s.name}>Welcome to Oguaa</Text>
          <Text style={s.welcomeSub}>Sign in to contribute, follow memorials, and rep your town.</Text>
          <View style={s.authBtnRow}>
            <Pressable accessibilityRole="button" onPress={() => router.push(ROUTES.signIn)} style={s.btnGold}>
              <Text style={s.btnGoldText}>Sign in</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.push(ROUTES.signIn)} style={s.btnOutline}>
              <Text style={s.btnOutlineText}>Create account</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Quick links */}
      <MenuCard
        rows={
          member
            ? [
                { icon: <MapIcon size={18} color={C.inkMuted} strokeWidth={2} />, label: "Explore the map", href: ROUTES.explore },
                { icon: <UserIcon size={18} color={C.inkMuted} strokeWidth={2} />, label: "My Profile", href: ROUTES.me },
                ...(canUseStudio(member) ? [{ icon: <SparkleIcon size={18} color={C.inkMuted} strokeWidth={2} />, label: "Creator studio", href: ROUTES.studio }] : []),
                { icon: <PenIcon size={18} color={C.inkMuted} strokeWidth={2} />, label: "Contribute", href: ROUTES.submit },
                { icon: <BellIcon size={18} color={C.inkMuted} strokeWidth={2} />, label: "Notifications", href: ROUTES.notifications },
                { icon: <SearchIcon size={18} color={C.inkMuted} strokeWidth={2} />, label: "Search", href: ROUTES.search },
                { icon: <SettingsIcon size={18} color={C.inkMuted} strokeWidth={2} />, label: "Settings — security & preferences", href: ROUTES.settings },
              ]
            : [
                { icon: <MapIcon size={18} color={C.inkMuted} strokeWidth={2} />, label: "Explore the map", href: ROUTES.explore },
                { icon: <SearchIcon size={18} color={C.inkMuted} strokeWidth={2} />, label: "Search people, places & memories", href: ROUTES.search },
              ]
        }
      />

      {/* Language */}
      <View style={[s.card, { marginTop: 14 }]}>
        <Text style={s.cardKicker}>LANGUAGE</Text>
        <View style={s.langRow}>
          {LANGS.map((l) => (
            <Pressable accessibilityRole="button" key={l.code} onPress={() => setLang(l.code)} style={[s.langChip, lang === l.code && s.langChipOn]}>
              <Text style={[s.langChipText, lang === l.code && s.langChipTextOn]}>{l.native}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Appearance — follows the OS by default, with a manual override */}
      <View style={[s.card, { marginTop: 14 }]}>
        <Text style={s.cardKicker}>APPEARANCE</Text>
        <View style={s.langRow}>
          {THEME_OPTIONS.map((o) => (
            <Pressable accessibilityRole="button" key={o.value} onPress={() => setTheme(o.value)} style={[s.langChip, setting === o.value && s.langChipOn]}>
              <Text style={[s.langChipText, setting === o.value && s.langChipTextOn]}>{o.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Legal */}
      <View style={{ marginTop: 14 }}>
        <MenuCard
          rows={[
            { icon: <InfoIcon size={18} color={C.inkMuted} strokeWidth={2} />, label: "Terms of Use", href: ROUTES.legalTerms },
            { icon: <InfoIcon size={18} color={C.inkMuted} strokeWidth={2} />, label: "Privacy Policy", href: ROUTES.legalPrivacy },
            { icon: <InfoIcon size={18} color={C.inkMuted} strokeWidth={2} />, label: "Acceptable Use", href: ROUTES.legalAcceptableUse },
            { icon: <InfoIcon size={18} color={C.inkMuted} strokeWidth={2} />, label: "Safeguarding Policy", href: ROUTES.legalSafeguarding },
          ]}
        />
      </View>

      {/* Auth */}
      <View style={{ marginTop: 14 }}>
        {member ? (
          <MenuCard rows={[{ icon: <LogOutIcon size={18} color={C.clayText} strokeWidth={2} />, label: "Sign out", danger: true, onPress: () => signOut() }]} />
        ) : (
          <MenuCard
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
  content: { padding: 20, paddingBottom: 48 },
  bannerWrap: { marginBottom: 0 },
  banner: {
    height: 110,
    borderRadius: 20,
    backgroundColor: C.green,
    overflow: "hidden",
  },
  bannerCircle: {
    position: "absolute",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: withAlpha(C.gold, 0.35),
    backgroundColor: withAlpha(C.gold, 0.1),
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: C.gold,
    borderWidth: 4,
    borderColor: C.paper,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -38,
    marginLeft: 20,
  },
  avatarInit: { ...S(700), fontSize: 26, color: C.green900 },
  nameRow: { flexDirection: "row", alignItems: "center", marginTop: 12, marginBottom: 18, gap: 12 },
  name: { ...D(700), fontSize: 26, color: C.ink, marginTop: 12 },
  handle: { color: C.inkFaint, fontSize: 14, marginTop: 3 },
  welcomeSub: { color: C.inkMuted, fontSize: 14, lineHeight: 20, marginTop: 6 },
  authBtnRow: { flexDirection: "row", gap: 10, marginTop: 16, marginBottom: 18 },
  btnGold: { backgroundColor: C.gold, borderRadius: 999, paddingVertical: 11, paddingHorizontal: 22 },
  btnGoldText: { color: C.green900, ...S(700), fontSize: 14 },
  btnOutline: { borderWidth: 1, borderColor: C.gold, borderRadius: 999, paddingVertical: 11, paddingHorizontal: 22 },
  btnOutlineText: { color: C.goldText, ...S(700), fontSize: 14 },
  card: {
    backgroundColor: C.cream,
    borderWidth: 1,
    borderColor: C.sand,
    borderRadius: 16,
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 15 },
  rowIconWrap: { width: 22, alignItems: "center", justifyContent: "center" },
  rowLabel: { fontSize: 15, ...S(600), color: C.ink },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: C.sand, marginLeft: 52 },
  cardKicker: { color: C.inkFaint, fontSize: 11, letterSpacing: 2, ...D(700), paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  langRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, paddingBottom: 16 },
  langChip: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  langChipOn: { borderColor: C.green, backgroundColor: C.green },
  langChipText: { color: C.inkMuted, fontSize: 13, ...S(600) },
  langChipTextOn: { color: ON_GREEN },
  foot: { ...SI(), color: C.goldText, textAlign: "center", marginTop: 28, fontSize: 16 },
  version: { color: C.inkMuted, fontSize: 12, textAlign: "center", marginTop: 10, ...S(600) },
  note: { color: C.inkFaint, fontSize: 12, textAlign: "center", marginTop: 4 },
});
