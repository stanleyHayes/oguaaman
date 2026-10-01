import { apiErrorCode, type ApiError } from "./api";

/** The copy shown when the server has no payment provider configured (K16 / D4). */
export const PAYMENTS_UNAVAILABLE = "Payments are temporarily unavailable. Please try again later.";

/** Paystack has not finished the charge yet (409 payment_pending, contract C1). */
export const PAYMENT_PENDING = "Your payment is still processing. We'll confirm it automatically — check again in a minute.";

/** Paystack could not be reached to check the charge (503 payment_check_unavailable, contract C1). */
export const PAYMENT_CHECK_UNAVAILABLE = "We couldn't check your payment right now. Try again in a minute.";

/** Any other confirm failure: the webhook still settles a real charge later. */
export const PAYMENT_NOT_CONFIRMED = "We couldn't confirm that payment. If you were charged, it will reconcile shortly — check again in a minute.";

/** A human message for a failed payment start or confirm. */
export function paymentErrorMessage(err: unknown, fallback: string): string {
  if (apiErrorCode(err) === "payments_unavailable") return PAYMENTS_UNAVAILABLE;
  return err instanceof Error && err.message ? err.message : fallback;
}

/** The server's own message for a known code, or our copy of it. */
function serverMessage(err: unknown, fallback: string): string {
  const message = (err as ApiError | undefined)?.data?.message;
  return typeof message === "string" && message ? message : fallback;
}

/**
 * A human message for a failed confirm call. "Still processing" and "couldn't
 * check" are not failures: the payer is told to check again, never that the
 * payment failed.
 */
export function confirmErrorMessage(err: unknown): string {
  switch (apiErrorCode(err)) {
    case "payment_pending":
      return serverMessage(err, PAYMENT_PENDING);
    case "payment_check_unavailable":
      return serverMessage(err, PAYMENT_CHECK_UNAVAILABLE);
    case "payments_unavailable":
      return PAYMENTS_UNAVAILABLE;
    default:
      return PAYMENT_NOT_CONFIRMED;
  }
}
