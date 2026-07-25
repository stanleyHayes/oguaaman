import { useState } from "react";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router-dom";
import type { Listing, PropertyAvailability, PropertyType, SocialLink } from "@/lib/types";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePageTitle } from "@/lib/use-page-title";
import { useRecordView } from "@/lib/use-record-view";
import { cldCover } from "@/lib/cloudinary";
import { formatDate } from "@/lib/format";
import { Container, Pill } from "@/components/ui";
import { LocationMap } from "@/components/location-map";
import { ReportButton } from "@/components/report-button";

export async function loader({ params }: LoaderFunctionArgs) {
  return api.property(params.slug!);
}

const CREATOR = (import.meta.env.VITE_CREATOR_URL as string | undefined) ?? "http://localhost:3004";

const PROPERTY_LABELS: Record<PropertyType, string> = {
  room: "Room",
  apartment: "Apartment",
  house: "House",
  guesthouse: "Guesthouse",
  hostel: "Hostel",
};

const AVAILABILITY: Record<PropertyAvailability, { label: string; className: string }> = {
  available: { label: "Available", className: "bg-cream/95 text-green-text" },
  reserved: { label: "Reserved", className: "bg-gold-brand text-green-900" },
  let: { label: "Let", className: "bg-cream/95 text-maroon-text" },
};

function money(pesewas = 0): string {
  return `GH₵${(pesewas / 100).toLocaleString("en-GH", { maximumFractionDigits: 0 })}`;
}

function safeHref(url: string | undefined): string | null {
  const value = url?.trim();
  if (!value) return null;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(value)) return value;
  return null;
}

function contactKind(contact: SocialLink): "whatsapp" | "phone" | "email" | "link" {
  const value = `${contact.label} ${contact.url}`.toLowerCase();
  if (value.includes("whatsapp") || value.includes("wa.me")) return "whatsapp";
  if (contact.url.startsWith("tel:")) return "phone";
  if (contact.url.startsWith("mailto:")) return "email";
  return "link";
}

function galleryFor(property: Listing): { url: string; caption: string }[] {
  const gallery = Array.isArray(property.details.gallery) ? property.details.gallery : [];
  const candidates = [
    property.coverImageUrl ? { url: property.coverImageUrl, caption: property.title } : null,
    ...gallery.map((image) => image && typeof image.url === "string" && image.url
      ? { url: image.url, caption: image.caption || image.label || property.title }
      : null),
  ].filter((image): image is { url: string; caption: string } => !!image);
  const seen = new Set<string>();
  return candidates.filter((image) => {
    if (seen.has(image.url)) return false;
    seen.add(image.url);
    return true;
  });
}

function Gallery({ property }: Readonly<{ property: Listing }>) {
  const images = galleryFor(property);
  if (images.length === 0) {
    return (
      <div className="on-dark-pin relative min-h-[22rem] overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-teal via-green to-green-900 lg:min-h-[34rem]">
        <div className="bg-dotgrid absolute inset-0 opacity-50" aria-hidden />
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.8" className="absolute inset-0 m-auto h-36 w-36 text-cream/20" aria-hidden><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></svg>
        <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-green-900/90 px-6 pb-5 pt-16 text-sm text-cream/70">Photos have not been added yet.</p>
      </div>
    );
  }
  return (
    <div className={`relative grid min-h-[22rem] gap-2 overflow-hidden rounded-[1.75rem] border border-cream/10 bg-green-900 shadow-[var(--shadow-lift)] lg:min-h-[34rem] ${images.length > 1 ? "grid-cols-[minmax(0,1.7fr)_minmax(7rem,0.62fr)]" : ""}`}>
      <img src={cldCover(images[0].url, 1000)} alt={images[0].caption} className="h-full min-h-[22rem] w-full object-cover lg:min-h-[34rem]" />
      {images.length > 1 && (
        <div className="grid min-h-[22rem] gap-2 lg:min-h-[34rem]">
          {images.slice(1, 3).map((image) => <img key={image.url} src={cldCover(image.url, 500)} alt={image.caption} loading="lazy" className="h-full min-h-0 w-full object-cover" />)}
          {images.length === 2 && <div className="flex items-center justify-center bg-gold/[0.12] p-4 text-center text-xs font-semibold text-gold-text">More views coming soon</div>}
        </div>
      )}
      <span className="absolute bottom-4 right-4 rounded-full border border-cream/20 bg-green-900/80 px-3 py-1.5 text-xs font-semibold text-cream backdrop-blur-md">{images.length} {images.length === 1 ? "photo" : "photos"}</span>
    </div>
  );
}

function Fact({ icon, label, value }: Readonly<{ icon: string; label: string; value: string }>) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-sand bg-cream p-4">
      <span className="absolute -bottom-4 -right-2 text-6xl font-bold text-gold/[0.07]" aria-hidden>{icon}</span>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold/[0.12] text-base text-gold-text" aria-hidden>{icon}</span>
      <span className="mt-3 block text-xs font-medium text-ink-faint">{label}</span>
      <span className="mt-0.5 block text-sm font-bold text-ink">{value}</span>
    </div>
  );
}

function amenityIcon(amenity: string): string {
  const value = amenity.toLowerCase();
  if (value.includes("water")) return "≈";
  if (value.includes("wi-fi") || value.includes("wifi") || value.includes("internet")) return "⌁";
  if (value.includes("park")) return "P";
  if (value.includes("security") || value.includes("guard")) return "◇";
  if (value.includes("washroom") || value.includes("bath")) return "◒";
  if (value.includes("electric") || value.includes("meter")) return "ϟ";
  if (value.includes("air condition") || value.includes("fan")) return "✣";
  return "✓";
}

const AVAILABILITY_OPTIONS: { value: PropertyAvailability; label: string; hint: string }[] = [
  { value: "available", label: "Available", hint: "Listed in Rent & Stay and search — renters can enquire." },
  { value: "reserved", label: "Reserved", hint: "Still listed, but flagged as on hold." },
  { value: "let", label: "Let — taken", hint: "Hidden from Rent & Stay and search until you free it up." },
];

/**
 * Owner-only card: flip the property's letting state without a full re-edit.
 * Marking it "Let" removes it from the public browse + search immediately; the
 * change is optimistic and reverts if the request fails.
 */
function OwnerControls({ slug, availability, onAvailability, editHref }: Readonly<{
  slug: string;
  availability: PropertyAvailability;
  onAvailability: (value: PropertyAvailability) => void;
  editHref: string;
}>) {
  const [saving, setSaving] = useState<PropertyAvailability | null>(null);
  const [error, setError] = useState("");
  const active = AVAILABILITY_OPTIONS.find((option) => option.value === availability);

  async function choose(next: PropertyAvailability) {
    if (next === availability || saving) return;
    const previous = availability;
    onAvailability(next);
    setSaving(next);
    setError("");
    try {
      await api.setPropertyAvailability(slug, next);
    } catch {
      onAvailability(previous);
      setError("Couldn't update availability. Please try again.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="rounded-[var(--radius-card)] border border-green/25 bg-green/[0.05] p-5">
      <p className="eyebrow text-green-text">Owner controls</p>
      <h2 className="mt-2 text-xl font-semibold text-ink">Availability</h2>
      <p className="mt-1 text-xs leading-relaxed text-ink-muted">{active?.hint ?? "Set whether renters can find this place."}</p>
      <div className="mt-4 grid gap-1.5" role="group" aria-label="Set availability">
        {AVAILABILITY_OPTIONS.map((option) => {
          const isActive = option.value === availability;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => choose(option.value)}
              disabled={saving !== null}
              aria-pressed={isActive}
              className={`flex items-center justify-between rounded-xl border px-4 py-2.5 text-left text-sm font-semibold transition-colors disabled:opacity-60 ${
                isActive ? "border-green bg-green text-on-green" : "border-sand bg-cream text-ink hover:border-green/50"
              }`}
            >
              <span>{option.label}</span>
              {saving === option.value ? <span className="text-xs font-normal opacity-80">Saving…</span> : isActive ? <span aria-hidden>✓</span> : null}
            </button>
          );
        })}
      </div>
      {error && <p className="mt-2 text-xs font-semibold text-maroon-text">{error}</p>}
      <a href={editHref} className="mt-4 flex w-full items-center justify-center rounded-full border border-green/30 px-5 py-2.5 text-sm font-semibold text-green-text hover:border-green">Edit full listing in Creator Studio</a>
    </section>
  );
}

export function Component() {
  const property = useLoaderData() as Listing;
  const d = property.details;
  const { member } = useAuth();
  usePageTitle(property.title);
  useRecordView(property.id);

  const isOwner = member?.id === property.ownerId;
  // Owner-controlled letting state, kept in local state so the badge + enquiry
  // panel update live when the owner marks the place taken (or frees it up).
  const [availabilityValue, setAvailabilityValue] = useState<PropertyAvailability>(d.availability ?? "available");
  const availability = AVAILABILITY[availabilityValue];
  const propertyType = d.propertyType ? PROPERTY_LABELS[d.propertyType] : "Property";
  const cadence = d.pricePeriod === "night" ? "night" : "month";
  const rawContacts = Array.isArray(d.contact) ? d.contact : [];
  const contacts = rawContacts.flatMap((contact) => {
    if (!contact || typeof contact.url !== "string") return [];
    const href = safeHref(contact.url);
    return href ? [{ ...contact, href, kind: contactKind(contact) }] : [];
  });
  const whatsapp = contacts.find((contact) => contact.kind === "whatsapp");
  const bookingUrl = safeHref(d.bookingUrl);
  const canEnquire = availabilityValue === "available";
  const actionLabel = d.offerType === "short-stay" ? "Check availability" : "Request a viewing";

  return (
    <article className="overflow-hidden">
      <section className="on-dark on-dark-pin relative isolate bg-green-900 text-cream">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_15%,rgba(199,162,74,0.20),transparent_28%),radial-gradient(circle_at_92%_86%,rgba(14,124,107,0.34),transparent_34%)]" aria-hidden />
        <div className="bg-dotgrid absolute inset-0 opacity-25" aria-hidden />
        <Container size="wide" className="relative py-8 sm:py-10 lg:py-14">
          <nav aria-label="Breadcrumb" className="text-xs text-cream/55 sm:text-sm">
            <Link to="/" className="hover:text-gold">Home</Link><span className="mx-2" aria-hidden>/</span><Link to="/rent-stay" className="hover:text-gold">Rent & Stay</Link><span className="mx-2" aria-hidden>/</span><span className="text-cream/90">{property.title}</span>
          </nav>
          <div className="mt-6 grid items-center gap-8 lg:grid-cols-[minmax(18rem,0.78fr)_minmax(0,1.35fr)] lg:gap-12">
            <div className="lg:py-5">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-gold-brand px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-green-900">{d.offerType === "short-stay" ? "Short stay" : "For rent"}</span>
                <span className="rounded-full border border-cream/20 bg-cream/10 px-3 py-1 text-xs font-semibold text-cream">{propertyType}</span>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${availability.className}`}>{availability.label}</span>
              </div>
              <h1 className="mt-5 max-w-xl text-4xl font-semibold leading-[1.02] text-cream sm:text-5xl lg:text-6xl">{property.title}</h1>
              {(d.area || d.address) && <p className="mt-4 flex items-start gap-2 text-sm leading-relaxed text-cream/72"><span className="text-gold" aria-hidden>⌖</span>{[d.area, d.address].filter(Boolean).join(" · ")}</p>}
              <div className="mt-7 border-y border-cream/15 py-5">
                <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-cream/50">Listed price</p>
                <p className="mt-1 text-4xl font-bold text-gold">{money(d.pricePesewas)}<span className="ml-1 text-sm font-normal text-cream/60">/ {cadence}</span></p>
                {d.depositPesewas ? <p className="mt-2 text-xs text-cream/60">Deposit requested: <b className="text-cream/85">{money(d.depositPesewas)}</b></p> : null}
              </div>
              <a href="#enquire" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-cream px-5 text-sm font-bold text-green-900 transition-colors hover:bg-gold">{actionLabel} <span className="ml-2" aria-hidden>↓</span></a>
            </div>
            <Gallery property={property} />
          </div>
        </Container>
      </section>

      <Container size="wide" className="py-10 sm:py-14">
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1.45fr)_23rem] lg:gap-14">
          <div className="min-w-0 space-y-11">
            <section aria-labelledby="about-property">
              <p className="eyebrow text-green-text">About this place</p>
              <h2 id="about-property" className="mt-2 text-3xl font-semibold text-ink sm:text-4xl">What you should know</h2>
              {d.description ? <p className="mt-5 whitespace-pre-line text-base leading-8 text-ink-muted">{d.description}</p> : <p className="mt-5 text-ink-muted">The manager has not added a full description yet.</p>}
              <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {typeof d.bedrooms === "number" && <Fact icon="◫" label="Bedrooms" value={String(d.bedrooms)} />}
                {typeof d.bathrooms === "number" && <Fact icon="◩" label="Bathrooms" value={String(d.bathrooms)} />}
                <Fact icon="⌂" label="Furnishing" value={d.furnished ? "Furnished" : "Not furnished"} />
                <Fact icon="◷" label="Availability" value={availability.label} />
              </div>
              {d.availableFrom && <p className="mt-4 rounded-xl border border-teal/20 bg-teal/[0.07] px-4 py-3 text-sm text-teal-text"><b>Available from:</b> {formatDate(d.availableFrom)}</p>}
            </section>

            <section aria-labelledby="amenities-title">
              <p className="eyebrow text-gold-text">What is included</p>
              <h2 id="amenities-title" className="mt-2 text-3xl font-semibold text-ink">Amenities</h2>
              {(d.amenities?.length ?? 0) > 0 ? (
                <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {d.amenities?.map((amenity) => <li key={amenity} className="relative min-h-28 overflow-hidden rounded-2xl border border-sand bg-cream p-4 text-sm font-semibold text-ink"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal/[0.10] text-lg font-bold text-teal-text" aria-hidden>{amenityIcon(amenity)}</span><span className="mt-3 block">{amenity}</span><span className="absolute -bottom-5 -right-2 text-7xl font-bold text-teal/[0.05]" aria-hidden>{amenityIcon(amenity)}</span></li>)}
                </ul>
              ) : <p className="mt-4 rounded-xl border border-dashed border-sand bg-cream p-5 text-sm text-ink-muted">Ask the manager which amenities are included.</p>}
            </section>

            {(d.address || d.area) && (
              <section id="location" className="scroll-mt-24" aria-labelledby="location-title">
                <p className="eyebrow text-teal-text">Location</p>
                <h2 id="location-title" className="mt-2 text-3xl font-semibold text-ink">Around {d.area || "Cape Coast"}</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink-muted">Confirm the exact address and viewing instructions with the property manager before travelling or paying.</p>
                <LocationMap className="mt-5" address={d.address || d.area} query={property.title} latitude={property.latitude} longitude={property.longitude} />
              </section>
            )}

            {property.tags.length > 0 && <section><h2 className="text-2xl font-semibold text-ink">Good to know</h2><div className="mt-4 flex flex-wrap gap-2">{property.tags.map((tag) => <Pill key={tag} tone="teal">#{tag}</Pill>)}</div></section>}
          </div>

          <aside className="space-y-5 lg:sticky lg:top-24">
            <section id="enquire" className="scroll-mt-28 overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-lift)]" aria-labelledby="enquire-title">
              <div className="bg-green p-5 text-on-green">
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl border border-gold/25 bg-gold/[0.12] text-xl text-gold" aria-hidden>⌂</div>
                <p className="eyebrow text-gold">Direct to the manager</p>
                <h2 id="enquire-title" className="mt-2 text-2xl font-semibold text-on-green">{actionLabel}</h2>
                <p className="mt-2 text-sm leading-relaxed text-on-green/72">Confirm the viewing, availability and every fee before travelling or paying.</p>
              </div>
              <div className="space-y-2.5 p-5">
                {!canEnquire && <p className="mb-3 rounded-xl bg-sand px-4 py-3 text-sm text-ink-muted">This listing is not taking enquiries right now.</p>}
                {canEnquire && whatsapp?.href && <a href={whatsapp.href} target="_blank" rel="noopener noreferrer" className="flex w-full items-center justify-center gap-2 rounded-full bg-teal px-5 py-3 text-sm font-semibold text-cream transition-colors hover:bg-teal-text"><span aria-hidden>◉</span> Enquire on WhatsApp</a>}
                {canEnquire && bookingUrl && <a href={bookingUrl} target="_blank" rel="noopener noreferrer" className="flex w-full items-center justify-center gap-2 rounded-full bg-gold-brand px-5 py-3 text-sm font-semibold text-green-900 transition-colors hover:bg-gold">{d.offerType === "short-stay" ? "Open booking page" : "Request a viewing"} <span aria-hidden>↗</span></a>}
                {canEnquire && contacts.filter((contact) => contact.href !== whatsapp?.href).map((contact) => <a key={`${contact.label}-${contact.url}`} href={contact.href} target={contact.kind === "phone" || contact.kind === "email" ? undefined : "_blank"} rel="noopener noreferrer" className="flex w-full items-center justify-between rounded-full border border-teal/30 px-4 py-2.5 text-sm font-semibold text-teal-text transition-colors hover:bg-teal/[0.07]">{contact.label}<span aria-hidden>↗</span></a>)}
                {canEnquire && !whatsapp?.href && !bookingUrl && contacts.length === 0 && <p className="rounded-xl border border-dashed border-sand p-4 text-sm text-ink-muted">Contact details are awaiting review. Check back shortly.</p>}
              </div>
            </section>

            <section className="rounded-[var(--radius-card)] border border-gold-border/35 bg-gold/[0.08] p-5">
              <p className="eyebrow text-gold-text">Rent safely</p>
              <h2 className="mt-2 text-xl font-semibold text-ink">Pause before you pay</h2>
              <ul className="mt-3 space-y-2 text-xs leading-relaxed text-ink-muted">
                <li>• View the property or verify it through someone you trust.</li>
                <li>• Confirm who owns or manages it and get written terms.</li>
                <li>• Never pay because someone is rushing you.</li>
              </ul>
              <p className="mt-4 border-t border-gold-border/25 pt-3 text-[0.7rem] leading-relaxed text-ink-faint">Community-listed does not mean Oguaa guarantees the property, price or transaction.</p>
            </section>

            {isOwner && (
              <OwnerControls
                slug={property.slug}
                availability={availabilityValue}
                onAvailability={setAvailabilityValue}
                editHref={`${CREATOR}/work/${property.id}/edit`}
              />
            )}

            <div className="flex items-center justify-between gap-3 px-1 text-xs text-ink-faint">
              <span>{property.viewCount?.toLocaleString("en-GH") ?? 0} views</span>
              <ReportButton listingId={property.id} />
            </div>
          </aside>
        </div>
      </Container>
    </article>
  );
}
