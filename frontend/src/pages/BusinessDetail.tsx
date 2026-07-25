import { useEffect, useRef, useState } from "react";
import { Link, useLoaderData, useNavigate, useRevalidator, useSearchParams, type LoaderFunctionArgs } from "react-router-dom";
import { usePageTitle } from "@/lib/use-page-title";
import type { Listing, Plan, Review, Subscription } from "@/lib/types";
import { api } from "@/lib/api";
import { completePayment } from "@/lib/paystack";
import { useRecordView } from "@/lib/use-record-view";
import { useAuth } from "@/lib/auth";
import { Container, Pill, SampleNote } from "@/components/ui";
import { LocationMap } from "@/components/location-map";
import { Storefront } from "@/components/storefront";
import { ReportButton } from "@/components/report-button";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { Breadcrumbs, HeroIcon, HeroWatermark } from "@/components/hero-chrome";
import { cldCover } from "@/lib/cloudinary";
import { SAMPLE_NOTICE } from "@/lib/content";
import { formatDate } from "@/lib/format";

export async function loader({ params }: LoaderFunctionArgs) {
  const [business, plans, reviews] = await Promise.all([
    api.business(params.slug!),
    api.plans().catch(() => [] as Plan[]),
    api.businessReviews(params.slug!).catch(() => ({ reviews: [] as Review[], ratingAvg: 0, ratingCount: 0 })),
  ]);
  return { business, plans, reviews };
}

const cedis = (pesewas: number) =>
  "GH₵ " + (pesewas / 100).toLocaleString("en-GH", { maximumFractionDigits: 2 });

export function Component() {
  const { business: b, plans, reviews: initialReviews } = useLoaderData() as { business: Listing; plans: Plan[]; reviews: { reviews: Review[]; ratingAvg: number; ratingCount: number } };
  usePageTitle(b.title);
  useRecordView(b.id);
  const { member } = useAuth();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [params, setParams] = useSearchParams();
  const d = b.details;
  const isOwner = member?.id === b.ownerId;
  const productCount = (b.products ?? []).filter((item) => item.available).length;
  const storefrontServiceCount = (b.services ?? []).filter((item) => item.available).length;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Subscription | null>(null);
  const [confirming, setConfirming] = useState(false);
  const confirmedRef = useRef(false);

  useEffect(() => {
    const ref = params.get("sub_ref");
    if (!ref || confirmedRef.current) return;
    confirmedRef.current = true;
    setConfirming(true);
    api.confirmSubscription(ref)
      .then((subscription) => {
        setConfirmed(subscription);
        setParams({}, { replace: true });
        revalidator.revalidate();
      })
      .catch(() => setError("We couldn't confirm that payment. If you were charged, it will reconcile shortly."))
      .finally(() => setConfirming(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const plan = plans.filter((candidate) => candidate.interval === "month").sort((x, y) => x.sortOrder - y.sortOrder)[0];
  const price = plan ? (plan.prices.business ?? plan.prices.default ?? 0) : 0;

  async function subscribe() {
    setError(null);
    if (!member) {
      navigate("/signin", { state: { from: "/business/" + b.slug } });
      return;
    }
    setBusy(true);
    try {
      const response = await api.subscribe(b.slug, plan?.slug);
      await completePayment(response, {
        onSuccess: async () => {
          setConfirming(true);
          try {
            setConfirmed(await api.confirmSubscription(response.reference));
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

  let subscribeLabel = "Subscribe with Paystack";
  if (busy) subscribeLabel = "Starting payment…";
  else if (b.supporter) subscribeLabel = "Renew — add another month";

  return (
    <article>
      <section className="on-dark on-dark-pin relative isolate overflow-hidden bg-green-900 text-cream">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(199,162,74,0.18),transparent_32%),linear-gradient(135deg,#0C2C1F_0%,#123F2D_60%,#071A12_100%)]" aria-hidden />
        <div className="bg-dotgrid absolute inset-0 opacity-25" aria-hidden />
        <HeroWatermark sectionId="business" onDark />
        <Container size="wide" className="relative py-10 sm:py-14 lg:py-16">
          <Reveal><Breadcrumbs crumbs={[{ label: "Home", to: "/" }, { label: "Business directory", to: "/business" }, { label: b.title }]} onDark /></Reveal>

          <div className="mt-8 grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-16">
            <div className="min-w-0">
              <Reveal delay={0.04}><HeroIcon sectionId="business" onDark /></Reveal>
              <Reveal delay={0.08} className="mt-5 flex flex-wrap items-center gap-2">
                {d.category && <span className="rounded-full border border-cream/20 bg-cream/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-cream backdrop-blur-sm">{d.category}</span>}
                {b.supporter && <span className="rounded-full bg-gold-brand px-3 py-1 text-xs font-bold text-green-900">★ Oguaa Supporter</span>}
                {b.featured && <span className="rounded-full border border-gold/50 bg-gold/10 px-3 py-1 text-xs font-semibold text-gold">Featured locally</span>}
              </Reveal>
              <Reveal as="h1" delay={0.12} className="mt-5 max-w-4xl text-5xl font-semibold leading-[0.95] text-cream sm:text-6xl lg:text-7xl">{b.title}</Reveal>
              {d.description && <Reveal delay={0.16} className="mt-6 max-w-2xl text-lg leading-relaxed text-cream/82">{d.description}</Reveal>}
              <Reveal delay={0.2} className="mt-8 flex flex-wrap items-center gap-3 text-sm">
                {d.contact?.[0] && <a href={d.contact[0].url} target="_blank" rel="noopener noreferrer" className="group inline-flex min-h-11 items-center gap-3 rounded-full bg-gold-brand px-5 font-semibold text-green-900 transition-colors hover:bg-gold">Start an enquiry <span className="transition-transform group-hover:translate-x-0.5" aria-hidden>↗</span></a>}
                {d.address && <a href="#location" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-cream/25 bg-cream/[0.07] px-4 text-cream transition-colors hover:border-gold hover:text-gold"><span aria-hidden>⌖</span> Plan a visit</a>}
                {isOwner && <Link to={`/business/${b.slug}/manage`} className="inline-flex min-h-11 items-center rounded-full border border-cream/25 px-4 font-semibold text-cream transition-colors hover:border-gold hover:text-gold">{b.supporter ? "Edit storefront" : "Build your storefront"}</Link>}
              </Reveal>
            </div>

            <Reveal delay={0.12} className="relative mx-auto w-full max-w-md lg:mx-0">
              <div className="absolute -inset-3 rotate-2 rounded-[1.75rem] border border-gold/30 bg-gold/[0.08]" aria-hidden />
              <figure className="relative aspect-[4/5] overflow-hidden rounded-[1.5rem] border border-cream/20 bg-green-900 shadow-2xl">
                {b.coverImageUrl ? <img src={cldCover(b.coverImageUrl, 900)} alt={b.title} className="h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <div className="flex h-full items-center justify-center text-8xl text-gold/30" aria-hidden>◇</div>}
                <div className="absolute inset-0 bg-gradient-to-t from-green-900/85 via-transparent to-transparent" aria-hidden />
                <figcaption className="absolute inset-x-0 bottom-0 p-6">
                  <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-gold">Cape Coast storefront</p>
                  <p className="mt-2 text-xl font-semibold text-cream">{d.category ?? "Local business"}</p>
                  {initialReviews.ratingCount > 0 && <p className="mt-2 flex items-center gap-2 text-sm text-cream/75"><Stars value={initialReviews.ratingAvg} size="text-sm" /> {initialReviews.ratingAvg.toFixed(1)} from {initialReviews.ratingCount} reviews</p>}
                </figcaption>
              </figure>
            </Reveal>
          </div>

          <Reveal delay={0.24} className="mt-10 grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-cream/15 bg-cream/15 sm:grid-cols-3">
            <HeroFact label="Storefront" value={`${productCount} products · ${storefrontServiceCount} services`} />
            <HeroFact label="Location" value={d.address ?? "Cape Coast"} />
            <HeroFact label="Hours" value={d.openingHours ?? "Contact for current hours"} />
          </Reveal>
        </Container>
      </section>

      <div className="sticky top-0 z-20 border-b border-sand bg-paper/95 shadow-[0_8px_24px_rgba(18,63,45,0.05)] backdrop-blur-md">
        <Container size="wide" className="flex items-center gap-5 overflow-x-auto py-3 text-sm [scrollbar-width:none]">
          <a href="#storefront" className="shrink-0 font-semibold text-green-text hover:text-gold-text">Storefront</a>
          {productCount > 0 && <a href="#products" className="shrink-0 text-ink-muted hover:text-green-text">Products <span className="ml-1 rounded-full bg-gold/[0.12] px-2 py-0.5 text-xs text-gold-text">{productCount}</span></a>}
          {storefrontServiceCount > 0 && <a href="#storefront-services" className="shrink-0 text-ink-muted hover:text-green-text">Services <span className="ml-1 rounded-full bg-teal/[0.1] px-2 py-0.5 text-xs text-teal-text">{storefrontServiceCount}</span></a>}
          {d.address && <a href="#location" className="shrink-0 text-ink-muted hover:text-green-text">Visit</a>}
          <a href="#reviews" className="shrink-0 text-ink-muted hover:text-green-text">Reviews</a>
          <div className="ml-auto flex shrink-0 gap-2">
            {d.contact?.map((contact) => <a key={contact.label} href={contact.url} target="_blank" rel="noopener noreferrer" className="rounded-full border border-teal/30 px-3 py-1.5 font-semibold text-teal-text transition-colors hover:bg-teal hover:text-cream">{contact.label} ↗</a>)}
          </div>
        </Container>
      </div>

      <Container size="wide" className="grid gap-10 py-12 lg:grid-cols-[minmax(0,1.5fr)_22rem] lg:gap-14 lg:py-16">
        <div className="min-w-0 space-y-16">
          {storefrontServiceCount === 0 && <Reveal as="section">
            <p className="eyebrow text-teal-text">What they offer</p>
            <h2 className="mt-3 text-3xl font-semibold text-ink sm:text-4xl">Services &amp; prices</h2>
            <div className="mt-4 h-1 w-16 rounded-full bg-teal" aria-hidden />
            {d.services && d.services.length > 0 ? (
              <Stagger as="ul" className="mt-7 grid gap-3 sm:grid-cols-2">
                {d.services.map((service, index) => (
                  <StaggerItem as="li" key={service.name} className="group relative overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream p-5 shadow-[var(--shadow-card)]">
                    <span className="absolute inset-y-0 left-0 w-1 bg-teal/70 transition-colors group-hover:bg-gold-brand" aria-hidden />
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <span className="text-[0.68rem] font-semibold tabular-nums text-ink-faint">{String(index + 1).padStart(2, "0")}</span>
                        <h3 className="mt-2 text-lg font-semibold text-ink">{service.name}</h3>
                        {service.note && <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{service.note}</p>}
                      </div>
                      {service.price && <span className="shrink-0 rounded-full bg-gold/[0.12] px-3 py-1 text-sm font-semibold text-gold-text">{service.price}</span>}
                    </div>
                  </StaggerItem>
                ))}
              </Stagger>
            ) : (
              <div className="mt-7 rounded-[var(--radius-card)] border border-dashed border-sand bg-cream p-6 text-ink-muted">Contact the business for its current services and prices.</div>
            )}
          </Reveal>}

          <Storefront business={b} />

          {b.tags.length > 0 && (
            <Reveal as="section">
              <h2 className="text-2xl font-semibold text-ink">Known for</h2>
              <div className="mt-4 flex flex-wrap gap-2">{b.tags.map((tag) => <Pill key={tag} tone="teal">#{tag}</Pill>)}</div>
            </Reveal>
          )}

          {d.address && (
            <Reveal as="section" className="scroll-mt-24" >
              <div id="location" className="scroll-mt-24">
                <p className="eyebrow text-teal-text">Visit in person</p>
                <h2 className="mt-3 text-3xl font-semibold text-ink">Find {b.title}</h2>
                <p className="mt-3 max-w-2xl text-ink-muted">{d.address}{d.openingHours ? " · " + d.openingHours : ""}</p>
                <LocationMap className="mt-6" address={d.address} query={b.title} latitude={b.latitude} longitude={b.longitude} />
              </div>
            </Reveal>
          )}

          <BusinessReviews slug={b.slug} initial={initialReviews} canReview={member != null && !isOwner} />
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <div className="overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)]">
            <div className="bg-green px-5 py-4 text-on-green">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold">Plan your visit</p>
              <h2 className="mt-1 text-2xl font-semibold text-on-green">At a glance</h2>
            </div>
            <dl className="divide-y divide-sand p-5 text-sm">
              {initialReviews.ratingCount > 0 && (
                <div className="flex items-center justify-between gap-4 py-3 first:pt-0">
                  <dt className="text-ink-faint">Rating</dt>
                  <dd className="flex items-center gap-1.5 font-medium text-ink"><Stars value={initialReviews.ratingAvg} /> {initialReviews.ratingAvg.toFixed(1)} <span className="text-ink-faint">({initialReviews.ratingCount})</span></dd>
                </div>
              )}
              {d.category && <div className="flex justify-between gap-4 py-3 first:pt-0"><dt className="text-ink-faint">Category</dt><dd className="text-right font-medium text-ink">{d.category}</dd></div>}
              {d.address && <div className="flex justify-between gap-4 py-3"><dt className="text-ink-faint">Location</dt><dd className="max-w-48 text-right text-ink">{d.address}</dd></div>}
              {d.openingHours && <div className="flex justify-between gap-4 py-3 last:pb-0"><dt className="text-ink-faint">Hours</dt><dd className="max-w-48 text-right text-ink">{d.openingHours}</dd></div>}
            </dl>
            {(d.contact?.length ?? 0) > 0 && (
              <div className="grid gap-2 border-t border-sand p-5">
                {d.contact?.map((contact) => (
                  <a key={contact.label} href={contact.url} target="_blank" rel="noopener noreferrer" className="group flex items-center justify-between rounded-full border border-teal/35 px-4 py-2.5 text-sm font-semibold text-teal-text transition-colors hover:bg-teal hover:text-cream">
                    {contact.label} <span className="transition-transform group-hover:translate-x-0.5" aria-hidden>↗</span>
                  </a>
                ))}
              </div>
            )}
          </div>

          {isOwner && plan && (
            <div className="relative overflow-hidden rounded-[var(--radius-card)] border border-gold-border/40 bg-gold/[0.07] p-5">
              <span className="absolute -right-6 -top-8 text-8xl text-gold opacity-10" aria-hidden>★</span>
              <div className="relative">
                <p className="eyebrow text-gold-text">Support Oguaa</p>
                <h2 className="mt-2 text-xl font-semibold text-ink">{plan.name}</h2>
                <p className="mt-1 text-2xl font-semibold text-gold-text">{cedis(price)}<span className="text-sm font-normal text-ink-faint"> / month</span></p>
                <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                  Keep the platform running and give {b.title} {(plan.perks ?? []).length > 0 ? (plan.perks ?? []).map((perk) => perk.toLowerCase()).join(", ") : "a boost in the business directory"}. Each payment adds another month.
                </p>
                {b.supporter && d.subscribedUntil && <p className="mt-3 rounded-lg bg-gold/[0.1] p-3 text-sm font-medium text-gold-text">★ Active until {formatDate(d.subscribedUntil)}</p>}
                {confirming && <p className="mt-4 text-sm text-ink-muted">Confirming your payment…</p>}
                {confirmed ? (
                  <div className="mt-4 rounded-lg border border-green/30 bg-green/[0.06] p-4">
                    <p className="text-base font-semibold text-green-text">Medaase! Your support is confirmed.</p>
                    <p className="mt-1 text-sm text-ink-muted">
                      {b.title} is a Supporter until <b>{confirmed.periodEnd ? formatDate(confirmed.periodEnd) : "next month"}</b>.
                      {confirmed.simulated && <span className="mt-1 block text-xs text-gold-text">Simulated — dev mode, no real money moved.</span>}
                    </p>
                  </div>
                ) : (
                  <div className="mt-4">
                    {error && <p className="mb-2 text-sm text-clay-text">{error}</p>}
                    <button type="button" onClick={subscribe} disabled={busy} className="w-full rounded-full bg-gold-brand py-3 text-sm font-semibold text-green-900 transition-colors hover:bg-gold disabled:opacity-60">
                      {subscribeLabel}
                    </button>
                    <p className="mt-2 text-center text-xs text-ink-faint">Mobile money &amp; cards via Paystack.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end"><ReportButton listingId={b.id} /></div>
        </aside>
      </Container>

      <Container><SampleNote>{SAMPLE_NOTICE}</SampleNote></Container>
    </article>
  );
}

function HeroFact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="bg-green-900/70 px-5 py-4 backdrop-blur-sm">
      <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-gold">{label}</p>
      <p className="mt-1 line-clamp-2 text-sm text-cream/82">{value}</p>
    </div>
  );
}

// Stars renders a 0–5 star rating (rounded to the nearest half is overkill here;
// we fill whole stars up to the rounded value).
function Stars({ value, size = "text-base" }: Readonly<{ value: number; size?: string }>) {
  const filled = Math.round(value);
  return (
    <span className={`inline-flex ${size} leading-none text-gold-brand`} aria-label={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= filled ? "text-gold-brand" : "text-sand"}>★</span>
      ))}
    </span>
  );
}

function BusinessReviews({ slug, initial, canReview }: Readonly<{ slug: string; initial: { reviews: Review[]; ratingAvg: number; ratingCount: number }; canReview: boolean }>) {
  const [data, setData] = useState(initial);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await api.reviewBusiness(slug, { rating, body: body.trim() || undefined });
      setData(await api.businessReviews(slug));
      setBody("");
      setDone(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not post your review.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="reviews" className="scroll-mt-28">
      <Reveal>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-gold-text">What people say</p>
          <h2 className="mt-3 text-3xl font-semibold text-ink">Reviews &amp; ratings</h2>
        </div>
        {data.ratingCount > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-3xl font-semibold text-ink">{data.ratingAvg.toFixed(1)}</span>
            <div><Stars value={data.ratingAvg} /><p className="text-xs text-ink-faint">{data.ratingCount} {data.ratingCount === 1 ? "review" : "reviews"}</p></div>
          </div>
        )}
      </div>

      {canReview && !done && (
        <div className="mt-6 rounded-[var(--radius-card)] border border-sand bg-cream p-5">
          <p className="text-sm font-semibold text-ink">Leave a review</p>
          <div className="mt-3 flex items-center gap-1" role="radiogroup" aria-label="Your rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => setRating(n)} className={`text-2xl leading-none transition-transform hover:scale-110 ${n <= rating ? "text-gold-brand" : "text-sand"}`}>★</button>
            ))}
          </div>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={1500} placeholder="Share your experience (optional)" className="mt-3 w-full resize-none rounded-lg border border-sand bg-paper px-3 py-2 text-sm text-ink focus:border-green focus:outline-none" />
          {error && <p role="alert" className="mt-2 text-sm text-clay-text">{error}</p>}
          <button type="button" onClick={submit} disabled={busy} className="mt-3 rounded-full bg-green px-5 py-2 text-sm font-semibold text-on-green transition-colors hover:bg-green-900 disabled:opacity-60">
            {busy ? "Posting…" : "Post review"}
          </button>
        </div>
      )}
      {done && <p className="mt-6 rounded-[var(--radius-card)] border border-green/25 bg-green/[0.06] p-4 text-sm text-green-text">Medaase — your review is posted.</p>}

      {data.reviews.length === 0 ? (
        <p className="mt-6 text-ink-muted">No reviews yet{canReview ? " — be the first." : "."}</p>
      ) : (
        <div className="mt-6 space-y-4">
          {data.reviews.map((r) => (
            <div key={r.id} className="rounded-[var(--radius-card)] border border-sand bg-cream p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-ink">{r.authorName}</span>
                <Stars value={r.rating} size="text-sm" />
              </div>
              {r.body && <p className="mt-2 text-sm leading-relaxed text-ink-muted">{r.body}</p>}
              <p className="mt-2 text-xs text-ink-faint">{formatDate(r.createdAt)}</p>
            </div>
          ))}
        </div>
      )}
      </Reveal>
    </section>
  );
}
