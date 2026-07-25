import { useState, type ReactNode, type FormEvent } from "react";
import { Link, useLoaderData, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import type { ArtistRelease, Listing, SocialLink } from "@/lib/types";
import { BackLink, Card, StatusBadge } from "@/components/ui";
import { ArtistProfileEditor } from "@/components/artist-profile-editor";
import { PropertyTypePicker } from "@/components/property-type-picker";
import { AmenitiesPicker } from "@/components/amenities-picker";
import { SocialLinksEditor } from "@/components/social-links-editor";
import { GenrePicker } from "@/components/genre-picker";
import { BusinessCategoryPicker } from "@/components/business-category-picker";
import { EventDetailsFields, type EventAdmission, type EventTierDraft } from "@/components/event-details-fields";
import { ImageUpload } from "@/components/image-upload";
import { DatePicker } from "@/components/date-picker";
import { BusyLabel } from "@/components/skeleton";
import { PORTAL } from "@/lib/portal";

interface Data {
  listing: Listing | null;
}

// The member view carries every owned listing (all statuses) — no dedicated
// read endpoint needed; ownership is proven by it being in the member's list.
export async function loader({ params }: { params: { id?: string } }): Promise<Data> {
  const me = await api.me();
  const view = await api.member(me.slug);
  return { listing: view.listings.find((l) => l.id === params.id) ?? null };
}

const TYPE_LABELS: Record<string, string> = {
  business: "Business", artist: "Artist", person: "Person", memory: "Memory",
  event: "Event", opportunity: "Opportunity", memorial: "Memorial",
  property: "Property",
};

const COVER_COPY: Record<string, { label: string; hint: string }> = {
  artist: { label: "Photo", hint: "A promo shot, performance photo, or portrait of the act." },
  business: { label: "Photo or logo", hint: "Your storefront, a product, or the business logo." },
  event: { label: "Poster or photo", hint: "The event flyer, or a photo that represents it." },
  memory: { label: "Old photo", hint: "A photograph from the time, if you have one to share." },
  opportunity: { label: "Flyer or poster", hint: "The opportunity's flyer or poster, if there is one." },
  person: { label: "Photo", hint: "A portrait or a representative photo of them." },
  memorial: { label: "Portrait", hint: "A dignified portrait of the departed." },
  property: { label: "Property photo", hint: "Use a clear, recent photo that honestly represents the space." },
};

// The primary free-text field of each type (plain textarea here — the AI
// writing bar stays on the portal's submit form).
const TEXT_FIELD: Record<string, { name: string; label: string; rows: number }> = {
  artist: { name: "bio", label: "Bio", rows: 4 },
  business: { name: "description", label: "Short description", rows: 3 },
  event: { name: "description", label: "Description", rows: 3 },
  memory: { name: "text", label: "Your memory", rows: 5 },
  opportunity: { name: "eligibility", label: "Eligibility", rows: 2 },
  person: { name: "whyNotable", label: "Why notable", rows: 4 },
  memorial: { name: "lifeStory", label: "Life story", rows: 4 },
  property: { name: "description", label: "About this property", rows: 4 },
};

// Detail keys the form manages per type. Whitelisted keys NOT listed here are
// passed through untouched from the stored listing (streamingLinks, services,
// gallery…), so a full-replace edit never erases richer data.
const MANAGED_KEYS: Record<string, string[]> = {
  artist: ["genres", "link", "bio", "actName", "streamingLinks", "socials", "booking", "releases"],
  business: ["category", "categories", "address", "description"],
  event: ["startsAt", "endsAt", "venue", "description", "organiser", "eventFormat", "audience", "admission", "startTime", "endTime", "highlights", "featuredGuests", "ageGuidance", "accessibility", "dressCode", "contactInfo", "refundPolicy", "tiers"],
  memory: ["era", "text"],
  opportunity: ["kind", "description", "applyUrl", "eligibility", "provider", "safeguardingPolicyUrl", "minAge", "maxAge", "guardianConsentRequired"],
  person: ["era", "whyNotable"],
  memorial: ["honorific", "bornYear", "diedDate", "birthday", "epitaph", "associations", "lifeStory", "observeBirthday", "remindersEnabled"],
  property: ["offerType", "propertyType", "area", "address", "description", "pricePesewas", "pricePeriod", "depositPesewas", "bedrooms", "bathrooms", "furnished", "amenities", "availability", "availableFrom", "bookingUrl"],
};

// The server's per-type whitelist (mirror of editableDetailsKeys in Go) — used
// to compute the passthrough set.
const WHITELIST: Record<string, string[]> = {
  artist: ["actName", "genres", "bio", "link", "streamingLinks", "socials", "booking", "releases"],
  business: ["category", "categories", "description", "address", "openingHours", "services", "contact"],
  event: ["description", "startsAt", "endsAt", "venue", "organiser", "eventFormat", "audience", "admission", "startTime", "endTime", "highlights", "featuredGuests", "ageGuidance", "accessibility", "dressCode", "contactInfo", "refundPolicy", "tiers"],
  memory: ["text", "era"],
  opportunity: ["kind", "description", "eligibility", "deadline", "applyUrl", "provider", "safeguardingPolicyUrl", "minAge", "maxAge", "guardianConsentRequired"],
  person: ["whyNotable", "era"],
  memorial: ["honorific", "bornYear", "diedDate", "birthday", "epitaph", "lifeStory", "associations", "gallery", "observeBirthday", "remindersEnabled"],
  property: ["offerType", "propertyType", "area", "address", "description", "pricePesewas", "pricePeriod", "depositPesewas", "bedrooms", "bathrooms", "furnished", "amenities", "availability", "availableFrom", "contact", "bookingUrl", "gallery"],
};

const OFFER_OPTIONS = [
  { value: "long-term", label: "Long-term rent", hint: "Monthly homes and rooms" },
  { value: "short-stay", label: "Short stay", hint: "Nightly guest accommodation" },
] as const;
const CADENCE_OPTIONS = [
  { value: "month", label: "Per month" },
  { value: "night", label: "Per night" },
] as const;
const AVAILABILITY_OPTIONS = [
  { value: "available", label: "Available" },
  { value: "reserved", label: "Reserved" },
  { value: "let", label: "Let" },
] as const;

const inputCls =
  "w-full rounded-lg border border-sand bg-paper px-3.5 py-2.5 text-ink placeholder:text-ink-faint focus:border-green focus:outline-none focus:ring-2 focus:ring-green/15";

function Field({ label, children, hint }: Readonly<{ label: string; children: ReactNode; hint?: string }>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-faint">{hint}</span>}
    </label>
  );
}

function ChoiceField({ label, value, options, onChange, hint }: Readonly<{
  label: string;
  value: string;
  options: ReadonlyArray<Readonly<{ value: string; label: string; hint?: string }>>;
  onChange: (value: string) => void;
  hint?: string;
}>) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-ink">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={`rounded-xl border px-3.5 py-2 text-left text-sm transition-colors ${active ? "border-green bg-green text-on-green" : "border-sand bg-paper text-ink-muted hover:border-green/40 hover:text-ink"}`}
            >
              <span className="block font-semibold">{option.label}</span>
              {option.hint && <span className={`mt-0.5 block text-xs ${active ? "text-on-green/70" : "text-ink-faint"}`}>{option.hint}</span>}
            </button>
          );
        })}
      </div>
      {hint && <span className="mt-1.5 block text-xs text-ink-faint">{hint}</span>}
    </fieldset>
  );
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function strList(v: unknown): string {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").join(", ") : "";
}

function stringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((item): item is string => typeof item === "string") : [];
}

function normalizeAmenities(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const aliases: Record<string, string> = { kitchenette: "Kitchen", "private washroom": "Private bathroom", "prepaid meter": "Prepaid electricity", "walled yard": "Gated compound" };
  return [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => aliases[item.toLowerCase()] ?? item))];
}

function socialLinks(v: unknown): SocialLink[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const link = item as Record<string, unknown>;
    return typeof link.label === "string" && typeof link.url === "string" ? [{ label: link.label, url: link.url }] : [];
  });
}

function artistReleases(v: unknown): ArtistRelease[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const release = item as ArtistRelease;
    if (typeof release.title !== "string") return [];
    return [{ ...release, id: release.id || `saved-release-${index}` }];
  });
}

function cedisInput(v: unknown): string {
  return typeof v === "number" && Number.isFinite(v) ? String(v / 100) : "";
}

function pesewasFromForm(v: FormDataEntryValue | null): number | undefined {
  if (typeof v !== "string" || !v.trim()) return undefined;
  const amount = Number(v);
  return Number.isFinite(amount) ? Math.round(amount * 100) : undefined;
}

function eventTierDrafts(value: unknown): EventTierDraft[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => { if (!row || typeof row !== "object") return []; const tier = row as Record<string, unknown>; return typeof tier.name === "string" ? [{ name: tier.name, priceGhs: typeof tier.pricePesewas === "number" ? String(tier.pricePesewas / 100) : "", capacity: typeof tier.capacity === "number" && tier.capacity > 0 ? String(tier.capacity) : "" }] : []; });
}

export function Component() {
  const { listing } = useLoaderData() as Data;
  const { id } = useParams();

  if (!listing || !WHITELIST[listing.type]) {
    return (
      <div>
        <BackLink to="/work">My work</BackLink>
        <Card className="p-8 text-center">
          <h1 className="text-2xl font-semibold text-ink">Not your listing to edit</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
            {listing
              ? "Incidents, lost & found notices and institution projects are edited through their own flows."
              : "This listing doesn't exist or belongs to someone else. Only the owner can edit a listing."}
          </p>
          <Link to="/work" className="mt-5 inline-block rounded-full bg-green px-5 py-2 text-sm font-semibold text-on-green">Back to My Work</Link>
        </Card>
      </div>
    );
  }
  return <ListingForm key={id} type={listing.type} listing={listing} />;
}

export function ListingForm({ type, listing }: Readonly<{ type: string; listing?: Listing }>) {
  const creating = !listing;
  const d: Record<string, unknown> = listing?.details ?? {};
  const textField = TEXT_FIELD[type];
  const cover = COVER_COPY[type];
  const [coverImageUrl, setCoverImageUrl] = useState(listing?.coverImageUrl ?? "");
  const [text, setText] = useState(textField ? str(d[textField.name]) : "");
  // DatePicker is controlled; only the type-relevant one is rendered.
  const [startsAt, setStartsAt] = useState(str(d.startsAt));
  const [endsAt, setEndsAt] = useState(str(d.endsAt));
  const [diedDate, setDiedDate] = useState(str(d.diedDate));
  const [availableFrom, setAvailableFrom] = useState(str(d.availableFrom));
  const [offerType, setOfferType] = useState(str(d.offerType) || "long-term");
  const [propertyType, setPropertyType] = useState(str(d.propertyType) || "apartment");
  const [pricePeriod, setPricePeriod] = useState(str(d.pricePeriod) || "month");
  const [availability, setAvailability] = useState(str(d.availability) || "available");
  const [furnished, setFurnished] = useState(d.furnished === true);
  const [amenities, setAmenities] = useState<string[]>(normalizeAmenities(d.amenities));
  const [genres, setGenres] = useState<string[]>(stringList(d.genres));
  const initialStreamingLinks = socialLinks(d.streamingLinks);
  if (initialStreamingLinks.length === 0 && str(d.link)) initialStreamingLinks.push({ label: "Music", url: str(d.link) });
  const [streamingLinks, setStreamingLinks] = useState<SocialLink[]>(initialStreamingLinks);
  const [socials, setSocials] = useState<SocialLink[]>(socialLinks(d.socials));
  const [businessContactLinks, setBusinessContactLinks] = useState<SocialLink[]>(socialLinks(d.contact));
  const [businessCategories, setBusinessCategories] = useState<string[]>(stringList(d.categories).length ? stringList(d.categories) : (str(d.category) ? [str(d.category)] : []));
  const [opportunityKind, setOpportunityKind] = useState(str(d.kind) || "scholarship");
  const [eventFormat, setEventFormat] = useState(str(d.eventFormat) || "community");
  const [eventAudience, setEventAudience] = useState<string[]>(stringList(d.audience).length ? stringList(d.audience) : ["all-ages"]);
  const [eventAdmission, setEventAdmission] = useState<EventAdmission>(str(d.admission) === "paid" || Array.isArray(d.tiers) ? "paid" : "free");
  const [eventTiers, setEventTiers] = useState<EventTierDraft[]>(eventTierDrafts(d.tiers));
  const [booking, setBooking] = useState(str(d.booking));
  const [releases, setReleases] = useState<ArtistRelease[]>(artistReleases(d.releases));
  // Memorial keeper controls (spec §8.11): reminders default on; the birthday
  // is observed only by the keeper's choice. Absent keys read as those defaults.
  const [reminders, setReminders] = useState(d.remindersEnabled !== false);
  const [observeBday, setObserveBday] = useState(d.observeBirthday === true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<"live" | "queued" | null>(null);

  const resubmits = listing ? (listing.status !== "approved" && listing.status !== "pending") : false;

  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const title = str(fd.get("title")).trim();
    const details: Record<string, unknown> = {};
    for (const [k, v] of fd.entries()) {
      if (k === "title" || k === "priceGhs" || k === "depositGhs") continue;
      if (typeof v === "string" && v.trim()) details[k] = v.trim();
    }
    if (textField && text.trim()) details[textField.name] = text.trim();
    for (const listKey of ["associations", "amenities", "highlights", "featuredGuests"]) {
      if (typeof details[listKey] === "string") {
        details[listKey] = (details[listKey] as string).split(listKey === "highlights" || listKey === "featuredGuests" ? /\r?\n/ : ",").map((s) => s.trim()).filter(Boolean);
      }
    }
    if (typeof details.bornYear === "string") {
      const n = Number.parseInt(details.bornYear as string, 10);
      if (Number.isFinite(n)) details.bornYear = n; else delete details.bornYear;
    }
    for (const numberKey of ["bedrooms", "bathrooms"]) {
      if (typeof details[numberKey] === "string") {
        const n = Number.parseInt(details[numberKey] as string, 10);
        if (Number.isFinite(n)) details[numberKey] = n; else delete details[numberKey];
      }
    }
    if (type === "artist") {
      details.actName = title;
      details.genres = genres;
      details.streamingLinks = streamingLinks.map((link) => ({ label: link.label.trim(), url: link.url.trim() })).filter((link) => link.label && link.url);
      details.socials = socials.map((link) => ({ label: link.label.trim(), url: link.url.trim() })).filter((link) => link.label && link.url);
      details.releases = releases.map((release) => ({
        ...release,
        title: release.title.trim(),
        description: release.description?.trim() || undefined,
        coverImageUrl: release.coverImageUrl?.trim() || undefined,
        url: release.url?.trim() || undefined,
        tracks: (release.tracks ?? []).map((track) => ({ title: track.title.trim() })).filter((track) => track.title),
      })).filter((release) => release.title);
      if (booking.trim()) details.booking = booking.trim();
    }
    if (type === "business") {
      if (!businessCategories.length) { setErr("Choose at least one business category."); return; }
      details.category = businessCategories[0];
      details.categories = businessCategories;
      details.contact = businessContactLinks.map((link) => ({ label: link.label.trim(), url: link.url.trim() })).filter((link) => link.label && link.url);
    }
    if (type === "opportunity") details.kind = opportunityKind;
    if (type === "memorial") {
      details.remindersEnabled = reminders;
      details.observeBirthday = observeBday;
    }
    if (type === "property") {
      details.offerType = offerType;
      details.propertyType = propertyType;
      details.pricePeriod = pricePeriod;
      details.availability = availability;
      details.furnished = furnished;
      details.amenities = amenities;
      const pricePesewas = pesewasFromForm(fd.get("priceGhs"));
      const depositPesewas = pesewasFromForm(fd.get("depositGhs"));
      if (pricePesewas !== undefined) details.pricePesewas = pricePesewas;
      if (depositPesewas !== undefined) details.depositPesewas = depositPesewas;
    }
    if (type === "event" && startsAt && endsAt && endsAt < startsAt) {
      setErr("The end date cannot be before the start date.");
      return;
    }
    if (type === "event") {
      details.eventFormat = eventFormat; details.audience = eventAudience; details.admission = eventAdmission;
      if (eventAdmission === "paid") { const tiers = eventTiers.map((tier) => ({ name: tier.name.trim(), pricePesewas: Math.round(Number(tier.priceGhs) * 100), capacity: Number.parseInt(tier.capacity || "0", 10) || 0 })).filter((tier) => tier.name && tier.pricePesewas > 0); if (!tiers.length) { setErr("Add at least one paid ticket type with a name and price."); return; } details.tiers = tiers; }
    }

    // Passthrough: whitelisted keys the form doesn't manage survive untouched.
    const managed = new Set(MANAGED_KEYS[type] ?? []);
    for (const k of WHITELIST[type] ?? []) {
      if (!managed.has(k) && d[k] !== undefined && details[k] === undefined) {
        details[k] = d[k];
      }
    }

    setBusy(true);
    try {
      const updated = listing
        ? await api.updateListing(listing.id, { title, coverImageUrl: coverImageUrl.trim() || undefined, details })
        : await api.submitListing({ type, title, coverImageUrl: coverImageUrl.trim() || undefined, details });
      setSaved(updated.status === "approved" ? "live" : "queued");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not save. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <div>
        <BackLink to="/work">My work</BackLink>
        <Card className="p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-teal/[0.12]">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-teal-text" aria-hidden><path d="M5 13l4 4L19 7" /></svg>
          </div>
          <h1 className="mt-4 text-2xl font-semibold text-ink">
            {creating ? "Listing submitted" : saved === "live" ? "Changes saved — still live" : "Changes saved — back in the queue"}
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
            {creating
              ? "Your new listing is in the review queue. A curator approves it before it goes public — you'll be notified."
              : saved === "live"
                ? "Your updates are on the public page already. A curator can spot-check the change in the audit trail."
                : "A curator will review your changes before the listing goes live again. You'll be notified."}
          </p>
          <Link to="/work" className="mt-6 inline-block rounded-full bg-green px-6 py-2.5 text-sm font-semibold text-on-green">Back to My Work</Link>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <BackLink to="/work">My work</BackLink>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div>
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-gold-text">{creating ? "New" : "Edit"} {TYPE_LABELS[type] ?? type}</p>
          <h1 className="mt-1 text-3xl font-semibold text-ink">{listing ? listing.title : `Add ${TYPE_LABELS[type] ?? "a listing"}`}</h1>
        </div>
        {listing && <StatusBadge status={listing.status} />}
      </div>

      {creating && (
        <p className="mb-4 rounded-lg bg-gold/[0.12] px-4 py-3 text-sm font-medium text-gold-text">
          New listings enter the moderation queue — a curator reviews and approves before it's public. You'll be notified.
        </p>
      )}
      {resubmits && (
        <p className="mb-4 rounded-lg bg-gold/[0.12] px-4 py-3 text-sm font-medium text-gold-text">
          Saving sends this listing back to the review queue — a curator re-approves it before it's live again.
        </p>
      )}
      {listing?.status === "approved" && (
        <p className="mb-4 rounded-lg bg-teal/[0.1] px-4 py-3 text-sm text-teal-text">
          {type === "property"
            ? "This property is live. Availability and booking-link updates stay live; changes to its price, description or location return to curator review."
            : "This listing is live. Minor changes publish immediately; significant content changes return to curator review."}
        </p>
      )}

      <Card className="p-5 sm:p-6">
        <form onSubmit={onSubmit} className="space-y-6">
          <Field label={type === "memorial" ? "Name of the departed" : type === "property" ? "Property name" : "Title / name"}>
            <input name="title" required defaultValue={listing?.title} className={inputCls} />
          </Field>

          <ImageUpload value={coverImageUrl} onChange={setCoverImageUrl} label={cover?.label ?? "Cover image"} hint={cover?.hint} />

          {type === "artist" && (<>
            <GenrePicker value={genres} onChange={setGenres} />
            <ArtistProfileEditor
              streamingLinks={streamingLinks}
              onStreamingLinks={setStreamingLinks}
              socials={socials}
              onSocials={setSocials}
              booking={booking}
              onBooking={setBooking}
              releases={releases}
              onReleases={setReleases}
            />
          </>)}
          {type === "business" && (<>
            <BusinessCategoryPicker value={businessCategories} onChange={setBusinessCategories} />
            <Field label="Location / address"><input name="address" defaultValue={str(d.address)} className={inputCls} /></Field>
            <SocialLinksEditor links={businessContactLinks} onChange={setBusinessContactLinks} />
            {listing && (
              <a href={`${PORTAL}/business/${listing.slug}/manage`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-3 rounded-xl border border-gold-border/50 bg-gold/[0.06] px-4 py-3 text-sm transition-colors hover:border-gold-border">
                <span><span className="font-semibold text-gold-text">★ Build your storefront</span> <span className="text-ink-faint">— photos, videos &amp; a shareable link (Supporter)</span></span>
                <span aria-hidden className="text-gold-text">↗</span>
              </a>
            )}
          </>)}
          {type === "property" && (
            <div className="space-y-5 rounded-xl border border-gold-border/40 bg-gold/[0.06] p-4 sm:p-5">
              <ChoiceField label="What are you offering?" value={offerType} options={OFFER_OPTIONS} onChange={setOfferType} />
              <PropertyTypePicker value={propertyType} onChange={setPropertyType} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Area / neighbourhood (optional)"><input name="area" defaultValue={str(d.area)} className={inputCls} placeholder="e.g. Abura, Pedu, Cape Coast Central" /></Field>
                <Field label="Address or landmark"><input name="address" required defaultValue={str(d.address)} className={inputCls} /></Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Price (GH₵)"><input name="priceGhs" type="number" min="0.01" step="0.01" required defaultValue={cedisInput(d.pricePesewas)} className={inputCls} /></Field>
                <Field label="Deposit (GH₵, optional)"><input name="depositGhs" type="number" min="0" step="0.01" defaultValue={cedisInput(d.depositPesewas)} className={inputCls} /></Field>
              </div>
              <ChoiceField label="Price period" value={pricePeriod} options={CADENCE_OPTIONS} onChange={setPricePeriod} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Bedrooms (optional)"><input name="bedrooms" type="number" min="0" step="1" defaultValue={typeof d.bedrooms === "number" ? String(d.bedrooms) : ""} className={inputCls} /></Field>
                <Field label="Bathrooms (optional)"><input name="bathrooms" type="number" min="0" step="1" defaultValue={typeof d.bathrooms === "number" ? String(d.bathrooms) : ""} className={inputCls} /></Field>
              </div>
              <ChoiceField
                label="Furnishing"
                value={furnished ? "furnished" : "unfurnished"}
                options={[{ value: "furnished", label: "Furnished" }, { value: "unfurnished", label: "Unfurnished" }]}
                onChange={(value) => setFurnished(value === "furnished")}
              />
              <AmenitiesPicker value={amenities} onChange={setAmenities} />
              <ChoiceField label="Availability" value={availability} options={AVAILABILITY_OPTIONS} onChange={setAvailability} />
              <Field label="Available from (optional)"><DatePicker name="availableFrom" value={availableFrom} onChange={setAvailableFrom} className="w-full" /></Field>
              <Field label="Booking link (optional)" hint="A secure page where guests can enquire or book."><input name="bookingUrl" type="url" defaultValue={str(d.bookingUrl)} className={inputCls} placeholder="https://" /></Field>
            </div>
          )}
          {type === "event" && (<>
            <div className="rounded-2xl border border-gold-border/35 bg-gold/[0.05] p-4 sm:p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-gold-text">Event schedule</p><h3 className="mt-1 text-lg font-semibold text-ink">When does it happen?</h3><p className="mt-1 text-xs text-ink-faint">Leave the end date empty for a one-day event.</p></div>{endsAt && <span className="rounded-full bg-green px-3 py-1 text-xs font-semibold text-on-green">Multi-day</span>}</div><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Start date"><DatePicker name="startsAt" value={startsAt} onChange={(value) => { setStartsAt(value); if (endsAt && endsAt < value) setEndsAt(""); }} className="w-full" /></Field><Field label="End date (optional)"><DatePicker name="endsAt" value={endsAt} onChange={setEndsAt} min={startsAt || undefined} placeholder="Same day" className="w-full" /></Field></div></div>
            <Field label="Venue / location"><input name="venue" defaultValue={str(d.venue)} className={inputCls} /></Field>
            <EventDetailsFields format={eventFormat} onFormat={setEventFormat} audience={eventAudience} onAudience={setEventAudience} admission={eventAdmission} onAdmission={setEventAdmission} tiers={eventTiers} onTiers={setEventTiers} initial={d} />
          </>)}
          {type === "memory" && (
            <Field label="Era" hint="e.g. 1980s"><input name="era" defaultValue={str(d.era)} className={inputCls} /></Field>
          )}
          {type === "opportunity" && (<>
            <ChoiceField label="Opportunity type" value={opportunityKind} onChange={setOpportunityKind} options={[{ value: "scholarship", label: "Scholarship", hint: "Funding for study" }, { value: "internship", label: "Internship", hint: "Workplace experience" }, { value: "apprenticeship", label: "Apprenticeship", hint: "Learn a skilled trade" }, { value: "training", label: "Training", hint: "Build practical skills" }, { value: "job", label: "Job", hint: "Paid employment" }, { value: "investment", label: "Investment", hint: "Funding or partnership" }, { value: "mentorship", label: "Mentorship programme", hint: "Guidance and support" }]} hint="Choose the format that best matches the opportunity." />
            <Field label="Description"><textarea name="description" rows={2} defaultValue={str(d.description)} className={inputCls} /></Field>
            <Field label="Provider / programme owner"><input name="provider" defaultValue={str(d.provider)} className={inputCls} /></Field>
            <Field label="Safeguarding / policy link (required for mentorship)"><input name="safeguardingPolicyUrl" defaultValue={str(d.safeguardingPolicyUrl)} className={inputCls} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Minimum age (optional)"><input name="minAge" inputMode="numeric" defaultValue={str(d.minAge)} className={inputCls} /></Field>
              <Field label="Maximum age (optional)"><input name="maxAge" inputMode="numeric" defaultValue={str(d.maxAge)} className={inputCls} /></Field>
            </div>
            <label className="flex items-start gap-2.5 rounded-lg border border-sand bg-paper p-3.5 text-sm text-ink">
              <input type="checkbox" name="guardianConsentRequired" defaultChecked={d.guardianConsentRequired !== false} className="mt-0.5 accent-green" />
              <span>Require guardian consent for minors<span className="block text-xs text-ink-faint">Mandatory when mentorship includes under-18s.</span></span>
            </label>
            <Field label="How to apply (link)" hint="Information and outbound links only."><input name="applyUrl" defaultValue={str(d.applyUrl)} className={inputCls} /></Field>
          </>)}
          {type === "person" && (
            <Field label="Era" hint="e.g. Colonial era, 1950s, contemporary"><input name="era" defaultValue={str(d.era)} className={inputCls} /></Field>
          )}
          {type === "memorial" && (
            <div className="rounded-lg border border-gold-border/40 bg-gold/[0.08] p-4">
              <div className="space-y-4">
                <Field label="Honorific (optional)" hint="e.g. Nana, Maame, Dr."><input name="honorific" defaultValue={str(d.honorific)} className={inputCls} /></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Year of birth (optional)"><input name="bornYear" inputMode="numeric" defaultValue={typeof d.bornYear === "number" ? String(d.bornYear) : ""} className={inputCls} /></Field>
                  <Field label="Date of passing (optional)"><DatePicker name="diedDate" value={diedDate} onChange={setDiedDate} max={todayIso} className="w-full" /></Field>
                </div>
                <Field label="Birthday (optional)" hint="MM-DD, for yearly remembrance"><input name="birthday" defaultValue={str(d.birthday)} className={inputCls} /></Field>
                <Field label="Epitaph (optional)" hint="A short line of remembrance"><input name="epitaph" defaultValue={str(d.epitaph)} className={inputCls} /></Field>
                <Field label="Associations (optional)" hint="Comma-separated — schools, asafo companies, churches…"><input name="associations" defaultValue={strList(d.associations)} className={inputCls} /></Field>
                <div className="space-y-3 rounded-lg border border-sand bg-paper p-3.5">
                  <label className="flex items-start gap-2.5 text-sm text-ink">
                    <input type="checkbox" checked={reminders} onChange={(e) => setReminders(e.target.checked)} className="mt-0.5 accent-green" />
                    <span>Yearly remembrance<span className="block text-xs text-ink-faint">A gentle reminder reaches those who remember them, each year on the passing anniversary.</span></span>
                  </label>
                  <label className="flex items-start gap-2.5 text-sm text-ink">
                    <input type="checkbox" checked={observeBday} onChange={(e) => setObserveBday(e.target.checked)} className="mt-0.5 accent-green" />
                    <span>Also observe the birthday<span className="block text-xs text-ink-faint">Remember them on their birthday too, not only the anniversary of their passing.</span></span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {textField && (
            <Field label={textField.label}>
              <textarea rows={textField.rows} value={text} onChange={(e) => setText(e.target.value)} required={type === "property"} className={inputCls} />
            </Field>
          )}

          {err && <p className="rounded-lg border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay-text">{err}</p>}

          <div className="flex items-center gap-3">
            <button type="submit" disabled={busy} aria-busy={busy || undefined} className="rounded-full bg-green px-8 py-3 text-sm font-semibold text-on-green transition-colors hover:bg-green-900 disabled:opacity-60">
              {busy ? <BusyLabel label={resubmits ? "Saving and resubmitting listing" : "Saving listing changes"} width="w-24" /> : resubmits ? "Save & resubmit" : "Save changes"}
            </button>
            <Link to="/work" className="text-sm font-medium text-ink-faint hover:text-ink">Cancel</Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
