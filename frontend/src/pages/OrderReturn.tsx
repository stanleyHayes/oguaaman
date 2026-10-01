import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import type { CommerceOrder } from "@/lib/types";
import { Container } from "@/components/ui";
import { PaymentNotice } from "@/components/payment-notice";
import { usePageTitle } from "@/lib/use-page-title";
import { usePaymentConfirm } from "@/lib/use-payment-confirm";

/** Order states that mean the buyer's payment went through. */
const PAID_STATES = new Set<CommerceOrder["status"]>(["paid", "processing", "ready", "fulfilled"]);

/** The heading and note for an order the server returned. */
function orderOutcome(order: CommerceOrder): { title: string; note: string } {
  if (PAID_STATES.has(order.status)) {
    return { title: "Order confirmed", note: `${order.businessName} has received order ${order.reference}.` };
  }
  if (order.status === "refunded") {
    return { title: "Order refunded", note: `Order ${order.reference} with ${order.businessName} was refunded.` };
  }
  if (order.status === "cancelled") {
    return { title: "Payment not completed", note: `Order ${order.reference} was not paid, so ${order.businessName} has not received it. If money left your account, keep this reference and contact support.` };
  }
  return { title: "Payment still processing", note: `We're waiting for Paystack to confirm order ${order.reference}. Check again in a minute.` };
}

export function Component() {
  usePageTitle("Order confirmation");
  const [params] = useSearchParams();
  const reference = params.get("reference");
  const payment = usePaymentConfirm(api.confirmOrder);
  const { confirm, confirmed: order, notice } = payment;

  useEffect(() => {
    if (reference) void confirm(reference);
  }, [reference, confirm]);

  let title = "Confirming your payment…";
  if (!reference) title = "Confirmation needs attention";
  else if (order) title = orderOutcome(order).title;
  else if (notice) title = "Payment not confirmed yet";

  return <Container className="py-20"><div className="mx-auto max-w-xl rounded-[var(--radius-card)] border border-sand bg-cream p-8 text-center">
    <p className="eyebrow text-gold-text">Secure checkout</p>
    <h1 className="mt-3 text-4xl font-semibold">{title}</h1>
    {order && <>
      <p className="mt-4 text-ink-muted">{orderOutcome(order).note}</p>
      <p className="mt-2 text-sm text-ink-faint">Status: {order.status} · GH₵ {(order.amountPesewas / 100).toFixed(2)}</p>
      {order.status === "pending" && (
        <button type="button" onClick={() => void confirm(order.reference)} disabled={payment.confirming} className="mt-4 rounded-full border border-gold-border/50 px-4 py-2 text-sm font-semibold text-gold-text disabled:opacity-60">
          {payment.confirming ? "Checking…" : "Check again"}
        </button>
      )}
      <div><Link className="mt-7 inline-flex rounded-full bg-green px-5 py-3 font-semibold text-on-green" to={`/business/${order.listingSlug}`}>Back to the shop</Link></div>
    </>}
    {!reference && <p className="mt-4 text-clay-text">The payment reference is missing. If you were charged, keep your Paystack receipt and contact support.</p>}
    {!order && notice && (
      <>
        <PaymentNotice notice={notice} confirming={payment.confirming} onRecheck={payment.recheck} className="mt-5 text-left" />
        <p className="mt-3 text-xs text-ink-faint">Your reference is <strong>{notice.reference}</strong> — keep it if you contact support.</p>
      </>
    )}
  </div></Container>;
}
