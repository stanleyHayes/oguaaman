import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

/** Report reason categories, mirroring the Go domain (domain.Reason*). */
const REASONS: { value: string; label: string }[] = [
  { value: "inaccurate", label: "Not accurate / not real" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "impersonation", label: "Impersonation" },
  { value: "bereavement", label: "A concern about this memorial" },
  { value: "other", label: "Something else" },
];

function bereavementFirst(a: { value: string }, b: { value: string }): number {
  if (a.value === "bereavement") return -1;
  if (b.value === "bereavement") return 1;
  return 0;
}

/**
 * The member-facing notice-and-takedown affordance (spec §14.3/§14.4/§14.7).
 * Anyone can quietly flag a listing for a steward to review. `memorial` floats
 * the bereavement reason to the top for In Memoriam pages.
 */
export function ReportButton({
  listingId,
  memorial = false,
  className = "",
}: Readonly<{
  listingId: string;
  memorial?: boolean;
  className?: string;
}>) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(memorial ? "bereavement" : "inaccurate");
  const [detail, setDetail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  const reasons = memorial ? [...REASONS].sort(bereavementFirst) : REASONS;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  async function submit(e: React.SubmitEvent) {
    e.preventDefault();
    setState("sending");
    try {
      await api.reportListing(listingId, { reason, detail: detail.trim() || undefined });
      setState("done");
    } catch {
      setState("error");
    }
  }

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-faint transition-colors hover:text-clay-text"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 21V4h12l-1.5 4L16 12H4" /><path d="M4 4v17" />
        </svg>
        Report this
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-[var(--radius-card)] border border-sand bg-paper p-4 text-left text-ink shadow-[var(--shadow-lift)]">
          {state === "done" ? (
            <div className="text-sm">
              <p className="font-semibold text-green">Thank you.</p>
              <p className="mt-1 text-ink-muted">A steward will review this. We take memorial and personal concerns seriously.</p>
              <button type="button" onClick={() => setOpen(false)} className="mt-3 text-xs font-medium text-teal-text hover:underline">Close</button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <p className="text-sm font-semibold text-ink">Report this listing</p>
              <p className="text-xs text-ink-muted">Tell a steward what&rsquo;s wrong. Contested or sensitive items are held, never auto-removed.</p>
              <div className="space-y-1.5">
                {reasons.map((rr) => (
                  <label key={rr.value} className="flex items-center gap-2 text-sm text-ink-muted">
                    <input type="radio" name="reason" value={rr.value} checked={reason === rr.value} onChange={() => setReason(rr.value)} className="accent-clay" />
                    {rr.label}
                  </label>
                ))}
              </div>
              <textarea
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                rows={2}
                placeholder="Add a detail (optional)"
                className="w-full rounded-lg border border-sand bg-cream px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-clay focus:outline-none"
              />
              {state === "error" && <p className="text-xs text-clay-text">Could not send that. Please try again.</p>}
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} className="text-xs text-ink-muted hover:text-ink">Cancel</button>
                <button type="submit" disabled={state === "sending"} className="rounded-full bg-clay px-4 py-1.5 text-xs font-semibold text-cream hover:bg-maroon-900 hover:text-on-green disabled:opacity-60">
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
