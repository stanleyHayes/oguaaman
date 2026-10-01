/**
 * "Not an emergency service" notice (Apple 1.4 / A021). Shown at the top of
 * the safety, lost & found and alerts pages. 112 is Ghana's national
 * emergency number; the link dials it on phones.
 */
export function EmergencyCallout({ className = "" }: Readonly<{ className?: string }>) {
  return (
    <aside
      aria-label="Emergency notice"
      className={`flex flex-col gap-3 rounded-[var(--radius-card)] border border-maroon-900/30 bg-maroon-900/[0.05] px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      <p className="text-sm leading-relaxed text-maroon-text">
        <strong className="font-semibold">Oguaa is not an emergency service.</strong>{" "}
        Posting here does not alert the police, fire service or ambulance. In an emergency, call 112.
      </p>
      <a
        href="tel:112"
        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-maroon-900 px-5 py-2 text-sm font-semibold text-on-green transition-colors hover:bg-clay"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z" />
        </svg>
        Call 112
      </a>
    </aside>
  );
}
