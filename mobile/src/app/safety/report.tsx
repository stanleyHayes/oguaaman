import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { IncidentCategory, IncidentSeverity } from "@/lib/types";
import { INCIDENT_CATEGORIES, INCIDENT_SEVERITIES, SEVERITY_COLOR } from "@/lib/incidents";
import { C, serif } from "@/theme";

export default function ReportIncident() {
  const { member } = useAuth();
  const [category, setCategory] = useState<IncidentCategory>("flood");
  const [severity, setSeverity] = useState<IncidentSeverity>("medium");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!member) {
    return (
      <View style={s.gate}>
        <Text style={s.gateTitle}>Sign in to report</Text>
        <Text style={s.gateBody}>Incident reports are credited to you so curators can verify them. In a life-threatening emergency, call the emergency services first.</Text>
        <Pressable onPress={() => router.replace("/signin")} style={s.btn}>
          <Text style={s.btnText}>Sign in / create account</Text>
        </Pressable>
      </View>
    );
  }

  async function submit() {
    const t = title.trim();
    const loc = location.trim();
    if (t.length < 2) { setError("Give the incident a short, clear title."); return; }
    if (loc.length < 2) { setError("Add a location — a landmark, a street, a compound."); return; }
    setBusy(true);
    setError("");
    try {
      const inc = await api.reportIncident({
        title: t,
        category,
        severity,
        location: loc,
        contact: contact.trim() || undefined,
        description: description.trim() || undefined,
      });
      router.replace(`/safety/${inc.slug}` as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t post the report. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
      <Text style={s.title}>Report an incident</Text>
      <Text style={s.lede}>Floods, fires, accidents, hazards — post what is happening so responders and neighbours can act. It goes live immediately; a curator verifies afterwards.</Text>

      <Text style={s.label}>CATEGORY</Text>
      <View style={s.chips}>
        {INCIDENT_CATEGORIES.map((c) => (
          <Pressable key={c.value} onPress={() => setCategory(c.value)} style={[s.chip, category === c.value && s.chipOn]}>
            <Text style={[s.chipText, category === c.value && s.chipTextOn]}>{c.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={s.label}>SEVERITY</Text>
      <Text style={s.hint}>Critical and high alert every curator immediately.</Text>
      <View style={s.chips}>
        {INCIDENT_SEVERITIES.map((sv) => {
          const col = SEVERITY_COLOR[sv.value];
          const on = severity === sv.value;
          return (
            <Pressable key={sv.value} onPress={() => setSeverity(sv.value)} style={[s.chip, on && { borderColor: col, backgroundColor: col }]}>
              <Text style={[s.chipText, on ? { color: C.cream } : { color: col }]}>{sv.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={s.label}>TITLE</Text>
      <Text style={s.hint}>Short and clear — e.g. “Flooding around Fosu Lagoon”.</Text>
      <TextInput style={s.input} value={title} onChangeText={(v) => { setTitle(v); setError(""); }} placeholder="What is happening?" placeholderTextColor={C.inkFaint} maxLength={160} />

      <Text style={s.label}>LOCATION</Text>
      <Text style={s.hint}>As precise as you can — a landmark, a street, a compound.</Text>
      <TextInput style={s.input} value={location} onChangeText={(v) => { setLocation(v); setError(""); }} placeholder="e.g. Kotokuraba Market, near the main gate" placeholderTextColor={C.inkFaint} />

      <Text style={s.label}>WHAT HAPPENED</Text>
      <Text style={s.hint}>What responders and neighbours need to know.</Text>
      <TextInput
        style={[s.input, s.area]}
        value={description}
        onChangeText={setDescription}
        placeholder="Describe the incident, the danger, who is affected…"
        placeholderTextColor={C.inkFaint}
        multiline
      />

      <Text style={s.label}>YOUR CONTACT (OPTIONAL)</Text>
      <Text style={s.hint}>A phone number responders can reach you on.</Text>
      <TextInput style={s.input} value={contact} onChangeText={setContact} placeholder="e.g. 024 000 0000" placeholderTextColor={C.inkFaint} keyboardType="phone-pad" />

      {error !== "" && <Text style={s.error}>{error}</Text>}

      <Pressable onPress={submit} disabled={busy} style={[s.btn, busy && { opacity: 0.6 }]}>
        <Text style={s.btnText}>{busy ? "Posting…" : "Post the report"}</Text>
      </Pressable>
      <Text style={s.note}>Posted as {member.displayName}. In a life-threatening emergency, call the emergency services first.</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  title: { fontFamily: serif, fontSize: 26, fontWeight: "600", color: C.ink },
  lede: { color: C.inkMuted, fontSize: 14, lineHeight: 21, marginTop: 6 },
  label: { color: C.inkFaint, fontSize: 11, letterSpacing: 2, fontWeight: "700", marginTop: 22, marginBottom: 8 },
  hint: { color: C.inkFaint, fontSize: 12, marginTop: -4, marginBottom: 8, lineHeight: 17 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.cream, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chipOn: { borderColor: C.green, backgroundColor: C.green },
  chipText: { color: C.inkMuted, fontSize: 13, fontWeight: "600" },
  chipTextOn: { color: C.cream },
  input: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.cream, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.ink },
  area: { minHeight: 110, textAlignVertical: "top", fontFamily: serif },
  error: { color: C.clayText, marginTop: 12, fontSize: 13 },
  btn: { backgroundColor: C.maroon, borderRadius: 999, paddingVertical: 14, alignItems: "center", marginTop: 22 },
  btnText: { color: C.cream, fontWeight: "700", fontSize: 15 },
  note: { color: C.inkFaint, fontSize: 12, textAlign: "center", marginTop: 12, lineHeight: 18 },
  gate: { flex: 1, backgroundColor: C.paper, padding: 28, justifyContent: "center", alignItems: "center" },
  gateTitle: { fontFamily: serif, fontSize: 26, fontWeight: "600", color: C.ink, textAlign: "center" },
  gateBody: { color: C.inkMuted, fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 10, maxWidth: 320 },
});
