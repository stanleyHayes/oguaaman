import { useEffect, useRef, useState } from "react";
import { Link, useLoaderData, useNavigate, useRevalidator, useSearchParams, type LoaderFunctionArgs } from "react-router-dom";
import type { EventView, Ticket } from "@/lib/types";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Container, Pill } from "@/components/ui";
import { Thumb } from "@/components/cards";
import { ReportButton } from "@/components/report-button";
import { formatDate, initials } from "@/lib/format";
import { cedis } from "./Projects";

export async function loader({ params }: LoaderFunctionArgs) {
  return api.eventView(params.slug!);
}

export function Component() {
  const { event, tiers } = useLoaderData() as EventView;
  const { member } = useAuth();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [params, setParams] = useSearchParams();

  const [selected, setSelected] = useState(0);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Confirmation state when the buyer returns from Paystack (?ticket_ref=…).
  const [confirmed, setConfirmed] = useState<Ticket | null>(null);
  const [confirming, setConfirming] = useState(false);
  const confirmedRef = useRef(false);

  useEffect(() => {
    const ref = params.get("ticket_ref");
    if (!ref || confirmedRef.current) return;
    confirmedRef.current = true; // confirm once, even across re-renders
    setConfirming(true);
    api.confirmTicket(ref)
      .then((t) => {
        setConfirmed(t);
        setParams({}, { replace: true });
        revalidator.revalidate(); // re-run the loader so sold/remaining updates in place
      })
      .catch(() => setError("We couldn't confirm that payment. If you were charged, it will reconcile shortly."))
      .finally(() => setConfirming(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function buy() {
    setError(null);
    const tier = tiers[selected];
    if (!tier) return;
    if (!member) { navigate("/signin", { state: { from: `/events/${event.slug}` } }); return; }
    setBusy(true);
    try {
      const r = await api.buyTicket(event.slug, { tier: tier.name, qty });
      window.location.assign(r.authorizationUrl); // off to Paystack (or straight back, in dev simulation)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the payment.");
      setBusy(false);
    }
  }

  return (
    <>
      <Container size="wide" className="py-10">
        <Link to="/events" className="text-sm text-teal-text hover:underline">← All events</Link>
      </Container>
      <Container size="wide" className="grid gap-10 pb-12 lg:grid-cols-[1.6fr_1fr]">
        <EventInfo event={event} />

        <aside className="space-y-6">
          <div className="rounded-[var(--radius-card)] border border-sand bg-cream p-6">
            <h2 className="font-display text-xl font-semibold text-ink">Tickets</h2>
            <TicketPanel
              confirming={confirming}
              confirmed={confirmed}
              tiers={tiers}
              selected={selected}
              qty={qty}
              busy={busy}
              error={error}
              signedIn={!!member}
              onSelectTier={(i) => { setSelected(i); setQty(1); }}
              onQtyChange={setQty}
              onBuy={buy}
            />
          </div>

          <div className="flex justify-end"><ReportButton listingId={event.id} /></div>
        </aside>
      </Container>
    </>
  );
}

function EventInfo({ event }: Readonly<{ event: EventView["event"] }>) {
  const d = event.details;
  return (
    <div>
      <Pill tone="gold">Event{d.anchorFestival ? " · homecoming" : ""}</Pill>
      <h1 className="mt-3 font-display text-4xl font-semibold text-ink sm:text-5xl">{event.title}</h1>
      <p className="mt-2 text-sm font-medium text-gold-text">
        {d.startsAt && formatDate(d.startsAt)}{d.venue ? ` · ${d.venue}` : ""}{d.organiser ? ` · ${d.organiser}` : ""}
      </p>
      <Thumb seed={event.slug} src={event.coverImageUrl} label={initials(event.title)} className="mt-6 aspect-[16/7] w-full" />
      {d.description && <p className="mt-6 font-serif text-lg leading-relaxed text-ink">{d.description}</p>}
      {event.tags.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">{event.tags.map((t) => <Pill key={t}>#{t}</Pill>)}</div>
      )}
      {d.programme && d.programme.length > 0 && (
        <div className="mt-8">
          <h2 className="font-display text-2xl font-semibold text-ink">Programme</h2>
          <ul className="mt-4 space-y-3">
            {d.programme.map((p, i) => (
              <li key={i} className="rounded-[var(--radius-card)] border border-sand bg-cream p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gold-text">{p.day}{p.time ? ` · ${p.time}` : ""}</p>
                <p className="mt-1 text-sm text-ink">{p.title}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {d.festival && (
        <Link to={`/festivals/${d.festival}`} className="mt-8 inline-block rounded-full border border-gold-border/60 px-4 py-2 text-sm font-semibold text-gold-text hover:bg-gold/[0.08]">
          See every edition in the festival archive →
        </Link>
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
  readonly onSelectTier: (i: number) => void;
  readonly onQtyChange: (fn: (q: number) => number) => void;
  readonly onBuy: () => void;
}

function TicketPanel({ confirming, confirmed, tiers, selected, qty, busy, error, signedIn, onSelectTier, onQtyChange, onBuy }: TicketPanelProps) {
  const tier = tiers[selected];
  const soldOut = tier && tier.remaining !== null && tier.remaining < qty;
  const maxQty = tier && tier.remaining !== null ? Math.max(1, Math.min(10, tier.remaining)) : 10;
  let buyLabel = signedIn ? "Buy with Paystack" : "Sign in to buy";
  if (busy) buyLabel = "Starting payment…";

  if (confirmed) {
    return (
      <div className="mt-4 rounded-lg border border-green/30 bg-green/[0.06] p-5 text-center">
        <p className="font-display text-lg font-semibold text-green">Medaase! 🎟️</p>
        <p className="mt-1 text-sm text-ink-muted">
          {confirmed.qty} × {confirmed.tier} for <b>{confirmed.eventTitle}</b> ({cedis(confirmed.amountPesewas)}).
        </p>
        <p className="mt-4 font-mono text-3xl font-bold tracking-[0.3em] text-ink">{confirmed.code}</p>
        <p className="mt-2 text-xs text-ink-faint">Your check-in code — show this at the gate.</p>
        {confirmed.simulated && <p className="mt-2 text-xs text-gold-text">Simulated — dev mode, no real money moved.</p>}
        <Link to="/me" className="mt-4 inline-block text-sm font-semibold text-teal-text hover:underline">See all my tickets →</Link>
      </div>
    );
  }

  return (
    <>
      {confirming && <p className="mt-4 text-sm text-ink-muted">Confirming your payment…</p>}
      {tiers.length === 0 ? (
        <p className="mt-4 rounded-lg border border-green/30 bg-green/[0.06] p-4 text-sm text-ink-muted">
          <b className="text-green">Free entry</b> — no ticket needed. Just come.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {tiers.map((t, i) => {
            const out = t.remaining !== null && t.remaining <= 0;
            return (
              <button
                key={t.name}
                type="button"
                disabled={out}
                onClick={() => onSelectTier(i)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg border p-4 text-left transition-colors ${selected === i ? "border-green bg-green/[0.06]" : "border-sand bg-paper hover:border-green/40"} disabled:opacity-50`}
              >
                <span className="min-w-0">
                  <span className="block font-medium text-ink">{t.name}</span>
                  <span className="text-xs text-ink-faint">
                    {t.remaining === null ? "Unlimited" : out ? "Sold out" : `${t.remaining} left`}
                  </span>
                </span>
                <span className="shrink-0 font-display text-lg font-semibold text-green">{cedis(t.pricePesewas)}</span>
              </button>
            );
          })}

          <div className="flex items-center justify-between pt-2">
            <p className="text-sm font-medium text-ink">Quantity</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => onQtyChange((q) => Math.max(1, q - 1))} className="h-8 w-8 rounded-full border border-sand bg-paper text-ink-muted hover:border-green/40" aria-label="Fewer">−</button>
              <span className="w-6 text-center font-semibold text-ink">{qty}</span>
              <button type="button" onClick={() => onQtyChange((q) => Math.min(maxQty, q + 1))} className="h-8 w-8 rounded-full border border-sand bg-paper text-ink-muted hover:border-green/40" aria-label="More">+</button>
            </div>
          </div>

          {tier && (
            <p className="text-right text-sm text-ink-muted">
              Total: <b className="text-ink">{cedis(tier.pricePesewas * qty)}</b>
            </p>
          )}
          {error && <p className="text-sm text-clay-text">{error}</p>}
          <button type="button" onClick={onBuy} disabled={busy || !tier || !!soldOut} className="w-full rounded-full bg-green py-3 text-sm font-semibold text-cream transition-colors hover:bg-green-900 disabled:opacity-60">
            {buyLabel}
          </button>
          <p className="text-center text-xs text-ink-faint">Mobile money &amp; cards via Paystack. Your code arrives here and by email.</p>
        </div>
      )}
    </>
  );
}
