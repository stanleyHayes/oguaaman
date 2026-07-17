import { api } from "./api";
import { openInAppBrowser } from "./webbrowser";
import { initPaymentSheet, presentPaymentSheet } from "@stripe/stripe-react-native";

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

const DEFAULT_PROVIDER: PaymentProvider = "paystack";

export function activePaymentProvider(): PaymentProvider {
  const env = process.env.EXPO_PUBLIC_PAYMENT_PROVIDER;
  if (env === "stripe") return "stripe";
  return DEFAULT_PROVIDER;
}

export function isStripeConfigured(): boolean {
  return !!process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
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
 * - Stripe: creates a PaymentIntent on the server and presents the native
 *   PaymentSheet (cards, Apple Pay / Google Pay when configured).
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

  // Stripe path
  if (!isStripeConfigured()) {
    return { kind: "error", message: "Stripe is not configured on this device." };
  }
  try {
    const intent = await api.stripeIntent({
      reference: session.reference,
      amountPesewas: session.amountPesewas,
      currency: "GHS",
      flow: session.flow,
      metadata: session.metadata,
    });
    const { error: initError } = await initPaymentSheet({
      paymentIntentClientSecret: intent.clientSecret,
      merchantDisplayName: "Oguaa",
      allowsDelayedPaymentMethods: false,
    });
    if (initError) {
      return { kind: "error", message: initError.message };
    }
    const { error: presentError } = await presentPaymentSheet();
    if (presentError) {
      if (presentError.code === "Canceled") {
        return { kind: "cancelled" };
      }
      return { kind: "error", message: presentError.message };
    }
    return { kind: "success", reference: intent.reference, provider: "stripe" };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not start Stripe checkout.";
    return { kind: "error", message };
  }
}

/**
 * Build a checkout session from the legacy start-payment response shape used by
 * the four money flows. This lets existing call sites migrate without changing
 * the backend contract.
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
