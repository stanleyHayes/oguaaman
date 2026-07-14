import { useSearchParams } from "react-router-dom";
import type { ListingType } from "@/lib/types";
import { PageHero } from "@/components/page-hero";
import { Container, CTA } from "@/components/ui";
import { SubmitForm } from "@/components/submit-form";
import { useAuth } from "@/lib/auth";

const VALID: ListingType[] = ["artist", "business", "event", "memory", "opportunity", "person", "memorial"];

export function Component() {
  const [params] = useSearchParams();
  const { member } = useAuth();
  const t = params.get("type");
  const initialType = t && VALID.includes(t as ListingType) ? (t as ListingType) : undefined;

  return (
    <>
      <PageHero tone="green" kicker="One engine · many listings" title="Add to Oguaa" symbol="adinkrahene" lede="Businesses, artists, people, memories, events, opportunities and memorials all run the same path: you create it, a curator reviews it, and it goes live. The community is a participant, not an audience." />
      <Container size="wide" className="grid gap-10 py-12 lg:grid-cols-[1.6fr_1fr]">
        <div>
          {member ? (
            <SubmitForm initialType={initialType} />
          ) : (
            <div className="rounded-[var(--radius-card)] border border-sand bg-cream p-8 text-center">
              <h2 className="font-display text-2xl font-semibold text-ink">Sign in to contribute</h2>
              <p className="mx-auto mt-3 max-w-md text-sm text-ink-muted">
                Contributing needs a verified member account — the platform&apos;s spam gate. It takes a moment: sign in with your phone or email and you&apos;re in.
              </p>
              <div className="mt-6"><CTA to="/signin" variant="gold">Sign in / create account</CTA></div>
            </div>
          )}
        </div>
        <aside className="space-y-6">
          <div className="rounded-[var(--radius-card)] border border-sand bg-cream p-5">
            <h2 className="font-display text-lg font-semibold text-ink">How review works</h2>
            <ol className="mt-3 space-y-3 text-sm text-ink-muted">
              {[["Draft", "You build your listing."], ["Pending", "It enters the moderation queue."], ["Approved", "It goes live, and you're notified."]].map(([k, v], i) => (
                <li key={k} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green text-xs font-bold text-cream">{i + 1}</span><span><b className="text-ink">{k}.</b> {v}</span></li>
              ))}
            </ol>
          </div>
          <div className="rounded-[var(--radius-card)] border border-sand bg-cream p-5">
            <h2 className="font-display text-lg font-semibold text-ink">The curator's checklist</h2>
            <ul className="mt-3 space-y-2 text-sm text-ink-muted">
              {["Real — a genuine entry", "Local — belongs to Oguaa / Cape Coast", "Correctly categorised", "Appropriate — nothing harmful"].map((c) => (
                <li key={c} className="flex items-start gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-brand" aria-hidden />{c}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-[var(--radius-card)] border border-dashed border-sand p-5 text-sm text-ink-faint">
            Anything involving young people is handled conservatively, with consent and protection ahead of convenience. The youth board is information and outbound links only — no private messaging.
          </div>
        </aside>
      </Container>
    </>
  );
}
