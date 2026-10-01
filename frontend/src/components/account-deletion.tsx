import type { ReactNode } from "react";

export function FactList({ title, items, tone = "neutral" }: Readonly<{ title: ReactNode; items: readonly string[]; tone?: "neutral" | "warn" }>) {
  return (
    <section className={`rounded-[var(--radius-card)] border p-5 ${tone === "warn" ? "border-gold-border/50 bg-gold/[0.06]" : "border-sand bg-cream"}`}>
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-muted">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </section>
  );
}

/** Shown after a deletion: the server's own list of what it kept. */
export function DeletionDone({ retained }: Readonly<{ retained: readonly string[] }>) {
  return (
    <div role="status" className="space-y-4 rounded-[var(--radius-card)] border border-green/30 bg-green/[0.06] p-6">
      <h2 className="text-xl font-semibold text-green-text">Your account has been deleted</h2>
      <p className="text-sm text-ink-muted">Your personal data has been erased and you have been signed out everywhere.</p>
      {retained.length > 0 && (
        <>
          <p className="text-sm font-semibold text-ink">What we keep, and why</p>
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-muted">
            {retained.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </>
      )}
    </div>
  );
}

/** A 409 from the deletion endpoints: what must be settled first. */
export function DeletionBlockers({ blockers }: Readonly<{ blockers: readonly string[] }>) {
  return (
    <div role="alert" className="rounded-lg border border-clay/30 bg-clay/5 px-4 py-3 text-sm text-clay-text">
      <p className="font-semibold">Settle these first, then delete your account.</p>
      <ul className="mt-1.5 list-disc space-y-1 pl-5">
        {blockers.map((b) => <li key={b}>{b}</li>)}
      </ul>
    </div>
  );
}
