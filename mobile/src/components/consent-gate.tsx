import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { T as Text } from "@/components/typography";
import { CheckIcon } from "@/components/icons";
import { api, clientPlatform, PORTAL_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme-context";
import { openInAppBrowser } from "@/lib/webbrowser";
import { D, ON_GREEN, S, type Palette } from "@/theme";

/**
 * Blocking consent dialog (K2, decision D8). Shown whenever the signed-in
 * member's `consentRequired` is true — accounts created before the Terms
 * checkbox, invited accounts, and everyone after a Terms update. The member
 * agrees (and confirms 18+ when the account's age was never checked), or signs
 * out. The documents open in the browser because this dialog covers the app.
 */
export function ConsentGate() {
  const { member, setMember, signOut } = useAuth();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [agree, setAgree] = useState(false);
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const visible = member?.consentRequired === true;
  if (!visible) return null;
  const needsAdult = member.adultVerified !== true;
  const ready = agree && (!needsAdult || adult);

  async function accept() {
    if (!ready) { setErr(needsAdult ? "Tick both boxes to continue." : "Tick the box to continue."); return; }
    setBusy(true);
    setErr("");
    try {
      const next = await api.acceptConsent({ acceptTerms: true, platform: clientPlatform(), ...(needsAdult ? { confirmAdult: true } : {}) });
      setMember(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That didn't work. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const open = (path: string) => { void openInAppBrowser(`${PORTAL_URL}${path}`); };

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={() => {}}>
      <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={s.wrap}>
        <Text style={s.kicker}>BEFORE YOU CONTINUE</Text>
        <Text style={s.title}>Our Terms and Privacy Policy</Text>
        <Text style={s.body}>
          To keep using Oguaa, please read and agree to the Terms of Use and Privacy Policy. Oguaa has zero tolerance for
          objectionable content and abusive users: you can report any post or member, and block anyone, and we act on
          reports within 24 hours.
        </Text>
        <View style={s.links}>
          <Pressable accessibilityRole="link" onPress={() => open("/terms")}><Text style={s.link}>Read the Terms of Use ↗</Text></Pressable>
          <Pressable accessibilityRole="link" onPress={() => open("/privacy")}><Text style={s.link}>Read the Privacy Policy ↗</Text></Pressable>
          <Pressable accessibilityRole="link" onPress={() => open("/acceptable-use")}><Text style={s.link}>Read the Acceptable Use rules ↗</Text></Pressable>
        </View>
        <CheckRow checked={agree} onToggle={() => { setAgree(!agree); setErr(""); }} label="I agree to the Terms of Use and Privacy Policy." s={s} />
        {needsAdult ? <CheckRow checked={adult} onToggle={() => { setAdult(!adult); setErr(""); }} label="I am 18 or older." s={s} /> : null}
        {err ? <Text style={s.err}>{err}</Text> : null}
        <Pressable accessibilityRole="button" onPress={accept} disabled={busy} style={[s.btn, (!ready || busy) && { opacity: 0.6 }]}>
          <Text style={s.btnText}>{busy ? "Saving…" : "Agree and continue"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={signOut} style={s.secondary}>
          <Text style={s.secondaryText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </Modal>
  );
}

function CheckRow({ checked, onToggle, label, s }: Readonly<{ checked: boolean; onToggle: () => void; label: string; s: ReturnType<typeof makeStyles> }>) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onToggle} style={s.checkRow}>
      <View style={[s.box, checked && s.boxOn]}>{checked ? <CheckIcon size={14} color={ON_GREEN} strokeWidth={3} /> : null}</View>
      <Text style={s.checkLabel}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  wrap: { padding: 24, paddingTop: 72, gap: 16 },
  kicker: { color: C.goldText, fontSize: 11, letterSpacing: 2, ...S(700) },
  title: { color: C.ink, fontSize: 26, lineHeight: 32, ...D(700) },
  body: { color: C.inkMuted, fontSize: 15, lineHeight: 22 },
  links: { gap: 10 },
  link: { color: C.greenText, fontSize: 15, textDecorationLine: "underline", ...S(600) },
  checkRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 4 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: C.inkFaint, alignItems: "center", justifyContent: "center" },
  boxOn: { backgroundColor: C.green, borderColor: C.green },
  checkLabel: { flex: 1, color: C.ink, fontSize: 15, lineHeight: 22 },
  err: { color: C.clayText, fontSize: 14 },
  btn: { backgroundColor: C.green, borderRadius: 999, paddingVertical: 14, alignItems: "center" },
  btnText: { color: ON_GREEN, fontSize: 15, ...S(700) },
  secondary: { alignItems: "center", paddingVertical: 10 },
  secondaryText: { color: C.inkMuted, fontSize: 14, ...S(600) },
});
