import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { T as Text, TI as TextInput } from "@/components/typography";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { LostFoundKind } from "@/lib/types";
import { KIND_COLOR, LOST_FOUND_KINDS } from "@/lib/lostfound";
import { HeroBand } from "@/ui";
import { formStyles } from "@/components/form-styles";
import { C } from "@/theme";

export default function NewLostFound() {
  const { member } = useAuth();
  const [kind, setKind] = useState<LostFoundKind>("lost_item");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [lastSeenLocation, setLastSeenLocation] = useState("");
  const [lastSeenDate, setLastSeenDate] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!member) {
    return (
      <View style={s.gate}>
        <Text style={s.gateTitle}>Sign in to post</Text>
        <Text style={s.gateBody}>Notices are credited to you so the town can reach you — and so you can mark them reunited when it works out.</Text>
        <Pressable onPress={() => router.replace("/signin")} style={s.btn}>
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
      });
      router.replace(`/lost-found/${notice.slug}` as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t post the notice. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 48 }}>
      <HeroBand tone={C.teal} kicker="Lost & found" title="Post a notice" lede="Lost something, found something, or searching for someone? Notices go live immediately — the town helps." />
      <View style={s.formCard}>
      <Text style={s.label}>WHAT KIND?</Text>
      <View style={s.chips}>
        {LOST_FOUND_KINDS.map((k) => {
          const col = KIND_COLOR[k.value];
          const on = kind === k.value;
          return (
            <Pressable key={k.value} onPress={() => setKind(k.value)} style={[s.chip, on && { borderColor: col, backgroundColor: col }]}>
              <Text style={[s.chipText, on ? { color: C.cream } : { color: col }]}>{k.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={s.label}>TITLE</Text>
      <Text style={s.hint}>
        {missing ? "The person’s name, and a word about them — e.g. “Missing: Auntie Efia, 72, last seen in Aboom”." : "What it is and where — e.g. “Lost: black Samsung phone at Victoria Park”."}
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

      <Text style={s.label}>YOUR CONTACT</Text>
      <Text style={s.hint}>A phone number or name people can reach you on.</Text>
      <TextInput style={s.input} value={contact} onChangeText={(v) => { setContact(v); setError(""); }} placeholder="e.g. Ama Mensah — 024 000 0000" placeholderTextColor={C.inkFaint} />

      {error !== "" && <Text style={s.error}>{error}</Text>}

      <Pressable onPress={submit} disabled={busy} style={[s.btn, missing && { backgroundColor: C.maroon }, busy && { opacity: 0.6 }]}>
        <Text style={s.btnText}>{busy ? "Posting…" : "Post the notice"}</Text>
      </Pressable>
      <Text style={s.note}>Posted as {member.displayName}. You can mark it reunited once it works out.</Text>
      </View>
    </ScrollView>
  );
}

const s = {
  ...formStyles,
  ...StyleSheet.create({
    btn: { backgroundColor: C.teal, borderRadius: 999, paddingVertical: 14, alignItems: "center", marginTop: 22 },
  }),
};
