import { useEffect, useRef, useState } from "react";
import { Link, useLoaderData, useNavigate, useRevalidator, useSearchParams, type LoaderFunctionArgs } from "react-router-dom";
import { LocationMap } from "@/components/location-map";
import { ReportButton } from "@/components/report-button";
import { Skeleton, SkeletonText } from "@/components/skeleton";
import { Container, Pill } from "@/components/ui";
import { api } from "@/lib/api";
import { cldCover } from "@/lib/cloudinary";
import { dayMonth, formatDate } from "@/lib/format";
import { completePayment } from "@/lib/paystack";
import type { EventView, Ticket } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { usePageTitle } from "@/lib/use-page-title";
import { useRecordView } from "@/lib/use-record-view";
import { cedis } from "./Projects";

export async function loader({ params }: LoaderFunctionArgs) {
  return api.eventView(params.slug!);
}

export function HydrateFallback() {
  return (
    <div className="bg-paper">
      <div className="bg-green-900 py-14 sm:py-20">
        <Container size="wide">
          <Skeleton className="h-5 w-32 bg-cream/15" />
          <Skeleton className="mt-9 h-12 w-full max-w-3xl bg-cream/15" />
          <Skeleton className="mt-3 h-12 w-3/5 max-w-xl bg-cream/15" />
          <SkeletonText lines={2} className="mt-7 max-w-2xl [&>span]:bg-cream/15" />
        </Container>
      </div>
      <Container size="wide" className="grid gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <SkeletonText lines={9} />
        <Skeleton className="h-96 w-full" />
      </Container>
    </div>
  );
}

function eventTime(iso?: string): string | null {
  if (!iso?.includes("T")) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GH", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Africa/Accra",
  }).format(date);
}

function EventHero({ event }: Readonly<{ event: EventView["event"] }>) {
  const details = event.details;
  const date = details.startsAt ? dayMonth(details.startsAt) : null;
  const time = eventTime(details.startsAt);

  return (
    <header className="on-dark on-dark-pin relative isolate overflow-hidden bg-green-900 text-cream">
      {event.coverImageUrl && (
        <img
          src={cldCover(event.coverImageUrl, 1800)}
          alt=""
          className="absolute inset-0 -z-20 h-full w-full object-cover"
        />
      )}
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-green-900 via-green-900/90 to-green-900/45" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-green-900 via-transparent to-green-900/25" />
      <div aria-hidden className="bg-dotgrid absolute inset-0 -z-10 opacity-25" />

      <Container size="wide" className="py-9 sm:py-12 lg:py-16">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-cream/70">
          <Link to="/" className="hover:text-gold">Home</Link>
          <span aria-hidden>/</span>
          <Link to="/events" className="hover:text-gold">Events</Link>
          <span aria-hidden>/</span>
          <span className="max-w-56 truncate text-cream">{event.title}</span>
        </nav>

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_10rem] lg:items-end">
          <div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-cream/25 bg-cream/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-cream backdrop-blur-sm">
                {details.anchorFestival ? "Homecoming event" : "Oguaa event"}
              </span>
              {details.festival && (
                <Link to={`/festivals/${details.festival}`} className="rounded-full border border-gold/50 bg-gold/15 px-3 py-1 text-xs font-semibold text-gold transition-colors hover:bg-gold/25">
                  Festival programme →
                </Link>
              )}
            </div>
            <h1 className="mt-5 max-w-4xl text-4xl font-semibold leading-[1.03] text-cream sm:text-5xl lg:text-6xl">{event.title}</h1>
            {details.description && <p className="mt-6 max-w-2xl text-base leading-relaxed text-cream/78 sm:text-lg">{details.description}</p>}
          </div>

          {date && (
            <div className="w-fit rounded-[var(--radius-card)] border border-cream/20 bg-green-900/65 p-4 text-center shadow-xl backdrop-blur-md lg:justify-self-end">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">{date.mon}</p>
              <p className="mt-1 text-5xl font-bold leading-none text-cream">{date.day}</p>
              <p className="mt-2 text-xs text-cream/65">{details.startsAt?.slice(0, 4)}{time ? ` · ${time}` : ""}</p>
            </div>
          )}
        </div>

        <dl className="mt-10 grid overflow-hidden rounded-[var(--radius-card)] border border-cream/15 bg-green-900/60 backdrop-blur-md sm:grid-cols-3">
          <HeroFact label="When" value={details.startsAt ? formatDate(details.startsAt) : "Date to be announced"} note={time ?? undefined} />
          <HeroFact label="Where" value={details.venue ?? "Venue to be announced"} />
          <HeroFact label="Hosted by" value={details.organiser ?? "Community organiser"} />
        </dl>
      </Container>
    </header>
  );
}

function HeroFact({ label, value, note }: Readonly<{ label: string; value: string; note?: string }>) {
  return (
    <div className="border-cream/15 px-5 py-4 sm:border-r sm:last:border-r-0">
      <dt className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-gold">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-cream">{value}</dd>
      {note && <dd className="mt-0.5 text-xs text-cream/60">{note}</dd>}
    </div>
  );
}

function ShareEvent({ title }: Readonly<{ title: string }>) {
  const [shared, setShared] = useState(false);

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title, text: `Join me at ${title}`, url: window.location.href });
      } else {
        await navigator.clipboard.writeText(window.location.href);
      }
      setShared(true);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }

  return (
    <button type="button" onClick={share} className="inline-flex items-center gap-2 text-xs font-semibold text-teal-text hover:underline">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
        <path d="m8.7 10.7 6.6-4.3M8.7 13.3l6.6 4.3" />
      </svg>
      {shared ? "Ready to share" : "Share event"}
    </button>
  );
}

export function Component() {
  const { event, tiers } = useLoaderData() as EventView;
  usePageTitle(event.title);
  useRecordView(event.id);
  const { member } = useAuth();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [params, setParams] = useSearchParams();

  const [selected, setSelected] = useState(0);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Ticket | null>(null);
  const [confirming, setConfirming] = useState(false);
  const confirmedRef = useRef(false);

  useEffect(() => {
    const ref = params.get("ticket_ref");
    if (!ref || confirmedRef.current) return;
    confirmedRef.current = true;
    setConfirming(true);
    api.confirmTicket(ref)
      .then((ticket) => {
        setConfirmed(ticket);
        setParams({}, { replace: true });
        revalidator.revalidate();
      })
      .catch(() => setError("We couldn't confirm that payment. If you were charged, it will reconcile shortly."))
      .finally(() => setConfirming(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function buy() {
    setError(null);
    const tier = tiers[selected];
    if (!tier) return;
    if (!member) {
      navigate("/signin", { state: { from: `/events/${event.slug}` } });
      return;
    }
    setBusy(true);
    try {
      const result = await api.buyTicket(event.slug, { tier: tier.name, qty });
      await completePayment(result, {
        onSuccess: async () => {
          setConfirming(true);
          try {
            setConfirmed(await api.confirmTicket(result.reference));
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

  const details = event.details;

  return (
    <>
      <EventHero event={event} />

      <Container size="wide" className="grid gap-8 py-10 sm:py-14 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-10">
        <EventInfo event={event} />

        <aside className="space-y-5 self-start lg:sticky lg:top-24">
          <section aria-labelledby="tickets-heading" className="overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-lift)]">
            <div className="border-b border-sand bg-green px-6 py-5 text-on-green">
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-gold">Admission</p>
              <div className="mt-1 flex items-end justify-between gap-4">
                <h2 id="tickets-heading" className="text-2xl font-semibold text-on-green">Choose your place</h2>
                {tiers.length > 0 && <span className="shrink-0 text-xs text-on-green/65">{tiers.length} {tiers.length === 1 ? "option" : "options"}</span>}
              </div>
            </div>
            <div className="p-5 sm:p-6">
              <TicketPanel
                confirming={confirming}
                confirmed={confirmed}
                tiers={tiers}
                selected={selected}
                qty={qty}
                busy={busy}
                error={error}
                signedIn={!!member}
                onSelectTier={(index) => { setSelected(index); setQty(1); }}
                onQtyChange={setQty}
                onBuy={buy}
              />
            </div>
          </section>

          {details.venue && (
            <LocationMap
              address={details.venue}
              query={`${event.title} ${details.venue}`}
              latitude={event.latitude}
              longitude={event.longitude}
            />
          )}
          <div className="flex items-center justify-between gap-4 px-1">
            <ShareEvent title={event.title} />
            <ReportButton listingId={event.id} />
          </div>
        </aside>
      </Container>
    </>
  );
}

function EventInfo({ event }: Readonly<{ event: EventView["event"] }>) {
  const details = event.details;
  const tags = event.tags ?? [];

  return (
    <div className="min-w-0 space-y-8">
      <section aria-labelledby="about-event" className="rounded-[var(--radius-card)] border border-sand bg-cream p-6 shadow-[var(--shadow-card)] sm:p-8">
        <p className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-gold-text">Know before you go</p>
        <h2 id="about-event" className="mt-2 text-3xl font-semibold text-ink">About this gathering</h2>
        {details.description ? (
          <p className="mt-5 max-w-3xl text-base leading-7 text-ink-muted sm:text-lg sm:leading-8">{details.description}</p>
        ) : (
          <p className="mt-5 text-sm text-ink-muted">More information will be added by the organiser.</p>
        )}

        {tags.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2 border-t border-sand pt-5">
            {tags.map((tag) => <Pill key={tag} tone="green">#{tag}</Pill>)}
          </div>
        )}
      </section>

      {details.programme && details.programme.length > 0 && (
        <section aria-labelledby="programme-heading" className="overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)]">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-sand px-6 py-5 sm:px-8">
            <div>
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-gold-text">Run of show</p>
              <h2 id="programme-heading" className="mt-1 text-3xl font-semibold text-ink">Programme</h2>
            </div>
            <p className="text-xs text-ink-faint">{details.programme.length} {details.programme.length === 1 ? "programme item" : "programme items"}</p>
          </div>
          <ol className="divide-y divide-sand">
            {details.programme.map((item, index) => (
              <li key={`${item.day}-${item.time ?? ""}-${item.title}`} className="grid gap-3 px-6 py-5 sm:grid-cols-[2.25rem_8rem_minmax(0,1fr)] sm:items-start sm:px-8">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-gold/[0.12] text-xs font-bold text-gold-text" aria-hidden>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-gold-text">{item.day}</p>
                  {item.time && <p className="mt-1 text-xs text-ink-faint">{item.time}</p>}
                </div>
                <p className="font-semibold leading-relaxed text-ink">{item.title}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {details.festival && (
        <section className="on-dark on-dark-pin relative overflow-hidden rounded-[var(--radius-card)] bg-green-900 p-6 text-cream shadow-[var(--shadow-card)] sm:p-8">
          <div aria-hidden className="bg-dotgrid absolute inset-0 opacity-30" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-gold">Part of something bigger</p>
              <h2 className="mt-2 text-2xl font-semibold text-cream">Explore the full festival</h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-cream/70">See every edition, programme update and community recap in the festival archive.</p>
            </div>
            <Link to={`/festivals/${details.festival}`} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-gold-brand px-5 text-sm font-semibold text-green-900 transition-colors hover:bg-gold">
              Open festival archive →
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

interface TicketPanelProps {
  readonly confirming: boolean;
  readonly confirmed: Ticket | null;
  readonly tiers: EventView["tiers"];
  readonly selected: number;
  readonly qty: number;
  readonly busy: boolean;
  readonly error: string | null;
  readonly signedIn: boolean;
  readonly onSelectTier: (index: number) => void;
  readonly onQtyChange: (fn: (qty: number) => number) => void;
  readonly onBuy: () => void;
}

function TicketPanel({ confirming, confirmed, tiers, selected, qty, busy, error, signedIn, onSelectTier, onQtyChange, onBuy }: TicketPanelProps) {
  const tier = tiers[selected];
  const soldOut = tier && tier.remaining !== null && tier.remaining < qty;
  const maxQty = tier && tier.remaining !== null ? Math.max(1, Math.min(10, tier.remaining)) : 10;
  let buyLabel = signedIn ? "Continue with Paystack" : "Sign in to reserve";
  if (busy) buyLabel = "Starting payment…";

  if (confirmed) {
    return (
      <div className="rounded-xl border border-green/25 bg-green/[0.06] p-5 text-center">
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-green text-xl text-on-green" aria-hidden>✓</span>
        <p className="mt-3 font-semibold text-green-text">Your place is confirmed</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">
          {confirmed.qty} × {confirmed.tier} for <b>{confirmed.eventTitle}</b> ({cedis(confirmed.amountPesewas)}).
        </p>
        <div className="mt-4 rounded-lg border border-dashed border-green/35 bg-paper px-3 py-4">
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-ink-faint">Gate code</p>
          <p className="mt-1 font-mono text-3xl font-bold tracking-[0.24em] text-ink">{confirmed.code}</p>
        </div>
        <p className="mt-3 text-xs text-ink-faint">Show this check-in code at the gate.</p>
        {confirmed.simulated && <p className="mt-2 text-xs text-gold-text">Simulated — dev mode, no real money moved.</p>}
        <Link to="/me" className="mt-4 inline-flex min-h-10 items-center text-sm font-semibold text-teal-text hover:underline">See all my tickets →</Link>
      </div>
    );
  }

  return (
    <>
      {confirming && (
        <div className="mb-4 flex items-center gap-3 rounded-lg bg-gold/[0.1] px-4 py-3 text-sm text-gold-text" role="status">
          <span className="h-2 w-2 animate-pulse rounded-full bg-gold-brand" aria-hidden />
          Confirming your payment…
        </div>
      )}
      {tiers.length === 0 ? (
        <div className="rounded-xl border border-green/25 bg-green/[0.06] p-5">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-green text-lg text-on-green" aria-hidden>✓</span>
          <p className="mt-3 font-semibold text-green-text">Free entry</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">No ticket needed. Save the date and simply come along.</p>
        </div>
      ) : (
        <div>
          <div className="space-y-2" role="group" aria-label="Ticket type">
            {tiers.map((item, index) => {
              const out = item.remaining !== null && item.remaining <= 0;
              let availability = "No capacity limit";
              if (out) availability = "Sold out";
              else if (item.remaining !== null) availability = `${item.remaining} remaining`;
              return (
                <button
                  key={item.name}
                  type="button"
                  disabled={out}
                  onClick={() => onSelectTier(index)}
                  aria-pressed={selected === index}
                  className={`group flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${selected === index ? "border-green bg-green/[0.07]" : "border-sand bg-paper hover:border-green/40"} disabled:cursor-not-allowed disabled:opacity-45`}
                >
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${selected === index ? "border-green" : "border-ink-faint/40"}`} aria-hidden>
                    {selected === index && <span className="h-2.5 w-2.5 rounded-full bg-green" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{item.name}</span>
                    <span className="block text-xs text-ink-faint">{availability}</span>
                  </span>
                  <span className="shrink-0 font-semibold text-green-text">{cedis(item.pricePesewas)}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-5 flex items-center justify-between border-y border-sand py-4">
            <div>
              <p className="text-sm font-semibold text-ink">Guests</p>
              <p className="text-xs text-ink-faint">Up to {maxQty} per order</p>
            </div>
            <div className="flex items-center overflow-hidden rounded-full border border-sand bg-paper">
              <button type="button" onClick={() => onQtyChange((current) => Math.max(1, current - 1))} disabled={qty <= 1} className="grid h-9 w-9 place-items-center text-ink-muted hover:bg-sand/60 disabled:opacity-35" aria-label="Fewer tickets">−</button>
              <span className="w-8 text-center text-sm font-bold text-ink" aria-live="polite">{qty}</span>
              <button type="button" onClick={() => onQtyChange((current) => Math.min(maxQty, current + 1))} disabled={qty >= maxQty} className="grid h-9 w-9 place-items-center text-ink-muted hover:bg-sand/60 disabled:opacity-35" aria-label="More tickets">+</button>
            </div>
          </div>

          {tier && (
            <div className="flex items-center justify-between py-4 text-sm">
              <span className="text-ink-muted">Order total</span>
              <strong className="text-lg text-ink">{cedis(tier.pricePesewas * qty)}</strong>
            </div>
          )}
          {error && <p className="mb-3 rounded-lg border border-clay/25 bg-clay/[0.06] p-3 text-sm text-clay-text" role="alert">{error}</p>}
          <button type="button" onClick={onBuy} disabled={busy || !tier || !!soldOut} className="min-h-12 w-full rounded-xl bg-green px-5 text-sm font-semibold text-on-green transition-colors hover:bg-green-900 disabled:cursor-not-allowed disabled:opacity-60">
            {buyLabel}
          </button>
          <p className="mt-3 text-center text-[0.7rem] leading-relaxed text-ink-faint">Mobile money and cards via Paystack. Your check-in code appears here and arrives by email.</p>
        </div>
      )}
    </>
  );
}
