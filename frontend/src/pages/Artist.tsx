import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLoaderData, useNavigate, useRevalidator, useSearchParams, type LoaderFunctionArgs } from "react-router-dom";
import { usePageTitle } from "@/lib/use-page-title";
import type { ArtistRelease, Listing, Organization, Pledge, SocialLink } from "@/lib/types";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { completePayment } from "@/lib/paystack";
import { useRecordView } from "@/lib/use-record-view";
import { Container, Pill } from "@/components/ui";
import { Thumb } from "@/components/cards";
import { DetailHero } from "@/components/detail-hero";
import { ReportButton } from "@/components/report-button";
import { initials } from "@/lib/format";
import { cedis } from "./Projects";

const DONATION_AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;
const MAX_DONATION_CEDIS = 100_000;
const DONATION_PRESETS = [10, 20, 50, 100];

interface Data {
  artist: Listing;
  school: Organization | null;
}

export async function loader({ params }: LoaderFunctionArgs): Promise<Data> {
  const artist = await api.artist(params.slug!);
  let school: Organization | null = null;
  const sid = artist.schoolIds?.[0];
  if (sid) {
    school = await api.institution(sid).then((v) => v.institution).catch(() => null);
  }
  return { artist, school };
}

type Svc = "spotify" | "youtube" | "audiomack" | "boomplay" | "default";
const STREAM: Record<string, { chip: string; icon: Svc }> = {
  Spotify: { chip: "bg-green/15 text-green-text", icon: "spotify" },
  Audiomack: { chip: "bg-clay/15 text-clay-text", icon: "audiomack" },
  Boomplay: { chip: "bg-teal/15 text-teal-text", icon: "boomplay" },
  YouTube: { chip: "bg-maroon-900/15 text-maroon-text", icon: "youtube" },
};

function Headphones({ className = "" }: Readonly<{ className?: string }>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="3" y="13.5" width="4.5" height="6.5" rx="1.6" /><rect x="16.5" y="13.5" width="4.5" height="6.5" rx="1.6" />
    </svg>
  );
}
function SvcIcon({ name, className = "" }: Readonly<{ name: Svc; className?: string }>) {
  const body = {
    spotify: <><circle cx="12" cy="12" r="9" /><path d="M7.5 10c3-1 6-.7 8.5 1" /><path d="M8 13c2.2-.7 4.6-.5 6.6.8" /><path d="M8.6 15.6c1.6-.5 3.3-.3 4.8.6" /></>,
    youtube: <><rect x="3" y="6" width="18" height="12" rx="3.5" /><path d="M11 9.5l4.2 2.5-4.2 2.5Z" fill="currentColor" stroke="none" /></>,
    audiomack: <path d="M5 10.5v3M8.5 7.5v9M12 9.5v5M15.5 6v12M19 10.5v3" />,
    boomplay: <><circle cx="12" cy="12" r="9" /><path d="M10 8.5l5 3.5-5 3.5Z" fill="currentColor" stroke="none" /></>,
    default: <><path d="M9 18V6l10-2v12" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="16.5" cy="16" r="2.5" /></>,
  }[name];
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {body}
    </svg>
  );
}

export function Component() {
  const { artist, school } = useLoaderData() as Data;
  usePageTitle(artist.title);
  useRecordView(artist.id);
  const d = artist.details;
  const donate = useDonate(artist);
  const releases = artistReleases(d.releases, d.latestRelease);
  const latest = releases[0];

  return (
    <>
      <DetailHero
        tone="gold"
        sectionId="music"
        backTo="/music"
        backLabel="Music"
        coverImageUrl={artist.coverImageUrl}
        title={d.actName ?? artist.title}
        meta={latest ? `Latest release · ${latest.title}${latest.year ? ` · ${latest.year}` : ""}` : "An artist from the Cape Coast music community"}
      >
        {d.spotlight && <span className="rounded-full bg-gold-brand px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.15em] text-green-900">Oguaa spotlight</span>}
        {(d.genres ?? []).map((genre) => <span key={genre} className="rounded-full border border-cream/25 bg-cream/10 px-3 py-1 text-xs text-cream/90 backdrop-blur-sm">{genre}</span>)}
        {releases.length > 0 && <a href="#discography" className="rounded-full border border-gold/45 bg-gold/10 px-3 py-1 text-xs font-semibold text-gold">{releases.length} {releases.length === 1 ? "release" : "releases"} ↓</a>}
      </DetailHero>

      <Container size="wide" className="grid gap-10 py-12 sm:py-16 lg:grid-cols-[minmax(0,1.55fr)_22rem] lg:gap-14">
        <div className="min-w-0">
          <section className="grid items-start gap-7 sm:grid-cols-[15rem_minmax(0,1fr)]" aria-labelledby="artist-story">
            <div className="relative mx-auto w-full max-w-60 sm:mx-0">
              <div className="absolute -inset-3 rotate-2 rounded-[1.5rem] border border-gold-border/35 bg-gold/[0.08]" aria-hidden />
              <Thumb seed={artist.slug} label={initials(d.actName ?? artist.title)} src={artist.coverImageUrl} rounded="rounded-[1.2rem]" className="relative aspect-square w-full border border-sand shadow-[var(--shadow-lift)]" coverWidth={620} />
              <span className="absolute -bottom-3 -right-3 flex h-12 w-12 items-center justify-center rounded-full border-4 border-paper bg-clay text-cream shadow-lg" aria-hidden>
                <Headphones className="h-5 w-5" />
              </span>
            </div>
            <div>
              <p className="eyebrow text-clay-text">Artist story</p>
              <h2 id="artist-story" className="mt-3 text-3xl font-semibold text-ink sm:text-4xl">The voice behind the sound.</h2>
              <div className="mt-4 h-1 w-14 rounded-full bg-clay" aria-hidden />
              <p className="mt-6 text-lg leading-relaxed text-ink-muted first-letter:float-left first-letter:mr-2 first-letter:text-5xl first-letter:font-semibold first-letter:leading-[0.85] first-letter:text-clay-text">
                {d.bio || "This artist is building their Oguaa profile. Check back for their story, influences and the music they are making from the coast."}
              </p>
            </div>
          </section>

          {releases.length > 0 && <Discography releases={releases} />}

          <ListeningPlatforms links={d.streamingLinks ?? []} />

          {artist.tags.length > 0 && (
            <section className="mt-10" aria-labelledby="artist-tags">
              <h2 id="artist-tags" className="text-2xl font-semibold text-ink">Sounds &amp; influences</h2>
              <div className="mt-4 flex flex-wrap gap-2">{artist.tags.map((t) => <Pill key={t} tone="clay">#{t}</Pill>)}</div>
            </section>
          )}
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <ArtistBookingCard artistSlug={artist.slug} artistName={d.actName ?? artist.title} />
          {artist.donationsEnabled && <DonatePanel artist={artist} donate={donate} />}
          <ArtistContact booking={d.booking} socials={d.socials ?? []} />
          {school && (
            <div className="rounded-[var(--radius-card)] border border-sand bg-cream p-5 text-sm text-ink-muted">
              Reps <Link to={`/education/${school.slug}`} className="font-medium text-maroon-text hover:underline">{school.name}</Link>
            </div>
          )}
        </aside>
      </Container>

      <Container className="flex items-center justify-between gap-4">
        <ReportButton listingId={artist.id} />
      </Container>
    </>
  );
}

function artistReleases(releases: ArtistRelease[] | undefined, latest: ArtistRelease | undefined): ArtistRelease[] {
  if (releases && releases.length > 0) return releases;
  return latest ? [{ ...latest, kind: "single" }] : [];
}

function Discography({ releases }: Readonly<{ releases: ArtistRelease[] }>) {
  return (
    <section id="discography" className="mt-14 scroll-mt-24" aria-labelledby="discography-title">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-sand pb-5">
        <div><p className="eyebrow text-teal-text">Discography</p><h2 id="discography-title" className="mt-2 text-3xl font-semibold text-ink sm:text-4xl">Music from the artist.</h2></div>
        <p className="max-w-sm text-sm leading-relaxed text-ink-muted">Albums, EPs and songs are catalogued here. Listening always opens on the artist’s chosen platform.</p>
      </div>
      <div className="mt-7 grid gap-5 sm:grid-cols-2">
        {releases.map((release, index) => <ReleaseCard key={release.id ?? `${release.title}-${index}`} release={release} index={index} />)}
      </div>
    </section>
  );
}

function ReleaseCard({ release, index }: Readonly<{ release: ArtistRelease; index: number }>) {
  const kind = (release.kind ?? "release").toUpperCase();
  return (
    <article className="group overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)] transition duration-300 hover:-translate-y-1 hover:border-gold-border/45 hover:shadow-[var(--shadow-lift)]">
      <div className="relative aspect-square overflow-hidden bg-[radial-gradient(circle_at_center,rgba(199,162,74,0.28),rgba(18,63,45,0.96)_68%)]">
        {release.coverImageUrl ? <img src={release.coverImageUrl} alt={`${release.title} artwork`} loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.035]" /> : <div className="flex h-full items-center justify-center"><span className="h-32 w-32 rounded-full border-[18px] border-gold/65 bg-green-900 shadow-[inset_0_0_0_2px_rgba(246,241,231,0.2)]"><span className="mx-auto mt-[2.55rem] block h-3 w-3 rounded-full bg-cream" /></span></div>}
        <span className="absolute left-4 top-4 rounded-full border border-cream/25 bg-green-900/80 px-3 py-1 text-[0.62rem] font-bold tracking-[0.15em] text-cream backdrop-blur-sm">{String(index + 1).padStart(2, "0")} · {kind}</span>
        {release.year && <span className="absolute bottom-4 right-4 rounded-full bg-gold-brand px-3 py-1 text-xs font-bold text-green-900">{release.year}</span>}
      </div>
      <div className="p-5 sm:p-6">
        <h3 className="text-2xl font-semibold leading-tight text-ink">{release.title}</h3>
        {release.description && <p className="mt-3 text-sm leading-relaxed text-ink-muted">{release.description}</p>}
        {(release.tracks?.length ?? 0) > 0 && (
          <ol className="mt-5 divide-y divide-sand border-y border-sand">
            {release.tracks?.slice(0, 5).map((track, trackIndex) => <li key={`${track.title}-${trackIndex}`} className="flex gap-3 py-2.5 text-sm"><span className="w-5 shrink-0 tabular-nums text-ink-faint">{String(trackIndex + 1).padStart(2, "0")}</span><span className="font-medium text-ink">{track.title}</span></li>)}
          </ol>
        )}
        {(release.tracks?.length ?? 0) > 5 && <p className="mt-2 text-xs text-ink-faint">+ {(release.tracks?.length ?? 0) - 5} more tracks</p>}
        {release.url && <a href={release.url} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-green px-4 text-sm font-semibold text-on-green transition-colors hover:bg-gold-brand hover:text-green-900">Find this release <span aria-hidden>↗</span></a>}
      </div>
    </article>
  );
}

function ListeningPlatforms({ links }: Readonly<{ links: SocialLink[] }>) {
  return (
    <section id="listen" className="mt-14 scroll-mt-24" aria-labelledby="listen-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="eyebrow text-clay-text">Listen elsewhere</p><h2 id="listen-title" className="mt-2 text-3xl font-semibold text-ink">Find the artist everywhere.</h2></div>
        <p className="max-w-sm text-sm leading-relaxed text-ink-muted">Oguaa hosts the catalogue, not the audio. Choose the service you already use.</p>
      </div>
      {links.length > 0 ? <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{links.map((link, index) => {
        const meta = STREAM[link.label] ?? { chip: "bg-sand text-ink-muted", icon: "default" as const };
        return <a key={`${link.label}-${index}`} href={link.url} target="_blank" rel="noopener noreferrer" className="group flex min-h-16 items-center gap-3 rounded-xl border border-sand bg-cream px-4 py-3 transition-colors hover:border-clay/40 hover:bg-clay/[0.04]"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${meta.chip}`}><SvcIcon name={meta.icon} className="h-5 w-5" /></span><span className="min-w-0 flex-1 font-semibold text-ink">{link.label}</span><span className="text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-clay-text" aria-hidden>↗</span></a>;
      })}</div> : <p className="mt-5 rounded-xl border border-dashed border-sand bg-cream p-5 text-sm text-ink-faint">No listening platforms have been added yet.</p>}
    </section>
  );
}

function ArtistContact({ booking, socials }: Readonly<{ booking?: string; socials: SocialLink[] }>) {
  if (!booking && socials.length === 0) return null;
  const bookingIsLink = Boolean(booking && /^(https?:\/\/|mailto:|tel:)/i.test(booking));
  return <section className="rounded-[var(--radius-card)] border border-sand bg-cream p-5"><p className="eyebrow text-gold-text">Connect</p><h2 className="mt-1 text-xl font-semibold text-ink">Management &amp; socials</h2>{booking && (bookingIsLink ? <a href={booking} target="_blank" rel="noopener noreferrer" className="mt-4 flex min-h-11 items-center justify-between rounded-full border border-green/30 px-4 text-sm font-semibold text-green-text">External management page <span aria-hidden>↗</span></a> : <p className="mt-4 rounded-xl bg-paper p-3 text-sm text-ink-muted">{booking}</p>)}{socials.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{socials.map((link, index) => <a key={`${link.label}-${index}`} href={link.url} target="_blank" rel="noopener noreferrer" className="rounded-full border border-sand px-3 py-2 text-sm font-semibold text-ink-muted hover:border-gold-border hover:text-gold-text">{link.label} ↗</a>)}</div>}</section>;
}

function ArtistBookingCard({ artistSlug, artistName }: Readonly<{ artistSlug: string; artistName: string }>) {
  const { member } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const input = "mt-1.5 w-full rounded-xl border border-sand bg-paper px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-green focus:outline-none focus:ring-2 focus:ring-green/15";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = (name: string) => String(data.get(name) ?? "").trim();
    const contactEmail = value("contactEmail");
    const contactPhone = value("contactPhone");
    if (!contactEmail && !contactPhone) {
      setError("Add an email address or phone number so the artist can reply.");
      return;
    }
    const budget = Number(value("budgetGhs").replace(/,/g, ""));
    const audience = Number.parseInt(value("audienceSize"), 10);
    setBusy(true); setError("");
    try {
      await api.requestArtistBooking(artistSlug, {
        eventType: value("eventType"), eventDate: value("eventDate"), location: value("location"),
        contactEmail, contactPhone, message: value("message"),
        ...(Number.isFinite(budget) && budget > 0 ? { budgetPesewas: Math.round(budget * 100) } : {}),
        ...(Number.isFinite(audience) && audience > 0 ? { audienceSize: audience } : {}),
      });
      setSent(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not send the booking request.");
    } finally { setBusy(false); }
  }

  return <section className="overflow-hidden rounded-[var(--radius-card)] border border-gold-border/45 bg-gold/[0.07] shadow-[var(--shadow-card)]">
    <div className="p-5"><p className="eyebrow text-gold-text">Book this artist</p><h2 className="mt-1 text-xl font-semibold text-ink">Bring {artistName} to your event.</h2><p className="mt-2 text-sm leading-relaxed text-ink-muted">Send the date and event details directly to the artist’s private creator dashboard.</p>
      {!member ? <Link to="/signin" className="mt-4 flex min-h-11 items-center justify-center rounded-full bg-green px-4 text-sm font-semibold text-on-green">Sign in to request a booking</Link> : !open && !sent ? <button type="button" onClick={() => setOpen(true)} className="mt-4 min-h-11 w-full rounded-full bg-green px-4 text-sm font-semibold text-on-green">Request a booking</button> : null}
    </div>
    {sent ? <div className="border-t border-gold-border/30 bg-green/[0.07] p-5"><p className="font-semibold text-green-text">Request sent</p><p className="mt-1 text-sm text-ink-muted">{artistName} can now review it in the creator dashboard and update you through Oguaa.</p></div> : open && member ? <form onSubmit={submit} className="space-y-3 border-t border-gold-border/30 bg-cream p-5">
      <label className="block text-xs font-semibold text-ink-muted">Event type<select name="eventType" required className={input}><option value="">Choose event</option><option>Wedding</option><option>Festival</option><option>Corporate event</option><option>Church programme</option><option>Funeral or remembrance</option><option>Private celebration</option><option>Concert or live show</option><option>Other event</option></select></label>
      <label className="block text-xs font-semibold text-ink-muted">Event date<input name="eventDate" type="date" required min={new Date().toISOString().slice(0, 10)} className={input} /></label>
      <label className="block text-xs font-semibold text-ink-muted">Location<input name="location" required className={input} placeholder="Venue, town or region" /></label>
      <div className="grid grid-cols-2 gap-2"><label className="block text-xs font-semibold text-ink-muted">Budget (GH₵)<input name="budgetGhs" inputMode="decimal" className={input} placeholder="Optional" /></label><label className="block text-xs font-semibold text-ink-muted">Audience<input name="audienceSize" inputMode="numeric" className={input} placeholder="Optional" /></label></div>
      <label className="block text-xs font-semibold text-ink-muted">Email<input name="contactEmail" type="email" className={input} placeholder="you@example.com" /></label>
      <label className="block text-xs font-semibold text-ink-muted">Phone or WhatsApp<input name="contactPhone" type="tel" className={input} placeholder="+233…" /></label>
      <label className="block text-xs font-semibold text-ink-muted">Event notes<textarea name="message" rows={3} className={input} placeholder="Timing, set length, audience and anything the artist should know." /></label>
      {error && <p className="text-xs font-medium text-maroon-text">{error}</p>}
      <button type="submit" disabled={busy} className="min-h-11 w-full rounded-full bg-green px-4 text-sm font-semibold text-on-green disabled:opacity-60">{busy ? "Sending…" : "Send booking request"}</button>
    </form> : null}
  </section>;
}

interface DonateState {
  amount: string;
  setAmount: (v: string) => void;
  message: string;
  setMessage: (v: string) => void;
  anonymous: boolean;
  setAnonymous: (v: boolean) => void;
  busy: boolean;
  confirming: boolean;
  error: string | null;
  confirmed: Pledge | null;
  signedIn: boolean;
  start: () => Promise<void>;
}

// useDonate holds the artist "tip jar" flow: preset/custom amount, the Paystack
// modal, and confirmation — mirroring the project pledge flow.
function useDonate(artist: Listing): DonateState {
  const { member } = useAuth();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [params, setParams] = useSearchParams();
  const [amount, setAmount] = useState("20");
  const [message, setMessage] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Pledge | null>(null);
  const confirmedRef = useRef(false);

  useEffect(() => {
    const ref = params.get("donation_ref");
    if (!ref || confirmedRef.current) return;
    confirmedRef.current = true;
    setConfirming(true);
    api.confirmDonation(ref)
      .then((pledge) => {
        setConfirmed(pledge);
        setParams({}, { replace: true });
        revalidator.revalidate();
      })
      .catch(() => setError("We couldn't confirm that payment. If you were charged, it will reconcile shortly."))
      .finally(() => setConfirming(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    setError(null);
    const normalized = amount.trim();
    if (!DONATION_AMOUNT_PATTERN.test(normalized)) {
      setError("Enter a valid cedi amount with no more than two decimal places.");
      return;
    }
    const cedisNum = Number(normalized);
    if (!Number.isFinite(cedisNum) || cedisNum < 1 || cedisNum > MAX_DONATION_CEDIS) {
      setError("Enter an amount between GH₵ 1 and GH₵ 100,000.");
      return;
    }
    if (!member) {
      navigate("/signin", { state: { from: `/music/${artist.slug}` } });
      return;
    }
    setBusy(true);
    try {
      const response = await api.donate(artist.slug, {
        amountPesewas: Math.round(cedisNum * 100),
        message: message.trim() || undefined,
        anonymous,
      });
      await completePayment(response, {
        onSuccess: async () => {
          setConfirming(true);
          try {
            setConfirmed(await api.confirmDonation(response.reference));
            revalidator.revalidate();
          } catch {
            setError("We couldn't confirm that payment. If you were charged, it will reconcile shortly.");
          } finally {
            setConfirming(false);
          }
        },
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start the payment.");
    } finally {
      setBusy(false);
    }
  }

  return { amount, setAmount, message, setMessage, anonymous, setAnonymous, busy, confirming, error, confirmed, signedIn: Boolean(member), start };
}

function DonatePanel({ artist, donate }: Readonly<{ artist: Listing; donate: DonateState }>) {
  const supporters = artist.details.donorCount ?? 0;
  let label = "Support with Paystack";
  if (donate.confirming) label = "Confirming…";
  else if (donate.busy) label = "Starting payment…";
  else if (!donate.signedIn) label = "Sign in to support";

  if (donate.confirmed) {
    return (
      <div className="rounded-[var(--radius-card)] border border-green/25 bg-green/[0.06] p-5">
        <p className="eyebrow text-green-text">Medaase 💚</p>
        <p className="mt-2 text-lg font-semibold text-ink">Your support of {cedis(donate.confirmed.amountPesewas)} is confirmed.</p>
        <p className="mt-1 text-sm text-ink-muted">Thank you for backing {artist.details.actName ?? artist.title}.</p>
      </div>
    );
  }

  return (
    <section aria-labelledby="donate-heading" className="overflow-hidden rounded-[var(--radius-card)] border border-clay/25 bg-cream shadow-[var(--shadow-card)]">
      <div className="bg-clay/[0.08] px-5 py-4">
        <p className="eyebrow text-clay-text">Support this artist</p>
        <h2 id="donate-heading" className="mt-1 text-xl font-semibold text-ink">Send a donation</h2>
        {supporters > 0 && (
          <p className="mt-1 text-xs text-ink-faint">{supporters} {supporters === 1 ? "fan has" : "fans have"} shown love so far.</p>
        )}
      </div>
      <div className="p-5">
        <div className="grid grid-cols-4 gap-2">
          {DONATION_PRESETS.map((preset) => {
            const active = donate.amount === String(preset);
            return (
              <button
                key={preset}
                type="button"
                onClick={() => donate.setAmount(String(preset))}
                className={`rounded-lg border px-2 py-2 text-sm font-semibold transition-colors ${active ? "border-clay bg-clay/[0.1] text-clay-text" : "border-sand bg-paper text-ink-muted hover:border-clay/40"}`}
              >
                {preset}
              </button>
            );
          })}
        </div>
        <label htmlFor="donate-amount" className="mt-4 block text-xs font-semibold uppercase tracking-wide text-ink-faint">Or enter another amount (GH₵)</label>
        <input
          id="donate-amount"
          inputMode="decimal"
          value={donate.amount}
          onChange={(e) => donate.setAmount(e.target.value)}
          className="mt-1 w-full rounded-lg border border-sand bg-paper px-3 py-2 text-ink focus:border-clay focus:outline-none"
          aria-describedby={donate.error ? "donate-error" : undefined}
        />
        <label htmlFor="donate-message" className="mt-4 block text-xs font-semibold uppercase tracking-wide text-ink-faint">Add a note (optional)</label>
        <textarea
          id="donate-message"
          value={donate.message}
          onChange={(e) => donate.setMessage(e.target.value)}
          rows={2}
          maxLength={280}
          className="mt-1 w-full resize-none rounded-lg border border-sand bg-paper px-3 py-2 text-sm text-ink focus:border-clay focus:outline-none"
          placeholder="Keep making great music!"
        />
        <label className="mt-3 flex items-center gap-2 text-sm text-ink-muted">
          <input type="checkbox" checked={donate.anonymous} onChange={(e) => donate.setAnonymous(e.target.checked)} className="h-4 w-4 rounded border-sand text-clay" />
          Donate anonymously
        </label>
        {donate.error && <p id="donate-error" role="alert" className="mt-3 rounded-lg border border-clay/25 bg-clay/[0.06] p-3 text-sm text-clay-text">{donate.error}</p>}
        <button
          type="button"
          onClick={donate.start}
          disabled={donate.busy || donate.confirming}
          className="mt-4 w-full rounded-full bg-clay px-4 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-clay/90 disabled:opacity-60"
        >
          {label}
        </button>
        <p className="mt-2 text-center text-xs text-ink-faint">Secured by Paystack. A small platform fee applies.</p>
      </div>
    </section>
  );
}
