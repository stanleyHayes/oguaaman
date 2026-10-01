import { useMemo } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { T as Text } from "@/components/typography";
import { EnvelopeIcon, InfoIcon, ShieldIcon } from "@/components/icons";
import { EmergencyCallout } from "@/components/notices";
import { useTheme } from "@/lib/theme-context";
import { openInAppBrowser } from "@/lib/webbrowser";
import { push } from "@/lib/router";
import { ROUTES } from "@/lib/routes";
import { D, S, type Palette } from "@/theme";

// The contact channels the project already publishes (marketing site config).
const SUPPORT_EMAIL = "hello@oguaaman.com";
const SUPPORT_WEB = "https://oguaaman.com/contact";

/**
 * Contact & support (App Store 1.5, Play policy): reachable from Settings and
 * the More tab. Email is shown as text as well as a link, because mailto: may
 * not open on every device.
 */
export default function Contact() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={s.wrap}>
      <Text style={s.kicker}>HELP</Text>
      <Text style={s.title}>Contact &amp; support</Text>
      <Text style={s.body}>Questions, safety concerns, problems with your account or a payment, or content about you that you want removed — tell us and a person will reply.</Text>

      <Pressable accessibilityRole="link" accessibilityLabel={`Email ${SUPPORT_EMAIL}`} onPress={() => { Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {}); }} style={s.row}>
        <EnvelopeIcon size={20} color={C.greenText} strokeWidth={2} />
        <View style={{ flex: 1 }}>
          <Text style={s.rowLabel}>Email</Text>
          <Text style={s.rowValue} selectable>{SUPPORT_EMAIL}</Text>
        </View>
      </Pressable>

      <Pressable accessibilityRole="link" onPress={() => { void openInAppBrowser(SUPPORT_WEB); }} style={s.row}>
        <InfoIcon size={20} color={C.greenText} strokeWidth={2} />
        <View style={{ flex: 1 }}>
          <Text style={s.rowLabel}>Contact page</Text>
          <Text style={s.rowValue}>oguaaman.com/contact</Text>
        </View>
      </Pressable>

      <Pressable accessibilityRole="button" onPress={() => push(ROUTES.settings)} style={s.row}>
        <ShieldIcon size={20} color={C.greenText} strokeWidth={2} />
        <View style={{ flex: 1 }}>
          <Text style={s.rowLabel}>Your data and account</Text>
          <Text style={s.rowValue}>Export your data or delete your account in Settings › Your data.</Text>
        </View>
      </Pressable>

      <Text style={s.body}>To report a post or a member, use “Report this” on the post or profile — we review reports within 24 hours. You can block any member from their profile.</Text>
      <EmergencyCallout />
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  wrap: { padding: 20, gap: 14, paddingBottom: 48 },
  kicker: { color: C.goldText, fontSize: 11, letterSpacing: 2, ...S(700) },
  title: { color: C.ink, fontSize: 26, ...D(700) },
  body: { color: C.inkMuted, fontSize: 14, lineHeight: 21 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 14, padding: 14 },
  rowLabel: { color: C.inkFaint, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", ...S(700) },
  rowValue: { color: C.ink, fontSize: 15, marginTop: 2, ...S(600) },
});
