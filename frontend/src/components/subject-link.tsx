import { Link, useLocation } from "react-router-dom";
import { privacyRequestHref } from "@/lib/legal";

/**
 * "Is this about you?" (G122 / Act 843): sends the person a page is about to
 * the privacy request form with the request type and this page filled in.
 */
export function SubjectLink({ className = "" }: Readonly<{ className?: string }>) {
  const { pathname } = useLocation();
  return (
    <Link to={privacyRequestHref("correction", pathname)} className={`inline-flex items-center gap-1 text-xs font-medium text-ink-faint underline-offset-4 hover:text-ink hover:underline ${className}`}>
      Is this about you? Correct or remove <span aria-hidden>→</span>
    </Link>
  );
}
