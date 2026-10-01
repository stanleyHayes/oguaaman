import { errorCode } from "./api";

/** No payment provider configured on the server (503 payments_unavailable). */
export const PAYMENTS_UNAVAILABLE = "Payments are temporarily unavailable. Please try again later.";

// Contract C1: a confirm that is not final yet is never reported as a failure.
const STILL_PROCESSING = "Your payment is still processing. We'll confirm it automatically — check again in a minute.";
const CHECK_UNAVAILABLE = "We couldn't check your payment right now. Try again in a minute.";
const NOT_CONFIRMED = "We couldn't confirm that payment yet. If you were charged, it will be confirmed shortly — check again in a minute.";

/** A payment-start failure as shown to the member. */
export function paymentError(e: unknown): string {
  if (errorCode(e) === "payments_unavailable") return PAYMENTS_UNAVAILABLE;
  return e instanceof Error ? e.message : "Could not start the payment.";
}

/** A confirm failure as shown to the member: the server's message for the known codes. */
export function confirmError(e: unknown): string {
  const code = errorCode(e);
  const fromServer = e instanceof Error && e.message ? e.message : "";
  if (code === "payment_pending") return fromServer || STILL_PROCESSING;
  if (code === "payment_check_unavailable") return fromServer || CHECK_UNAVAILABLE;
  if (code === "payments_unavailable") return PAYMENTS_UNAVAILABLE;
  return NOT_CONFIRMED;
}
