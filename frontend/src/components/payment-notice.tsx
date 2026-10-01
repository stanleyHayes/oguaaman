import type { PaymentNoticeState } from "@/lib/use-payment-confirm";

/**
 * Why a payment is not confirmed yet — still processing, not checkable right
 * now, or closed early — with a "Check again" button that re-runs the server
 * confirm for the same reference (contract C1).
 */
export function PaymentNotice({ notice, confirming, onRecheck, className = "" }: Readonly<{
  notice: PaymentNoticeState | null;
  confirming: boolean;
  onRecheck: () => void;
  className?: string;
}>) {
  if (!notice) return null;
  return (
    <div role="status" className={`rounded-lg border border-gold-border/30 bg-gold/[0.1] px-4 py-3 text-sm text-gold-text ${className}`}>
      <p>{notice.message}</p>
      <button
        type="button"
        onClick={onRecheck}
        disabled={confirming}
        className="mt-2 rounded-full border border-gold-border/50 px-3 py-1 text-xs font-semibold hover:bg-gold/[0.12] disabled:opacity-60"
      >
        {confirming ? "Checking…" : "Check again"}
      </button>
    </div>
  );
}
