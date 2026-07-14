import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/lib/auth";
import { C, serif } from "@/theme";
import { Mark } from "@/ui";

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
    <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ padding: 24 }}>
      <View style={{ alignItems: "center", marginVertical: 14 }}><Mark size={40} color={C.goldBrand} /></View>
      <Text style={s.title}>Join Oguaa</Text>
      <Text style={s.sub}>Sign in with your phone or email. A one-time code verifies you — and creates your profile if you&apos;re new.</Text>

      {step === "id" ? (
        <View style={{ gap: 12, marginTop: 18 }}>
          <TextInput value={identifier} onChangeText={setIdentifier} placeholder="Phone or email" placeholderTextColor={C.inkFaint} autoCapitalize="none" style={s.input} />
          <TextInput value={name} onChangeText={setName} placeholder="Your name (new members)" placeholderTextColor={C.inkFaint} style={s.input} />
          <TextInput value={dob} onChangeText={setDob} placeholder="Date of birth — YYYY-MM-DD (new members)" placeholderTextColor={C.inkFaint} autoCapitalize="none" style={s.input} />
          <Text style={s.hint}>Oguaa is for ages 18+. Your date of birth stays private — it only confirms you can join.</Text>
          {err && <Text style={s.err}>{err}</Text>}
          <Pressable onPress={send} disabled={busy} style={s.btn}><Text style={s.btnText}>{busy ? "Sending…" : "Send my code"}</Text></Pressable>
          <Text style={s.hint}>Seeded account: akua-pratt@oguaa.test</Text>
        </View>
      ) : (
        <View style={{ gap: 12, marginTop: 18 }}>
          {devCode && <Text style={s.dev}>Dev mode — your code is {devCode}</Text>}
          <TextInput value={code} onChangeText={setCode} placeholder="000000" placeholderTextColor={C.inkFaint} keyboardType="number-pad" style={[s.input, { letterSpacing: 6, textAlign: "center" }]} />
          {err && <Text style={s.err}>{err}</Text>}
          <Pressable onPress={confirm} disabled={busy} style={s.btn}><Text style={s.btnText}>{busy ? "Verifying…" : "Verify & sign in"}</Text></Pressable>
          <Pressable onPress={() => setStep("id")}><Text style={s.back}>← Use a different number</Text></Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  title: { fontFamily: serif, fontSize: 30, fontWeight: "600", color: C.ink, textAlign: "center" },
  sub: { color: C.inkMuted, fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 8 },
  input: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.cream, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: C.ink },
  btn: { backgroundColor: C.green, borderRadius: 999, paddingVertical: 14, alignItems: "center" },
  btnText: { color: C.cream, fontWeight: "700", fontSize: 15 },
  err: { color: C.clayText, fontSize: 14 },
  hint: { color: C.inkFaint, fontSize: 12, textAlign: "center" },
  dev: { backgroundColor: "#FBF1D9", borderColor: C.goldBrand, borderWidth: 1, borderRadius: 10, padding: 10, color: C.goldText, textAlign: "center" },
  back: { color: C.inkMuted, textAlign: "center", paddingVertical: 8 },
});
