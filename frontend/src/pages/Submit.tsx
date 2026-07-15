import { useSearchParams } from "react-router-dom";
import type { ListingType } from "@/lib/types";
import { PageHero } from "@/components/page-hero";
import { Container, CTA as Cta, Pill } from "@/components/ui";
import { SubmitForm } from "@/components/submit-form";
import { Adinkra } from "@/components/adinkra";
import { useAuth } from "@/lib/auth";

const VALID = new Set<ListingType>(["artist", "business", "event", "memory", "opportunity", "person", "memorial"]);

const CONTRIBUTE_TYPES: { label: string; tone: "green" | "gold" | "clay" | "teal" }[] = [
  { label: "Business", tone: "teal" },
  { label: "Artist", tone: "clay" },
  { label: "Person", tone: "gold" },
  { label: "Memory", tone: "green" },
  { label: "Event", tone: "gold" },
  { label: "Opportunity", tone: "teal" },
  { label: "Memorial", tone: "clay" },
];

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
    <div className="relative overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream p-8 shadow-[var(--shadow-card)] sm:p-10">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{ backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)", backgroundSize: "20px 20px", color: "#B07D32" }}
        aria-hidden
      />
      <Adinkra
        name="adinkrahene"
        size={220}
        labelled={false}
        strokeWidth={0.6}
        className="pointer-events-none absolute -right-12 -top-12 text-gold/10"
      />
      <div className="relative">
        <p className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-gold-text">Members only — the spam gate</p>
        <h2 className="mt-3 max-w-md text-3xl font-semibold leading-tight text-ink">Add your corner of Oguaa.</h2>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-muted">
          Everything on Oguaa — every business, artist, memory and memorial — was put here by a member,
          and checked by a curator before it went live. Your entry takes a few minutes; the review does the rest.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-4">
          <Cta to="/signin" variant="gold">Sign in / create account</Cta>
          <p className="text-xs text-ink-faint">Free · phone or email · a minute at most</p>
        </div>
        <div className="mt-9 border-t border-sand pt-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">What you can add</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {CONTRIBUTE_TYPES.map((t) => <Pill key={t.label} tone={t.tone}>{t.label}</Pill>)}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewSteps() {
  return (
    <div className="rounded-[var(--radius-card)] border border-sand bg-cream p-6">
      <h2 className="text-lg font-semibold text-ink">How review works</h2>
      <ol className="relative mt-4 space-y-5 before:absolute before:bottom-2 before:left-[11px] before:top-2 before:w-px before:bg-sand">
        {REVIEW_STEPS.map(([k, v], i) => (
          <li key={k} className="relative flex items-start gap-3.5">
            <span className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green text-xs font-bold text-cream ring-4 ring-cream">{i + 1}</span>
            <span className="text-sm text-ink-muted"><b className="text-ink">{k}.</b> {v}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function CuratorChecklist() {
  return (
    <div className="rounded-[var(--radius-card)] border border-sand bg-cream p-6">
      <h2 className="text-lg font-semibold text-ink">The curator's checklist</h2>
      <ul className="mt-4 space-y-3">
        {CHECKLIST.map((c) => (
          <li key={c} className="flex items-start gap-3 text-sm text-ink-muted">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold/20 text-[0.65rem] text-gold-text" aria-hidden>✓</span>
            {c}
          </li>
        ))}
      </ul>
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

  return (
    <>
      <PageHero tone="green" kicker="One engine · many listings" title="Add to Oguaa" symbol="adinkrahene" lede="Businesses, artists, people, memories, events, opportunities and memorials all run the same path: you create it, a curator reviews it, and it goes live. The community is a participant, not an audience." />
      <Container size="wide" className="grid gap-10 py-12 lg:grid-cols-[1.6fr_1fr]">
        <div>
          {member ? <SubmitForm initialType={initialType} /> : <SignInGate />}
        </div>
        <aside className="space-y-6">
          <ReviewSteps />
          <CuratorChecklist />
          <YouthNote />
        </aside>
      </Container>
    </>
  );
}
