// Shared building blocks for the "Oguaa Outside" experience — the vetted-agent
// marketplace with managed escrow. Kept in one place so the directory, agent
// detail, jobs and become-an-agent pages present money, status, escrow and the
// (load-bearing) risk disclaimer identically. Money is in PESEWAS everywhere.
import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Agent, AgentJobStatus, AgentEscrow, AgentService } from "@/lib/types";
import { Avatar, VerifiedBadge } from "./ui";
import { tagLabel } from "@/lib/format";

// ── Money ───────────────────────────────────────────────────────────────────
/** Format pesewas as GHS, showing decimals only when the amount isn't whole. */
export function ghs(pesewas?: number): string {
  const value = (pesewas ?? 0) / 100;
  const hasFraction = Math.round(value * 100) % 100 !== 0;
  return `GH₵ ${value.toLocaleString("en-GH", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

/** Map a service slug to its human label using the /api/agent-services list. */
export function serviceLabeller(services: AgentService[]): (slug: string) => string {
  const map = new Map(services.map((s) => [s.slug, s.label]));
  return (slug: string) => map.get(slug) ?? tagLabel(slug);
}

// ── Custom choice menu ──────────────────────────────────────────────────────
// Outside has two short, high-value pickers (service and payout method). This
// listbox keeps them visually consistent without falling back to the browser's
// native select chrome. Options receive focus while the menu is open, so arrow,
// Home/End, Escape and Tab behaviour remains predictable for keyboard users.
export interface OutsideChoiceOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

export function OutsideChoiceMenu<T extends string>({
  label,
  value,
  options,
  onChange,
  className = "",
}: Readonly<{
  label: string;
  value: T;
  options: readonly OutsideChoiceOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}>) {
  const [open, setOpen] = useState(false);
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const current = options.find((option) => option.value === value) ?? options[0];
  const disabled = options.length === 0;

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const selected = listRef.current?.querySelector<HTMLButtonElement>('[role="option"][aria-selected="true"]');
      const first = listRef.current?.querySelector<HTMLButtonElement>('[role="option"]');
      (selected ?? first)?.focus({ preventScroll: true });
    });
    const dismiss = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", dismiss);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("mousedown", dismiss);
    };
  }, [open]);

  function focusOption(index: number) {
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
    if (buttons.length === 0) return;
    const next = ((index % buttons.length) + buttons.length) % buttons.length;
    buttons[next].focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!open && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      focusOption(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusOption(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusOption(buttons.length - 1);
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`} onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`${label}: ${current?.label ?? "No options available"}`}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((shown) => !shown)}
        className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
          open
            ? "border-gold-border bg-gold/[0.1] text-ink shadow-sm ring-2 ring-gold/15"
            : "border-sand bg-paper text-ink hover:border-green/40 hover:bg-cream"
        }`}
      >
        <span className="min-w-0">
          <span className="block truncate font-semibold">{current?.label ?? "No options available"}</span>
        </span>
        <svg viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 text-ink-faint transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label={`${label} options`}
          className="theme-surface absolute left-0 top-full z-50 mt-2 max-h-72 w-full min-w-56 overflow-y-auto rounded-2xl border border-sand bg-paper p-1.5 text-ink shadow-[var(--shadow-lift)]"
        >
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                  selected ? "bg-green font-semibold text-on-green" : "text-ink hover:bg-cream"
                }`}
              >
                <span>
                  <span className="block">{option.label}</span>
                  {option.description && <span className={`mt-0.5 block text-xs font-normal ${selected ? "text-on-green/70" : "text-ink-faint"}`}>{option.description}</span>}
                </span>
                {selected && (
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m5 12 4 4L19 6" /></svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── The disclaimer (load-bearing; shown on directory, detail + before funding)─
export const OUTSIDE_DISCLAIMER =
  "Oguaa verifies identity and vets agents but cannot guarantee a transaction. Keep terms in writing, use escrow, and report problems immediately.";

function WarningGlyph({ className = "h-5 w-5" }: Readonly<{ className?: string }>) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

/**
 * The prominent "engage at your own risk" notice. `variant="banner"` is the
 * full callout used at the top of the directory and detail pages; `compact` is a
 * slimmer inline strip used right before a client funds an escrow. `onDark`
 * restyles it for green-900 hero contexts.
 */
export function OutsideDisclaimer({
  variant = "banner",
  onDark = false,
  className = "",
}: Readonly<{ variant?: "banner" | "compact"; onDark?: boolean; className?: string }>) {
  const shell = onDark
    ? "border-gold/40 bg-gold/[0.10] text-cream"
    : "border-clay/35 bg-clay/[0.07] text-ink";
  const iconWrap = onDark ? "bg-gold/20 text-gold" : "bg-clay/[0.12] text-clay-text";
  const heading = onDark ? "text-gold" : "text-clay-text";
  const body = onDark ? "text-cream/85" : "text-ink-muted";

  if (variant === "compact") {
    return (
      <div role="note" className={`flex items-start gap-3 rounded-[var(--radius-card)] border px-4 py-3 ${shell} ${className}`}>
        <span className={`mt-0.5 shrink-0 ${onDark ? "text-gold" : "text-clay-text"}`}><WarningGlyph className="h-4 w-4" /></span>
        <p className={`text-xs leading-relaxed ${body}`}>
          <b className={heading}>Engage at your own risk.</b> {OUTSIDE_DISCLAIMER}
        </p>
      </div>
    );
  }

  return (
    <aside
      role="note"
      aria-label="Engage at your own risk"
      className={`flex items-start gap-4 rounded-[var(--radius-card)] border px-5 py-4 sm:px-6 sm:py-5 ${shell} ${className}`}
    >
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${iconWrap}`}>
        <WarningGlyph />
      </span>
      <div>
        <p className={`text-[0.7rem] font-bold uppercase tracking-[0.16em] ${heading}`}>Engage at your own risk</p>
        <p className={`mt-1.5 text-sm leading-relaxed ${body}`}>{OUTSIDE_DISCLAIMER}</p>
      </div>
    </aside>
  );
}

// ── Job status chip ───────────────────────────────────────────────────────────
// Light-token styling: every job/escrow chip sits on cream cards. Each status
// carries a colour + a short human label so the escrow lifecycle reads at a
// glance (awaiting quote → quoted → in escrow → delivered → completed …).
const JOB_STATUS_META: Record<AgentJobStatus, { label: string; cls: string; dot: string }> = {
  requested: { label: "Awaiting quote", cls: "border-sand bg-cream text-ink-muted", dot: "bg-ink-faint" },
  quoted: { label: "Quoted", cls: "border-gold-border/40 bg-gold/[0.12] text-gold-text", dot: "bg-gold-brand" },
  funded: { label: "Funded · in escrow", cls: "border-teal/30 bg-teal/[0.09] text-teal-text", dot: "bg-teal" },
  delivered: { label: "Delivered", cls: "border-green/30 bg-green/[0.07] text-green-text", dot: "bg-green" },
  completed: { label: "Completed", cls: "border-green/40 bg-green/[0.12] text-green-text", dot: "bg-green" },
  disputed: { label: "Disputed", cls: "border-maroon-900/30 bg-maroon-900/[0.07] text-maroon-text", dot: "bg-maroon-900" },
  cancelled: { label: "Cancelled", cls: "border-clay/30 bg-clay/[0.08] text-clay-text", dot: "bg-clay" },
  refunded: { label: "Refunded", cls: "border-clay/30 bg-clay/[0.08] text-clay-text", dot: "bg-clay" },
};

export function JobStatusChip({ status }: Readonly<{ status: AgentJobStatus }>) {
  const meta = JOB_STATUS_META[status] ?? JOB_STATUS_META.requested;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold ${meta.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden />
      {meta.label}
    </span>
  );
}

// ── Escrow chip ───────────────────────────────────────────────────────────────
// The backend's escrow.status is a free-ish string; classify it loosely so the
// colour still tracks meaning even if the exact vocabulary shifts.
function escrowMeta(status: string): { label: string; cls: string } {
  const s = (status || "").toLowerCase();
  if (s.includes("release") || s.includes("paid") || s.includes("complete"))
    return { label: "Escrow released", cls: "border-green/30 bg-green/[0.07] text-green-text" };
  if (s.includes("refund"))
    return { label: "Escrow refunded", cls: "border-clay/30 bg-clay/[0.08] text-clay-text" };
  if (s.includes("disput") || s.includes("frozen") || s.includes("hold-dispute"))
    return { label: "Escrow frozen", cls: "border-maroon-900/30 bg-maroon-900/[0.07] text-maroon-text" };
  if (s.includes("held") || s.includes("fund") || s.includes("hold"))
    return { label: "Escrow held", cls: "border-teal/30 bg-teal/[0.09] text-teal-text" };
  return { label: status ? `Escrow ${status}` : "Escrow pending", cls: "border-sand bg-cream text-ink-muted" };
}

export function EscrowChip({ escrow }: Readonly<{ escrow: AgentEscrow }>) {
  const meta = escrowMeta(escrow.status);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold ${meta.cls}`}>
      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="11" width="18" height="10" rx="2" />
        <path d="M7 11V8a5 5 0 0 1 10 0v3" />
      </svg>
      {meta.label}
      {escrow.simulated && <span className="opacity-70">· sim</span>}
    </span>
  );
}

// ── Rating stars ──────────────────────────────────────────────────────────────
export function Stars({ value, count, className = "", onDark = false }: Readonly<{ value: number; count?: number; className?: string; onDark?: boolean }>) {
  const rounded = Math.round(value * 2) / 2; // nearest half
  const label = count != null ? `${value.toFixed(1)} out of 5 from ${count} ${count === 1 ? "review" : "reviews"}` : `${value.toFixed(1)} out of 5`;
  const gradientSeed = useId().replaceAll(":", "");
  return (
    <span className={`inline-flex items-center gap-1 ${className}`} title={label} aria-label={label}>
      <span className="inline-flex" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => {
          const fill = rounded >= i ? "full" : rounded >= i - 0.5 ? "half" : "empty";
          return (
            <svg key={i} viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden>
              <defs>
                <linearGradient id={`half-${gradientSeed}-${i}`}>
                  <stop offset="50%" stopColor="var(--color-gold-brand)" />
                  <stop offset="50%" stopColor="transparent" />
                </linearGradient>
              </defs>
              <path
                d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 21.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9L12 2.5z"
                fill={fill === "full" ? "var(--color-gold-brand)" : fill === "half" ? `url(#half-${gradientSeed}-${i})` : "transparent"}
                stroke="var(--color-gold-border)"
                strokeWidth="1"
              />
            </svg>
          );
        })}
      </span>
      <span className={`text-xs font-semibold ${onDark ? "text-cream" : "text-ink"}`}>
        {value.toFixed(1)}
        {count != null && <span className={`ml-0.5 font-normal ${onDark ? "text-cream/60" : "text-ink-faint"}`}>({count})</span>}
      </span>
    </span>
  );
}

// ── Agent type badge ──────────────────────────────────────────────────────────
export function AgentTypeBadge({ type, onDark = false }: Readonly<{ type: Agent["type"]; onDark?: boolean }>) {
  const isOffice = type === "office";
  const base = "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-wide";
  const cls = onDark
    ? "border-cream/25 bg-cream/[0.08] text-cream/85"
    : isOffice
      ? "border-teal/30 bg-teal/[0.09] text-teal-text"
      : "border-green/25 bg-green/[0.06] text-green-text";
  return (
    <span className={`${base} ${cls}`}>
      {isOffice ? (
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16" /><path d="M15 9h4a1 1 0 0 1 1 1v11" /><path d="M2 21h20M8 8h.01M8 12h.01M8 16h.01M11 8h.01M11 12h.01M11 16h.01" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="8" r="3.4" /><path d="M5 20a7 7 0 0 1 14 0" />
        </svg>
      )}
      {isOffice ? "Office" : "Individual"}
    </span>
  );
}

// ── Agent directory card ──────────────────────────────────────────────────────
/** One agent in the /outside directory grid. `serviceLabel` turns slugs human. */
export function AgentCard({ agent, serviceLabel }: Readonly<{ agent: Agent; serviceLabel: (slug: string) => string }>) {
  const verified = agent.status === "verified";
  const initials = agent.displayName.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <article className="group relative overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream p-5 shadow-[var(--shadow-card)] transition-[border-color,box-shadow] hover:border-green/40 hover:shadow-[var(--shadow-lift)]">
      <span className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-gold-brand via-teal to-green" aria-hidden />
      <div className="flex items-start gap-3.5">
        <Avatar initials={initials} size={48} className="ring-1 ring-green/10" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="line-clamp-2 break-words text-lg font-semibold text-ink">{agent.displayName}</h3>
            {verified && <VerifiedBadge iconOnly verifiedAs="Oguaa Outside agent" />}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <AgentTypeBadge type={agent.type} />
            {agent.ratingCount > 0
              ? <Stars value={agent.ratingAvg} count={agent.ratingCount} />
              : <span className="text-xs text-ink-faint">No reviews yet</span>}
          </div>
        </div>
      </div>

      {agent.headline && <p className="mt-3.5 line-clamp-2 text-sm leading-relaxed text-ink-muted">{agent.headline}</p>}

      {agent.services.length > 0 && (
        <ul className="mt-3.5 flex flex-wrap gap-1.5">
          {agent.services.slice(0, 3).map((s) => (
            <li key={s} className="rounded-full border border-sand bg-paper px-2.5 py-0.5 text-[0.7rem] font-medium text-ink-muted">{serviceLabel(s)}</li>
          ))}
          {agent.services.length > 3 && <li className="rounded-full px-1.5 py-0.5 text-[0.7rem] text-ink-faint">+{agent.services.length - 3}</li>}
        </ul>
      )}

      {agent.coverageAreas.length > 0 && (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-ink-faint">
          <svg viewBox="0 0 24 24" className="mt-0.5 h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" />
          </svg>
          <span className="line-clamp-1">{agent.coverageAreas.join(" · ")}</span>
        </p>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-sand pt-4">
        <span className="text-xs font-semibold text-green-text">{agent.jobsCompleted} {agent.jobsCompleted === 1 ? "job done" : "jobs done"}</span>
        <Link
          to={`/outside/agents/${agent.slug}`}
          aria-label={`View ${agent.displayName} and send a request`}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-green px-4 py-2 text-xs font-semibold text-on-green transition-colors hover:bg-green-900"
        >
          View &amp; request
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </Link>
      </div>
    </article>
  );
}
