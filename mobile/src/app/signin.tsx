import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/lib/auth";
import { C, serif } from "@/theme";
import { Mark } from "@/ui";

const TRUST = [
  "No passwords — a one-time code by SMS or email",
  "Free to join, built for the people of Oguaa",
  "Your date of birth stays private — age check only",
];

export default function SignIn() {
  const { requestOtp, verify } = useAuth();
  const [step, setStep] = useState<"id" | "code">("id");
  const [identifier, setIdentifier] = useState("");
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    setBusy(true); setErr(null);
    try {
      const dc = await requestOtp(identifier.trim(), name.trim() || undefined, dob.trim() || undefined);
      setDevCode(dc); if (dc) setCode(dc); setStep("code");
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not send a code."); } finally { setBusy(false); }
  }
  async function confirm() {
    setBusy(true); setErr(null);
    try { await verify(identifier.trim(), code.trim()); router.back(); }
    catch { setErr("That code is invalid or has expired."); } finally { setBusy(false); }
  }

  return (
    <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Brand header */}
      <View style={s.hero}>
        <View style={s.heroMark}><Mark size={44} color={C.gold} /></View>
        <Text style={s.heroKicker}>Member sign in</Text>
        <Text style={s.heroTitle}>Welcome home to Oguaa.</Text>
        <Text style={s.heroSub}>
          Sign in with your phone or email. A one-time code verifies you — and creates your profile if you&apos;re new.
        </Text>
        <View style={{ marginTop: 16, gap: 8 }}>
          {TRUST.map((t) => (
            <View key={t} style={s.trustRow}>
              <View style={s.trustTick}><Text style={s.trustTickText}>✓</Text></View>
              <Text style={s.trustText}>{t}</Text>
            </View>
          ))}
        </View>
        <Text style={s.motto}>Yɛn ara asaase ni — this is our own land.</Text>
      </View>

      {/* Form card */}
      <View style={s.card}>
        <View style={s.steps}>
          <View style={[s.stepBar, { backgroundColor: C.goldBrand }]} />
          <View style={[s.stepBar, { backgroundColor: step === "code" ? C.goldBrand : C.sand }]} />
        </View>

        {step === "id" ? (
          <View style={{ gap: 14 }}>
            <Text style={s.cardTitle}>Join Oguaa</Text>
            <Text style={s.cardSub}>Step 1 of 2 — tell us where to send your code.</Text>
            <Text style={s.label}>Phone or email</Text>
            <TextInput value={identifier} onChangeText={setIdentifier} placeholder="+233… or you@email" placeholderTextColor={C.inkFaint} autoCapitalize="none" style={s.input} />
            <Text style={s.label}>Your name (new members)</Text>
            <TextInput value={name} onChangeText={setName} placeholder="Display name" placeholderTextColor={C.inkFaint} style={s.input} />
            <Text style={s.label}>Date of birth (new members)</Text>
            <TextInput value={dob} onChangeText={setDob} placeholder="YYYY-MM-DD" placeholderTextColor={C.inkFaint} autoCapitalize="none" style={s.input} />
            <Text style={s.hint}>Oguaa is for ages 18 and over.</Text>
            {err && <Text style={s.err}>{err}</Text>}
            <Pressable onPress={send} disabled={busy} style={s.btn}><Text style={s.btnText}>{busy ? "Sending…" : "Send my code →"}</Text></Pressable>
            <Text style={s.hint}>Seeded account: akua-pratt@oguaa.test</Text>
          </View>
        ) : (
          <View style={{ gap: 14 }}>
            <Text style={s.cardTitle}>Check your messages</Text>
            <Text style={s.cardSub}>Step 2 of 2 — we sent a 6-digit code to {identifier}.</Text>
            {devCode && <Text style={s.dev}>Dev mode — your code is {devCode}</Text>}
            <Text style={s.label}>Verification code</Text>
            <TextInput value={code} onChangeText={setCode} placeholder="000000" placeholderTextColor={C.inkFaint} keyboardType="number-pad" style={[s.input, { letterSpacing: 8, textAlign: "center", fontSize: 20 }]} />
            {err && <Text style={s.err}>{err}</Text>}
            <Pressable onPress={confirm} disabled={busy} style={s.btn}><Text style={s.btnText}>{busy ? "Verifying…" : "Verify & sign in"}</Text></Pressable>
            <Pressable onPress={() => setStep("id")}><Text style={s.back}>← Use a different number</Text></Pressable>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  hero: { backgroundColor: C.green, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 44, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  heroMark: { alignItems: "center", marginBottom: 14 },
  heroKicker: { color: C.gold, fontSize: 11, fontWeight: "700", letterSpacing: 2, textTransform: "uppercase", textAlign: "center" },
  heroTitle: { fontFamily: serif, color: C.cream, fontSize: 30, fontWeight: "600", textAlign: "center", marginTop: 8 },
  heroSub: { color: "#D9D2C2", fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 8 },
  trustRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  trustTick: { width: 20, height: 20, borderRadius: 10, backgroundColor: "rgba(199,162,74,0.2)", alignItems: "center", justifyContent: "center", marginTop: 1 },
  trustTickText: { color: C.gold, fontSize: 11, fontWeight: "700" },
  trustText: { color: "#E7E1D3", fontSize: 13, lineHeight: 19, flex: 1 },
  motto: { fontFamily: serif, color: C.gold, fontSize: 14, fontStyle: "italic", textAlign: "center", marginTop: 18 },
  card: { marginHorizontal: 16, marginTop: -24, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 16, padding: 20, gap: 14, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  steps: { flexDirection: "row", gap: 10, marginBottom: 4 },
  stepBar: { flex: 1, height: 6, borderRadius: 3 },
  cardTitle: { fontFamily: serif, fontSize: 24, fontWeight: "600", color: C.ink },
  cardSub: { color: C.inkMuted, fontSize: 13, lineHeight: 19, marginTop: -8 },
  label: { color: C.ink, fontSize: 13, fontWeight: "600", marginBottom: -8 },
  input: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, color: C.ink },
  btn: { backgroundColor: C.green, borderRadius: 999, paddingVertical: 15, alignItems: "center" },
  btnText: { color: C.cream, fontWeight: "700", fontSize: 15 },
  err: { color: C.clayText, fontSize: 14, backgroundColor: "rgba(176,80,60,0.06)", borderWidth: 1, borderColor: "rgba(176,80,60,0.3)", borderRadius: 10, padding: 10 },
  hint: { color: C.inkFaint, fontSize: 12, textAlign: "center" },
  dev: { backgroundColor: "#FBF1D9", borderColor: C.goldBrand, borderWidth: 1, borderRadius: 10, padding: 10, color: C.goldText, textAlign: "center" },
  back: { color: C.inkMuted, textAlign: "center", paddingVertical: 8 },
});
