import { LANGS, useLang, type Lang } from "@/lib/i18n";

/**
 * Compact language picker for the header. Sits on the dark green bar, so it's
 * styled for an on-dark surface. English is the default; picking another
 * language translates the strings that have a translation (others stay English).
 */
export function LanguageSwitcher({ className = "" }: Readonly<{ className?: string }>) {
  const { lang, setLang } = useLang();
  return (
    <label className={`relative inline-flex items-center ${className}`}>
      <span className="sr-only">Language</span>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden className="pointer-events-none absolute left-2.5 text-cream/70">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18" />
      </svg>
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
        aria-label="Choose language"
        className="appearance-none rounded-full border border-cream/25 bg-transparent py-1.5 pl-8 pr-7 text-sm text-cream/90 transition-colors hover:border-gold focus:border-gold focus:outline-none"
      >
        {LANGS.map((l) => (
          <option key={l.code} value={l.code} className="bg-green-900 text-cream">
            {l.native}
          </option>
        ))}
      </select>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="pointer-events-none absolute right-2.5 text-cream/60">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </label>
  );
}
