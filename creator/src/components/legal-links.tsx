import { PRIVACY_URL, TERMS_URL } from "@/lib/portal";

/** "Privacy notice · Terms of Use" links to the portal's canonical legal pages. */
export function LegalLinks({ className = "" }: Readonly<{ className?: string }>) {
  return (
    <nav aria-label="Legal" className={`flex flex-wrap items-center justify-center gap-x-2 text-xs ${className}`}>
      <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="underline hover:no-underline">Privacy notice</a>
      <span aria-hidden>·</span>
      <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" className="underline hover:no-underline">Terms of Use</a>
    </nav>
  );
}
