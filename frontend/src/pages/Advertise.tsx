import type { ReactNode } from "react";
import { Link, useLoaderData, useRevalidator, useSearchParams } from "react-router-dom";
import { PageHero } from "@/components/page-hero";
import { Container, CTA as Cta, Eyebrow, SectionHeading } from "@/components/ui";
import { Adinkra } from "@/components/adinkra";
import { Reveal } from "@/components/motion";
import { Skeleton, SkeletonText } from "@/components/skeleton";
import { AdWizard } from "@/components/ads/ad-wizard";
import { RateCardTable } from "@/components/ads/rate-card-table";
import { api } from "@/lib/api";
import { BLOCKED_CATEGORY_NAMES } from "@/lib/ads";
import { useAuth } from "@/lib/auth";
import { mediaUrl } from "@/lib/cloudinary";
import { LEGAL } from "@/lib/legal";
import type { AdOperator, AdRateCard } from "@/lib/types";
import { usePageTitle } from "@/lib/use-page-title";

// /advertise — the honest sales page (who Oguaa reaches, the public rate card,
// how review works, the political-ads rules, the seller's details) and, with
// ?book=1, the booking wizard (sign-in required). Spec §3.7, §6.

export async function loader(): Promise<AdRateCard | null> {
  try {
    return await api.adRateCard();
  } catch {
    return null; // The page still explains itself; the rate card shows a retry.
  }
}

export function HydrateFallback() {
  return (
    <div>
      <div className="on-dark on-dark-pin bg-green-900 py-20">
        <Container>
          <Skeleton className="h-4 w-40 bg-cream/15" />
          <Skeleton className="mt-5 h-12 w-full max-w-xl bg-cream/15" />
          <SkeletonText lines={2} className="mt-6 max-w-lg [&>div]:bg-cream/15" />
        </Container>
      </div>
      <Container size="wide" className="py-14">
        <Skeleton className="h-72 w-full rounded-[var(--radius-card)]" />
      </Container>
    </div>
  );
}

const FALLBACK_OPERATOR: AdOperator = {
  name: "Dev Track",
  registration: "BN843072020",
  address: "GE-161-2814",
  phone: "+233 55 518 0048",
  email: "hello@oguaaman.com",
};

const BOOK = "/advertise?book=1";

const PROMISES: { title: string; body: string }[] = [
  {
    title: "Shown by page, never by person",
    body: "An ad on the news pages is shown to everyone reading the news. We don't use profiles, location, reading history or trackers to choose ads.",
  },
  {
    title: "Checked by a person before you pay",
    body: "Every ad is reviewed by someone at Oguaa. If we can't approve it, we say why and you pay nothing.",
  },
  {
    title: "One public price",
    body: "The same rate for every advertiser, every party and every candidate. No private deals, coupons or discounts.",
  },
];

const HOW: { title: string; body: string }[] = [
  { title: "Choose where and when", body: "Pick a placement, your dates and how many views you want. The price updates as you go." },
  { title: "Add the sponsor and artwork", body: "Upload your own image. If the law needs a licence or FDA approval for your product, we ask for it here." },
  { title: "A reviewer checks it", body: "Usually within two working days. If something needs to change, you get the reason." },
  { title: "Pay within 72 hours", body: "Mobile Money or card through Paystack, in cedis. Paying books your dates." },
  { title: "Watch it run", body: "See daily views and clicks. Any views we don't deliver are refunded to how you paid." },
];

function BookingHeader() {
  return (
    <header className="border-b border-sand bg-cream/60">
      <Container size="wide" className="py-8 sm:py-10">
        <Link to="/advertise" className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-green-text transition-colors hover:text-green">
          <span aria-hidden>←</span> Rates and rules
        </Link>
        <Eyebrow className="mt-4 text-gold-text">Advertise on Oguaa</Eyebrow>
        <h1 className="mt-2 text-4xl font-semibold tracking-[-0.02em] text-ink sm:text-5xl">Book an ad</h1>
      </Container>
    </header>
  );
}

function Notice({ title, body, children }: Readonly<{ title: string; body: string; children?: ReactNode }>) {
  return (
    <div className="relative overflow-hidden rounded-[var(--radius-card)] border border-gold-border/40 bg-gold/[0.06] p-6 sm:p-8">
      <Adinkra name="sankofa" size={120} labelled={false} className="pointer-events-none absolute -right-6 -top-6 text-gold/15" />
      <h2 className="relative text-2xl font-semibold text-ink">{title}</h2>
      <p className="relative mt-2 max-w-[56ch] text-pretty leading-relaxed text-ink-muted">{body}</p>
      {children && <div className="relative mt-5 flex flex-wrap gap-3">{children}</div>}
    </div>
  );
}

function RateCardError() {
  const revalidator = useRevalidator();
  return (
    <div role="alert" className="rounded-[var(--radius-card)] border border-clay/30 bg-clay/[0.05] p-6">
      <p className="font-semibold text-ink">We couldn&rsquo;t load the rate card.</p>
      <p className="mt-1 text-sm text-ink-muted">Check your connection and try again.</p>
      <button
        type="button"
        onClick={() => void revalidator.revalidate()}
        disabled={revalidator.state === "loading"}
        className="mt-4 inline-flex min-h-11 items-center rounded-full bg-green px-5 text-sm font-semibold text-on-green transition-[background-color,transform] hover:bg-green-900 active:scale-[0.98] disabled:opacity-60"
      >
        {revalidator.state === "loading" ? "Trying again…" : "Try again"}
      </button>
    </div>
  );
}

function Booking({ card }: Readonly<{ card: AdRateCard | null }>) {
  const { member, loading } = useAuth();
  let content: ReactNode;
  if (!card) content = <RateCardError />;
  else if (!card.adsEnabled) {
    content = (
      <Notice title="Bookings are not open yet" body="Oguaa isn't taking new ads at the moment. The rates and rules are published so you can plan; check back soon or write to hello@oguaaman.com.">
        <Cta to="/advertise" variant="outline">See the rates</Cta>
      </Notice>
    );
  } else if (loading) {
    content = <Skeleton className="h-96 w-full rounded-[var(--radius-card)]" />;
  } else if (!member) {
    content = (
      <Notice title="Sign in to book an ad" body="Bookings are tied to an Oguaa account so you can follow the review, pay, and see how the ad performs. It takes about a minute with your phone or email.">
        <Cta to={`/signin?next=${encodeURIComponent(BOOK)}`} variant="primary">Sign in or create an account</Cta>
        <Cta to="/advertise" variant="outline">Read the rules first</Cta>
      </Notice>
    );
  } else {
    content = <AdWizard card={card} />;
  }
  return (
    <>
      <BookingHeader />
      <Container size="wide" className="py-10 sm:py-12">{content}</Container>
    </>
  );
}

function Reach() {
  return (
    <section aria-labelledby="reach-heading" className="py-16 sm:py-24">
      <Container size="wide" className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16">
        <Reveal className="relative pb-10 pr-6 sm:pb-14 sm:pr-14">
          <figure className="overflow-hidden rounded-[22px] shadow-[var(--shadow-lift)]">
            <img src={mediaUrl("/uploads/seed/downtown.jpg")} alt="Cape Coast rooftops running down to the Atlantic" loading="lazy" className="aspect-[4/3] w-full bg-sand object-cover" />
          </figure>
          <figure className="absolute bottom-0 right-0 w-[44%] overflow-hidden rounded-xl border-4 border-paper shadow-[var(--shadow-lift)]">
            <img src={mediaUrl("/uploads/seed/kenkey-fish.jpg")} alt="Kenkey with fried fish, sold at a Cape Coast chop bar" loading="lazy" className="aspect-square w-full bg-sand object-cover" />
          </figure>
          <div aria-hidden className="bg-dotgrid absolute -left-4 -top-4 -z-10 h-40 w-40 rounded-xl opacity-80" />
        </Reveal>
        <div>
          <Eyebrow className="text-gold-text">Who you reach</Eyebrow>
          <h2 id="reach-heading" className="mt-3 text-3xl font-semibold tracking-[-0.02em] text-ink sm:text-4xl">
            The town&rsquo;s paper, noticeboard and directory in one place
          </h2>
          <p className="mt-5 max-w-[60ch] text-pretty text-lg leading-relaxed text-ink-muted">
            People in Cape Coast, and Fantes living away, come to Oguaa for local news, the events calendar, festival dates and the business directory.
            Students at UCC and the old schools use it, and so do the shops, churches and associations that serve them.
          </p>
          <ol className="mt-8 divide-y divide-sand border-y border-sand">
            {PROMISES.map((p, i) => (
              <li key={p.title} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 py-4">
                <span aria-hidden className="row-span-2 pt-0.5 text-sm font-semibold tabular-nums text-gold-text">0{i + 1}</span>
                <h3 className="text-base font-semibold text-ink">{p.title}</h3>
                <p className="mt-1 text-pretty text-sm leading-relaxed text-ink-muted">{p.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </Container>
    </section>
  );
}

function HowItWorks() {
  return (
    <section aria-labelledby="how-heading" className="py-16 sm:py-20">
      <Container size="wide">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] lg:gap-16">
          <div>
            <Eyebrow className="text-gold-text">How it works</Eyebrow>
            <h2 id="how-heading" className="mt-3 text-3xl font-semibold tracking-[-0.02em] text-ink sm:text-4xl">Review first, payment second</h2>
            <p className="mt-4 max-w-[46ch] text-pretty leading-relaxed text-ink-muted">
              You never pay for an ad we turn down. Cancel before the start date for a full refund; once it starts, you get back the share of views we didn&rsquo;t deliver.
            </p>
          </div>
          <ol className="relative space-y-6 before:absolute before:bottom-3 before:left-[15px] before:top-3 before:w-px before:bg-sand">
            {HOW.map((h, i) => (
              <li key={h.title} className="relative grid grid-cols-[2rem_minmax(0,1fr)] gap-x-4">
                <span className={`relative z-10 grid h-8 w-8 place-items-center rounded-lg text-xs font-bold tabular-nums ring-4 ring-paper ${i === 2 ? "bg-gold-brand text-green-900" : "bg-green text-on-green"}`}>{i + 1}</span>
                <div className="pt-1">
                  <h3 className="text-base font-semibold text-ink">{h.title}</h3>
                  <p className="mt-1 max-w-[58ch] text-pretty text-sm leading-relaxed text-ink-muted">{h.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Container>
    </section>
  );
}

function Rules({ card }: Readonly<{ card: AdRateCard | null }>) {
  const blocked = (card?.blockedCategories ?? Object.keys(BLOCKED_CATEGORY_NAMES)).map((b) => BLOCKED_CATEGORY_NAMES[b] ?? b);
  return (
    <section aria-labelledby="rules-heading" className="py-16 sm:py-20">
      <Container size="wide" className="grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-12">
        <div className="relative overflow-hidden rounded-[22px] border border-gold-border/35 bg-sand/45 p-6 sm:p-9">
          <div aria-hidden className="bg-dotgrid pointer-events-none absolute inset-0 opacity-60" />
          <div className="relative">
            <Eyebrow className="text-gold-text">Political and election ads</Eyebrow>
            <h2 id="rules-heading" className="mt-3 text-3xl font-semibold tracking-[-0.02em] text-ink">Fair to every side, open to everyone</h2>
            {card && !card.politicalEnabled && (
              <p className="mt-4 inline-block rounded-md border border-gold-border/40 bg-paper/70 px-3 py-1.5 text-sm font-medium text-gold-text">Oguaa is not taking political ads at the moment.</p>
            )}
            <ul className="mt-6 space-y-3.5 text-[0.95rem] leading-relaxed text-ink-muted">
              <li><strong className="font-semibold text-ink">Verified sponsors only.</strong> We check identity and Ghanaian citizenship or ownership. Names such as &ldquo;Concerned Citizens&rdquo; are not accepted.</li>
              <li><strong className="font-semibold text-ink">Clearly labelled.</strong> Every political ad says &ldquo;Paid for by&rdquo; and the sponsor&rsquo;s legal name.</li>
              <li><strong className="font-semibold text-ink">Same price for all.</strong> Every party and candidate pays the published political rate.</li>
              <li><strong className="font-semibold text-ink">Two reviewers.</strong> No false claims about candidates or withdrawals, no results before the Electoral Commission declares them, and no wrong voting information.</li>
              <li><strong className="font-semibold text-ink">Paused for the blackout.</strong> Political ads stop from 00:00 the day before polls until the blackout ends.</li>
              <li><strong className="font-semibold text-ink">No District Assembly candidate ads.</strong> Those elections are non-partisan (Article 248).</li>
              <li><strong className="font-semibold text-ink">On the public record.</strong> Every political ad is listed in the <Link to="/ads/library" className="font-semibold text-teal-text underline-offset-2 hover:underline">Ad library</Link> with its sponsor, dates, views and the exact amount paid, for seven years.</li>
            </ul>
          </div>
        </div>
        <div className="space-y-8 lg:pt-6">
          <div>
            <h3 className="text-xl font-semibold text-ink">What we don&rsquo;t accept</h3>
            <p className="mt-2 text-pretty text-sm leading-relaxed text-ink-muted">{blocked.join(", ")}.</p>
            <p className="mt-3 text-pretty text-sm leading-relaxed text-ink-muted">
              Ads must be truthful, priced in cedis, and must not look like news: no &ldquo;Breaking&rdquo;, &ldquo;Just in&rdquo; or &ldquo;Alert&rdquo;. AI-generated or altered images must be declared, and we label them.
            </p>
          </div>
          <div className="border-t border-sand pt-6">
            <h3 className="text-xl font-semibold text-ink">Regulated products</h3>
            <p className="mt-2 text-pretty text-sm leading-relaxed text-ink-muted">
              Food, drinks, medicines, herbal products and cosmetics need FDA registration and an approved advertisement. Financial services need an SEC, Bank of Ghana or NIC licence.
            </p>
          </div>
          <Link to={LEGAL.advertising} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-green-text underline-offset-4 hover:underline">
            Read the full Advertising Policy <span aria-hidden>→</span>
          </Link>
        </div>
      </Container>
    </section>
  );
}

function Seller({ operator }: Readonly<{ operator: AdOperator }>) {
  return (
    <section aria-labelledby="seller-heading" className="pb-6 pt-4">
      <Container size="wide">
        <div className="grid gap-8 rounded-[22px] border border-sand bg-cream p-6 shadow-[var(--shadow-card)] sm:p-9 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <Eyebrow>Who sells the ads</Eyebrow>
            <h2 id="seller-heading" className="mt-3 text-2xl font-semibold text-ink">{operator.name}, the operator of Oguaa</h2>
            <p className="mt-3 max-w-[50ch] text-pretty text-sm leading-relaxed text-ink-muted">
              Seller information under the Electronic Transactions Act, 2008 (Act 772), section 47. Prices are in Ghana cedis and every quote shows the full price, including any tax.
            </p>
          </div>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-ink-faint">Business</dt><dd className="mt-0.5 font-medium text-ink">{operator.name}</dd></div>
            <div><dt className="text-xs text-ink-faint">Registration</dt><dd className="mt-0.5 font-medium tabular-nums text-ink">{operator.registration}</dd></div>
            <div><dt className="text-xs text-ink-faint">Address (Ghana Post GPS)</dt><dd className="mt-0.5 font-medium tabular-nums text-ink">{operator.address}</dd></div>
            <div><dt className="text-xs text-ink-faint">Phone</dt><dd className="mt-0.5 font-medium tabular-nums text-ink">{operator.phone}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs text-ink-faint">Email</dt><dd className="mt-0.5 font-medium text-ink">{operator.email}</dd></div>
          </dl>
          <nav aria-label="Advertising policies" className="flex flex-wrap gap-x-5 gap-y-2 border-t border-sand pt-5 text-sm md:col-span-2">
            <Link to={LEGAL.advertising} className="font-semibold text-teal-text hover:underline">Advertising Policy</Link>
            <Link to={LEGAL.termsOfSale} className="font-semibold text-teal-text hover:underline">Terms of Sale</Link>
            <Link to={LEGAL.privacy} className="font-semibold text-teal-text hover:underline">Privacy Notice</Link>
            <Link to="/ads/library" className="font-semibold text-teal-text hover:underline">Ad library</Link>
          </nav>
        </div>
      </Container>
    </section>
  );
}

function Intro({ card }: Readonly<{ card: AdRateCard | null }>) {
  const open = Boolean(card?.adsEnabled);
  return (
    <>
      <PageHero
        tone="gold"
        kicker="Advertise on Oguaa"
        title="Reach Cape Coast where it reads"
        crumbs={[{ label: "Home", to: "/" }, { label: "Advertise" }]}
        symbol="dwennimmen"
        image="/uploads/seed/market-women.jpg"
        lede="Put your shop, school, event or cause in front of the people who use Oguaa every day. One public price, a human review, and no tracking."
      >
        <div className="flex flex-wrap items-center gap-3">
          {open ? <Cta to={BOOK} variant="gold" className="min-h-11">Book an ad</Cta> : (
            <span className="inline-flex min-h-11 items-center rounded-full border border-cream/25 bg-green-900/50 px-4 text-sm font-medium text-cream backdrop-blur-sm">Bookings open soon</span>
          )}
          <Cta to="#rates" variant="outline-dark" className="min-h-11">See the rates</Cta>
          <Link to="/ads/library" className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-cream/85 underline-offset-4 transition-colors hover:text-gold hover:underline">
            Ad library
          </Link>
        </div>
      </PageHero>

      <Reach />

      <section id="rates" aria-labelledby="rates-heading" className="scroll-mt-24 bg-cream/60 py-16 sm:py-20">
        <Container size="wide">
          <div className="mb-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <SectionHeading kicker="Rate card" title={<span id="rates-heading">One price for everyone</span>} lede="Prices are per 1,000 viewable impressions, net of tax. You choose how many views you want; the price is the rate times your views." />
            {card && <p className="text-xs tabular-nums text-ink-faint lg:text-right">Version {card.version}</p>}
          </div>
          {card ? <RateCardTable card={card} /> : <RateCardError />}
        </Container>
      </section>

      <HowItWorks />
      <div className="bg-cream/40"><Rules card={card} /></div>
      <div className="py-12"><Seller operator={card?.operator ?? FALLBACK_OPERATOR} /></div>

      {open && (
        <section className="pb-20">
          <Container size="wide">
            <div className="on-dark on-dark-pin relative overflow-hidden rounded-[22px] bg-green-900 px-6 py-10 text-cream sm:px-12 sm:py-12">
              <div aria-hidden className="bg-dotgrid absolute inset-0 opacity-40" />
              <Adinkra name="dwennimmen" size={200} labelled={false} strokeWidth={0.7} className="pointer-events-none absolute -right-10 -top-10 text-gold/15" />
              <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-3xl font-semibold tracking-[-0.02em] text-cream">Ready to book?</h2>
                  <p className="mt-2 max-w-[48ch] text-pretty text-cream/75">It takes about ten minutes. You can save and come back; nothing is charged until the ad is approved.</p>
                </div>
                <Cta to={BOOK} variant="gold" className="min-h-11 shrink-0">Book an ad</Cta>
              </div>
            </div>
          </Container>
        </section>
      )}
    </>
  );
}

export function Component() {
  const card = useLoaderData() as AdRateCard | null;
  const [params] = useSearchParams();
  const booking = params.get("book") === "1";
  usePageTitle(booking ? "Book an ad" : "Advertise on Oguaa");
  return booking ? <Booking card={card} /> : <Intro card={card} />;
}
