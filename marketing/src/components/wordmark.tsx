/** The Oguaa crab mark — Kotokuraba, the crab market that gave the town its name. */
export function CrabMark({ size = 24, className = "", strokeWidth = 1.6 }: Readonly<{ size?: number; className?: string; strokeWidth?: number }>) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      role="img" aria-label="Oguaa — the crab of Kotokuraba" className={className}
    >
      {/* shell */}
      <path d="M4.6 13.4c0-3 3.3-4.6 7.4-4.6s7.4 1.6 7.4 4.6c0 2.4-3.3 3.9-7.4 3.9s-7.4-1.5-7.4-3.9Z" />
      {/* eyes on stalks */}
      <path d="M9.6 9V6.4M14.4 9V6.4" />
      <circle cx="9.6" cy="5.7" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="14.4" cy="5.7" r="0.7" fill="currentColor" stroke="none" />
      {/* claws (open pincers) */}
      <path d="M5.2 12.3 2.3 9.6M2.3 9.6l1.9-.2M2.3 9.6l.1 1.9" />
      <path d="M18.8 12.3 21.7 9.6M21.7 9.6l-1.9-.2M21.7 9.6l-.1 1.9" />
      {/* legs */}
      <path d="M6.2 15.4 3.2 17M7.4 16.8 5.2 19.6M16.6 16.8 18.8 19.6M17.8 15.4 20.8 17" />
    </svg>
  );
}

/** The Oguaa wordmark — the crab mark + Cormorant display name. */
export function Wordmark({
  className = "",
  tone = "text-cream",
  markTone = "text-gold",
  size = "text-2xl",
}: Readonly<{
  className?: string;
  tone?: string;
  markTone?: string;
  size?: string;
}>) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <CrabMark size={26} className={markTone} />
      <span className={`font-display ${size} font-semibold leading-none tracking-tight ${tone}`}>
        Oguaa
      </span>
    </span>
  );
}
