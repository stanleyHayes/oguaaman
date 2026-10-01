import type { StudioPaymentNotice } from "@/lib/use-studio-payment";

/** A payment that is still processing or was closed early, with a "Check again" button. */
export function PaymentNotice({ notice, checking, onRecheck, className = "mt-4" }: Readonly<{
  notice: StudioPaymentNotice | null;
  checking: boolean;
  onRecheck: () => void;
  className?: string;
}>) {
  if (!notice) return null;
  return (
    <div className={`${className} flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold/30 bg-gold/[0.1] px-4 py-3.5 text-sm font-medium text-gold-text`} role="status">
      <p className="min-w-0 flex-1">{notice.text}</p>
      <button type="button" onClick={onRecheck} disabled={checking} className="shrink-0 rounded-full border border-gold/50 px-3.5 py-1.5 text-xs font-semibold transition-colors hover:bg-gold/[0.15] disabled:opacity-60">
        {checking ? "Checking…" : "Check again"}
      </button>
    </div>
  );
}
