import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { T as Text, TI as TextInput } from "@/components/typography";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme-context";
import { D, ON_GREEN, S, type Palette } from "@/theme";

/**
 * Forgot password — and how an invited account (created by an institution
 * manager) sets its first password (K3): request a code to the account's email
 * or phone, then set a new password with it. Every other session is signed out.
 */
export default function ResetPassword() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [step, setStep] = useState<"start" | "confirm" | "done">("start");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [devCode, setDevCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function start() {
    const id = identifier.trim();
    if (!id) { setErr("Enter the phone number or email on your account."); return; }
    setBusy(true); setErr("");
    try {
      const r = await api.resetPasswordStart(id);
      setDevCode(__DEV__ ? r.devCode ?? "" : "");
      setStep("confirm");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "We couldn't send a code right now. Try again later.");
    } finally { setBusy(false); }
  }

  async function confirm() {
    if (!code.trim()) { setErr("Enter the code we sent you."); return; }
    if (password.length < 8) { setErr("Your new password must be at least 8 characters."); return; }
    setBusy(true); setErr("");
    try {
      await api.resetPasswordConfirm(identifier.trim(), code.trim(), password);
      setStep("done");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That code is incorrect or has expired.");
    } finally { setBusy(false); }
  }

  return (
    <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
      <Text style={s.title}>Set a new password</Text>
      {step === "start" ? (
        <>
          <Text style={s.body}>Forgot your password, or were you added by an institution and have never signed in? We&apos;ll send a code to the email or phone on the account.</Text>
          <Text style={s.label}>Phone or email</Text>
          <TextInput value={identifier} onChangeText={(v) => { setIdentifier(v); setErr(""); }} placeholder="+233… or you@email" placeholderTextColor={C.inkFaint} autoCapitalize="none" autoComplete="username" style={s.input} />
          {err ? <Text style={s.err}>{err}</Text> : null}
          <Pressable accessibilityRole="button" onPress={start} disabled={busy} style={[s.btn, busy && { opacity: 0.6 }]}>
            <Text style={s.btnText}>{busy ? "Sending…" : "Send me a code"}</Text>
          </Pressable>
        </>
      ) : null}
      {step === "confirm" ? (
        <>
          <Text style={s.body}>If an account matches {identifier.trim()}, a code is on its way. Enter it with your new password.</Text>
          {devCode ? <Text style={s.hint}>Dev mode code: {devCode}</Text> : null}
          <Text style={s.label}>Code</Text>
          <TextInput value={code} onChangeText={(v) => { setCode(v); setErr(""); }} placeholder="123456" placeholderTextColor={C.inkFaint} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" style={s.input} />
          <Text style={s.label}>New password</Text>
          <TextInput value={password} onChangeText={(v) => { setPassword(v); setErr(""); }} placeholder="At least 8 characters" placeholderTextColor={C.inkFaint} secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" style={s.input} />
          {err ? <Text style={s.err}>{err}</Text> : null}
          <Pressable accessibilityRole="button" onPress={confirm} disabled={busy} style={[s.btn, busy && { opacity: 0.6 }]}>
            <Text style={s.btnText}>{busy ? "Saving…" : "Set password"}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => { setStep("start"); setCode(""); setErr(""); }} style={s.secondary}>
            <Text style={s.secondaryText}>Send a new code</Text>
          </Pressable>
        </>
      ) : null}
      {step === "done" ? (
        <>
          <Text style={s.body}>Your password is set. Sign in with it now — any other device that was signed in has been signed out.</Text>
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={s.btn}>
            <Text style={s.btnText}>Back to sign in</Text>
          </Pressable>
        </>
      ) : null}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  wrap: { padding: 24, gap: 12 },
  title: { color: C.ink, fontSize: 24, ...D(700) },
  body: { color: C.inkMuted, fontSize: 14, lineHeight: 21 },
  hint: { color: C.inkFaint, fontSize: 12 },
  label: { color: C.inkMuted, fontSize: 12, letterSpacing: 1, ...S(700), marginTop: 6 },
  input: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.cream, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.ink },
  err: { color: C.clayText, fontSize: 13 },
  btn: { backgroundColor: C.green, borderRadius: 999, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  btnText: { color: ON_GREEN, fontSize: 15, ...S(700) },
  secondary: { alignItems: "center", paddingVertical: 10 },
  secondaryText: { color: C.inkMuted, fontSize: 14, ...S(600) },
});
