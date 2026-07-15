import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { T as Text, TI as TextInput } from "@/components/typography";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ImageField } from "@/components/image-field";
import { HeroBand } from "@/ui";
import { formStyles } from "@/components/form-styles";
import { C } from "@/theme";

const TYPES = [
  { id: "memory", label: "Memory" },
  { id: "artist", label: "Artist" },
  { id: "person", label: "Person" },
  { id: "event", label: "Event" },
  { id: "business", label: "Business" },
  { id: "opportunity", label: "Opportunity" },
  { id: "memorial", label: "Memorial" },
] as const;

// Per-type extra fields, mirroring the web submit form so phone submissions
// arrive with the same structure curators expect (memorial has its own block).
interface ExtraField { key: string; label: string; placeholder: string }
const TYPE_FIELDS: Record<string, ExtraField[]> = {
  artist: [
    { key: "genres", label: "GENRES", placeholder: "Comma-separated, e.g. highlife, gospel" },
    { key: "link", label: "STREAMING LINK (OPTIONAL)", placeholder: "https://audiomack.com/…" },
  ],
  business: [
    { key: "category", label: "CATEGORY", placeholder: "e.g. Guesthouse, Fishmonger, Tailor" },
    { key: "address", label: "LOCATION / ADDRESS", placeholder: "e.g. Kotokuraba Market, Cape Coast" },
  ],
  event: [
    { key: "startsAt", label: "DATE", placeholder: "YYYY-MM-DD" },
    { key: "venue", label: "VENUE", placeholder: "e.g. Victoria Park" },
  ],
  memory: [{ key: "era", label: "ERA (OPTIONAL)", placeholder: "e.g. 1970s" }],
  person: [
    { key: "era", label: "ERA (OPTIONAL)", placeholder: "e.g. 1920s–2018" },
    { key: "whyNotable", label: "WHY OGUAA IS PROUD (OPTIONAL)", placeholder: "One line on what they mean to the town" },
  ],
  opportunity: [
    { key: "kind", label: "KIND", placeholder: "e.g. Scholarship, Job, Training" },
    { key: "applyUrl", label: "HOW TO APPLY (LINK)", placeholder: "https://…" },
  ],
};

// Memorial-only optional fields bundled for the details builder.
interface MemorialFields {
  honorific: string; bornYear: string; diedDate: string; epitaph: string; birthday: string; associations: string;
}

// Fold in the per-type extras (genres become an array; a streaming link
// becomes a streamingLinks entry, matching what the detail screens render).
function addTypeExtras(details: Record<string, unknown>, type: string, extra: Record<string, string>) {
  for (const f of TYPE_FIELDS[type] ?? []) {
    const v = (extra[f.key] ?? "").trim();
    if (!v) continue;
    if (f.key === "genres") details.genres = v.split(",").map((g) => g.trim()).filter(Boolean);
    else if (f.key === "link") details.streamingLinks = [{ label: "Listen", url: v }];
    else details[f.key] = v;
  }
}

function addMemorialDetails(details: Record<string, unknown>, m: MemorialFields) {
  const honorific = m.honorific.trim();
  if (honorific) details.honorific = honorific;
  const yr = Number.parseInt(m.bornYear.trim(), 10);
  if (!Number.isNaN(yr)) details.bornYear = yr;
  const diedDate = m.diedDate.trim();
  if (diedDate) details.diedDate = diedDate;
  const epitaph = m.epitaph.trim();
  if (epitaph) details.epitaph = epitaph;
  const birthday = m.birthday.trim();
  if (birthday) details.birthday = birthday;
  const assoc = m.associations.split(",").map((a) => a.trim()).filter(Boolean);
  if (assoc.length) details.associations = assoc;
}

function buildDetails(type: string, description: string, extra: Record<string, string>, memorial: MemorialFields): Record<string, unknown> {
  const details: Record<string, unknown> = { description: description.trim() };
  addTypeExtras(details, type, extra);
  if (type === "memorial") addMemorialDetails(details, memorial);
  return details;
}

export default function Submit() {
  const { member } = useAuth();
  const [type, setType] = useState<string>("memory");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  // Memorial-only optional fields.
  const [honorific, setHonorific] = useState("");
  const [bornYear, setBornYear] = useState("");
  const [diedDate, setDiedDate] = useState("");
  const [epitaph, setEpitaph] = useState("");
  const [birthday, setBirthday] = useState("");
  const [associations, setAssociations] = useState("");
  // Per-type extra fields (TYPE_FIELDS), keyed by field key.
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  function reset() {
    setTitle("");
    setDescription("");
    setCoverImageUrl("");
    setHonorific("");
    setBornYear("");
    setDiedDate("");
    setEpitaph("");
    setBirthday("");
    setAssociations("");
    setExtra({});
  }

  async function submit() {
    const t = title.trim();
    if (t.length < 2) {
      setError("Give it a title (at least 2 characters).");
      return;
    }
    setBusy(true);
    setError("");

    const details = buildDetails(type, description, extra, { honorific, bornYear, diedDate, epitaph, birthday, associations });
    const cover = coverImageUrl.trim();
    try {
      await api.submit({ type, title: t, details, ...(cover ? { coverImageUrl: cover } : {}) });
      setDone(true);
    } catch {
      setError("Couldn’t submit. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!member) {
    return (
      <View style={s.gate}>
        <Text style={s.gateTitle}>Sign in to contribute</Text>
        <Text style={s.gateBody}>Listings are credited to you and reviewed by a curator before they go live.</Text>
        <Pressable onPress={() => router.replace("/signin")} style={s.btn}>
          <Text style={s.btnText}>Sign in / create account</Text>
        </Pressable>
      </View>
    );
  }

  if (done) {
    return (
      <View style={s.gate}>
        <Text style={s.gateTitle}>Thank you 🙏</Text>
        <Text style={s.gateBody}>Your contribution has been submitted. A curator will review it for dignity and accuracy before it appears.</Text>
        <Pressable onPress={() => router.back()} style={s.btn}><Text style={s.btnText}>Done</Text></Pressable>
        <Pressable
          onPress={() => { setDone(false); reset(); }}
          style={s.btnOutline}
        >
          <Text style={s.btnOutlineText}>Add another</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 48 }}>
      <HeroBand tone={C.green} kicker="One engine · many listings" title="Contribute to Oguaa" lede="Add an artist, a memory, an event, or someone to remember. A curator reviews every entry." />
      <View style={s.formCard}>
      <Text style={s.label}>WHAT IS IT?</Text>
      <View style={s.chips}>
        {TYPES.map((x) => (
          <Pressable key={x.id} onPress={() => setType(x.id)} style={[s.chip, type === x.id && s.chipOn]}>
            <Text style={[s.chipText, type === x.id && s.chipTextOn]}>{x.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={s.label}>TITLE / NAME</Text>
      <TextInput
        style={s.input}
        value={title}
        onChangeText={(v) => { setTitle(v); setError(""); }}
        placeholder={type === "memorial" ? "Full name of the person" : "A clear title"}
        placeholderTextColor={C.inkFaint}
      />

      <Text style={s.label}>TELL US MORE</Text>
      <TextInput
        style={[s.input, s.area]}
        value={description}
        onChangeText={setDescription}
        placeholder="A few sentences — the curator will help shape it."
        placeholderTextColor={C.inkFaint}
        multiline
      />

      {(TYPE_FIELDS[type] ?? []).map((f) => (
        <View key={f.key}>
          <Text style={s.label}>{f.label}</Text>
          <TextInput
            style={s.input}
            value={extra[f.key] ?? ""}
            onChangeText={(v) => setExtra((cur) => ({ ...cur, [f.key]: v }))}
            placeholder={f.placeholder}
            placeholderTextColor={C.inkFaint}
            autoCapitalize={f.key === "link" || f.key === "applyUrl" ? "none" : "sentences"}
          />
        </View>
      ))}

      {type === "memorial" && (
        <>
          <Text style={s.label}>HONORIFIC (OPTIONAL)</Text>
          <TextInput
            style={s.input}
            value={honorific}
            onChangeText={setHonorific}
            placeholder="e.g. Nana, Dr, Maa"
            placeholderTextColor={C.inkFaint}
          />

          <Text style={s.label}>BORN YEAR (OPTIONAL)</Text>
          <TextInput
            style={s.input}
            value={bornYear}
            onChangeText={setBornYear}
            placeholder="e.g. 1938"
            placeholderTextColor={C.inkFaint}
            keyboardType="number-pad"
          />

          <Text style={s.label}>DATE OF PASSING (OPTIONAL)</Text>
          <TextInput
            style={s.input}
            value={diedDate}
            onChangeText={setDiedDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={C.inkFaint}
          />

          <Text style={s.label}>EPITAPH (OPTIONAL)</Text>
          <TextInput
            style={s.input}
            value={epitaph}
            onChangeText={setEpitaph}
            placeholder="A short line in their memory"
            placeholderTextColor={C.inkFaint}
          />

          <Text style={s.label}>BIRTHDAY (OPTIONAL)</Text>
          <TextInput
            style={s.input}
            value={birthday}
            onChangeText={setBirthday}
            placeholder="MM-DD"
            placeholderTextColor={C.inkFaint}
          />

          <Text style={s.label}>ASSOCIATIONS (OPTIONAL)</Text>
          <TextInput
            style={s.input}
            value={associations}
            onChangeText={setAssociations}
            placeholder="Comma-separated, e.g. Mfantsipim, Asafo No. 7"
            placeholderTextColor={C.inkFaint}
          />
        </>
      )}

      <Text style={s.label}>COVER IMAGE (OPTIONAL)</Text>
      <ImageField value={coverImageUrl} onChange={setCoverImageUrl} />

      {error !== "" && <Text style={s.error}>{error}</Text>}

      <Pressable onPress={submit} disabled={busy} style={[s.btn, busy && { opacity: 0.6 }]}>
        <Text style={s.btnText}>{busy ? "Submitting…" : "Submit for review"}</Text>
      </Pressable>
      <Text style={s.note}>Submitted as {member.displayName}. Your phone number stays private.</Text>
      </View>
    </ScrollView>
  );
}

const s = {
  ...formStyles,
  ...StyleSheet.create({
    chipOn: { borderColor: C.green, backgroundColor: C.green },
    chipTextOn: { color: C.cream },
    btn: { backgroundColor: C.green, borderRadius: 999, paddingVertical: 14, alignItems: "center", marginTop: 22 },
    btnOutline: { borderWidth: 1, borderColor: C.sand, borderRadius: 999, paddingVertical: 13, alignItems: "center", marginTop: 12 },
    btnOutlineText: { color: C.ink, fontWeight: "600" },
  }),
};
