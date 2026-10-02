import { useId, type ReactNode } from "react";
import { AD_STATUS, type StatusTone } from "@/lib/ads";
import type { AdStatus } from "@/lib/types";

// Form primitives for the advertiser flow. They follow the portal's form look
// (paper inputs, sand hairlines, green focus) with inline errors under each
// field — never alerts.

/** A labelled field with an optional hint, character counter and inline error. */
export function Field({
  label,
  hint,
  error,
  required = false,
  count,
  max,
  children,
  id,
  className = "",
}: Readonly<{
  label: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  /** Current length, shown against `max`. */
  count?: number;
  max?: number;
  /** The id of the control the label points at. */
  id: string;
  children: ReactNode;
  className?: string;
}>) {
  const over = max !== undefined && count !== undefined && count > max;
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
          {required && <span className="text-clay-text"> *</span>}
        </label>
        {max !== undefined && count !== undefined && (
          <span className={`text-xs tabular-nums ${over ? "font-semibold text-clay-text" : "text-ink-faint"}`} aria-live="polite">
            {count}/{max}
          </span>
        )}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs text-clay-text">{error}</p>
      ) : (
        hint && <p className="mt-1.5 text-xs leading-relaxed text-ink-faint">{hint}</p>
      )}
    </div>
  );
}

/** A large radio choice drawn as a card. The radio itself stays real (and focusable). */
export function ChoiceCard({
  name,
  checked,
  onChange,
  disabled = false,
  title,
  meta,
  children,
  className = "",
}: Readonly<{
  name: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  title: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
  className?: string;
}>) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={`group relative flex cursor-pointer flex-col rounded-xl border p-4 transition-[border-color,background-color,box-shadow,transform] duration-200 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-teal/50 sm:p-5 ${
        checked
          ? "border-green bg-green/[0.05] shadow-[0_10px_30px_-20px_color-mix(in_oklab,var(--color-green)_60%,transparent)]"
          : "border-sand bg-paper hover:border-green/40 active:translate-y-px"
      } ${disabled ? "cursor-not-allowed opacity-60 hover:border-sand active:translate-y-0" : ""} ${className}`}
    >
      <input id={id} type="radio" name={name} checked={checked} onChange={onChange} disabled={disabled} className="sr-only" />
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0 text-base font-semibold text-ink">{title}</span>
        <span
          aria-hidden
          className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors ${checked ? "border-green bg-green" : "border-ink-faint/50 bg-paper"}`}
        >
          {checked && <span className="h-2 w-2 rounded-full bg-on-green" />}
        </span>
      </span>
      {meta && <span className="mt-1 text-sm text-ink-muted">{meta}</span>}
      {children}
    </label>
  );
}

/** A checkbox with its sentence beside it (consents, declarations). */
export function CheckRow({
  checked,
  onChange,
  children,
  error,
}: Readonly<{ checked: boolean; onChange: (v: boolean) => void; children: ReactNode; error?: string | null }>) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3.5 transition-colors ${error ? "border-clay/60 bg-clay/[0.04]" : "border-sand bg-paper hover:border-green/30"}`}>
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-green" />
        <span className="text-sm leading-relaxed text-ink-muted">{children}</span>
      </label>
      {error && <p role="alert" className="mt-1.5 text-xs text-clay-text">{error}</p>}
    </div>
  );
}

const TONE_CLASS: Record<StatusTone, string> = {
  neutral: "border-sand bg-cream text-ink-muted",
  gold: "border-gold-border/40 bg-gold/[0.12] text-gold-text",
  green: "border-green/30 bg-green/[0.07] text-green-text",
  teal: "border-teal/30 bg-teal/[0.09] text-teal-text",
  clay: "border-clay/30 bg-clay/[0.08] text-clay-text",
};

/** A campaign status as a small square-cornered tag. */
export function AdStatusTag({ status, className = "" }: Readonly<{ status: AdStatus; className?: string }>) {
  const s = AD_STATUS[status] ?? { label: status, tone: "neutral" as const };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[0.7rem] font-semibold tracking-wide ${TONE_CLASS[s.tone]} ${className}`}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {s.label}
    </span>
  );
}
