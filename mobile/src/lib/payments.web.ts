import { openInAppBrowser } from "./webbrowser";

/**
 * Web variant of ./payments.ts — Metro resolves this file for web bundles,
 * where the native Stripe SDK (@stripe/stripe-react-native) cannot run.
 * Paystack's hosted checkout (in-app browser) and the simulated flow behave
 * exactly as on native; the Stripe flow reports itself unavailable.
 */

export type PaymentProvider = "paystack" | "stripe";

export type StripeFlow = "pledge" | "ticket" | "subscription" | "promotion";

export type CheckoutResult =
  | { kind: "success"; reference: string; provider: PaymentProvider | "simulated" }
  | { kind: "cancelled" }
  | { kind: "error"; message: string };

export type CheckoutSession =
  | { provider: "paystack"; authorizationUrl: string; reference: string }
  | {
      provider: "stripe";
      reference: string;
      amountPesewas: number;
      flow: StripeFlow;
      metadata?: Record<string, string>;
    }
  | { provider: "simulated"; reference: string };

/** Web checkout only supports Paystack — the native PaymentSheet can't run here. */
export function activePaymentProvider(): PaymentProvider {
  return "paystack";
}

/** Native Stripe is never available on web, so sessions always fall back to Paystack. */
export function isStripeConfigured(): boolean {
  return false;
}

export function isPaystackConfigured(): boolean {
  return !!process.env.EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY;
}

export function simulationEnabled(): boolean {
  return process.env.EXPO_PUBLIC_SIMULATE_PAYMENTS === "true";
}

/**
 * Present the configured checkout for a session returned by one of the start
 * endpoints (pledge, ticket, subscription, promotion).
 *
 * - Paystack: opens the hosted checkout in an in-app browser.
 * - Stripe: unavailable on web (native-only SDK) — returns an error.
 * - Simulated: only succeeds when EXPO_PUBLIC_SIMULATE_PAYMENTS is "true",
 *   otherwise returns an error so real credentials can't be accidentally skipped.
 */
export async function presentCheckout(session: CheckoutSession): Promise<CheckoutResult> {
  if (session.provider === "simulated") {
    if (simulationEnabled()) {
      return { kind: "success", reference: session.reference, provider: "simulated" };
    }
    return { kind: "error", message: "Simulated payments are disabled. Set a live provider key." };
  }

  if (session.provider === "paystack") {
    const opened = await openInAppBrowser(session.authorizationUrl);
    if (!opened) {
      return { kind: "error", message: "Could not open the payment page." };
    }
    return { kind: "success", reference: session.reference, provider: "paystack" };
  }

  return { kind: "error", message: "Stripe payments are not available on web — please use Paystack." };
}

/**
 * Build a checkout session from the legacy start-payment response shape used by
 * the four money flows. On web this always yields a Paystack (or simulated)
 * session, since isStripeConfigured() is false here.
 */
export function sessionFromStartResponse(
  response: { authorizationUrl?: string; reference?: string; simulated?: boolean },
  stripeFallback: { amountPesewas: number; flow: StripeFlow; metadata?: Record<string, string> }
): CheckoutSession {
  const reference = response.reference ?? "";
  if (response.simulated) {
    return { provider: "simulated", reference };
  }
  if (activePaymentProvider() === "stripe" && isStripeConfigured()) {
    return {
      provider: "stripe",
      reference,
      amountPesewas: stripeFallback.amountPesewas,
      flow: stripeFallback.flow,
      metadata: stripeFallback.metadata,
    };
  }
  return {
    provider: "paystack",
    authorizationUrl: response.authorizationUrl ?? "",
    reference,
  };
}
