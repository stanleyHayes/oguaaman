import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { ReportTargetType } from "@/lib/types";

/** Report reason categories, mirroring the Go domain (domain.Reason*). */
const REASONS: { value: string; label: string }[] = [
  { value: "child_safety", label: "Child safety — a child may be at risk" },
  { value: "ncii", label: "Intimate image shared without consent, or sextortion" },
  { value: "harassment", label: "Harassment, bullying or threats" },
  { value: "hate", label: "Hate — attacks on people for who they are" },
  { value: "violence", label: "Violence or threats of violence" },
  { value: "private_info", label: "Someone's private information" },
  { value: "scam", label: "Scam or fraud" },
  { value: "impersonation", label: "Impersonation" },
  { value: "inaccurate", label: "Not accurate / not real" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "bereavement", label: "A concern about this memorial" },
  { value: "other", label: "Something else" },
];

/** Reasons that hide the content at once and alert stewards (see domain.UrgentReportReason). */
const URGENT = new Set(["child_safety", "ncii"]);

/** What a report is about. Omit for the legacy listing report (`listingId`). */
export interface ReportTarget {
  type: ReportTargetType;
  id: string;
  /** The business a reported product belongs to. */
  listingId?: string;
}

const NOUN: Record<ReportTargetType, string> = {
  listing: "listing",
  member: "profile",
  review: "review",
  tribute: "tribute",
  product: "product",
  news: "article",
  agent: "agent profile",
  agent_review: "review",
  ai_output: "suggestion",
};

function reasonsFor(memorial: boolean) {
  const list = memorial ? REASONS : REASONS.filter((r) => r.value !== "bereavement");
  if (!memorial) return list;
  const bereavement = list.find((r) => r.value === "bereavement");
  return bereavement ? [bereavement, ...list.filter((r) => r !== bereavement)] : list;
}

type SendState = "idle" | "sending" | "done" | "error";

/**
 * Notice-and-takedown for any piece of content (spec §14; Apple 1.2; K11).
 * Listings can be reported anonymously through the legacy route; every other
 * target needs sign-in. Child-safety and intimate-image reports hide the
 * content at once until a steward reviews it.
 */
export function ReportButton({
  listingId,
  target,
  memorial = false,
  compact = false,
  className = "",
}: Readonly<{
  listingId?: string;
  target?: ReportTarget;
  memorial?: boolean;
  /** A small flag-only trigger for rows (reviews, tributes, products). */
  compact?: boolean;
  className?: string;
}>) {
  const { member } = useAuth();
  const { pathname } = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const reasons = reasonsFor(memorial);
  // No reason is pre-selected (an urgent one would hide the content at once),
  // except "a concern about this memorial" on memorial pages.
  const [reason, setReason] = useState(memorial ? "bereavement" : "");
  const [detail, setDetail] = useState("");
  const [state, setState] = useState<SendState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const noun = target ? NOUN[target.type] : "listing";
  const needsSignIn = target != null && !member;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    setState("sending");
    setError(null);
    const note = detail.trim() || undefined;
    try {
      const res = target
        ? await api.report({ targetType: target.type, targetId: target.id, listingId: target.listingId, reason, detail: note })
        : await api.reportListing(listingId ?? "", { reason, detail: note });
      setHidden(Boolean(res.hidden));
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send that. Please try again.");
      setState("error");
    }
  }

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={compact ? `Report this ${noun}` : undefined}
        title={compact ? `Report this ${noun}` : undefined}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-faint transition-colors hover:text-clay-text"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 21V4h12l-1.5 4L16 12H4" /><path d="M4 4v17" />
        </svg>
        {compact ? <span className="sr-only sm:not-sr-only">Report</span> : "Report this"}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-[var(--radius-card)] border border-sand bg-paper p-4 text-left text-ink shadow-[var(--shadow-lift)]">
          {needsSignIn && (
            <div className="text-sm">
              <p className="font-semibold text-ink">Sign in to report this {noun}</p>
              <p className="mt-1 text-ink-muted">Reports are tied to an account so stewards can follow up. We review every report within 24 hours.</p>
              <Link to={`/signin?next=${encodeURIComponent(pathname)}`} className="mt-3 inline-block text-xs font-semibold text-teal-text hover:underline">Sign in →</Link>
            </div>
          )}
          {!needsSignIn && state === "done" && (
            <div className="text-sm" role="status">
              <p className="font-semibold text-green">Thank you.</p>
              <p className="mt-1 text-ink-muted">
                {hidden
                  ? "We've hidden it while a steward reviews your report, and we act on reports within 24 hours."
                  : "A steward will review this within 24 hours."}
              </p>
              {URGENT.has(reason) && <p className="mt-2 text-ink-muted">If someone is in immediate danger, call 112.</p>}
              <button type="button" onClick={() => setOpen(false)} className="mt-3 text-xs font-medium text-teal-text hover:underline">Close</button>
            </div>
          )}
          {!needsSignIn && state !== "done" && (
            <form onSubmit={submit} className="space-y-3">
              <p className="text-sm font-semibold text-ink">Report this {noun}</p>
              <p className="text-xs text-ink-muted">Tell a steward what&rsquo;s wrong. We review reports within 24 hours; child-safety and intimate-image reports are hidden straight away.</p>
              <fieldset className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                <legend className="sr-only">Reason</legend>
                {reasons.map((rr) => (
                  <label key={rr.value} className="flex items-start gap-2 text-sm text-ink-muted">
                    <input type="radio" name="reason" required value={rr.value} checked={reason === rr.value} onChange={() => setReason(rr.value)} className="mt-1 accent-clay" />
                    {rr.label}
                  </label>
                ))}
              </fieldset>
              <textarea
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="Add a detail (optional)"
                className="w-full rounded-lg border border-sand bg-cream px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-clay focus:outline-none"
              />
              {state === "error" && <p className="text-xs text-clay-text">{error}</p>}
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} className="text-xs text-ink-muted hover:text-ink">Cancel</button>
                <button type="submit" disabled={state === "sending" || !reason} className="rounded-full bg-clay px-4 py-1.5 text-xs font-semibold text-cream hover:bg-maroon-900 hover:text-on-green disabled:opacity-60">
                  {state === "sending" ? "Sending…" : "Send report"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
