import { useId, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { TONE_CLASS, TONE_DOT, type Tone } from "@/lib/ads";
import { btnGhost, btnSecondary, inputCls, sectionTitleCls } from "@/lib/ui-classes";
import { BusyLabel } from "@/components/skeleton";

/** A status chip with a leading dot (ads, sponsors, jobs, refunds). */
export function ToneChip({ tone, children, className = "" }: Readonly<{ tone: Tone; children: ReactNode; className?: string }>) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[0.7rem] font-semibold ${TONE_CLASS[tone]} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} aria-hidden />
      {children}
    </span>
  );
}

/** A small square-cornered flag for review flags (not a pill: these are warnings). */
export function FlagChip({ children, tone = "gold" }: Readonly<{ children: ReactNode; tone?: Tone | "ai" }>) {
  const cls = tone === "ai" ? "border-ai-line bg-ai-tint text-ai" : `border-transparent ${TONE_CLASS[tone]}`;
  return <span className={`inline-flex items-center rounded-[4px] border px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.06em] ${cls}`}>{children}</span>;
}

/** A titled panel. `aside` puts a short note under the title. */
export function Panel({ title, aside, action, children, className = "", id }: Readonly<{ title: string; aside?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; id?: string }>) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className={`rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)] ${className}`}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-sand/80 px-5 py-4">
        <div className="min-w-0">
          <h2 id={id ? `${id}-title` : undefined} className={sectionTitleCls}>{title}</h2>
          {aside && <p className="mt-0.5 max-w-[65ch] text-sm leading-relaxed text-ink-muted [text-wrap:pretty]">{aside}</p>}
        </div>
        {action}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

/** Accessible on/off switch. */
export function Toggle({ checked, onChange, label, description, disabled = false, warning }: Readonly<{
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: ReactNode;
  disabled?: boolean;
  /** Shown beneath when the switch is on (store-risk or legal warnings). */
  warning?: ReactNode;
}>) {
  const id = useId();
  return (
    <div className="py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <label htmlFor={id} className="text-sm font-semibold text-ink">{label}</label>
          {description && <p id={`${id}-d`} className="mt-0.5 max-w-[60ch] text-sm leading-relaxed text-ink-muted [text-wrap:pretty]">{description}</p>}
        </div>
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={checked}
          aria-describedby={description ? `${id}-d` : undefined}
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className={`relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-[background-color,border-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-cream disabled:cursor-not-allowed disabled:opacity-55 ${checked ? "border-green bg-green" : "border-sand bg-sand/70"}`}
        >
          <span className="sr-only">{checked ? "On" : "Off"}</span>
          <span aria-hidden className={`absolute left-0.5 h-[1.375rem] w-[1.375rem] rounded-full bg-paper shadow-[0_2px_6px_color-mix(in_oklab,var(--color-green-900)_25%,transparent)] transition-transform duration-200 ${checked ? "translate-x-5" : "translate-x-0"}`} />
        </button>
      </div>
      {checked && warning && (
        <p className="mt-2 rounded-lg border border-clay/25 bg-clay/[0.07] px-3 py-2 text-sm leading-relaxed text-clay-text">{warning}</p>
      )}
    </div>
  );
}

/** Inline error under a field. */
export function FieldError({ id, children }: Readonly<{ id?: string; children?: ReactNode }>) {
  if (!children) return null;
  return <p id={id} role="alert" className="mt-1 text-xs font-medium text-clay-text">{children}</p>;
}

/** A banner for page-level outcomes. Success copy is calm; no exclamation marks. */
export function Notice({ tone, children, onDismiss }: Readonly<{ tone: "ok" | "error" | "warn"; children: ReactNode; onDismiss?: () => void }>) {
  const cls = {
    ok: "border-green/25 bg-green/[0.07] text-green-text",
    error: "border-clay/30 bg-clay/[0.08] text-clay-text",
    warn: "border-gold-border/40 bg-gold/[0.1] text-gold-text",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm leading-relaxed ${cls}`}>
      <div className="min-w-0">{children}</div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="-my-1 shrink-0 rounded-full px-2 py-1 text-xs font-semibold opacity-80 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60">
          Dismiss
        </button>
      )}
    </div>
  );
}

/** A value against its cap, as a slim bar (spend, delivery). */
export function Meter({ label, value, cap, display, tone = "green" }: Readonly<{ label: string; value: number; cap: number; display: string; tone?: "green" | "ai" | "gold" }>) {
  const share = cap > 0 ? Math.min(1, value / cap) : 0;
  const over = cap > 0 && value >= cap;
  const fill = over ? "bg-clay" : { green: "bg-green-text", ai: "bg-ai", gold: "bg-gold-brand" }[tone];
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-xs font-medium text-ink-muted">{label}</span>
        <span className={`text-xs font-semibold tabular-nums ${over ? "text-clay-text" : "text-ink"}`}>{display}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sand" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={cap} aria-valuenow={Math.min(value, cap)}>
        <div className={`h-full rounded-full ${fill} transition-transform duration-300`} style={{ width: "100%", transform: `translateX(-${(1 - share) * 100}%)` }} />
      </div>
    </div>
  );
}

/**
 * An action that needs a written reason, confirmed in the page (never
 * window.confirm). Collapsed it is one button; opened it shows a reason box
 * and a confirm button.
 */
export function ReasonAction({ label, confirmLabel, placeholder, onConfirm, minLength = 5, maxLength = 1000, buttonClass = btnSecondary, confirmClass, disabled = false, busyLabel, description }: Readonly<{
  label: ReactNode;
  confirmLabel: string;
  placeholder: string;
  onConfirm: (reason: string) => Promise<void>;
  minLength?: number;
  maxLength?: number;
  buttonClass?: string;
  confirmClass?: string;
  disabled?: boolean;
  busyLabel?: string;
  description?: ReactNode;
}>) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tooShort = reason.trim().length < minLength;

  async function confirm() {
    if (tooShort) {
      setError(`Write at least ${minLength} characters so the record explains itself.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onConfirm(reason.trim());
      setOpen(false);
      setReason("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full">
      {!open && (
        <button type="button" disabled={disabled} onClick={() => setOpen(true)} className={buttonClass} aria-expanded={false} aria-controls={id}>
          {label}
        </button>
      )}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            key="reason"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="rounded-xl border border-sand bg-paper p-3"
          >
            {description && <p className="mb-2 text-sm leading-relaxed text-ink-muted">{description}</p>}
            <label htmlFor={`${id}-reason`} className="sr-only">Reason</label>
            <textarea
              id={`${id}-reason`}
              value={reason}
              onChange={(e) => { setReason(e.target.value); if (error) setError(""); }}
              rows={3}
              maxLength={maxLength}
              placeholder={placeholder}
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={error ? `${id}-err` : undefined}
              className={inputCls}
            />
            <FieldError id={`${id}-err`}>{error}</FieldError>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" onClick={confirm} disabled={busy} className={confirmClass ?? buttonClass}>
                {busy ? <BusyLabel label={busyLabel ?? "Saving"} /> : confirmLabel}
              </button>
              <button type="button" onClick={() => { setOpen(false); setError(""); }} disabled={busy} className={btnGhost}>Cancel</button>
              <span className="ml-auto text-[0.7rem] tabular-nums text-ink-faint">{reason.trim().length}/{maxLength}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** A configured / missing indicator for a server key. */
export function KeyIndicator({ label, on, detail }: Readonly<{ label: string; on: boolean; detail: string }>) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span aria-hidden className={`mt-1 grid size-5 shrink-0 place-items-center rounded-full ${on ? "bg-green/[0.12] text-green-text" : "bg-clay/[0.12] text-clay-text"}`}>
        {on ? (
          <svg viewBox="0 0 20 20" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m4.5 10.5 3.5 3.5 7.5-8" /></svg>
        ) : (
          <svg viewBox="0 0 20 20" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l8 8M14 6l-8 8" /></svg>
        )}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{label} <span className={`ml-1 text-xs font-medium ${on ? "text-green-text" : "text-clay-text"}`}>{on ? "Configured" : "Not set"}</span></p>
        <p className="text-xs leading-relaxed text-ink-muted">{detail}</p>
      </div>
    </div>
  );
}

/** Read-only notice for staff who can view but not change a settings page. */
export function ReadOnlyNotice({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <p className="flex items-center gap-2 rounded-xl border border-sand bg-paper px-4 py-3 text-sm text-ink-muted">
      <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-gold-text" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
      {children}
    </p>
  );
}
