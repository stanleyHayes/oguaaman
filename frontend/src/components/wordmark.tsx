/** The Oguaa crab mark — Kotokuraba, the crab market that gave the town its name. */
export function CrabMark({ size = 24, className = "", strokeWidth = 2.6 }: Readonly<{ size?: number; className?: string; strokeWidth?: number }>) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      role="img" aria-label="Oguaa — the crab of Kotokuraba" className={className}
    >
      <g transform="translate(0,-1)">
        {/* right claw + legs */}
        <path d="M43 32.5C47 31 50 30.5 52 28" />
        <path d="M52 28C56 27 59.2 23.4 55.6 20.4 54 19.1 52.4 20.2 52.9 22" />
        <path d="M52 28C54.6 28.9 57 27.6 57.2 25.2" />
        <path d="M43.5 40.5C47.5 41.5 50.6 43.4 52.6 46.4" />
        <path d="M42.5 43C45.6 44.4 48 46.4 49.5 49.4" />
        <path d="M40.6 45C42.6 47 43.8 49 44.8 51.7" />
        {/* left claw + legs (mirror) */}
        <path d="M21 32.5C17 31 14 30.5 12 28" />
        <path d="M12 28C8 27 4.8 23.4 8.4 20.4 10 19.1 11.6 20.2 11.1 22" />
        <path d="M12 28C9.4 28.9 7 27.6 6.8 25.2" />
        <path d="M20.5 40.5C16.5 41.5 13.4 43.4 11.4 46.4" />
        <path d="M21.5 43C18.4 44.4 16 46.4 14.5 49.4" />
        <path d="M23.4 45C21.4 47 20.2 49 19.2 51.7" />
        {/* carapace + eyes on stalks */}
        <path d="M20 39C20 32 25.5 28.5 32 28.5 38.5 28.5 44 32 44 39 44 44 39 46.5 32 46.5 25 46.5 20 44 20 39Z" />
        <path d="M28 29L28 24" />
        <path d="M36 29L36 24" />
        <circle cx="28" cy="22.4" r="1.9" fill="currentColor" stroke="none" />
        <circle cx="36" cy="22.4" r="1.9" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}

/** The Oguaa wordmark — the crab mark + Fraunces display name. */
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
      <span className={`${size} font-semibold leading-none tracking-tight ${tone}`}>
        Oguaa
      </span>
    </span>
  );
}
