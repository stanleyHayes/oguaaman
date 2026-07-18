import { useSearchParams } from "react-router-dom";
import type { ListingType } from "@/lib/types";
import { PageHero } from "@/components/page-hero";
import { Container, CTA as Cta } from "@/components/ui";
import { SubmitForm } from "@/components/submit-form";
import { Adinkra } from "@/components/adinkra";
import { useAuth } from "@/lib/auth";
import { usePageTitle } from "@/lib/use-page-title";

const VALID = new Set<ListingType>(["artist", "business", "event", "memory", "opportunity", "person", "memorial"]);

const CONTRIBUTE_TYPES = ["Business", "Artist", "Person", "Memory", "Event", "Opportunity", "Memorial"];

const REVIEW_STEPS: [string, string][] = [
  ["Draft", "You build your listing — a title, a picture, the details."],
  ["Pending", "It enters the moderation queue, nothing is public yet."],
  ["Approved", "It goes live, and you're notified."],
];

const CHECKLIST = [
  "Real — a genuine entry",
  "Local — belongs to Oguaa / Cape Coast",
  "Correctly categorised",
  "Appropriate — nothing harmful",
];

/** The signed-out invitation: not a dead-end card, but the front door. */
function SignInGate() {
  return (
    <div className="on-dark on-dark-pin relative overflow-hidden rounded-[var(--radius-card)] border border-green/30 bg-green-900 p-7 text-cream shadow-[var(--shadow-lift)] sm:p-10">
      <div className="bg-dotgrid pointer-events-none absolute inset-0 opacity-40" aria-hidden />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-green/10 via-transparent to-gold/10" aria-hidden />
      <Adinkra
        name="adinkrahene"
        size={220}
        labelled={false}
        strokeWidth={0.6}
        className="pointer-events-none absolute -right-12 -top-12 text-gold/15"
      />
      <div className="relative">
        <span className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.18em] text-gold">
          <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden /> Members contribute
        </span>
        <h2 className="mt-5 max-w-lg text-3xl font-semibold leading-tight text-cream sm:text-4xl">Your corner of Oguaa belongs on the map.</h2>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-cream/75 sm:text-base">
          Everything on Oguaa — every business, artist, memory and memorial — was put here by a member,
          and checked by a curator before it went live. Your entry takes a few minutes; the review does the rest.
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Cta to="/signin" variant="gold">Sign in / create account</Cta>
          <p className="text-xs text-cream/60">Free · phone or email · about a minute</p>
        </div>
        <div className="mt-9 border-t border-cream/15 pt-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-cream/55">What you can add</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {CONTRIBUTE_TYPES.map((label) => (
              <span key={label} className="rounded-full border border-cream/15 bg-cream/10 px-3 py-1 text-xs font-medium text-cream/85">{label}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ContributionGuide() {
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)]">
      <div className="bg-green px-6 py-5 text-on-green">
        <p className="eyebrow text-gold">After you send it</p>
        <h2 className="mt-2 text-2xl font-semibold text-on-green">A careful, human review</h2>
        <p className="mt-2 text-sm leading-relaxed text-on-green/70">Nothing publishes by accident. A local curator checks every contribution.</p>
      </div>
      <div className="p-6">
        <ol className="relative space-y-5 before:absolute before:bottom-2 before:left-[13px] before:top-2 before:w-px before:bg-sand">
          {REVIEW_STEPS.map(([key, value], index) => (
            <li key={key} className="relative flex items-start gap-4">
              <span className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-4 ring-cream ${index === 0 ? "bg-gold-brand text-green-900" : "bg-green text-on-green"}`}>{index + 1}</span>
              <span className="text-sm leading-relaxed text-ink-muted"><b className="text-ink">{key}</b><span className="block">{value}</span></span>
            </li>
          ))}
        </ol>

        <div className="mt-6 border-t border-sand pt-5">
          <h3 className="text-sm font-semibold text-ink">What the curator checks</h3>
          <ul className="mt-3 grid gap-2">
            {CHECKLIST.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-ink-muted">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold/20 text-[0.65rem] font-bold text-gold-text" aria-hidden>✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function YouthNote() {
  return (
    <div className="flex gap-3.5 rounded-[var(--radius-card)] border border-dashed border-gold-border/50 bg-gold/[0.06] p-5">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0 text-gold-text" aria-hidden>
        <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6Z" />
        <path d="m9 11.5 2 2 4-4" />
      </svg>
      <p className="text-sm leading-relaxed text-ink-muted">
        <b className="text-ink">Protecting young people.</b> Anything involving young people is handled
        conservatively, with consent and protection ahead of convenience. The youth board is information
        and outbound links only — no private messaging.
      </p>
    </div>
  );
}

export function Component() {
  const [params] = useSearchParams();
  const { member } = useAuth();
  const t = params.get("type");
  const initialType = t && VALID.has(t as ListingType) ? (t as ListingType) : undefined;
  usePageTitle("Add to Oguaa");

  return (
    <>
      <PageHero
        tone="green"
        kicker="Built by the community"
        title="Add to Oguaa"
        symbol="adinkrahene"
        image="/uploads/seed/fetu-crowd.jpg"
        lede="Share the people, places, work and memories that make Cape Coast ours. You create the entry; a curator checks it; the community discovers it."
      >
        <div className="flex flex-wrap gap-2 text-xs font-semibold text-cream/80">
          <span className="rounded-full border border-cream/20 bg-cream/10 px-3 py-1.5 backdrop-blur-sm">Free to contribute</span>
          <span className="rounded-full border border-cream/20 bg-cream/10 px-3 py-1.5 backdrop-blur-sm">Locally reviewed</span>
          <span className="rounded-full border border-cream/20 bg-cream/10 px-3 py-1.5 backdrop-blur-sm">You stay in control</span>
        </div>
      </PageHero>

      <Container size="wide" className="grid items-start gap-10 py-10 sm:py-12 lg:grid-cols-[minmax(0,1.65fr)_minmax(18rem,0.85fr)]">
        <div className="min-w-0">
          {member && (
            <div className="mb-8 border-b border-sand pb-6">
              <p className="eyebrow text-green-text">New contribution</p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <h2 className="text-3xl font-semibold text-ink">Build your listing</h2>
                <p className="max-w-sm text-sm leading-relaxed text-ink-muted">Choose a listing type, add what you know, then send it to the curator queue.</p>
              </div>
            </div>
          )}
          {member ? <SubmitForm initialType={initialType} /> : <SignInGate />}
        </div>

        <aside className="space-y-5 lg:sticky lg:top-24">
          <ContributionGuide />
          <YouthNote />
        </aside>
      </Container>
    </>
  );
}
