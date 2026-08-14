import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import type { CommerceOrder } from "@/lib/types";
import { Container } from "@/components/ui";
import { usePageTitle } from "@/lib/use-page-title";

export function Component() {
  usePageTitle("Order confirmation");
  const [params] = useSearchParams();
  const [order, setOrder] = useState<CommerceOrder | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { const reference = params.get("reference"); if (!reference) { setError("The payment reference is missing."); return; } api.confirmOrder(reference).then(setOrder).catch((e: unknown) => setError(e instanceof Error ? e.message : "We could not confirm the payment.")); }, [params]);
  return <Container className="py-20"><div className="mx-auto max-w-xl rounded-[var(--radius-card)] border border-sand bg-cream p-8 text-center">
    <p className="eyebrow text-gold-text">Secure checkout</p>
    <h1 className="mt-3 text-4xl font-semibold">{order ? "Order confirmed" : error ? "Confirmation needs attention" : "Confirming your payment…"}</h1>
    {order && <><p className="mt-4 text-ink-muted">{order.businessName} has received order <strong>{order.reference}</strong>.</p><p className="mt-2 text-sm text-ink-faint">Status: {order.status} · GH₵ {(order.amountPesewas / 100).toFixed(2)}</p><Link className="mt-7 inline-flex rounded-full bg-green px-5 py-3 font-semibold text-on-green" to={`/business/${order.listingSlug}`}>Back to the shop</Link></>}
    {error && <p className="mt-4 text-clay-text">{error} If you were charged, keep your reference and contact support.</p>}
  </div></Container>;
}
