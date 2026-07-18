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
      <div className="on-dark-pin relative aspect-[16/9] overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-teal via-green to-green-900">
        <div className="bg-dotgrid absolute inset-0 opacity-50" aria-hidden />
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.8" className="absolute inset-0 m-auto h-36 w-36 text-cream/20" aria-hidden><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></svg>
        <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-green-900/90 px-6 pb-5 pt-16 text-sm text-cream/70">Photos have not been added yet.</p>
      </div>
    );
  }
  return (
    <div className={`grid gap-2 overflow-hidden rounded-[1.5rem] ${images.length > 1 ? "grid-cols-[minmax(0,1.7fr)_minmax(8rem,0.8fr)]" : ""}`}>
      <img src={cldCover(images[0].url, 1000)} alt={images[0].caption} className="h-full min-h-72 w-full object-cover sm:min-h-96" />
      {images.length > 1 && (
        <div className="grid min-h-72 gap-2 sm:min-h-96">
          {images.slice(1, 3).map((image) => <img key={image.url} src={cldCover(image.url, 500)} alt={image.caption} loading="lazy" className="h-full min-h-0 w-full object-cover" />)}
          {images.length === 2 && <div className="flex items-center justify-center bg-gold/[0.12] p-4 text-center text-xs font-semibold text-gold-text">More views coming soon</div>}
        </div>
      )}
    </div>
  );
}

function Fact({ icon, label, value }: Readonly<{ icon: string; label: string; value: string }>) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-sand bg-cream p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold/[0.12] text-lg" aria-hidden>{icon}</span>
      <span><span className="block text-xs text-ink-faint">{label}</span><span className="mt-0.5 block text-sm font-semibold text-ink">{value}</span></span>
    </div>
  );
}

export function Component() {
  const property = useLoaderData() as Listing;
  const d = property.details;
  const { member } = useAuth();
  usePageTitle(property.title);
  useRecordView(property.id);

  const availability = AVAILABILITY[d.availability ?? "available"];
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
  const canEnquire = (d.availability ?? "available") === "available";
  const isOwner = member?.id === property.ownerId;
  const actionLabel = d.offerType === "short-stay" ? "Check availability" : "Request a viewing";

  return (
    <article>
      <section className="on-dark on-dark-pin relative isolate overflow-hidden bg-green-900 text-cream">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_84%_0%,rgba(199,162,74,0.26),transparent_32%),linear-gradient(135deg,#0C2C1F_0%,#123F2D_58%,#0B6557_100%)]" aria-hidden />
        <div className="bg-dotgrid absolute inset-0 opacity-30" aria-hidden />
        <Container size="wide" className="relative py-9 sm:py-12">
          <nav aria-label="Breadcrumb" className="text-sm text-cream/60">
            <Link to="/" className="hover:text-gold">Home</Link><span className="mx-2" aria-hidden>/</span><Link to="/rent-stay" className="hover:text-gold">Rent & Stay</Link><span className="mx-2" aria-hidden>/</span><span className="text-cream/90">{property.title}</span>
          </nav>
          <div className="mt-7 grid gap-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-gold-brand px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-green-900">{d.offerType === "short-stay" ? "Short stay" : "For rent"}</span>
                <span className="rounded-full border border-cream/20 bg-cream/10 px-3 py-1 text-xs font-semibold text-cream">{propertyType}</span>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${availability.className}`}>{availability.label}</span>
              </div>
              <h1 className="mt-4 max-w-4xl text-5xl font-semibold leading-[0.98] text-cream sm:text-6xl">{property.title}</h1>
              {(d.area || d.address) && <p className="mt-4 flex items-start gap-2 text-base text-cream/72"><span aria-hidden>⌖</span>{[d.area, d.address].filter(Boolean).join(" · ")}</p>}
            </div>
            <div className="rounded-2xl border border-cream/15 bg-cream/[0.08] p-5 backdrop-blur-sm lg:min-w-64">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cream/55">Listed price</p>
              <p className="mt-1 text-3xl font-semibold text-gold">{money(d.pricePesewas)}<span className="ml-1 text-sm font-normal text-cream/60">/ {cadence}</span></p>
              {d.depositPesewas ? <p className="mt-1 text-xs text-cream/60">Deposit: {money(d.depositPesewas)}</p> : null}
            </div>
          </div>
        </Container>
      </section>

      <Container size="wide" className="py-8 sm:py-10">
        <Gallery property={property} />

        <div className="mt-10 grid items-start gap-10 lg:grid-cols-[minmax(0,1.45fr)_23rem] lg:gap-14">
          <div className="min-w-0 space-y-11">
            <section aria-labelledby="about-property">
              <p className="eyebrow text-green-text">About this place</p>
              <h2 id="about-property" className="mt-2 text-3xl font-semibold text-ink">A clear look before you enquire</h2>
              {d.description ? <p className="mt-5 whitespace-pre-line text-base leading-8 text-ink-muted">{d.description}</p> : <p className="mt-5 text-ink-muted">The manager has not added a full description yet.</p>}
              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
                <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                  {d.amenities?.map((amenity) => <li key={amenity} className="flex items-center gap-3 rounded-xl border border-sand bg-cream px-4 py-3 text-sm text-ink"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-green/10 text-xs font-bold text-green-text" aria-hidden>✓</span>{amenity}</li>)}
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
            <section className="overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)]" aria-labelledby="enquire-title">
              <div className="bg-green p-5 text-on-green">
                <p className="eyebrow text-gold">Direct enquiry</p>
                <h2 id="enquire-title" className="mt-2 text-2xl font-semibold text-on-green">{actionLabel}</h2>
                <p className="mt-2 text-sm leading-relaxed text-on-green/72">Speak with the listed property professional. Oguaa does not collect rent or booking money.</p>
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
              <p className="text-sm font-semibold text-ink">Before you pay</p>
              <ul className="mt-3 space-y-2 text-xs leading-relaxed text-ink-muted">
                <li>• View the property or verify it through someone you trust.</li>
                <li>• Confirm who owns or manages it and get written terms.</li>
                <li>• Never pay because someone is rushing you.</li>
              </ul>
              <p className="mt-4 border-t border-gold-border/25 pt-3 text-[0.7rem] leading-relaxed text-ink-faint">Community-listed does not mean Oguaa guarantees the property, price or transaction.</p>
            </section>

            {isOwner && <a href={`${CREATOR}/work/${property.id}/edit`} className="flex w-full items-center justify-center rounded-full border border-green/30 px-5 py-2.5 text-sm font-semibold text-green-text hover:border-green">Edit this listing in Creator Studio</a>}

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
