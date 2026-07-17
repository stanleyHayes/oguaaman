// Paystack Inline (v2) — completes a payment the backend has already initialized
// in an in-app modal, so the payer never leaves the app. Replaces the old
// full-page redirect to Paystack's hosted checkout. Degrades gracefully: when
// the modal can't run (dev simulation, no access code, or the script is
// blocked) it falls back to the hosted-page redirect, and the caller's
// return-URL handler (the ?..._ref query flow) confirms on the way back.

const INLINE_SRC = "https://js.paystack.co/v2/inline.js";

interface PaystackPopInstance {
  resumeTransaction(
    accessCode: string,
    opts: {
      onSuccess?: (tx: { reference: string }) => void;
      onCancel?: () => void;
      onError?: (e: { message?: string }) => void;
      onLoad?: () => void;
    },
  ): void;
}
type PaystackPopCtor = new () => PaystackPopInstance;

let scriptPromise: Promise<void> | null = null;

function loadInline(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if ((window as unknown as { PaystackPop?: PaystackPopCtor }).PaystackPop) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = INLINE_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null; // allow a retry next time
      reject(new Error("Paystack failed to load"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export type PayOutcome = "success" | "cancelled";

async function openInline(accessCode: string): Promise<PayOutcome> {
  await loadInline();
  const Ctor = (window as unknown as { PaystackPop?: PaystackPopCtor }).PaystackPop;
  if (!Ctor) throw new Error("Paystack unavailable");
  return new Promise<PayOutcome>((resolve, reject) => {
    const popup = new Ctor();
    popup.resumeTransaction(accessCode, {
      onSuccess: () => resolve("success"),
      onCancel: () => resolve("cancelled"),
      onError: (e) => reject(new Error(e?.message || "The payment could not be completed.")),
    });
  });
}

/** The shape every Start* payment endpoint returns. */
export interface PaymentStart {
  authorizationUrl: string;
  accessCode?: string;
  reference: string;
  simulated: boolean;
}

/**
 * Complete a payment the backend already initialized. Opens the in-app Paystack
 * modal and calls `onSuccess` once the payer completes (the caller then confirms
 * the reference and updates the UI in place — no navigation). `onCancel` fires
 * if they dismiss the modal. When the modal can't run, it redirects to the
 * hosted page instead (this call then navigates away).
 */
export async function completePayment(
  res: PaymentStart,
  handlers: { onSuccess: () => void | Promise<void>; onCancel?: () => void },
): Promise<void> {
  // Dev simulation or no access code → the hosted-page/redirect flow.
  if (res.simulated || !res.accessCode) {
    window.location.assign(res.authorizationUrl);
    return;
  }
  let outcome: PayOutcome;
  try {
    outcome = await openInline(res.accessCode);
  } catch {
    window.location.assign(res.authorizationUrl); // inline blocked → redirect
    return;
  }
  if (outcome === "success") await handlers.onSuccess();
  else handlers.onCancel?.();
}
