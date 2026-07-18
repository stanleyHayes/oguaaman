import { useMemo, useState } from "react";
import { ROUTES } from "@/lib/routes";
import { replace } from "@/lib/router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { T as Text, TI as TextInput } from "@/components/typography";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth";
import type { Listing, ListingDetails, MemberView } from "@/lib/types";
import { D, S, ON_GREEN, withAlpha, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { Loading, ErrorView } from "@/ui";
import { DateField } from "@/components/date-field";
import { ImageField } from "@/components/image-field";
import { makeFormStyles } from "@/components/form-styles";

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
  artist: ["genres", "link"],
  business: ["category", "address"],
  property: ["area", "address", "pricePesewas", "depositPesewas", "bedrooms", "bathrooms", "availableFrom", "amenities", "bookingUrl"],
  event: ["venue"],
  memory: ["era"],
  opportunity: ["description", "provider", "safeguardingPolicyUrl", "minAge", "maxAge", "applyUrl"],
  person: ["era"],
  memorial: ["honorific", "bornYear", "birthday", "epitaph", "associations"],
};
const LIST_KEYS = new Set(["genres", "associations", "amenities"]);

// Detail keys the form manages per type (mirrors web MANAGED_KEYS) — anything
// whitelisted but NOT here is passed through untouched from the stored listing.
const MANAGED_KEYS: Record<string, string[]> = {
  artist: ["genres", "link", "bio", "actName"],
  business: ["category", "address", "description"],
  property: ["offerType", "propertyType", "area", "description", "address", "pricePesewas", "pricePeriod", "depositPesewas", "bedrooms", "bathrooms", "furnished", "availability", "availableFrom", "amenities", "bookingUrl"],
  event: ["startsAt", "venue", "description"],
  memory: ["era", "text"],
  opportunity: ["kind", "description", "applyUrl", "eligibility", "provider", "safeguardingPolicyUrl", "minAge", "maxAge", "guardianConsentRequired"],
  person: ["era", "whyNotable"],
  memorial: ["honorific", "bornYear", "diedDate", "birthday", "epitaph", "associations", "lifeStory", "observeBirthday", "remindersEnabled"],
};

// The server's per-type whitelist (mirror of editableDetailsKeys in Go).
const WHITELIST: Record<string, string[]> = {
  artist: ["actName", "genres", "bio", "link", "streamingLinks", "socials", "booking"],
  business: ["category", "description", "address", "openingHours", "services", "contact"],
  property: ["offerType", "propertyType", "area", "description", "address", "pricePesewas", "pricePeriod", "depositPesewas", "bedrooms", "bathrooms", "furnished", "availability", "availableFrom", "amenities", "contact", "bookingUrl", "gallery"],
  event: ["description", "startsAt", "venue", "organiser"],
  memory: ["text", "era"],
  opportunity: ["kind", "description", "eligibility", "deadline", "applyUrl", "provider", "safeguardingPolicyUrl", "minAge", "maxAge", "guardianConsentRequired"],
  person: ["whyNotable", "era"],
  memorial: ["honorific", "bornYear", "diedDate", "birthday", "epitaph", "lifeStory", "associations", "gallery", "observeBirthday", "remindersEnabled"],
};

const FIELD_META: Record<string, { label: string; hint?: string; url?: boolean; numeric?: boolean; area?: boolean }> = {
  genres: { label: "Genre(s)", hint: "Comma-separated, e.g. Highlife, Gospel" },
  link: { label: "Streaming link", hint: "We link out, we don't host audio.", url: true },
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
  { id: "scholarship", label: "Scholarship" },
  { id: "internship", label: "Internship" },
  { id: "apprenticeship", label: "Apprenticeship" },
  { id: "training", label: "Training" },
  { id: "job", label: "Job" },
  { id: "investment", label: "Investment" },
  { id: "mentorship", label: "Mentorship" },
] as const;

const PROPERTY_OFFERS = [
  { id: "long-term", label: "Rent monthly" },
  { id: "short-stay", label: "Book a stay" },
] as const;
const PROPERTY_TYPES = ["room", "apartment", "house", "guesthouse", "hostel"] as const;
const PROPERTY_AVAILABILITY = ["available", "reserved", "let"] as const;

function str(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}
function strList(v: unknown): string {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").join(", ") : "";
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
  const [diedDate, setDiedDate] = useState(str(details.diedDate));
  const [opportunityKind, setOpportunityKind] = useState<string>(str(details.kind) || "scholarship");
  const [guardianConsent, setGuardianConsent] = useState(details.guardianConsentRequired !== false);
  const [reminders, setReminders] = useState(details.remindersEnabled !== false);
  const [observeBday, setObserveBday] = useState(details.observeBirthday === true);
  const [propertyOffer, setPropertyOffer] = useState(str(details.offerType) || "long-term");
  const [propertyType, setPropertyType] = useState(str(details.propertyType) || "apartment");
  const [propertyAvailability, setPropertyAvailability] = useState(str(details.availability) || "available");
  const [propertyFurnished, setPropertyFurnished] = useState(details.furnished === true);
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
    if (type === "memorial" && diedDate.trim()) d.diedDate = diedDate.trim();
    if (textField && text.trim()) d[textField.name] = text.trim();
    if (typeof d.bornYear === "string") {
      const n = Number.parseInt(d.bornYear, 10);
      if (Number.isFinite(n)) d.bornYear = n; else delete d.bornYear;
    }
    if (type === "artist") d.actName = title.trim();
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
            <View style={s.chips}>
              {OPPORTUNITY_KINDS.map((k) => (
                <Pressable accessibilityRole="button" key={k.id} onPress={() => setOpportunityKind(k.id)} style={[s.chip, opportunityKind === k.id && s.chipOn]}>
                  <Text style={[s.chipText, opportunityKind === k.id && s.chipTextOn]}>{k.label}</Text>
                </Pressable>
              ))}
            </View>
          </>
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
            <Text style={s.label}>PROPERTY TYPE</Text>
            <View style={s.chips}>
              {PROPERTY_TYPES.map((item) => (
                <Pressable accessibilityRole="button" key={item} onPress={() => setPropertyType(item)} style={[s.chip, propertyType === item && s.chipOn]}>
                  <Text style={[s.chipText, propertyType === item && s.chipTextOn]}>{item[0].toUpperCase() + item.slice(1)}</Text>
                </Pressable>
              ))}
            </View>
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
          </>
        )}

        {type === "event" && (
          <>
            <Text style={s.label}>DATE</Text>
            <DateField value={startsAt} onChange={setStartsAt} placeholder="Pick a date" />
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
