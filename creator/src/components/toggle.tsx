/** A labelled row switch (role="switch"). `disabled` renders it locked (e.g. safety alerts). */
export function Toggle({ checked, onChange, label, description, disabled }: Readonly<{ checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }>) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-sand px-1 py-4 last:border-0">
      <div className="min-w-0 pr-2">
        <p className="text-sm font-medium text-ink">{label}</p>
        {description && <p className="mt-1 max-w-xl text-xs leading-relaxed text-ink-faint">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="relative h-11 w-14 shrink-0 rounded-full disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className={`absolute inset-x-0 top-1/2 h-7 -translate-y-1/2 rounded-full transition-colors ${checked ? "bg-green" : "bg-sand"}`} aria-hidden />
        <span className={`absolute left-1 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-paper shadow ring-1 ring-black/5 transition-transform ${checked ? "translate-x-6" : ""}`} aria-hidden />
      </button>
    </div>
  );
}
