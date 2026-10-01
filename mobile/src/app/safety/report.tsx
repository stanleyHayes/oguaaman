import { route, ROUTES } from "@/lib/routes";
import { useMemo, useState } from "react";
import { replace } from "@/lib/router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { T as Text, TI as TextInput } from "@/components/typography";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme-context";
import type { IncidentCategory, IncidentSeverity } from "@/lib/types";
import { HELD_CATEGORIES, INCIDENT_CATEGORIES, INCIDENT_SEVERITIES, severityColors } from "@/lib/incidents";
import { EmergencyCallout, HeldNotice } from "@/components/notices";
import { HeroBand } from "@/ui";
import { formStyles } from "@/components/form-styles";
import { ON_GREEN, type Palette } from "@/theme";

export default function ReportIncident() {
  const { member } = useAuth();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const sevColors = severityColors(C);
  const [category, setCategory] = useState<IncidentCategory>("flood");
  const [severity, setSeverity] = useState<IncidentSeverity>("medium");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [held, setHeld] = useState(false);

  if (!member) {
    return (
      <View style={s.gate}>
        <EmergencyCallout />
        <Text style={[s.gateTitle, { marginTop: 18 }]}>Sign in to report</Text>
        <Text style={s.gateBody}>Incident reports are credited to you so curators can verify them.</Text>
        <Pressable accessibilityRole="button" onPress={() => router.replace(ROUTES.signIn)} style={s.btn}>
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
      // Crime, medical and screened reports wait for a curator (K12): say so
      // here, because the detail page is not public until then.
      if (inc.held || inc.status === "pending") setHeld(true);
      else replace(route.safety(inc.slug));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t post the report. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (held) {
    return (
      <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ padding: 20, gap: 16 }}>
        <HeldNotice />
        <EmergencyCallout />
        <Pressable accessibilityRole="button" onPress={() => replace(ROUTES.safety)} style={s.btn}>
          <Text style={s.btnText}>Back to the safety board</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 48 }}>
      <HeroBand tone={C.maroon} kicker="Safety board" title="Report an incident" lede="Floods, fires, accidents, hazards — post what is happening so neighbours can act. Most reports go live immediately and a curator verifies afterwards; crime and medical reports are checked by a curator first." />
      <View style={{ paddingHorizontal: 16, paddingTop: 16 }}><EmergencyCallout /></View>
      <View style={s.formCard}>
      <Text style={s.label}>CATEGORY</Text>
      <View style={s.chips}>
        {INCIDENT_CATEGORIES.map((c) => (
          <Pressable accessibilityRole="button" key={c.value} onPress={() => setCategory(c.value)} style={[s.chip, category === c.value && s.chipOn]}>
            <Text style={[s.chipText, category === c.value && s.chipTextOn]}>{c.label}</Text>
          </Pressable>
        ))}
      </View>
      {HELD_CATEGORIES.has(category) ? (
        <Text style={s.hint}>A curator reviews {category} reports before anyone else sees them, and no town-wide alert goes out until then. To report a crime to the police, call 112.</Text>
      ) : null}

      <Text style={s.label}>SEVERITY</Text>
      <Text style={s.hint}>Critical and high alert every curator immediately.</Text>
      <View style={s.chips}>
        {INCIDENT_SEVERITIES.map((sv) => {
          const col = sevColors[sv.value];
          const on = severity === sv.value;
          return (
            <Pressable accessibilityRole="button" key={sv.value} onPress={() => setSeverity(sv.value)} style={[s.chip, on && { borderColor: col, backgroundColor: col }]}>
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
      <Text style={s.hint}>A phone number curators can reach you on. It is never shown publicly.</Text>
      <TextInput style={s.input} value={contact} onChangeText={setContact} placeholder="e.g. 024 000 0000" placeholderTextColor={C.inkFaint} keyboardType="phone-pad" />

      {error !== "" && <Text style={s.error}>{error}</Text>}

      <Pressable accessibilityRole="button" onPress={submit} disabled={busy} style={[s.btn, busy && { opacity: 0.6 }]}>
        <Text style={s.btnText}>{busy ? "Posting…" : "Post the report"}</Text>
      </Pressable>
      <Text style={s.note}>Posted as {member.displayName}. Oguaa does not alert the emergency services — in an emergency, call 112.</Text>
      </View>
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => ({
  ...formStyles,
  ...StyleSheet.create({
    chipOn: { borderColor: C.green, backgroundColor: C.green },
    chipTextOn: { color: ON_GREEN },
    btn: { backgroundColor: C.maroon, borderRadius: 999, paddingVertical: 14, alignItems: "center", marginTop: 22 },
  }),
});
