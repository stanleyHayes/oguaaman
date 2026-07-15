import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { T as Text, TI as TextInput } from "@/components/typography";
import { useAuth } from "@/lib/auth";
import { C, D, DI } from "@/theme";
import { Mark } from "@/ui";

const TRUST_SIGNIN = [
  "One account across web & mobile",
  "Free to use, built for the people of Oguaa",
];

const TRUST_JOIN = [
  ...TRUST_SIGNIN,
  "Your date of birth stays private — age check only",
];

type Mode = "signin" | "join";

type FormState = {
  isJoin: boolean;
  name: string;
  identifier: string;
  dob: string;
  password: string;
  busy: boolean;
  err: string | null;
  onName: (v: string) => void;
  onIdentifier: (v: string) => void;
  onDob: (v: string) => void;
  onPassword: (v: string) => void;
  onSubmit: () => void;
  onSwitchMode: (m: Mode) => void;
};

function Hero({ isJoin, trust }: Readonly<{ isJoin: boolean; trust: string[] }>) {
  return (
    <View style={s.hero}>
      <View style={s.heroMark}><Mark size={44} color={C.gold} /></View>
      <Text style={s.heroKicker}>{isJoin ? "Join Oguaa" : "Member sign in"}</Text>
      <Text style={s.heroTitle}>Welcome home to Oguaa.</Text>
      <Text style={s.heroSub}>
        {isJoin
          ? "Create your account with a phone or email and a password — one account for the whole of Oguaa."
          : "Sign in with your phone or email and your password — one account across web & mobile."}
      </Text>
      <View style={{ marginTop: 16, gap: 8 }}>
        {trust.map((t) => (
          <View key={t} style={s.trustRow}>
            <View style={s.trustTick}><Text style={s.trustTickText}>✓</Text></View>
            <Text style={s.trustText}>{t}</Text>
          </View>
        ))}
      </View>
      <Text style={s.motto}>Yɛn ara asaase ni — this is our own land.</Text>
    </View>
  );
}

function FormCard(f: Readonly<FormState>) {
  let btnLabel = "Sign in";
  if (f.busy) btnLabel = f.isJoin ? "Creating…" : "Signing in…";
  else if (f.isJoin) btnLabel = "Create my account →";
  return (
    <View style={s.card}>
      <View style={s.tabs}>
        <Pressable onPress={() => f.onSwitchMode("signin")} style={[s.tab, !f.isJoin && s.tabOn]}>
          <Text style={[s.tabText, !f.isJoin && s.tabTextOn]}>Sign in</Text>
        </Pressable>
        <Pressable onPress={() => f.onSwitchMode("join")} style={[s.tab, f.isJoin && s.tabOn]}>
          <Text style={[s.tabText, f.isJoin && s.tabTextOn]}>Join</Text>
        </Pressable>
      </View>

      <Text style={s.cardTitle}>{f.isJoin ? "Join Oguaa" : "Sign in"}</Text>
      <Text style={s.cardSub}>
        {f.isJoin ? "Create your account — one password for web & mobile." : "Enter your phone or email and your password."}
      </Text>

      {f.isJoin && (
        <>
          <Text style={s.label}>Your name</Text>
          <TextInput value={f.name} onChangeText={f.onName} placeholder="Display name" placeholderTextColor={C.inkFaint} autoComplete="name" style={s.input} />
        </>
      )}
      <Text style={s.label}>Phone or email</Text>
      <TextInput value={f.identifier} onChangeText={f.onIdentifier} placeholder="+233… or you@email" placeholderTextColor={C.inkFaint} autoCapitalize="none" autoComplete="username" style={s.input} />
      {f.isJoin && (
        <>
          <Text style={s.label}>Date of birth</Text>
          <TextInput value={f.dob} onChangeText={f.onDob} placeholder="YYYY-MM-DD" placeholderTextColor={C.inkFaint} autoCapitalize="none" style={s.input} />
          <Text style={s.hint}>Oguaa is for ages 18 and over.</Text>
        </>
      )}
      <Text style={s.label}>Password</Text>
      <TextInput
        value={f.password}
        onChangeText={f.onPassword}
        placeholder={f.isJoin ? "Choose a password" : "Your password"}
        placeholderTextColor={C.inkFaint}
        secureTextEntry
        autoCapitalize="none"
        autoComplete={f.isJoin ? "new-password" : "password"}
        textContentType={f.isJoin ? "newPassword" : "password"}
        style={s.input}
      />
      {f.isJoin && <Text style={s.hint}>At least 8 characters</Text>}

      {f.err && <Text style={s.err}>{f.err}</Text>}
      <Pressable onPress={f.onSubmit} disabled={f.busy} style={s.btn}>
        <Text style={s.btnText}>{btnLabel}</Text>
      </Pressable>
      <Pressable onPress={() => f.onSwitchMode(f.isJoin ? "signin" : "join")}>
        <Text style={s.back}>{f.isJoin ? "Have an account? Sign in instead" : "New here? Join instead"}</Text>
      </Pressable>
      <Text style={s.hint}>Seeded account: akua-pratt@oguaa.test</Text>
    </View>
  );
}

export default function SignIn() {
  const { signIn, completeMfa, join } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [identifier, setIdentifier] = useState("");
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isJoin = mode === "join";

  function switchMode(m: Mode) {
    setMode(m);
    setErr(null);
    setChallenge(null);
  }

  async function submit() {
    setBusy(true); setErr(null);
    if (isJoin && !dob.trim()) { setErr("Please enter your date of birth."); setBusy(false); return; }
    if (isJoin && password.length < 8) { setErr("Your password must be at least 8 characters."); setBusy(false); return; }
    try {
      if (isJoin) {
        await join({ identifier: identifier.trim(), displayName: name.trim(), dateOfBirth: dob.trim(), password });
        router.back();
      } else {
        const res = await signIn(identifier.trim(), password);
        if (res.mfaRequired && res.challenge) { setChallenge(res.challenge); setCode(""); }
        else router.back();
      }
    } catch (e) {
      const fallback = isJoin ? "Could not create your account." : "Sign in failed.";
      setErr(e instanceof Error ? e.message : fallback);
    } finally { setBusy(false); }
  }

  async function submitCode() {
    if (!challenge) return;
    setBusy(true); setErr(null);
    try {
      await completeMfa(challenge, code.trim());
      router.back();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That code didn't work.");
    } finally { setBusy(false); }
  }

  if (challenge) {
    return (
      <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Hero isJoin={false} trust={TRUST_SIGNIN} />
        <View style={s.card}>
          <Text style={s.cardTitle}>Two-factor check</Text>
          <Text style={s.cardSub}>Enter the 6-digit code from your authenticator app, or a recovery code.</Text>
          <Text style={s.label}>Code</Text>
          <TextInput
            style={[s.input, { textAlign: "center", letterSpacing: 4, fontSize: 18 }]}
            value={code}
            onChangeText={setCode}
            placeholder="123 456"
            placeholderTextColor={C.inkFaint}
            keyboardType="number-pad"
            autoComplete="one-time-code"
          />
          {err ? <Text style={s.err}>{err}</Text> : null}
          <Pressable style={[s.btn, busy && { opacity: 0.6 }]} onPress={submitCode} disabled={busy}>
            <Text style={s.btnText}>{busy ? "Verifying…" : "Verify & sign in"}</Text>
          </Pressable>
          <Pressable onPress={() => { setChallenge(null); setErr(null); setPassword(""); }}>
            <Text style={s.back}>← Back to sign in</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Hero isJoin={isJoin} trust={isJoin ? TRUST_JOIN : TRUST_SIGNIN} />
      <FormCard
        isJoin={isJoin}
        name={name}
        identifier={identifier}
        dob={dob}
        password={password}
        busy={busy}
        err={err}
        onName={setName}
        onIdentifier={setIdentifier}
        onDob={setDob}
        onPassword={setPassword}
        onSubmit={submit}
        onSwitchMode={switchMode}
      />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  hero: { backgroundColor: C.green, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 44, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  heroMark: { alignItems: "center", marginBottom: 14 },
  heroKicker: { color: C.gold, fontSize: 11, fontWeight: "700", letterSpacing: 2, textTransform: "uppercase", textAlign: "center" },
  heroTitle: { ...D(600), color: C.cream, fontSize: 30, textAlign: "center", marginTop: 8 },
  heroSub: { color: "#D9D2C2", fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 8 },
  trustRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  trustTick: { width: 20, height: 20, borderRadius: 10, backgroundColor: "rgba(199,162,74,0.2)", alignItems: "center", justifyContent: "center", marginTop: 1 },
  trustTickText: { color: C.gold, fontSize: 11, fontWeight: "700" },
  trustText: { color: "#E7E1D3", fontSize: 13, lineHeight: 19, flex: 1 },
  motto: { ...DI(), color: C.gold, fontSize: 14, textAlign: "center", marginTop: 18 },
  card: { marginHorizontal: 16, marginTop: -24, backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 16, padding: 20, gap: 14, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  tabs: { flexDirection: "row", gap: 8, marginBottom: 4 },
  tab: { flex: 1, alignItems: "center", borderWidth: 1, borderColor: C.sand, backgroundColor: C.cream, borderRadius: 999, paddingVertical: 9 },
  tabOn: { borderColor: C.green, backgroundColor: C.green },
  tabText: { color: C.inkMuted, fontSize: 14, fontWeight: "600" },
  tabTextOn: { color: C.cream },
  cardTitle: { ...D(600), fontSize: 24, color: C.ink },
  cardSub: { color: C.inkMuted, fontSize: 13, lineHeight: 19, marginTop: -8 },
  label: { color: C.ink, fontSize: 13, fontWeight: "600", marginBottom: -8 },
  input: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, color: C.ink },
  btn: { backgroundColor: C.green, borderRadius: 999, paddingVertical: 15, alignItems: "center" },
  btnText: { color: C.cream, fontWeight: "700", fontSize: 15 },
  err: { color: C.clayText, fontSize: 14, backgroundColor: "rgba(176,80,60,0.06)", borderWidth: 1, borderColor: "rgba(176,80,60,0.3)", borderRadius: 10, padding: 10 },
  hint: { color: C.inkFaint, fontSize: 12, textAlign: "center" },
  back: { color: C.inkMuted, textAlign: "center", paddingVertical: 8 },
});
