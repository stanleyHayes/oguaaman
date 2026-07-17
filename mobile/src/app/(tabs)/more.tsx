import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { T as Text } from "@/components/typography";
import { D, S, SI, initials, withAlpha, type Palette } from "@/theme";
import { Mark } from "@/ui";
import { useAuth } from "@/lib/auth";
import { useLang, LANGS } from "@/lib/i18n";
import { useTheme, type ThemeSetting } from "@/lib/theme-context";

// The More tab is the account & settings hub: profile banner, quick links,
// language, legal, and auth. Section navigation lives in the ☰ drawer.

type Row = { icon: string; label: string; href?: string; onPress?: () => void; danger?: boolean };

function MenuCard({ rows }: Readonly<{ rows: Row[] }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={s.card}>
      {rows.map((r, i) => (
        <View key={r.label}>
          {i > 0 && <View style={s.separator} />}
          <Pressable
            onPress={() => (r.onPress ? r.onPress() : r.href && router.push(r.href as never))}
            style={({ pressed }) => [s.row, pressed && { backgroundColor: C.sand + "55" }]}
          >
            <Text style={[s.rowIcon, r.danger && { color: C.clayText }]}>{r.icon}</Text>
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
        <Pressable onPress={() => router.push("/me")} style={s.nameRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.name} numberOfLines={1}>{member.displayName}</Text>
            <Text style={s.handle}>@{member.slug} · {roleLabel(member.role)}</Text>
          </View>
          <Text style={s.goArrow}>→</Text>
        </Pressable>
      ) : (
        <View>
          <Text style={s.name}>Welcome to Oguaa</Text>
          <Text style={s.welcomeSub}>Sign in to contribute, follow memorials, and rep your town.</Text>
          <View style={s.authBtnRow}>
            <Pressable onPress={() => router.push("/signin")} style={s.btnGold}>
              <Text style={s.btnGoldText}>Sign in</Text>
            </Pressable>
            <Pressable onPress={() => router.push("/signin")} style={s.btnOutline}>
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
                { icon: "🗺", label: "Explore the map", href: "/explore" },
                { icon: "☺", label: "My Profile", href: "/me" },
                { icon: "✎", label: "Contribute", href: "/submit" },
                { icon: "🔔", label: "Notifications", href: "/notifications" },
                { icon: "🔍", label: "Search", href: "/search" },
                { icon: "⚙", label: "Settings — security & preferences", href: "/settings" },
              ]
            : [
                { icon: "🗺", label: "Explore the map", href: "/explore" },
                { icon: "🔍", label: "Search people, places & memories", href: "/search" },
              ]
        }
      />

      {/* Language */}
      <View style={[s.card, { marginTop: 14 }]}>
        <Text style={s.cardKicker}>LANGUAGE</Text>
        <View style={s.langRow}>
          {LANGS.map((l) => (
            <Pressable key={l.code} onPress={() => setLang(l.code)} style={[s.langChip, lang === l.code && s.langChipOn]}>
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
            <Pressable key={o.value} onPress={() => setTheme(o.value)} style={[s.langChip, setting === o.value && s.langChipOn]}>
              <Text style={[s.langChipText, setting === o.value && s.langChipTextOn]}>{o.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Legal */}
      <View style={{ marginTop: 14 }}>
        <MenuCard
          rows={[
            { icon: "ℹ", label: "Terms of Use", href: "/legal/terms" },
            { icon: "ℹ", label: "Privacy Policy", href: "/legal/privacy" },
            { icon: "ℹ", label: "Acceptable Use", href: "/legal/acceptable-use" },
            { icon: "ℹ", label: "Safeguarding Policy", href: "/legal/safeguarding" },
          ]}
        />
      </View>

      {/* Auth */}
      <View style={{ marginTop: 14 }}>
        {member ? (
          <MenuCard rows={[{ icon: "✕", label: "Sign out", danger: true, onPress: () => signOut() }]} />
        ) : (
          <MenuCard
            rows={[
              { icon: "→", label: "Sign In", href: "/signin" },
              { icon: "✎", label: "Create Account", href: "/signin" },
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
  goArrow: { color: C.inkFaint, fontSize: 22, fontWeight: "700" },
  welcomeSub: { color: C.inkMuted, fontSize: 14, lineHeight: 20, marginTop: 6 },
  authBtnRow: { flexDirection: "row", gap: 10, marginTop: 16, marginBottom: 18 },
  btnGold: { backgroundColor: C.gold, borderRadius: 999, paddingVertical: 11, paddingHorizontal: 22 },
  btnGoldText: { color: C.green900, fontWeight: "700", fontSize: 14 },
  btnOutline: { borderWidth: 1, borderColor: C.gold, borderRadius: 999, paddingVertical: 11, paddingHorizontal: 22 },
  btnOutlineText: { color: C.goldText, fontWeight: "700", fontSize: 14 },
  card: {
    backgroundColor: C.cream,
    borderWidth: 1,
    borderColor: C.sand,
    borderRadius: 16,
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 15 },
  rowIcon: { width: 22, fontSize: 16, color: C.inkMuted, textAlign: "center" },
  rowLabel: { fontSize: 15, fontWeight: "600", color: C.ink },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: C.sand, marginLeft: 52 },
  cardKicker: { color: C.inkFaint, fontSize: 11, letterSpacing: 2, fontWeight: "700", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  langRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, paddingBottom: 16 },
  langChip: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  langChipOn: { borderColor: C.green, backgroundColor: C.green },
  langChipText: { color: C.inkMuted, fontSize: 13, fontWeight: "600" },
  langChipTextOn: { color: C.cream },
  foot: { ...SI(), color: C.goldText, textAlign: "center", marginTop: 28, fontSize: 16 },
  version: { color: C.inkMuted, fontSize: 12, textAlign: "center", marginTop: 10, fontWeight: "600" },
  note: { color: C.inkFaint, fontSize: 12, textAlign: "center", marginTop: 4 },
});
