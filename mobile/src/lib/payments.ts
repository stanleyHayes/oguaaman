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
      /** Informational only: the server charges the pending record's own amount. */
      amountPesewas?: number;
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
    // The server charges the pending record's own amount (in GHS); the client
    // only names the checkout.
    const intent = await api.stripeIntent({ reference: session.reference, flow: session.flow });
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
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not start Stripe checkout.";
    return { kind: "error", message };
  }
  return confirmStripeCheckout(session.reference);
}

/**
 * The card is charged: fulfil the record through the Stripe confirm endpoint,
 * which checks the PaymentIntent with Stripe. The flow's own confirm endpoint
 * verifies with Paystack and would mark a Stripe-paid record failed, so callers
 * only read the record back after this succeeds. One retry covers a
 * PaymentIntent that is still settling.
 */
async function confirmStripeCheckout(reference: string): Promise<CheckoutResult> {
  let last = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await api.confirmStripe(reference);
      return { kind: "success", reference, provider: "stripe" };
    } catch (e) {
      last = e instanceof Error ? e.message : "";
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
  return {
    kind: "error",
    message: `We couldn't confirm your card payment yet${last ? ` (${last})` : ""}. Please don't pay again — contact support with reference ${reference} if it doesn't show on your profile soon.`,
  };
}

/**
 * Build a checkout session from the legacy start-payment response shape used by
 * the four money flows. This lets existing call sites migrate without changing
 * the backend contract.
 */
export function sessionFromStartResponse(
  response: { authorizationUrl?: string; reference?: string; simulated?: boolean },
  stripeFallback: { amountPesewas?: number; flow: StripeFlow; metadata?: Record<string, string> }
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
