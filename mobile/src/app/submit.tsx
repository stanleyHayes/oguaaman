import { ROUTES } from "@/lib/routes";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { T as Text, TI as TextInput } from "@/components/typography";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { DateField } from "@/components/date-field";
import { ImageField } from "@/components/image-field";
import { HeroBand } from "@/ui";
import { makeFormStyles } from "@/components/form-styles";
import { ON_GREEN, type Palette, S, D } from "@/theme";
import { useTheme } from "@/lib/theme-context";

const TYPES = [
  { id: "memory", label: "Memory" },
  { id: "artist", label: "Artist" },
  { id: "person", label: "Person" },
  { id: "event", label: "Event" },
  { id: "business", label: "Business" },
  { id: "property", label: "Property" },
  { id: "opportunity", label: "Opportunity" },
  { id: "memorial", label: "Memorial" },
] as const;

const PROPERTY_OFFERS = [
  { id: "long-term", label: "Rent monthly" },
  { id: "short-stay", label: "Book a stay" },
] as const;

const PROPERTY_TYPES = [
  { id: "room", label: "Room" },
  { id: "apartment", label: "Apartment" },
  { id: "house", label: "House" },
  { id: "guesthouse", label: "Guesthouse" },
  { id: "hostel", label: "Hostel" },
] as const;

const PROPERTY_AVAILABILITY = [
  { id: "available", label: "Available" },
  { id: "reserved", label: "Reserved" },
  { id: "let", label: "Let" },
] as const;

const OPPORTUNITY_KINDS = [
  { id: "scholarship", label: "Scholarship" },
  { id: "internship", label: "Internship" },
  { id: "apprenticeship", label: "Apprenticeship" },
  { id: "training", label: "Training" },
  { id: "job", label: "Job" },
  { id: "investment", label: "Investment" },
  { id: "mentorship", label: "Mentorship" },
] as const;

// Per-type extra fields, mirroring the web submit form so phone submissions
// arrive with the same structure curators expect (memorial has its own block).
interface ExtraField { key: string; label: string; placeholder: string; kind?: "date" }
const TYPE_FIELDS: Record<string, ExtraField[]> = {
  artist: [
    { key: "genres", label: "GENRES", placeholder: "Comma-separated, e.g. highlife, gospel" },
    { key: "link", label: "STREAMING LINK (OPTIONAL)", placeholder: "https://audiomack.com/…" },
  ],
  business: [
    { key: "category", label: "CATEGORY", placeholder: "e.g. Guesthouse, Fishmonger, Tailor" },
    { key: "address", label: "LOCATION / ADDRESS", placeholder: "e.g. Kotokuraba Market, Cape Coast" },
  ],
  property: [
    { key: "area", label: "AREA / NEIGHBOURHOOD", placeholder: "e.g. Abura, Pedu, Amamoma" },
    { key: "address", label: "ADDRESS OR LANDMARK", placeholder: "e.g. Near Pedu Junction, Cape Coast" },
    { key: "priceGhs", label: "PRICE (GH₵)", placeholder: "e.g. 1200" },
    { key: "depositGhs", label: "DEPOSIT / ADVANCE (GH₵, OPTIONAL)", placeholder: "e.g. 2400" },
    { key: "bedrooms", label: "BEDROOMS (OPTIONAL)", placeholder: "e.g. 2" },
    { key: "bathrooms", label: "BATHROOMS (OPTIONAL)", placeholder: "e.g. 1" },
    { key: "availableFrom", label: "AVAILABLE FROM (OPTIONAL)", placeholder: "Pick a date", kind: "date" },
    { key: "amenities", label: "AMENITIES", placeholder: "Comma-separated: Wi-Fi, water, parking" },
    { key: "contactUrl", label: "CONTACT LINK", placeholder: "https://wa.me/233… or tel:+233…" },
    { key: "bookingUrl", label: "BOOKING LINK (OPTIONAL)", placeholder: "https://…" },
  ],
  event: [
    { key: "startsAt", label: "DATE", placeholder: "Pick a date", kind: "date" },
    { key: "venue", label: "VENUE", placeholder: "e.g. Victoria Park" },
  ],
  memory: [{ key: "era", label: "ERA (OPTIONAL)", placeholder: "e.g. 1970s" }],
  person: [
    { key: "era", label: "ERA (OPTIONAL)", placeholder: "e.g. 1920s–2018" },
    { key: "whyNotable", label: "WHY OGUAA IS PROUD (OPTIONAL)", placeholder: "One line on what they mean to the town" },
  ],
  opportunity: [
    { key: "provider", label: "PROVIDER / PROGRAMME OWNER", placeholder: "Institution, company or verified organisation" },
    { key: "safeguardingPolicyUrl", label: "SAFEGUARDING / POLICY LINK", placeholder: "https://…" },
    { key: "minAge", label: "MINIMUM AGE (OPTIONAL)", placeholder: "16" },
    { key: "maxAge", label: "MAXIMUM AGE (OPTIONAL)", placeholder: "19" },
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
    else if (f.key === "amenities") details.amenities = v.split(",").map((g) => g.trim()).filter(Boolean);
    else if (f.key === "link") details.streamingLinks = [{ label: "Listen", url: v }];
    else if (f.key === "contactUrl") details.contact = [{ label: "Contact manager", url: v }];
    else if (f.key === "priceGhs" || f.key === "depositGhs") {
      const amount = Number(v.replace(/,/g, ""));
      if (Number.isFinite(amount) && amount > 0) details[f.key === "priceGhs" ? "pricePesewas" : "depositPesewas"] = Math.round(amount * 100);
    } else if (f.key === "bedrooms" || f.key === "bathrooms") {
      const count = Number.parseInt(v, 10);
      if (Number.isFinite(count) && count >= 0) details[f.key] = count;
    }
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

function buildDetails(
  type: string,
  description: string,
  extra: Record<string, string>,
  memorial: MemorialFields,
  opportunityKind: (typeof OPPORTUNITY_KINDS)[number]["id"],
  guardianConsentRequired: boolean,
  property: {
    offerType: (typeof PROPERTY_OFFERS)[number]["id"];
    propertyType: (typeof PROPERTY_TYPES)[number]["id"];
    availability: (typeof PROPERTY_AVAILABILITY)[number]["id"];
    furnished: boolean;
  },
): Record<string, unknown> {
  const details: Record<string, unknown> = { description: description.trim() };
  addTypeExtras(details, type, extra);
  if (type === "memorial") addMemorialDetails(details, memorial);
  if (type === "opportunity") {
    details.kind = opportunityKind;
    if (opportunityKind === "mentorship") details.guardianConsentRequired = guardianConsentRequired;
  }
  if (type === "property") {
    details.offerType = property.offerType;
    details.propertyType = property.propertyType;
    details.pricePeriod = property.offerType === "short-stay" ? "night" : "month";
    details.availability = property.availability;
    details.furnished = property.furnished;
  }
  return details;
}

export default function Submit() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { member } = useAuth();
  const { type: requestedType } = useLocalSearchParams<{ type?: string }>();
  const initialType = TYPES.some((item) => item.id === requestedType) ? requestedType! : "memory";
  const [type, setType] = useState<string>(initialType);
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
  const [opportunityKind, setOpportunityKind] = useState<(typeof OPPORTUNITY_KINDS)[number]["id"]>("scholarship");
  const [guardianConsentRequired, setGuardianConsentRequired] = useState(true);
  const [propertyOffer, setPropertyOffer] = useState<(typeof PROPERTY_OFFERS)[number]["id"]>("long-term");
  const [propertyType, setPropertyType] = useState<(typeof PROPERTY_TYPES)[number]["id"]>("apartment");
  const [propertyAvailability, setPropertyAvailability] = useState<(typeof PROPERTY_AVAILABILITY)[number]["id"]>("available");
  const [propertyFurnished, setPropertyFurnished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

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
    setOpportunityKind("scholarship");
    setGuardianConsentRequired(true);
    setPropertyOffer("long-term");
    setPropertyType("apartment");
    setPropertyAvailability("available");
    setPropertyFurnished(false);
  }

  async function submit() {
    const t = title.trim();
    if (t.length < 2) {
      setError("Give it a title (at least 2 characters).");
      return;
    }
    if (type === "property" && description.trim().length < 10) {
      setError("Describe the property in at least 10 characters.");
      return;
    }
    if (type === "property" && (extra.address ?? "").trim().length < 2) {
      setError("Add an address or nearby landmark.");
      return;
    }
    setBusy(true);
    setError("");

    const details = buildDetails(
      type,
      description,
      extra,
      { honorific, bornYear, diedDate, epitaph, birthday, associations },
      opportunityKind,
      guardianConsentRequired,
      { offerType: propertyOffer, propertyType, availability: propertyAvailability, furnished: propertyFurnished },
    );
    if (type === "property" && typeof details.pricePesewas !== "number") {
      setError("Add a valid price for this property.");
      setBusy(false);
      return;
    }
    const cover = coverImageUrl.trim();
    try {
      await api.submit({ type, title: t, details, ...(cover ? { coverImageUrl: cover } : {}) });
      setDone(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Couldn’t submit. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!member) {
    return (
      <View style={s.gate}>
        <Text style={s.gateTitle}>Sign in to contribute</Text>
        <Text style={s.gateBody}>Listings are credited to you and reviewed by a curator before they go live.</Text>
        <Pressable accessibilityRole="button" onPress={() => router.replace(ROUTES.signIn)} style={s.btn}>
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
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={s.btn}><Text style={s.btnText}>Done</Text></Pressable>
        <Pressable accessibilityRole="button"
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
          <Pressable accessibilityRole="button" key={x.id} onPress={() => setType(x.id)} style={[s.chip, type === x.id && s.chipOn]}>
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
          {f.kind === "date" ? (
            <DateField
              value={extra[f.key] ?? ""}
              onChange={(v) => setExtra((cur) => ({ ...cur, [f.key]: v }))}
              placeholder={f.placeholder}
            />
          ) : (
            <TextInput
              style={s.input}
              value={extra[f.key] ?? ""}
              onChangeText={(v) => setExtra((cur) => ({ ...cur, [f.key]: v }))}
              placeholder={f.placeholder}
              placeholderTextColor={C.inkFaint}
              keyboardType={f.key === "link" || f.key.endsWith("Url") ? "url" : "default"}
              autoCapitalize={f.key === "link" || f.key.endsWith("Url") ? "none" : "sentences"}
            />
          )}
        </View>
      ))}

      {type === "property" && (
        <>
          <Text style={s.label}>HOW IS IT OFFERED?</Text>
          <View style={s.chips}>
            {PROPERTY_OFFERS.map((item) => (
              <Pressable accessibilityRole="button" key={item.id} onPress={() => setPropertyOffer(item.id)} style={[s.chip, propertyOffer === item.id && s.chipOn]}>
                <Text style={[s.chipText, propertyOffer === item.id && s.chipTextOn]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={s.label}>PROPERTY TYPE</Text>
          <View style={s.chips}>
            {PROPERTY_TYPES.map((item) => (
              <Pressable accessibilityRole="button" key={item.id} onPress={() => setPropertyType(item.id)} style={[s.chip, propertyType === item.id && s.chipOn]}>
                <Text style={[s.chipText, propertyType === item.id && s.chipTextOn]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={s.label}>AVAILABILITY</Text>
          <View style={s.chips}>
            {PROPERTY_AVAILABILITY.map((item) => (
              <Pressable accessibilityRole="button" key={item.id} onPress={() => setPropertyAvailability(item.id)} style={[s.chip, propertyAvailability === item.id && s.chipOn]}>
                <Text style={[s.chipText, propertyAvailability === item.id && s.chipTextOn]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: propertyFurnished }} onPress={() => setPropertyFurnished((value) => !value)} style={s.guardianRow}>
            <View style={[s.guardianBox, propertyFurnished && s.guardianBoxOn]}>{propertyFurnished && <Text style={s.guardianTick}>✓</Text>}</View>
            <View style={{ flex: 1 }}>
              <Text style={s.guardianTitle}>Furnished</Text>
              <Text style={s.guardianHint}>The place includes the essential furniture shown in the listing.</Text>
            </View>
          </Pressable>
        </>
      )}

      {type === "opportunity" && (
        <>
          <Text style={s.label}>OPPORTUNITY TYPE</Text>
          <View style={s.chips}>
            {OPPORTUNITY_KINDS.map((k) => (
              <Pressable accessibilityRole="button" key={k.id} onPress={() => setOpportunityKind(k.id)} style={[s.chip, opportunityKind === k.id && s.chipOn]}>
                <Text style={[s.chipText, opportunityKind === k.id && s.chipTextOn]}>{k.label}</Text>
              </Pressable>
            ))}
          </View>
          {opportunityKind === "mentorship" && (
            <Pressable accessibilityRole="button" onPress={() => setGuardianConsentRequired((v) => !v)} style={s.guardianRow}>
              <View style={[s.guardianBox, guardianConsentRequired && s.guardianBoxOn]}>{guardianConsentRequired && <Text style={s.guardianTick}>✓</Text>}</View>
              <View style={{ flex: 1 }}>
                <Text style={s.guardianTitle}>Require guardian consent for minors</Text>
                <Text style={s.guardianHint}>Mandatory when mentorship includes under-18 participants.</Text>
              </View>
            </Pressable>
          )}
        </>
      )}

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
          <DateField value={diedDate} onChange={setDiedDate} placeholder="Pick a date" maxDate={todayIso} />

          <Text style={s.label}>EPITAPH (OPTIONAL)</Text>
          <TextInput
            style={s.input}
            value={epitaph}
            onChangeText={setEpitaph}
            placeholder="A short line in their memory"
            placeholderTextColor={C.inkFaint}
          />

          <Text style={s.label}>BIRTHDAY (OPTIONAL)</Text>
          <DateField value={birthday} onChange={setBirthday} placeholder="Pick a date" maxDate={todayIso} />

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

      <Pressable accessibilityRole="button" onPress={submit} disabled={busy} style={[s.btn, busy && { opacity: 0.6 }]}>
        <Text style={s.btnText}>{busy ? "Submitting…" : "Submit for review"}</Text>
      </Pressable>
      <Text style={s.note}>Submitted as {member.displayName}. Your phone number stays private.</Text>
      </View>
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => ({
  ...makeFormStyles(C),
  ...StyleSheet.create({
    chipOn: { borderColor: C.green, backgroundColor: C.green },
    chipTextOn: { color: ON_GREEN },
    btn: { backgroundColor: C.green, borderRadius: 999, paddingVertical: 14, alignItems: "center", marginTop: 22 },
    btnOutline: { borderWidth: 1, borderColor: C.sand, borderRadius: 999, paddingVertical: 13, alignItems: "center", marginTop: 12 },
    btnOutlineText: { color: C.ink, ...S(600) },
    guardianRow: { marginTop: 8, flexDirection: "row", gap: 10, borderWidth: 1, borderColor: C.sand, borderRadius: 12, backgroundColor: C.paper, padding: 12 },
    guardianBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: C.sand, alignItems: "center", justifyContent: "center", marginTop: 1 },
    guardianBoxOn: { backgroundColor: C.green, borderColor: C.green },
    guardianTick: { color: ON_GREEN, ...S(700), fontSize: 12 },
    guardianTitle: { color: C.ink, ...D(600), fontSize: 13 },
    guardianHint: { color: C.inkFaint, fontSize: 11, marginTop: 3 },
  }),
});
