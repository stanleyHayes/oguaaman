import { route, ROUTES } from "@/lib/routes";
import { useMemo, useState } from "react";
import { replace } from "@/lib/router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { T as Text, TI as TextInput } from "@/components/typography";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { LostFoundKind } from "@/lib/types";
import { kindColor, LOST_FOUND_KINDS } from "@/lib/lostfound";
import { HeroBand } from "@/ui";
import { makeFormStyles } from "@/components/form-styles";
import { type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { EmergencyCallout, HeldNotice } from "@/components/notices";

export default function NewLostFound() {
  const { member } = useAuth();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const kindCol = useMemo(() => kindColor(C), [C]);
  const [kind, setKind] = useState<LostFoundKind>("lost_item");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [lastSeenLocation, setLastSeenLocation] = useState("");
  const [lastSeenDate, setLastSeenDate] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [minor, setMinor] = useState(false);
  const [guardianRelation, setGuardianRelation] = useState("");
  const [guardianAttestation, setGuardianAttestation] = useState(false);
  const [policeReference, setPoliceReference] = useState("");
  const [held, setHeld] = useState(false);

  if (!member) {
    return (
      <View style={s.gate}>
        <Text style={s.gateTitle}>Sign in to post</Text>
        <Text style={s.gateBody}>Notices are credited to you so the town can reach you — and so you can mark them reunited when it works out.</Text>
        <Pressable accessibilityRole="button" onPress={() => router.replace(ROUTES.signIn)} style={s.btn}>
          <Text style={s.btnText}>Sign in / create account</Text>
        </Pressable>
      </View>
    );
  }

  const missing = kind === "missing_person";
  const whereLabel = kind === "lost_item" ? "LOST WHERE" : "FOUND WHERE";

  async function submit() {
    const t = title.trim();
    const c = contact.trim();
    if (t.length < 2) { setError("Give the notice a clear title."); return; }
    if (c.length < 2) { setError("Add a contact — how can people reach you?"); return; }
    const child = missing && minor;
    if (child && (!guardianAttestation || guardianRelation.trim().length < 2)) {
      setError("For a missing child, say how you are related and confirm you are their parent or guardian, or acting for them.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const notice = await api.postLostFound({
        title: t,
        kind,
        description: description.trim(),
        lastSeenLocation: lastSeenLocation.trim() || undefined,
        lastSeenDate: lastSeenDate.trim() || undefined,
        contact: c,
        ...(missing ? { subjectIsMinor: child, policeReference: policeReference.trim() || undefined } : {}),
        ...(child ? { guardianAttestation: true, guardianRelation: guardianRelation.trim() } : {}),
      });
      // Missing children, missing people with a photo and posts from members
      // without a verified phone wait for a curator before they are public.
      if (notice.held || notice.status === "pending") setHeld(true);
      else replace(route.lostFound(notice.slug));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t post the notice. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (held) {
    return (
      <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ padding: 20, gap: 16 }}>
        <HeldNotice />
        {missing ? <EmergencyCallout /> : null}
        <Pressable accessibilityRole="button" onPress={() => replace(ROUTES.lostFound)} style={s.btn}>
          <Text style={s.btnText}>Back to lost &amp; found</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 48 }}>
      <HeroBand tone={C.teal} kicker="Lost & found" title="Post a notice" lede="Lost something, found something, or searching for someone? Most notices go live straight away; missing children and some other notices are checked by a curator first." />
      {missing ? <View style={{ paddingHorizontal: 16, paddingTop: 16 }}><EmergencyCallout /></View> : null}
      <View style={s.formCard}>
      <Text style={s.label}>WHAT KIND?</Text>
      <View style={s.chips}>
        {LOST_FOUND_KINDS.map((k) => {
          const col = kindCol[k.value];
          const on = kind === k.value;
          return (
            <Pressable accessibilityRole="button" key={k.value} onPress={() => setKind(k.value)} style={[s.chip, on && { borderColor: col, backgroundColor: col }]}>
              <Text style={[s.chipText, on ? { color: C.cream } : { color: col }]}>{k.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={s.label}>TITLE</Text>
      <Text style={s.hint}>
        {missing ? "The person’s name, and a word about them — e.g. “Missing: Auntie Efia, 72, last seen in Aboom”." : "What it is and where — e.g. “Lost: black mobile phone at Victoria Park”."}
      </Text>
      <TextInput style={s.input} value={title} onChangeText={(v) => { setTitle(v); setError(""); }} placeholder="A clear title" placeholderTextColor={C.inkFaint} maxLength={160} />

      <Text style={s.label}>TELL US MORE</Text>
      <TextInput
        style={[s.input, s.area]}
        value={description}
        onChangeText={setDescription}
        placeholder={missing ? "What they were wearing, where they might go, who to call…" : "Distinguishing marks, when you noticed, anything that helps…"}
        placeholderTextColor={C.inkFaint}
        multiline
      />

      <Text style={s.label}>{missing ? "LAST SEEN WHERE" : whereLabel}</Text>
      <TextInput style={s.input} value={lastSeenLocation} onChangeText={setLastSeenLocation} placeholder="e.g. Kotokuraba Market, the main gate" placeholderTextColor={C.inkFaint} />

      <Text style={s.label}>{missing ? "LAST SEEN WHEN" : "WHEN (OPTIONAL)"}</Text>
      <TextInput style={s.input} value={lastSeenDate} onChangeText={setLastSeenDate} placeholder="YYYY-MM-DD" placeholderTextColor={C.inkFaint} autoCapitalize="none" />

      {missing ? (
        <>
          <Text style={s.label}>IS THE PERSON UNDER 18?</Text>
          <View style={s.chips}>
            {[false, true].map((v) => (
              <Pressable accessibilityRole="button" accessibilityState={{ selected: minor === v }} key={String(v)} onPress={() => setMinor(v)} style={[s.chip, minor === v && { borderColor: C.maroon, backgroundColor: C.maroon }]}>
                <Text style={[s.chipText, minor === v ? { color: C.cream } : null]}>{v ? "Yes, a child" : "No, an adult"}</Text>
              </Pressable>
            ))}
          </View>
          {minor ? (
            <>
              <Text style={s.hint}>A curator checks notices about children before they are public. Don&apos;t include the child&apos;s school or home address.</Text>
              <Text style={s.label}>YOUR RELATIONSHIP TO THE CHILD</Text>
              <TextInput style={s.input} value={guardianRelation} onChangeText={(v) => { setGuardianRelation(v); setError(""); }} placeholder="e.g. Mother, uncle, class teacher" placeholderTextColor={C.inkFaint} maxLength={60} />
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: guardianAttestation }} onPress={() => { setGuardianAttestation(!guardianAttestation); setError(""); }} style={[s.chip, { marginTop: 10, alignSelf: "flex-start" }, guardianAttestation && { borderColor: C.maroon, backgroundColor: C.maroon }]}>
                <Text style={[s.chipText, guardianAttestation ? { color: C.cream } : null]}>{guardianAttestation ? "✓ " : ""}I am the child&apos;s parent, guardian or close relative, or a teacher or official acting with the family&apos;s knowledge</Text>
              </Pressable>
            </>
          ) : null}
          <Text style={s.label}>POLICE REFERENCE (OPTIONAL)</Text>
          <TextInput style={s.input} value={policeReference} onChangeText={setPoliceReference} placeholder="If you have reported it to the police" placeholderTextColor={C.inkFaint} maxLength={80} />
        </>
      ) : null}

      <Text style={s.label}>YOUR CONTACT</Text>
      <Text style={s.hint}>How curators can reach you. It is never shown publicly — others message you through Oguaa.</Text>
      <TextInput style={s.input} value={contact} onChangeText={(v) => { setContact(v); setError(""); }} placeholder="e.g. Ama Mensah — 024 000 0000" placeholderTextColor={C.inkFaint} />

      {error !== "" && <Text style={s.error}>{error}</Text>}

      <Pressable accessibilityRole="button" onPress={submit} disabled={busy} style={[s.btn, missing && { backgroundColor: C.maroon }, busy && { opacity: 0.6 }]}>
        <Text style={s.btnText}>{busy ? "Posting…" : "Post the notice"}</Text>
      </Pressable>
      <Text style={s.note}>Posted as {member.displayName}. You can mark it reunited once it works out.</Text>
      </View>
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => ({
  ...makeFormStyles(C),
  ...StyleSheet.create({
    btn: { backgroundColor: C.teal, borderRadius: 999, paddingVertical: 14, alignItems: "center", marginTop: 22 },
  }),
});
