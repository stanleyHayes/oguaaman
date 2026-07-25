import { useMemo, useState } from "react";
import { ROUTES } from "@/lib/routes";
import { replace } from "@/lib/router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { T as Text, TI as TextInput } from "@/components/typography";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth";
import type { ArtistRelease, Listing, ListingDetails, MemberView, SocialLink } from "@/lib/types";
import { D, S, ON_GREEN, withAlpha, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { Loading, ErrorView } from "@/ui";
import { DateField } from "@/components/date-field";
import { ImageField } from "@/components/image-field";
import { StreamingPlatformPicker } from "@/components/streaming-platform-picker";
import { GenrePicker } from "@/components/genre-picker";
import { makeFormStyles } from "@/components/form-styles";
import { PropertyTypePicker } from "@/components/property-type-picker";
import { AmenitiesPicker, normalizeAmenities } from "@/components/amenities-picker";
import { BusinessCategoryPicker } from "@/components/business-category-picker";
import { EventDetailsFields, EMPTY_EVENT_DETAILS, type EventDetailsDraft } from "@/components/event-details-fields";

/*
 * Edit listing — ports creator/src/pages/EditListing.tsx to the dedicated mobile
 * route registered in phase 1 (/listings/{id}/edit). Loads an owned listing from
 * the member's own view (which carries every listing they own, at every status),
 * prefills a per-type form, and full-replaces via api.updateListing. Whitelisted
 * detail keys the form doesn't manage (streamingLinks, services, gallery…) are
 * passed through untouched so a save never erases richer data. Approved listings
 * stay live; anything else re-queues for review.
 */

const TYPE_LABELS: Record<string, string> = {
  business: "Business", artist: "Artist", person: "Person", memory: "Memory",
  property: "Property",
  event: "Event", opportunity: "Opportunity", memorial: "Memorial",
};

const COVER_COPY: Record<string, { label: string; hint: string }> = {
  artist: { label: "Photo", hint: "A promo shot, performance photo, or portrait of the act." },
  business: { label: "Photo or logo", hint: "Your storefront, a product, or the business logo." },
  property: { label: "Property photo", hint: "A clear, current view of the room, home or guesthouse." },
  event: { label: "Poster or photo", hint: "The event flyer, or a photo that represents it." },
  memory: { label: "Old photo", hint: "A photograph from the time, if you have one to share." },
  opportunity: { label: "Flyer or poster", hint: "The opportunity's flyer or poster, if there is one." },
  person: { label: "Photo", hint: "A portrait or a representative photo of them." },
  memorial: { label: "Portrait", hint: "A dignified portrait of the departed." },
};

// The primary free-text field of each type.
const TEXT_FIELD: Record<string, { name: string; label: string }> = {
  artist: { name: "bio", label: "Bio" },
  business: { name: "description", label: "Short description" },
  property: { name: "description", label: "Property description" },
  event: { name: "description", label: "Description" },
  memory: { name: "text", label: "Your memory" },
  opportunity: { name: "eligibility", label: "Eligibility" },
  person: { name: "whyNotable", label: "Why notable" },
  memorial: { name: "lifeStory", label: "Life story" },
};

// Simple (single-line) detail keys the form manages per type, rendered generically.
const SIMPLE_KEYS: Record<string, string[]> = {
  artist: [],
  business: ["address"],
  property: ["area", "address", "pricePesewas", "depositPesewas", "bedrooms", "bathrooms", "availableFrom", "bookingUrl"],
  event: ["venue"],
  memory: ["era"],
  opportunity: ["description", "provider", "safeguardingPolicyUrl", "minAge", "maxAge", "applyUrl"],
  person: ["era"],
  memorial: ["honorific", "bornYear", "birthday", "epitaph", "associations"],
};
const LIST_KEYS = new Set(["associations"]);

// Detail keys the form manages per type (mirrors web MANAGED_KEYS) — anything
// whitelisted but NOT here is passed through untouched from the stored listing.
const MANAGED_KEYS: Record<string, string[]> = {
  artist: ["genres", "link", "bio", "actName", "streamingLinks", "socials", "booking", "releases"],
  business: ["category", "categories", "address", "description"],
  property: ["offerType", "propertyType", "area", "description", "address", "pricePesewas", "pricePeriod", "depositPesewas", "bedrooms", "bathrooms", "furnished", "availability", "availableFrom", "amenities", "bookingUrl"],
  event: ["startsAt", "endsAt", "venue", "description", "organiser", "eventFormat", "audience", "admission", "startTime", "endTime", "highlights", "featuredGuests", "ageGuidance", "accessibility", "dressCode", "contactInfo", "refundPolicy", "tiers"],
  memory: ["era", "text"],
  opportunity: ["kind", "description", "applyUrl", "eligibility", "provider", "safeguardingPolicyUrl", "minAge", "maxAge", "guardianConsentRequired"],
  person: ["era", "whyNotable"],
  memorial: ["honorific", "bornYear", "diedDate", "birthday", "epitaph", "associations", "lifeStory", "observeBirthday", "remindersEnabled"],
};

// The server's per-type whitelist (mirror of editableDetailsKeys in Go).
const WHITELIST: Record<string, string[]> = {
  artist: ["actName", "genres", "bio", "link", "streamingLinks", "socials", "booking", "releases"],
  business: ["category", "categories", "description", "address", "openingHours", "services", "contact"],
  property: ["offerType", "propertyType", "area", "description", "address", "pricePesewas", "pricePeriod", "depositPesewas", "bedrooms", "bathrooms", "furnished", "availability", "availableFrom", "amenities", "contact", "bookingUrl", "gallery"],
  event: ["description", "startsAt", "endsAt", "venue", "organiser", "eventFormat", "audience", "admission", "startTime", "endTime", "highlights", "featuredGuests", "ageGuidance", "accessibility", "dressCode", "contactInfo", "refundPolicy", "tiers"],
  memory: ["text", "era"],
  opportunity: ["kind", "description", "eligibility", "deadline", "applyUrl", "provider", "safeguardingPolicyUrl", "minAge", "maxAge", "guardianConsentRequired"],
  person: ["whyNotable", "era"],
  memorial: ["honorific", "bornYear", "diedDate", "birthday", "epitaph", "lifeStory", "associations", "gallery", "observeBirthday", "remindersEnabled"],
};

const FIELD_META: Record<string, { label: string; hint?: string; url?: boolean; numeric?: boolean; area?: boolean }> = {
  category: { label: "Category / sector" },
  area: { label: "Area / neighbourhood", hint: "e.g. Pedu, Abura, Amamoma" },
  address: { label: "Location / address" },
  pricePesewas: { label: "Price (GH₵)", numeric: true },
  depositPesewas: { label: "Deposit / advance (GH₵, optional)", numeric: true },
  bedrooms: { label: "Bedrooms (optional)", numeric: true },
  bathrooms: { label: "Bathrooms (optional)", numeric: true },
  availableFrom: { label: "Available from", hint: "YYYY-MM-DD" },
  amenities: { label: "Amenities", hint: "Comma-separated — water, Wi-Fi, parking…" },
  bookingUrl: { label: "Booking link (optional)", url: true },
  venue: { label: "Venue / location" },
  era: { label: "Era", hint: "e.g. 1980s / Colonial era" },
  description: { label: "Description", area: true },
  provider: { label: "Provider / programme owner" },
  safeguardingPolicyUrl: { label: "Safeguarding / policy link", hint: "Required for mentorship.", url: true },
  minAge: { label: "Minimum age (optional)", numeric: true },
  maxAge: { label: "Maximum age (optional)", numeric: true },
  applyUrl: { label: "How to apply (link)", hint: "Information and outbound links only.", url: true },
  honorific: { label: "Honorific (optional)", hint: "e.g. Nana, Maame, Dr." },
  bornYear: { label: "Year of birth (optional)", numeric: true },
  birthday: { label: "Birthday (optional)", hint: "MM-DD, for yearly remembrance" },
  epitaph: { label: "Epitaph (optional)", hint: "A short line of remembrance" },
  associations: { label: "Associations (optional)", hint: "Comma-separated — schools, asafo, churches…" },
};

const OPPORTUNITY_KINDS = [
  { id: "scholarship", label: "Scholarship", hint: "Funding for study", mark: "⌑" }, { id: "internship", label: "Internship", hint: "Workplace experience", mark: "▣" }, { id: "apprenticeship", label: "Apprenticeship", hint: "Learn a skilled trade", mark: "⚒" }, { id: "training", label: "Training", hint: "Build practical skills", mark: "✎" }, { id: "job", label: "Job", hint: "Paid employment", mark: "✓" }, { id: "investment", label: "Investment", hint: "Funding or partnership", mark: "₵" }, { id: "mentorship", label: "Mentorship", hint: "Guidance and support", mark: "◎" },
] as const;

const PROPERTY_OFFERS = [
  { id: "long-term", label: "Rent monthly" },
  { id: "short-stay", label: "Book a stay" },
] as const;
const PROPERTY_AVAILABILITY = ["available", "reserved", "let"] as const;

function str(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}
function strList(v: unknown): string {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").join(", ") : "";
}
function stringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((item): item is string => typeof item === "string") : [];
}
function links(v: unknown): SocialLink[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((item) => item && typeof item === "object" && typeof (item as SocialLink).label === "string" && typeof (item as SocialLink).url === "string" ? [item as SocialLink] : []);
}
function releases(v: unknown): ArtistRelease[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((item, index) => item && typeof item === "object" && typeof (item as ArtistRelease).title === "string" ? [{ ...(item as ArtistRelease), id: (item as ArtistRelease).id ?? `saved-${index}` }] : []);
}
function newRelease(): ArtistRelease {
  return { id: `release-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, title: "", kind: "single", tracks: [] };
}
function eventDraft(details: ListingDetails): EventDetailsDraft {
  const tiers = Array.isArray(details.tiers) ? details.tiers.map((tier) => ({ name: tier.name, priceGhs: String(tier.pricePesewas / 100), capacity: tier.capacity > 0 ? String(tier.capacity) : "" })) : [];
  return { ...EMPTY_EVENT_DETAILS, format: str(details.eventFormat) || "community", audience: stringList(details.audience).length ? stringList(details.audience) : ["all-ages"], admission: str(details.admission) === "paid" || tiers.length ? "paid" : "free", organiser: str(details.organiser), contactInfo: str(details.contactInfo), startTime: str(details.startTime), endTime: str(details.endTime), highlights: stringList(details.highlights).join("\n"), featuredGuests: stringList(details.featuredGuests).join("\n"), ageGuidance: str(details.ageGuidance), accessibility: str(details.accessibility), dressCode: str(details.dressCode), refundPolicy: str(details.refundPolicy), tiers };
}

function backToWork() {
  if (router.canGoBack()) router.back();
  else replace(ROUTES.studioWork);
}

export default function EditListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { member, loading: authLoading } = useAuth();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);

  const { data, loading, error } = useApi<MemberView>(
    async () => {
      if (!member) throw new Error("Not signed in");
      return api.member(member.slug);
    },
    `edit:owner:${member?.id ?? "anon"}`,
  );

  if (authLoading || (loading && member)) return <Loading />;
  if (!member) {
    return (
      <View style={s.gate}>
        <Text style={s.gateTitle}>Edit listing</Text>
        <Text style={s.gateBody}>Sign in to edit your listings.</Text>
        <Pressable accessibilityRole="button" onPress={() => router.replace(ROUTES.signIn)} style={s.primaryBtn}>
          <Text style={s.primaryBtnText}>Sign in / create account</Text>
        </Pressable>
      </View>
    );
  }
  if (error || !data) return <ErrorView message={error ?? "Couldn't load your listing"} />;

  const listing = data.listings.find((l) => l.id === id) ?? null;
  if (!listing || !WHITELIST[listing.type]) {
    return (
      <View style={s.notMineWrap}>
        <Pressable accessibilityRole="button" onPress={backToWork} style={s.backRow} hitSlop={8}>
          <Text style={s.backText}>‹ My work</Text>
        </Pressable>
        <View style={s.notMineCard}>
          <Text style={s.notMineTitle}>Not your listing to edit</Text>
          <Text style={s.notMineBody}>
            {listing
              ? "Incidents, lost & found notices and institution projects are edited through their own flows."
              : "This listing doesn't exist or belongs to someone else. Only the owner can edit a listing."}
          </Text>
          <Pressable accessibilityRole="button" onPress={backToWork} style={[s.primaryBtn, { alignSelf: "center", marginTop: 18 }]}>
            <Text style={s.primaryBtnText}>Back to My Work</Text>
          </Pressable>
        </View>
      </View>
    );
  }
  return <EditForm key={listing.id} listing={listing} />;
}

function EditForm({ listing }: Readonly<{ listing: Listing }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const type = listing.type;
  const details = listing.details;
  const textField = TEXT_FIELD[type];
  const cover = COVER_COPY[type];
  const simpleKeys = SIMPLE_KEYS[type] ?? [];

  const [title, setTitle] = useState(listing.title);
  const [coverImageUrl, setCoverImageUrl] = useState(listing.coverImageUrl ?? "");
  const [text, setText] = useState(textField ? str(details[textField.name]) : "");
  const [fields, setFields] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const k of simpleKeys) {
      if ((k === "pricePesewas" || k === "depositPesewas") && typeof details[k] === "number") init[k] = String((details[k] as number) / 100);
      else init[k] = LIST_KEYS.has(k) ? strList(details[k]) : str(details[k]);
    }
    return init;
  });
  const [startsAt, setStartsAt] = useState(str(details.startsAt));
  const [endsAt, setEndsAt] = useState(str(details.endsAt));
  const [eventDetails, setEventDetails] = useState<EventDetailsDraft>(() => eventDraft(details));
  const [diedDate, setDiedDate] = useState(str(details.diedDate));
  const [opportunityKind, setOpportunityKind] = useState<string>(str(details.kind) || "scholarship");
  const [guardianConsent, setGuardianConsent] = useState(details.guardianConsentRequired !== false);
  const [reminders, setReminders] = useState(details.remindersEnabled !== false);
  const [observeBday, setObserveBday] = useState(details.observeBirthday === true);
  const [propertyOffer, setPropertyOffer] = useState(str(details.offerType) || "long-term");
  const [propertyType, setPropertyType] = useState(str(details.propertyType) || "apartment");
  const [propertyAvailability, setPropertyAvailability] = useState(str(details.availability) || "available");
  const [propertyFurnished, setPropertyFurnished] = useState(details.furnished === true);
  const [propertyAmenities, setPropertyAmenities] = useState<string[]>(normalizeAmenities(details.amenities));
  const [artistGenres, setArtistGenres] = useState<string[]>(stringList(details.genres));
  const initialLinks = links(details.streamingLinks);
  if (initialLinks.length === 0 && str(details.link)) initialLinks.push({ label: "Music", url: str(details.link) });
  const [streamingLinks, setStreamingLinks] = useState(initialLinks);
  const [socialLinks, setSocialLinks] = useState(links(details.socials));
  const [businessContactLinks, setBusinessContactLinks] = useState(links(details.contact));
  const [businessCategories, setBusinessCategories] = useState<string[]>(stringList(details.categories).length ? stringList(details.categories) : (str(details.category) ? [str(details.category)] : []));
  const [booking, setBooking] = useState(str(details.booking));
  const [artistReleases, setArtistReleases] = useState(releases(details.releases));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState<"live" | "queued" | null>(null);

  const resubmits = listing.status !== "approved" && listing.status !== "pending";

  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const setField = (k: string, v: string) => setFields((cur) => ({ ...cur, [k]: v }));

  function buildDetails(): Record<string, unknown> {
    const d: Record<string, unknown> = {};
    for (const k of simpleKeys) {
      const v = (fields[k] ?? "").trim();
      if (!v) continue;
      if (LIST_KEYS.has(k)) d[k] = v.split(",").map((x) => x.trim()).filter(Boolean);
      else if (type === "property" && (k === "pricePesewas" || k === "depositPesewas")) {
        const amount = Number(v.replace(/,/g, ""));
        if (Number.isFinite(amount) && amount > 0) d[k] = Math.round(amount * 100);
      } else if (type === "property" && (k === "bedrooms" || k === "bathrooms")) {
        const count = Number.parseInt(v, 10);
        if (Number.isFinite(count) && count >= 0) d[k] = count;
      } else d[k] = v;
    }
    if (type === "event" && startsAt.trim()) d.startsAt = startsAt.trim();
    if (type === "event" && endsAt.trim()) d.endsAt = endsAt.trim();
    if (type === "event") {
      d.eventFormat = eventDetails.format; d.audience = eventDetails.audience; d.admission = eventDetails.admission;
      for (const key of ["organiser", "contactInfo", "startTime", "endTime", "ageGuidance", "accessibility", "dressCode", "refundPolicy"] as const) if (eventDetails[key].trim()) d[key] = eventDetails[key].trim();
      d.highlights = eventDetails.highlights.split(/\r?\n/).map((item) => item.trim()).filter(Boolean); d.featuredGuests = eventDetails.featuredGuests.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
      if (eventDetails.admission === "paid") d.tiers = eventDetails.tiers.map((tier) => ({ name: tier.name.trim(), pricePesewas: Math.round(Number(tier.priceGhs) * 100), capacity: Number.parseInt(tier.capacity || "0", 10) || 0 })).filter((tier) => tier.name && tier.pricePesewas > 0);
    }
    if (type === "memorial" && diedDate.trim()) d.diedDate = diedDate.trim();
    if (textField && text.trim()) d[textField.name] = text.trim();
    if (typeof d.bornYear === "string") {
      const n = Number.parseInt(d.bornYear, 10);
      if (Number.isFinite(n)) d.bornYear = n; else delete d.bornYear;
    }
    if (type === "artist") {
      d.actName = title.trim();
      d.genres = artistGenres;
      d.streamingLinks = streamingLinks.map((link) => ({ label: link.label.trim(), url: link.url.trim() })).filter((link) => link.label && link.url);
      d.socials = socialLinks.map((link) => ({ label: link.label.trim(), url: link.url.trim() })).filter((link) => link.label && link.url);
      d.releases = artistReleases.map((release) => ({ ...release, title: release.title.trim(), description: release.description?.trim() || undefined, coverImageUrl: release.coverImageUrl?.trim() || undefined, url: release.url?.trim() || undefined, tracks: (release.tracks ?? []).map((track) => ({ title: track.title.trim() })).filter((track) => track.title) })).filter((release) => release.title);
      if (booking.trim()) d.booking = booking.trim();
    }
    if (type === "business") {
      d.category = businessCategories[0];
      d.categories = businessCategories;
      d.contact = businessContactLinks.map((link) => ({ label: link.label.trim(), url: link.url.trim() })).filter((link) => link.label && link.url);
    }
    if (type === "memorial") {
      d.remindersEnabled = reminders;
      d.observeBirthday = observeBday;
    }
    if (type === "opportunity") {
      d.kind = opportunityKind;
      d.guardianConsentRequired = guardianConsent;
    }
    if (type === "property") {
      d.offerType = propertyOffer;
      d.propertyType = propertyType;
      d.pricePeriod = propertyOffer === "short-stay" ? "night" : "month";
      d.availability = propertyAvailability;
      d.furnished = propertyFurnished;
      d.amenities = propertyAmenities;
    }
    // Passthrough: whitelisted keys the form doesn't manage survive untouched.
    const managed = new Set(MANAGED_KEYS[type] ?? []);
    for (const k of WHITELIST[type] ?? []) {
      if (!managed.has(k) && (details as ListingDetails)[k] !== undefined && d[k] === undefined) {
        d[k] = (details as ListingDetails)[k];
      }
    }
    return d;
  }

  async function onSubmit() {
    const t = title.trim();
    if (t.length < 2) {
      setErr("Give it a title (at least 2 characters).");
      return;
    }
    if (type === "event" && startsAt && endsAt && endsAt < startsAt) {
      setErr("The end date cannot be before the start date.");
      return;
    }
    if (type === "business" && !businessCategories.length) { setErr("Choose at least one business category."); return; }
    if (type === "event" && eventDetails.admission === "paid" && !eventDetails.tiers.some((tier) => tier.name.trim() && Number(tier.priceGhs) > 0)) { setErr("Add at least one paid ticket type with a name and price."); return; }
    setBusy(true);
    setErr("");
    try {
      const updated = await api.updateListing(listing.id, {
        title: t,
        coverImageUrl: coverImageUrl.trim() || undefined,
        details: buildDetails(),
      });
      setSaved(updated.status === "approved" ? "live" : "queued");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <View style={s.savedWrap}>
        <View style={s.savedIcon}><Text style={s.savedTick}>✓</Text></View>
        <Text style={s.savedTitle}>
          {saved === "live" ? "Changes saved — still live" : "Changes saved — back in the queue"}
        </Text>
        <Text style={s.savedBody}>
          {saved === "live"
            ? "Your updates are on the public page already. A curator can spot-check the change in the audit trail."
            : "A curator will review your changes before the listing goes live again. You'll be notified."}
        </Text>
        <Pressable accessibilityRole="button" onPress={backToWork} style={[s.primaryBtn, { marginTop: 22 }]}>
          <Text style={s.primaryBtnText}>Back to My Work</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <View style={s.header}>
        <Pressable accessibilityRole="button" onPress={backToWork} style={s.backRow} hitSlop={8}>
          <Text style={s.backText}>‹ My work</Text>
        </Pressable>
        <Text style={s.kicker}>Edit {TYPE_LABELS[type] ?? type}</Text>
        <View style={s.titleRow}>
          <Text style={s.headerTitle} numberOfLines={2}>{listing.title}</Text>
          <StatusPill status={listing.status} />
        </View>
      </View>

      {resubmits && (
        <View style={[s.banner, s.bannerWarn]}>
          <Text style={s.bannerWarnText}>Saving sends this listing back to the review queue — a curator re-approves it before it&apos;s live again.</Text>
        </View>
      )}
      {listing.status === "approved" && (
        <View style={[s.banner, s.bannerLive]}>
          <Text style={s.bannerLiveText}>{type === "property"
            ? "This property is live. Availability and booking-link updates stay live; price, description or location changes return to curator review."
            : "This listing is live. Minor changes publish immediately; significant content changes return to curator review."}</Text>
        </View>
      )}

      <View style={s.formCard}>
        <Text style={s.label}>{type === "memorial" ? "NAME OF THE DEPARTED" : "TITLE / NAME"}</Text>
        <TextInput style={s.input} value={title} onChangeText={(v) => { setTitle(v); setErr(""); }} placeholder="A clear title" placeholderTextColor={C.inkFaint} />

        <Text style={s.label}>{(cover?.label ?? "Cover image").toUpperCase()}</Text>
        <ImageField value={coverImageUrl} onChange={setCoverImageUrl} />
        {cover?.hint ? <Text style={s.hint}>{cover.hint}</Text> : null}

        {type === "opportunity" && (
          <>
            <Text style={s.label}>OPPORTUNITY TYPE</Text>
            <Text style={s.opportunityIntro}>Choose the format that best matches the opportunity.</Text>
            <View style={s.opportunityGrid}>
              {OPPORTUNITY_KINDS.map((k) => (
                <Pressable accessibilityRole="button" accessibilityState={{ selected: opportunityKind === k.id }} key={k.id} onPress={() => setOpportunityKind(k.id)} style={[s.opportunityCard, opportunityKind === k.id && s.opportunityCardOn]}>
                  <Text style={s.opportunityWatermark}>{k.mark}</Text>
                  <Text style={[s.opportunityTitle, opportunityKind === k.id && s.opportunityTitleOn]}>{k.label}</Text><Text style={s.opportunityHint}>{k.hint}</Text><View style={[s.opportunityCheck, opportunityKind === k.id && s.opportunityCheckOn]}><Text style={[s.opportunityTick, opportunityKind !== k.id && { color: "transparent" }]}>✓</Text></View>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {type === "business" && (
          <View style={s.artistBuilder}>
            <BusinessCategoryPicker value={businessCategories} onChange={setBusinessCategories} />
            <View style={s.builderDivider} />
            <Text style={s.builderKicker}>OFFICIAL PAGES</Text>
            <Text style={s.builderTitle}>Social media and website</Text>
            <Text style={s.builderBody}>Select a platform and paste the business&apos;s official page.</Text>
            {businessContactLinks.map((link, index) => <LinkEditor key={`business-social-${index}`} link={link} index={index} onChange={(patch) => setBusinessContactLinks((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item))} onRemove={() => setBusinessContactLinks((current) => current.filter((_, i) => i !== index))} styles={s} palette={C} socialSelect />)}
            <Pressable accessibilityRole="button" onPress={() => setBusinessContactLinks((current) => [...current, { label: "Website", url: "" }])} style={s.addButton}><Text style={s.addButtonText}>+ Add social platform</Text></Pressable>
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
                <Pressable accessibilityRole="button" key={item} onPress={() => setPropertyAvailability(item)} style={[s.chip, propertyAvailability === item && s.chipOn]}>
                  <Text style={[s.chipText, propertyAvailability === item && s.chipTextOn]}>{item[0].toUpperCase() + item.slice(1)}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable accessibilityRole="switch" accessibilityState={{ checked: propertyFurnished }} onPress={() => setPropertyFurnished((value) => !value)} style={s.checkRow}>
              <View style={[s.checkBox, propertyFurnished && s.checkBoxOn]}>{propertyFurnished && <Text style={s.checkTick}>✓</Text>}</View>
              <View style={{ flex: 1 }}><Text style={s.checkTitle}>Furnished</Text><Text style={s.checkHint}>The listing includes the essential furniture shown.</Text></View>
            </Pressable>
            <AmenitiesPicker value={propertyAmenities} onChange={setPropertyAmenities} />
          </>
        )}

        {type === "event" && (
          <>
          <View style={s.artistBuilder}>
            <Text style={s.builderKicker}>EVENT SCHEDULE</Text>
            <Text style={s.builderTitle}>When does it happen?</Text>
            <Text style={s.builderBody}>Leave the end date empty for a one-day event.</Text>
            <Text style={s.label}>START DATE</Text>
            <DateField value={startsAt} onChange={(value) => { setStartsAt(value); if (endsAt && endsAt < value) setEndsAt(""); }} placeholder="Pick start date" />
            <Text style={s.label}>END DATE (OPTIONAL)</Text>
            <DateField value={endsAt} onChange={setEndsAt} minDate={startsAt || undefined} placeholder="Same day" />
            {endsAt ? <Text style={s.builderKicker}>MULTI-DAY EVENT</Text> : null}
          </View>
          <EventDetailsFields value={eventDetails} onChange={setEventDetails} />
          </>
        )}

        {simpleKeys.map((k) => {
          const m = FIELD_META[k] ?? { label: k };
          if (k === "bornYear") return null; // rendered in the memorial block below
          return (
            <View key={k}>
              <Text style={s.label}>{m.label.toUpperCase()}</Text>
              <TextInput
                style={[s.input, m.area && s.area]}
                value={fields[k] ?? ""}
                onChangeText={(v) => setField(k, v)}
                placeholder={m.hint ?? ""}
                placeholderTextColor={C.inkFaint}
                multiline={m.area}
                keyboardType={m.numeric ? "number-pad" : m.url ? "url" : "default"}
                autoCapitalize={m.url ? "none" : "sentences"}
              />
              {m.hint && !m.area ? <Text style={s.hint}>{m.hint}</Text> : null}
            </View>
          );
        })}

        {type === "artist" && (
          <View style={s.artistBuilder}>
            <GenrePicker value={artistGenres} onChange={setArtistGenres} />
            <View style={s.builderDivider} />
            <Text style={s.builderKicker}>LISTENING DESTINATIONS</Text>
            <Text style={s.builderTitle}>Add every platform you use</Text>
            <Text style={s.builderBody}>There is no platform cap. Add Spotify, Apple Music, YouTube Music, Audiomack, Boomplay, SoundCloud, Bandcamp, TIDAL, Deezer, Qobuz, Anghami, JOOX—or any other service.</Text>
            {streamingLinks.map((link, index) => <LinkEditor key={`stream-${index}`} link={link} index={index} onChange={(patch) => setStreamingLinks((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item))} onRemove={() => setStreamingLinks((current) => current.filter((_, i) => i !== index))} styles={s} palette={C} platformSelect />)}
            <Pressable accessibilityRole="button" onPress={() => setStreamingLinks((current) => [...current, { label: "Spotify", url: "" }])} style={s.addButton}><Text style={s.addButtonText}>+ Add another platform</Text></Pressable>

            <Text style={s.label}>EXTERNAL MANAGEMENT PAGE (OPTIONAL)</Text>
            <TextInput style={s.input} value={booking} onChangeText={setBooking} placeholder="https://… or mailto:…" placeholderTextColor={C.inkFaint} autoCapitalize="none" keyboardType="url" />

            <Text style={s.label}>SOCIALS AND WEBSITE</Text>
            {socialLinks.map((link, index) => <LinkEditor key={`social-${index}`} link={link} index={index} onChange={(patch) => setSocialLinks((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item))} onRemove={() => setSocialLinks((current) => current.filter((_, i) => i !== index))} styles={s} palette={C} socialSelect />)}
            <Pressable accessibilityRole="button" onPress={() => setSocialLinks((current) => [...current, { label: "Instagram", url: "" }])} style={s.addButton}><Text style={s.addButtonText}>+ Add a social platform</Text></Pressable>

            <View style={s.builderDivider} />
            <Text style={s.builderKicker}>DISCOGRAPHY</Text>
            <Text style={s.builderTitle}>Albums, EPs and songs</Text>
            <Text style={s.builderBody}>Add artwork, release details and a tracklist. Oguaa shows the catalogue but never hosts the audio.</Text>
            {artistReleases.map((release, index) => (
              <View key={release.id ?? `release-${index}`} style={s.releaseEditor}>
                <View style={s.releaseEditorHead}><Text style={s.releaseEditorTitle}>{String(index + 1).padStart(2, "0")} · {release.title || "Untitled release"}</Text><Pressable accessibilityRole="button" onPress={() => setArtistReleases((current) => current.filter((_, i) => i !== index))}><Text style={s.removeText}>Remove</Text></Pressable></View>
                <Text style={s.label}>RELEASE ARTWORK</Text>
                <ImageField value={release.coverImageUrl ?? ""} onChange={(coverImageUrl) => setArtistReleases((current) => current.map((item, i) => i === index ? { ...item, coverImageUrl } : item))} />
                <Text style={s.label}>RELEASE TITLE</Text><TextInput style={s.input} value={release.title} onChangeText={(value) => setArtistReleases((current) => current.map((item, i) => i === index ? { ...item, title: value } : item))} placeholderTextColor={C.inkFaint} />
                <Text style={s.label}>TYPE</Text><View style={s.chips}>{(["album", "ep", "single", "mixtape", "live", "compilation"] as const).map((kind) => <Pressable accessibilityRole="button" key={kind} onPress={() => setArtistReleases((current) => current.map((item, i) => i === index ? { ...item, kind } : item))} style={[s.chip, release.kind === kind && s.chipOn]}><Text style={[s.chipText, release.kind === kind && s.chipTextOn]}>{kind.toUpperCase()}</Text></Pressable>)}</View>
                <Text style={s.label}>YEAR</Text><TextInput style={s.input} value={release.year ? String(release.year) : ""} onChangeText={(value) => setArtistReleases((current) => current.map((item, i) => i === index ? { ...item, year: value ? Number(value) : undefined } : item))} keyboardType="number-pad" placeholderTextColor={C.inkFaint} />
                <Text style={s.label}>ABOUT THIS RELEASE</Text><TextInput style={[s.input, s.area]} value={release.description ?? ""} onChangeText={(value) => setArtistReleases((current) => current.map((item, i) => i === index ? { ...item, description: value } : item))} multiline placeholderTextColor={C.inkFaint} />
                <Text style={s.label}>TRACKLIST · ONE TITLE PER LINE</Text><TextInput style={[s.input, s.trackArea]} value={(release.tracks ?? []).map((track) => track.title).join("\n")} onChangeText={(value) => setArtistReleases((current) => current.map((item, i) => i === index ? { ...item, tracks: value.split("\n").map((trackTitle) => ({ title: trackTitle.trim() })).filter((track) => track.title) } : item))} multiline placeholderTextColor={C.inkFaint} />
                <Text style={s.label}>PRIMARY RELEASE LINK</Text><TextInput style={s.input} value={release.url ?? ""} onChangeText={(value) => setArtistReleases((current) => current.map((item, i) => i === index ? { ...item, url: value } : item))} autoCapitalize="none" keyboardType="url" placeholder="https://…" placeholderTextColor={C.inkFaint} />
              </View>
            ))}
            <Pressable accessibilityRole="button" onPress={() => setArtistReleases((current) => [...current, newRelease()])} style={s.addReleaseButton}><Text style={s.addReleaseButtonText}>+ Add an album, EP or single</Text></Pressable>
          </View>
        )}

        {type === "opportunity" && (
          <Pressable accessibilityRole="button" onPress={() => setGuardianConsent((v) => !v)} style={s.checkRow}>
            <View style={[s.checkBox, guardianConsent && s.checkBoxOn]}>{guardianConsent && <Text style={s.checkTick}>✓</Text>}</View>
            <View style={{ flex: 1 }}>
              <Text style={s.checkTitle}>Require guardian consent for minors</Text>
              <Text style={s.checkHint}>Mandatory when mentorship includes under-18s.</Text>
            </View>
          </Pressable>
        )}

        {type === "memorial" && (
          <>
            <Text style={s.label}>YEAR OF BIRTH (OPTIONAL)</Text>
            <TextInput style={s.input} value={fields.bornYear ?? ""} onChangeText={(v) => setField("bornYear", v)} placeholder="e.g. 1938" placeholderTextColor={C.inkFaint} keyboardType="number-pad" />

            <Text style={s.label}>DATE OF PASSING (OPTIONAL)</Text>
            <DateField value={diedDate} onChange={setDiedDate} placeholder="Pick a date" maxDate={todayIso} />

            <Pressable accessibilityRole="button" onPress={() => setReminders((v) => !v)} style={s.checkRow}>
              <View style={[s.checkBox, reminders && s.checkBoxOn]}>{reminders && <Text style={s.checkTick}>✓</Text>}</View>
              <View style={{ flex: 1 }}>
                <Text style={s.checkTitle}>Yearly remembrance</Text>
                <Text style={s.checkHint}>A gentle reminder reaches those who remember them, each year on the passing anniversary.</Text>
              </View>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setObserveBday((v) => !v)} style={s.checkRow}>
              <View style={[s.checkBox, observeBday && s.checkBoxOn]}>{observeBday && <Text style={s.checkTick}>✓</Text>}</View>
              <View style={{ flex: 1 }}>
                <Text style={s.checkTitle}>Also observe the birthday</Text>
                <Text style={s.checkHint}>Remember them on their birthday too, not only the anniversary of their passing.</Text>
              </View>
            </Pressable>
          </>
        )}

        {textField && (
          <>
            <Text style={s.label}>{textField.label.toUpperCase()}</Text>
            <TextInput style={[s.input, s.area]} value={text} onChangeText={setText} placeholder="" placeholderTextColor={C.inkFaint} multiline />
          </>
        )}

        {err !== "" && <Text style={s.error}>{err}</Text>}

        <Pressable accessibilityRole="button" onPress={onSubmit} disabled={busy} style={[s.btn, busy && { opacity: 0.6 }]}>
          <Text style={s.btnText}>{busy ? "Saving…" : resubmits ? "Save & resubmit" : "Save changes"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={backToWork} style={s.btnOutline}>
          <Text style={s.btnOutlineText}>Cancel</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function LinkEditor({ link, index, onChange, onRemove, styles, palette, platformSelect = false, socialSelect = false }: Readonly<{ link: SocialLink; index: number; onChange: (patch: Partial<SocialLink>) => void; onRemove: () => void; styles: ReturnType<typeof makeStyles>; palette: Palette; platformSelect?: boolean; socialSelect?: boolean }>) {
  const kind = socialSelect ? "social" : "streaming";
  return <View style={styles.linkEditor}>{platformSelect || socialSelect ? <StreamingPlatformPicker kind={kind} value={link.label} onChange={(label) => onChange({ label })} /> : <TextInput style={styles.input} value={link.label} onChangeText={(label) => onChange({ label })} placeholder="Link label" placeholderTextColor={palette.inkFaint} />}<TextInput style={styles.input} value={link.url} onChangeText={(url) => onChange({ url })} placeholder="https://…" placeholderTextColor={palette.inkFaint} autoCapitalize="none" keyboardType="url" accessibilityLabel={`Link ${index + 1} URL`} /><Pressable accessibilityRole="button" onPress={onRemove} style={styles.removeButton}><Text style={styles.removeText}>Remove</Text></Pressable></View>;
}

function StatusPill({ status }: Readonly<{ status: string }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const tone =
    status === "approved"
      ? { bg: withAlpha(C.green, 0.1), color: C.greenText }
      : status === "pending"
        ? { bg: withAlpha(C.gold, 0.16), color: C.goldText }
        : status === "rejected"
          ? { bg: withAlpha(C.maroon, 0.1), color: C.maroonText }
          : { bg: C.sand, color: C.inkMuted };
  return (
    <View style={[s.statusPill, { backgroundColor: tone.bg }]}>
      <Text style={[s.statusPillText, { color: tone.color }]}>{status}</Text>
    </View>
  );
}

const makeStyles = (C: Palette) => ({
  ...makeFormStyles(C),
  ...StyleSheet.create({
    primaryBtn: { backgroundColor: C.green, borderRadius: 999, paddingVertical: 13, paddingHorizontal: 24, alignItems: "center" },
    primaryBtnText: { color: ON_GREEN, ...S(700), fontSize: 15 },
    artistBuilder: { marginTop: 8, borderWidth: 1, borderColor: C.goldBorder35, borderRadius: 16, backgroundColor: C.goldTint14, padding: 14 },
    builderKicker: { color: C.goldText, fontSize: 10, letterSpacing: 1.5, ...S(700), marginTop: 4 },
    builderTitle: { color: C.ink, ...D(700), fontSize: 22, lineHeight: 27, marginTop: 5 },
    builderBody: { color: C.inkMuted, fontSize: 12.5, lineHeight: 19, marginTop: 6, marginBottom: 10 },
    linkEditor: { gap: 8, borderWidth: 1, borderColor: C.sand, borderRadius: 12, backgroundColor: C.paper, padding: 10, marginTop: 9 },
    removeButton: { minHeight: 38, alignSelf: "flex-start", justifyContent: "center", paddingHorizontal: 12, borderRadius: 9, borderWidth: 1, borderColor: withAlpha(C.maroon, 0.25) },
    removeText: { color: C.maroonText, fontSize: 12, ...S(700) },
    addButton: { minHeight: 43, alignSelf: "flex-start", justifyContent: "center", marginTop: 10, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: withAlpha(C.green, 0.3) },
    addButtonText: { color: C.greenText, fontSize: 13, ...S(700) },
    builderDivider: { height: 1, backgroundColor: C.sand, marginVertical: 22 },
    releaseEditor: { borderWidth: 1, borderColor: C.sand, borderRadius: 14, backgroundColor: C.paper, padding: 12, marginTop: 12 },
    releaseEditorHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.sand },
    releaseEditorTitle: { flex: 1, color: C.ink, fontSize: 14, ...S(700) },
    trackArea: { minHeight: 130, textAlignVertical: "top" },
    addReleaseButton: { minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 2, borderStyle: "dashed", borderColor: C.sand, backgroundColor: C.paper },
    addReleaseButtonText: { color: C.greenText, fontSize: 13, ...S(700) },

    header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 },
    backRow: { alignSelf: "flex-start", paddingVertical: 4 },
    backText: { color: C.greenText, fontSize: 14, ...S(700) },
    kicker: { color: C.goldText, fontSize: 11, letterSpacing: 1.5, ...D(700), textTransform: "uppercase", marginTop: 8 },
    titleRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4, flexWrap: "wrap" },
    headerTitle: { ...D(700), fontSize: 26, color: C.ink, flexShrink: 1 },

    banner: { marginHorizontal: 16, marginTop: 8, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
    bannerWarn: { backgroundColor: withAlpha(C.gold, 0.12) },
    bannerWarnText: { color: C.goldText, fontSize: 13, ...S(600), lineHeight: 19 },
    bannerLive: { backgroundColor: withAlpha(C.teal, 0.1) },
    bannerLiveText: { color: C.tealText, fontSize: 13, lineHeight: 19 },

    chipOn: { borderColor: C.green, backgroundColor: C.green },
    chipTextOn: { color: ON_GREEN },
    btn: { backgroundColor: C.green, borderRadius: 999, paddingVertical: 14, alignItems: "center", marginTop: 22 },
    btnOutline: { borderWidth: 1, borderColor: C.sand, borderRadius: 999, paddingVertical: 13, alignItems: "center", marginTop: 12 },
    btnOutlineText: { color: C.ink, ...S(600) },
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

    checkRow: { marginTop: 12, flexDirection: "row", gap: 10, borderWidth: 1, borderColor: C.sand, borderRadius: 12, backgroundColor: C.paper, padding: 12 },
    checkBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: C.sand, alignItems: "center", justifyContent: "center", marginTop: 1 },
    checkBoxOn: { backgroundColor: C.green, borderColor: C.green },
    checkTick: { color: ON_GREEN, ...S(700), fontSize: 12 },
    checkTitle: { color: C.ink, ...D(600), fontSize: 13 },
    checkHint: { color: C.inkFaint, fontSize: 11, marginTop: 3, lineHeight: 16 },

    statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
    statusPillText: { fontSize: 11, ...S(700), textTransform: "capitalize" },

    notMineWrap: { flex: 1, backgroundColor: C.paper, padding: 16 },
    notMineCard: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 16, padding: 24, marginTop: 12, alignItems: "center" },
    notMineTitle: { ...D(600), fontSize: 22, color: C.ink, textAlign: "center" },
    notMineBody: { color: C.inkMuted, fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 8, maxWidth: 340 },

    savedWrap: { flex: 1, backgroundColor: C.paper, padding: 28, justifyContent: "center", alignItems: "center" },
    savedIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: withAlpha(C.teal, 0.12), alignItems: "center", justifyContent: "center" },
    savedTick: { color: C.tealText, fontSize: 30, ...S(700) },
    savedTitle: { ...D(600), fontSize: 24, color: C.ink, textAlign: "center", marginTop: 16 },
    savedBody: { color: C.inkMuted, fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 8, maxWidth: 340 },
  }),
});
