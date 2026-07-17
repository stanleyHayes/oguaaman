import { useEffect, useRef, useState } from "react";
import { Link, useLoaderData, useNavigate, useRevalidator, useSearchParams, type LoaderFunctionArgs } from "react-router-dom";
import { usePageTitle } from "@/lib/use-page-title";
import type { EventView, Ticket } from "@/lib/types";
import { api } from "@/lib/api";
import { completePayment } from "@/lib/paystack";
import { useRecordView } from "@/lib/use-record-view";
import { useAuth } from "@/lib/auth";
import { Container, Pill } from "@/components/ui";
import { LocationMap } from "@/components/location-map";
import { DetailHero } from "@/components/detail-hero";
import { ReportButton } from "@/components/report-button";
import { formatDate } from "@/lib/format";
import { cedis } from "./Projects";

export async function loader({ params }: LoaderFunctionArgs) {
  return api.eventView(params.slug!);
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
      // In-app Paystack modal; on success we confirm + update in place (no
      // navigation). Simulated/blocked → completePayment redirects instead.
      await completePayment(r, {
        onSuccess: async () => {
          setConfirming(true);
          try {
            setConfirmed(await api.confirmTicket(r.reference));
            revalidator.revalidate(); // re-run the loader so sold/remaining updates in place
          } catch {
            setError("We couldn't confirm that payment. If you were charged, it will reconcile shortly.");
          } finally {
            setConfirming(false);
          }
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the payment.");
    } finally {
      setBusy(false);
    }
  }

  const d = event.details;

  return (
    <>
      <DetailHero
        tone="green"
        backTo="/events"
        backLabel="All events"
        coverImageUrl={event.coverImageUrl}
        title={event.title}
        meta={
          <p className="font-medium text-gold">
            {d.startsAt && formatDate(d.startsAt)}{d.venue ? ` · ${d.venue}` : ""}{d.organiser ? ` · ${d.organiser}` : ""}
          </p>
        }
      >
        <span className="rounded-full border border-cream/25 bg-cream/10 px-3 py-1 text-xs font-medium text-cream backdrop-blur-sm">
          Event{d.anchorFestival ? " · homecoming" : ""}
        </span>
        {d.festival && (
          <Link to={`/festivals/${d.festival}`} className="rounded-full border border-gold/50 bg-gold/15 px-3 py-1 text-xs font-semibold text-gold transition-colors hover:bg-gold/25">
            Part of a festival →
          </Link>
        )}
      </DetailHero>

      <Container size="wide" className="grid gap-10 py-12 lg:grid-cols-[1.6fr_1fr]">
        <EventInfo event={event} />

        <aside className="space-y-6">
          <div className="rounded-[var(--radius-card)] border border-sand bg-cream p-6 shadow-[var(--shadow-card)] lg:sticky lg:top-20">
            <p className="eyebrow text-gold-text">Admission</p>
            <h2 className="mt-1 text-xl font-semibold text-ink">Tickets</h2>
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

          {d.venue && <LocationMap address={d.venue} query={`${event.title} ${d.venue}`} />}
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
      {d.description && <p className="font-serif text-lg leading-relaxed text-ink first-letter:float-left first-letter:mr-2 first-letter:text-5xl first-letter:font-semibold first-letter:leading-[0.85] first-letter:text-green-text">{d.description}</p>}
      {event.tags.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">{event.tags.map((t) => <Pill key={t}>#{t}</Pill>)}</div>
      )}
      {d.programme && d.programme.length > 0 && (
        <div className="mt-10">
          <h2 className="text-2xl font-semibold text-ink">Programme</h2>
          <div className="mt-4 h-[3px] w-14 rounded-full bg-gold-brand" aria-hidden />
          <ol className="mt-6 space-y-5 border-l-2 border-gold-brand/30 pl-5">
            {d.programme.map((p) => (
              <li key={`${p.day}-${p.time ?? ""}-${p.title}`} className="relative">
                <span className="absolute -left-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-full bg-gold-brand" aria-hidden />
                <p className="text-xs font-semibold uppercase tracking-wide text-gold-text">{p.day}{p.time ? ` · ${p.time}` : ""}</p>
                <p className="mt-1 text-sm text-ink">{p.title}</p>
              </li>
            ))}
          </ol>
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
        <p className="text-lg font-semibold text-green-text">Medaase! 🎟️</p>
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
          <b className="text-green-text">Free entry</b> — no ticket needed. Just come.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {tiers.map((t, i) => {
            const out = t.remaining !== null && t.remaining <= 0;
            let remainingLabel: string;
            if (t.remaining === null) remainingLabel = "Unlimited";
            else if (out) remainingLabel = "Sold out";
            else remainingLabel = `${t.remaining} left`;
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
                    {remainingLabel}
                  </span>
                </span>
                <span className="shrink-0 text-lg font-semibold text-green-text">{cedis(t.pricePesewas)}</span>
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
          <button type="button" onClick={onBuy} disabled={busy || !tier || !!soldOut} className="w-full rounded-full bg-green py-3 text-sm font-semibold text-on-green transition-colors hover:bg-green-900 disabled:opacity-60">
            {buyLabel}
          </button>
          <p className="text-center text-xs text-ink-faint">Mobile money &amp; cards via Paystack. Your code arrives here and by email.</p>
        </div>
      )}
    </>
  );
}
