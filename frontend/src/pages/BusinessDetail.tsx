import { useEffect, useRef, useState } from "react";
import { Link, useLoaderData, useNavigate, useRevalidator, useSearchParams, type LoaderFunctionArgs } from "react-router-dom";
import type { Listing, Subscription } from "@/lib/types";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Container, Pill, SampleNote } from "@/components/ui";
import { Thumb } from "@/components/cards";
import { LocationMap } from "@/components/location-map";
import { SAMPLE_NOTICE } from "@/lib/content";
import { formatDate } from "@/lib/format";

export async function loader({ params }: LoaderFunctionArgs) {
  return api.business(params.slug!);
}

export function Component() {
  const b = useLoaderData() as Listing;
  const { member } = useAuth();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [params, setParams] = useSearchParams();
  const d = b.details;
  const isOwner = member != null && member.id === b.ownerId;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Confirmation state when the owner returns from Paystack (?sub_ref=…).
  const [confirmed, setConfirmed] = useState<Subscription | null>(null);
  const [confirming, setConfirming] = useState(false);
  const confirmedRef = useRef(false);

  useEffect(() => {
    const ref = params.get("sub_ref");
    if (!ref || confirmedRef.current) return;
    confirmedRef.current = true; // confirm once, even across re-renders
    setConfirming(true);
    api.confirmSubscription(ref)
      .then((s) => {
        setConfirmed(s);
        setParams({}, { replace: true });
        revalidator.revalidate(); // re-run the loader so the badge/expiry updates in place
      })
      .catch(() => setError("We couldn't confirm that payment. If you were charged, it will reconcile shortly."))
      .finally(() => setConfirming(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function subscribe() {
    setError(null);
    if (!member) { navigate("/signin", { state: { from: `/business/${b.slug}` } }); return; }
    setBusy(true);
    try {
      const r = await api.subscribe(b.slug);
      window.location.assign(r.authorizationUrl); // off to Paystack (or straight back, in dev simulation)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the payment.");
      setBusy(false);
    }
  }

  return (
    <>
      <Container size="wide" className="py-10">
        <Link to="/business" className="text-sm text-teal-text hover:underline">← Business directory</Link>
      </Container>
      <Container size="wide" className="grid gap-10 pb-12 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="teal">{d.category}</Pill>
            {b.supporter && <Pill tone="gold">★ Supporter</Pill>}
          </div>
          <h1 className="mt-3 font-display text-4xl font-semibold text-ink sm:text-5xl">{b.title}</h1>
          <Thumb seed={b.slug} src={b.coverImageUrl} className="mt-6 aspect-[16/7] w-full" />
          <p className="mt-6 font-serif text-lg leading-relaxed text-ink">{d.description}</p>
          {d.services && d.services.length > 0 && (
            <section className="mt-8">
              <h2 className="font-display text-xl font-semibold text-ink">Services</h2>
              <ul className="mt-3 divide-y divide-sand overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream">
                {d.services.map((s) => (
                  <li key={s.name} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="text-ink">{s.name}{s.note && <span className="ml-2 text-xs text-ink-faint">{s.note}</span>}</span>
                    {s.price && <span className="shrink-0 font-medium text-teal-text">{s.price}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <aside className="space-y-6">
          <div className="rounded-[var(--radius-card)] border border-sand bg-cream p-5">
            <p className="eyebrow text-teal-text">Find them</p>
            <dl className="mt-3 space-y-3 text-sm">
              {d.address && <div><dt className="text-ink-faint">Location</dt><dd className="text-ink">📍 {d.address}</dd></div>}
              {d.openingHours && <div><dt className="text-ink-faint">Hours</dt><dd className="text-ink">{d.openingHours}</dd></div>}
            </dl>
            {d.contact && d.contact.length > 0 && (
              <div className="mt-4 grid gap-2">
                {d.contact.map((c) => (
                  <a key={c.label} href={c.url} className="flex items-center justify-between rounded-lg border border-teal px-4 py-2.5 text-sm font-semibold text-teal-text hover:bg-teal/[0.06]">{c.label} <span aria-hidden>↗</span></a>
                ))}
              </div>
            )}
          </div>

          {isOwner && (
            <div className="rounded-[var(--radius-card)] border border-gold-border/40 bg-gold/[0.06] p-5">
              <p className="eyebrow text-gold-text">Support Oguaa</p>
              <h2 className="mt-1 font-display text-lg font-semibold text-ink">Supporter — GH₵ 50/month</h2>
              <p className="mt-2 text-sm text-ink-muted">
                Your GH₵ 50 a month keeps the platform running — and gives {b.title} the gold Supporter badge and priority placement in the business directory.
                Renew manually: each payment adds another month.
              </p>
              {b.supporter && d.subscribedUntil && (
                <p className="mt-3 text-sm font-medium text-gold-text">★ Supporter active until {formatDate(d.subscribedUntil)}</p>
              )}
              {confirming && <p className="mt-4 text-sm text-ink-muted">Confirming your payment…</p>}
              {confirmed ? (
                <div className="mt-4 rounded-lg border border-green/30 bg-green/[0.06] p-4">
                  <p className="font-display text-base font-semibold text-green">Medaase! 🎉</p>
                  <p className="mt-1 text-sm text-ink-muted">
                    Your support is confirmed — {b.title} is a Supporter until <b>{confirmed.periodEnd ? formatDate(confirmed.periodEnd) : "next month"}</b>.
                    {confirmed.simulated && <span className="mt-1 block text-xs text-gold-text">Simulated — dev mode, no real money moved.</span>}
                  </p>
                </div>
              ) : (
                <div className="mt-4">
                  {error && <p className="mb-2 text-sm text-clay-text">{error}</p>}
                  <button type="button" onClick={subscribe} disabled={busy} className="w-full rounded-full bg-gold-brand py-3 text-sm font-semibold text-green-900 transition-colors hover:bg-gold disabled:opacity-60">
                    {busy ? "Starting payment…" : b.supporter ? "Renew — add another month" : "Subscribe with Paystack"}
                  </button>
                  <p className="mt-2 text-center text-xs text-ink-faint">Mobile money &amp; cards via Paystack. GH₵ 50 per month.</p>
                </div>
              )}
            </div>
          )}

          {d.address && <LocationMap address={d.address} query={b.title} />}
        </aside>
      </Container>
      <Container><SampleNote>{SAMPLE_NOTICE}</SampleNote></Container>
    </>
  );
}
