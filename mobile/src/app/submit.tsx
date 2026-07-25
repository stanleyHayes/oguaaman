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
import { ON_GREEN, type Palette, S, D, withAlpha } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import type { ArtistRelease, SocialLink } from "@/lib/types";
import { StreamingPlatformPicker } from "@/components/streaming-platform-picker";
import { GenrePicker } from "@/components/genre-picker";
import { PropertyTypePicker, type PropertyType } from "@/components/property-type-picker";
import { AmenitiesPicker } from "@/components/amenities-picker";
import { BusinessCategoryPicker } from "@/components/business-category-picker";
import { EventDetailsFields, EMPTY_EVENT_DETAILS, type EventDetailsDraft } from "@/components/event-details-fields";

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

const PROPERTY_AVAILABILITY = [
  { id: "available", label: "Available" },
  { id: "reserved", label: "Reserved" },
  { id: "let", label: "Let" },
] as const;

const OPPORTUNITY_KINDS = [
  { id: "scholarship", label: "Scholarship", hint: "Funding for study", mark: "⌑" }, { id: "internship", label: "Internship", hint: "Workplace experience", mark: "▣" }, { id: "apprenticeship", label: "Apprenticeship", hint: "Learn a skilled trade", mark: "⚒" }, { id: "training", label: "Training", hint: "Build practical skills", mark: "✎" }, { id: "job", label: "Job", hint: "Paid employment", mark: "✓" }, { id: "investment", label: "Investment", hint: "Funding or partnership", mark: "₵" }, { id: "mentorship", label: "Mentorship", hint: "Guidance and support", mark: "◎" },
] as const;

// Per-type extra fields, mirroring the web submit form so phone submissions
// arrive with the same structure curators expect (memorial has its own block).
interface ExtraField { key: string; label: string; placeholder: string; kind?: "date" }
const TYPE_FIELDS: Record<string, ExtraField[]> = {
  artist: [],
  business: [
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
    { key: "contactUrl", label: "CONTACT LINK", placeholder: "https://wa.me/233… or tel:+233…" },
    { key: "bookingUrl", label: "BOOKING LINK (OPTIONAL)", placeholder: "https://…" },
  ],
  event: [
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

function newArtistRelease(): ArtistRelease {
  return { id: `release-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, title: "", kind: "single", tracks: [] };
}

// Fold in the per-type extras. The artist catalogue is controlled separately
// because it is a structured collection rather than a single text field.
function addTypeExtras(details: Record<string, unknown>, type: string, extra: Record<string, string>) {
  for (const f of TYPE_FIELDS[type] ?? []) {
    const v = (extra[f.key] ?? "").trim();
    if (!v) continue;
    if (f.key === "amenities") details.amenities = v.split(",").map((g) => g.trim()).filter(Boolean);
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
    propertyType: PropertyType;
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
  const [propertyType, setPropertyType] = useState<PropertyType>("apartment");
  const [propertyAvailability, setPropertyAvailability] = useState<(typeof PROPERTY_AVAILABILITY)[number]["id"]>("available");
  const [propertyFurnished, setPropertyFurnished] = useState(false);
  const [propertyAmenities, setPropertyAmenities] = useState<string[]>([]);
  const [artistStreamingLinks, setArtistStreamingLinks] = useState<SocialLink[]>([]);
  const [artistGenres, setArtistGenres] = useState<string[]>([]);
  const [artistSocialLinks, setArtistSocialLinks] = useState<SocialLink[]>([]);
  const [businessSocialLinks, setBusinessSocialLinks] = useState<SocialLink[]>([]);
  const [businessCategories, setBusinessCategories] = useState<string[]>([]);
  const [artistBooking, setArtistBooking] = useState("");
  const [artistReleases, setArtistReleases] = useState<ArtistRelease[]>([]);
  const [eventStartsAt, setEventStartsAt] = useState("");
  const [eventEndsAt, setEventEndsAt] = useState("");
  const [eventDetails, setEventDetails] = useState<EventDetailsDraft>(EMPTY_EVENT_DETAILS);
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
    setPropertyAmenities([]);
    setArtistStreamingLinks([]);
    setArtistGenres([]);
    setArtistSocialLinks([]);
    setBusinessSocialLinks([]);
    setBusinessCategories([]);
    setArtistBooking("");
    setArtistReleases([]);
    setEventStartsAt("");
    setEventEndsAt("");
    setEventDetails(EMPTY_EVENT_DETAILS);
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
    if (type === "event" && eventStartsAt && eventEndsAt && eventEndsAt < eventStartsAt) {
      setError("The end date cannot be before the start date.");
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
    if (type === "artist") {
      details.actName = t;
      details.genres = artistGenres;
      details.streamingLinks = artistStreamingLinks.map((link) => ({ label: link.label.trim(), url: link.url.trim() })).filter((link) => link.label && link.url);
      details.socials = artistSocialLinks.map((link) => ({ label: link.label.trim(), url: link.url.trim() })).filter((link) => link.label && link.url);
      details.releases = artistReleases.map((release) => ({ ...release, title: release.title.trim(), description: release.description?.trim() || undefined, coverImageUrl: release.coverImageUrl?.trim() || undefined, url: release.url?.trim() || undefined, tracks: (release.tracks ?? []).map((track) => ({ title: track.title.trim() })).filter((track) => track.title) })).filter((release) => release.title);
      if (artistBooking.trim()) details.booking = artistBooking.trim();
    }
    if (type === "business") {
      if (!businessCategories.length) {
        setError("Choose at least one business category.");
        setBusy(false);
        return;
      }
      details.category = businessCategories[0];
      details.categories = businessCategories;
      details.contact = businessSocialLinks.map((link) => ({ label: link.label.trim(), url: link.url.trim() })).filter((link) => link.label && link.url);
    }
    if (type === "event") {
      if (eventStartsAt) details.startsAt = eventStartsAt;
      if (eventEndsAt) details.endsAt = eventEndsAt;
      details.eventFormat = eventDetails.format;
      details.audience = eventDetails.audience;
      details.admission = eventDetails.admission;
      for (const key of ["organiser", "contactInfo", "startTime", "endTime", "ageGuidance", "accessibility", "dressCode", "refundPolicy"] as const) if (eventDetails[key].trim()) details[key] = eventDetails[key].trim();
      details.highlights = eventDetails.highlights.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
      details.featuredGuests = eventDetails.featuredGuests.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
      if (eventDetails.admission === "paid") {
        const tiers = eventDetails.tiers.map((tier) => ({ name: tier.name.trim(), pricePesewas: Math.round(Number(tier.priceGhs) * 100), capacity: Number.parseInt(tier.capacity || "0", 10) || 0 })).filter((tier) => tier.name && tier.pricePesewas > 0);
        if (!tiers.length) { setError("Add at least one paid ticket type with a name and price."); setBusy(false); return; }
        details.tiers = tiers;
      }
    }
    if (type === "property" && typeof details.pricePesewas !== "number") {
      setError("Add a valid price for this property.");
      setBusy(false);
      return;
    }
    if (type === "property") details.amenities = propertyAmenities;
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

      {type === "event" && (
        <>
        <View style={s.artistBuilder}>
          <Text style={s.builderKicker}>EVENT SCHEDULE</Text>
          <Text style={s.builderTitle}>When does it happen?</Text>
          <Text style={s.builderBody}>Leave the end date empty for a one-day event.</Text>
          <Text style={s.label}>START DATE</Text>
          <DateField value={eventStartsAt} onChange={(value) => { setEventStartsAt(value); if (eventEndsAt && eventEndsAt < value) setEventEndsAt(""); }} placeholder="Pick start date" />
          <Text style={s.label}>END DATE (OPTIONAL)</Text>
          <DateField value={eventEndsAt} onChange={setEventEndsAt} minDate={eventStartsAt || undefined} placeholder="Same day" />
          {eventEndsAt ? <Text style={s.builderKicker}>MULTI-DAY EVENT</Text> : null}
        </View>
        <EventDetailsFields value={eventDetails} onChange={setEventDetails} />
        </>
      )}

      {type === "business" && (
        <View style={s.artistBuilder}>
          <BusinessCategoryPicker value={businessCategories} onChange={setBusinessCategories} />
          <View style={s.builderDivider} />
          <Text style={s.builderKicker}>OFFICIAL PAGES</Text>
          <Text style={s.builderTitle}>Social media and website</Text>
          <Text style={s.builderBody}>Choose each platform and paste the business&apos;s official page.</Text>
          {businessSocialLinks.map((link, index) => (
            <View key={`business-social-${index}`} style={s.linkEditor}>
              <StreamingPlatformPicker kind="social" value={link.label} onChange={(label) => setBusinessSocialLinks((current) => current.map((item, i) => i === index ? { ...item, label } : item))} />
              <TextInput style={s.input} value={link.url} onChangeText={(url) => setBusinessSocialLinks((current) => current.map((item, i) => i === index ? { ...item, url } : item))} placeholder="https://…" placeholderTextColor={C.inkFaint} autoCapitalize="none" keyboardType="url" />
              <Pressable accessibilityRole="button" onPress={() => setBusinessSocialLinks((current) => current.filter((_, i) => i !== index))} style={s.removeButton}><Text style={s.removeText}>Remove</Text></Pressable>
            </View>
          ))}
          <Pressable accessibilityRole="button" onPress={() => setBusinessSocialLinks((current) => [...current, { label: "Website", url: "" }])} style={s.addButton}><Text style={s.addButtonText}>+ Add social platform</Text></Pressable>
        </View>
      )}

      {type === "artist" && (
        <View style={s.artistBuilder}>
          <GenrePicker value={artistGenres} onChange={setArtistGenres} />
          <View style={s.builderDivider} />
          <Text style={s.builderKicker}>LISTENING DESTINATIONS</Text>
          <Text style={s.builderTitle}>Streaming platforms</Text>
          <Text style={s.builderBody}>Add every service where fans can find you. There is no platform limit.</Text>
          {artistStreamingLinks.map((link, index) => (
            <View key={`stream-${index}`} style={s.linkEditor}>
              <StreamingPlatformPicker value={link.label} onChange={(label) => setArtistStreamingLinks((current) => current.map((item, i) => i === index ? { ...item, label } : item))} />
              <TextInput style={s.input} value={link.url} onChangeText={(url) => setArtistStreamingLinks((current) => current.map((item, i) => i === index ? { ...item, url } : item))} placeholder="https://…" placeholderTextColor={C.inkFaint} autoCapitalize="none" keyboardType="url" />
              <Pressable accessibilityRole="button" onPress={() => setArtistStreamingLinks((current) => current.filter((_, i) => i !== index))} style={s.removeButton}><Text style={s.removeText}>Remove</Text></Pressable>
            </View>
          ))}
          <Pressable accessibilityRole="button" onPress={() => setArtistStreamingLinks((current) => [...current, { label: "Spotify", url: "" }])} style={s.addButton}><Text style={s.addButtonText}>+ Add streaming platform</Text></Pressable>

          <View style={s.builderDivider} />
          <Text style={s.builderKicker}>OFFICIAL PAGES</Text>
          <Text style={s.builderTitle}>Social media</Text>
          <Text style={s.builderBody}>Select the platform so the page is labelled consistently.</Text>
          {artistSocialLinks.map((link, index) => (
            <View key={`artist-social-${index}`} style={s.linkEditor}>
              <StreamingPlatformPicker kind="social" value={link.label} onChange={(label) => setArtistSocialLinks((current) => current.map((item, i) => i === index ? { ...item, label } : item))} />
              <TextInput style={s.input} value={link.url} onChangeText={(url) => setArtistSocialLinks((current) => current.map((item, i) => i === index ? { ...item, url } : item))} placeholder="https://…" placeholderTextColor={C.inkFaint} autoCapitalize="none" keyboardType="url" />
              <Pressable accessibilityRole="button" onPress={() => setArtistSocialLinks((current) => current.filter((_, i) => i !== index))} style={s.removeButton}><Text style={s.removeText}>Remove</Text></Pressable>
            </View>
          ))}
          <Pressable accessibilityRole="button" onPress={() => setArtistSocialLinks((current) => [...current, { label: "Instagram", url: "" }])} style={s.addButton}><Text style={s.addButtonText}>+ Add social platform</Text></Pressable>

          <Text style={s.label}>EXTERNAL MANAGEMENT PAGE (OPTIONAL)</Text>
          <TextInput style={s.input} value={artistBooking} onChangeText={setArtistBooking} placeholder="https://booking.example.com/artist" placeholderTextColor={C.inkFaint} autoCapitalize="none" keyboardType="url" />

          <View style={s.builderDivider} />
          <Text style={s.builderKicker}>DISCOGRAPHY</Text>
          <Text style={s.builderTitle}>Albums, EPs and songs</Text>
          <Text style={s.builderBody}>Add artwork, release details and track titles. Oguaa lists the catalogue but does not host audio.</Text>
          {artistReleases.map((release, index) => (
            <View key={release.id ?? `release-${index}`} style={s.releaseEditor}>
              <View style={s.releaseEditorHead}><Text style={s.releaseEditorTitle}>{String(index + 1).padStart(2, "0")} · {release.title || "Untitled release"}</Text><Pressable accessibilityRole="button" onPress={() => setArtistReleases((current) => current.filter((_, i) => i !== index))}><Text style={s.removeText}>Remove</Text></Pressable></View>
              <Text style={s.label}>RELEASE ARTWORK</Text><ImageField value={release.coverImageUrl ?? ""} onChange={(coverImageUrl) => setArtistReleases((current) => current.map((item, i) => i === index ? { ...item, coverImageUrl } : item))} />
              <Text style={s.label}>RELEASE TITLE</Text><TextInput style={s.input} value={release.title} onChangeText={(titleValue) => setArtistReleases((current) => current.map((item, i) => i === index ? { ...item, title: titleValue } : item))} placeholderTextColor={C.inkFaint} />
              <Text style={s.label}>TYPE</Text><View style={s.chips}>{(["album", "ep", "single", "mixtape", "live", "compilation"] as const).map((kind) => <Pressable accessibilityRole="button" key={kind} onPress={() => setArtistReleases((current) => current.map((item, i) => i === index ? { ...item, kind } : item))} style={[s.chip, release.kind === kind && s.chipOn]}><Text style={[s.chipText, release.kind === kind && s.chipTextOn]}>{kind.toUpperCase()}</Text></Pressable>)}</View>
              <Text style={s.label}>YEAR</Text><TextInput style={s.input} value={release.year ? String(release.year) : ""} onChangeText={(value) => setArtistReleases((current) => current.map((item, i) => i === index ? { ...item, year: value ? Number(value) : undefined } : item))} keyboardType="number-pad" placeholderTextColor={C.inkFaint} />
              <Text style={s.label}>ABOUT THIS RELEASE</Text><TextInput style={[s.input, s.area]} value={release.description ?? ""} onChangeText={(descriptionValue) => setArtistReleases((current) => current.map((item, i) => i === index ? { ...item, description: descriptionValue } : item))} multiline placeholderTextColor={C.inkFaint} />
              <Text style={s.label}>TRACKLIST · ONE TITLE PER LINE</Text><TextInput style={[s.input, s.trackArea]} value={(release.tracks ?? []).map((track) => track.title).join("\n")} onChangeText={(value) => setArtistReleases((current) => current.map((item, i) => i === index ? { ...item, tracks: value.split("\n").map((trackTitle) => ({ title: trackTitle.trim() })).filter((track) => track.title) } : item))} multiline placeholderTextColor={C.inkFaint} />
              <Text style={s.label}>PRIMARY RELEASE LINK</Text><TextInput style={s.input} value={release.url ?? ""} onChangeText={(url) => setArtistReleases((current) => current.map((item, i) => i === index ? { ...item, url } : item))} autoCapitalize="none" keyboardType="url" placeholder="https://…" placeholderTextColor={C.inkFaint} />
            </View>
          ))}
          <Pressable accessibilityRole="button" onPress={() => setArtistReleases((current) => [...current, newArtistRelease()])} style={s.addReleaseButton}><Text style={s.addReleaseButtonText}>+ Add an album, EP or single</Text></Pressable>
        </View>
      )}

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
          <PropertyTypePicker value={propertyType} onChange={setPropertyType} />
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
          <AmenitiesPicker value={propertyAmenities} onChange={setPropertyAmenities} />
        </>
      )}

      {type === "opportunity" && (
        <>
          <Text style={s.label}>OPPORTUNITY TYPE</Text>
          <Text style={s.opportunityIntro}>Choose the format that best matches what you are offering.</Text>
          <View style={s.opportunityGrid}>
            {OPPORTUNITY_KINDS.map((k) => (
              <Pressable accessibilityRole="button" accessibilityState={{ selected: opportunityKind === k.id }} key={k.id} onPress={() => setOpportunityKind(k.id)} style={[s.opportunityCard, opportunityKind === k.id && s.opportunityCardOn]}>
                <Text style={s.opportunityWatermark}>{k.mark}</Text>
                <Text style={[s.opportunityTitle, opportunityKind === k.id && s.opportunityTitleOn]}>{k.label}</Text>
                <Text style={s.opportunityHint}>{k.hint}</Text>
                <View style={[s.opportunityCheck, opportunityKind === k.id && s.opportunityCheckOn]}><Text style={[s.opportunityTick, opportunityKind !== k.id && { color: "transparent" }]}>✓</Text></View>
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
    artistBuilder: { marginTop: 12, borderWidth: 1, borderColor: C.goldBorder35, borderRadius: 16, backgroundColor: C.goldTint14, padding: 14 },
    builderKicker: { color: C.goldText, fontSize: 10, letterSpacing: 1.5, ...S(700), marginTop: 4 },
    builderTitle: { color: C.ink, ...D(700), fontSize: 22, lineHeight: 27, marginTop: 5 },
    builderBody: { color: C.inkMuted, fontSize: 12.5, lineHeight: 19, marginTop: 6, marginBottom: 10 },
    linkEditor: { gap: 8, borderWidth: 1, borderColor: C.sand, borderRadius: 12, backgroundColor: C.paper, padding: 10, marginTop: 9 },
    removeButton: { minHeight: 38, alignSelf: "flex-start", justifyContent: "center", paddingHorizontal: 12, borderRadius: 9, borderWidth: 1, borderColor: C.maroon },
    removeText: { color: C.maroonText, fontSize: 12, ...S(700) },
    addButton: { minHeight: 43, alignSelf: "flex-start", justifyContent: "center", marginTop: 10, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: C.green },
    addButtonText: { color: C.greenText, fontSize: 13, ...S(700) },
    builderDivider: { height: 1, backgroundColor: C.sand, marginVertical: 22 },
    releaseEditor: { borderWidth: 1, borderColor: C.sand, borderRadius: 14, backgroundColor: C.paper, padding: 12, marginTop: 12 },
    releaseEditorHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.sand },
    releaseEditorTitle: { flex: 1, color: C.ink, fontSize: 14, ...S(700) },
    trackArea: { minHeight: 130, textAlignVertical: "top" },
    addReleaseButton: { minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 2, borderStyle: "dashed", borderColor: C.sand, backgroundColor: C.paper },
    addReleaseButtonText: { color: C.greenText, fontSize: 13, ...S(700) },
    guardianRow: { marginTop: 8, flexDirection: "row", gap: 10, borderWidth: 1, borderColor: C.sand, borderRadius: 12, backgroundColor: C.paper, padding: 12 },
    guardianBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: C.sand, alignItems: "center", justifyContent: "center", marginTop: 1 },
    guardianBoxOn: { backgroundColor: C.green, borderColor: C.green },
    guardianTick: { color: ON_GREEN, ...S(700), fontSize: 12 },
    guardianTitle: { color: C.ink, ...D(600), fontSize: 13 },
    guardianHint: { color: C.inkFaint, fontSize: 11, marginTop: 3 },
    opportunityIntro: { color: C.inkFaint, fontSize: 12, lineHeight: 18, marginTop: 5 },
    opportunityGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
    opportunityCard: { width: "48.5%", minHeight: 72, justifyContent: "center", borderWidth: 1, borderColor: C.sand, borderRadius: 12, backgroundColor: C.paper, paddingVertical: 11, paddingLeft: 12, paddingRight: 36 },
    opportunityCardOn: { borderColor: C.teal, backgroundColor: withAlpha(C.teal, 0.09) },
    opportunityTitle: { color: C.inkMuted, fontSize: 13, ...S(700) },
    opportunityTitleOn: { color: C.tealText },
    opportunityHint: { color: C.inkFaint, fontSize: 10.5, lineHeight: 15, marginTop: 3 },
    opportunityCheck: { position: "absolute", right: 10, top: 10, width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: C.sand, alignItems: "center", justifyContent: "center" },
    opportunityCheckOn: { backgroundColor: C.teal, borderColor: C.teal },
    opportunityTick: { color: ON_GREEN, fontSize: 10, ...S(700) },
    opportunityWatermark: { position: "absolute", right: 1, bottom: -16, color: C.ink, opacity: 0.05, fontSize: 54, ...S(700) },
  }),
});
