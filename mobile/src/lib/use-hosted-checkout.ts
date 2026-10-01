import { useEffect, useRef, useState } from "react";
import { AppState, Platform, type AppStateStatus } from "react-native";
import { errorStatus } from "./api";
import { openInAppBrowser } from "./webbrowser";

/** Confirm answered 409: Paystack is still processing the payment. */
export const PAYMENT_PENDING = "payment_pending";
/** Confirm answered 503: Paystack couldn't be reached to check the payment. */
export const PAYMENT_CHECK_UNAVAILABLE = "payment_check_unavailable";

const OPEN_FAILED = "Could not open the payment page. Tap “Open payment page” to try again.";

/** A Paystack checkout handed off to the hosted page and not yet confirmed. */
export interface PendingPayment {
  reference: string;
  url: string;
}

function errorCode(e: unknown): string {
  const data = (e as { data?: unknown } | null)?.data;
  const code = (data as { error?: unknown } | null | undefined)?.error;
  return typeof code === "string" ? code : "";
}

/** True when the server couldn't settle the payment yet (still processing at
 *  Paystack, or Paystack unreachable): keep the reference and check again. */
export function isPaymentStillOpen(e: unknown): boolean {
  const code = errorCode(e);
  return code === PAYMENT_PENDING || code === PAYMENT_CHECK_UNAVAILABLE;
}

// Failures the payer should hear about even from a quiet check: the payment is
// still processing, the check couldn't run, or a conflict (paid but not issued).
function isWorthTelling(e: unknown): boolean {
  return isPaymentStillOpen(e) || errorStatus(e) === 409;
}

/** What to tell the payer when a confirm fails: the server's own words for a
 *  payment still processing, a check that couldn't run, or a conflict such as
 *  a paid ticket whose tier sold out; otherwise `notConfirmed` with the
 *  server's reason when it gave one. */
export function confirmFailureMessage(e: unknown, notConfirmed: string): string {
  const detail = e instanceof Error ? e.message : "";
  if (isWorthTelling(e)) return detail || notConfirmed;
  return detail ? `${notConfirmed} (${detail})` : notConfirmed;
}

interface Options<T> {
  /** The flow's confirm endpoint; throws when the payment isn't settled. */
  confirm: (reference: string) => Promise<T>;
  /** Whether a confirm response means paid (defaults to any response). */
  isPaid?: (result: T) => boolean;
  /** Called once the payment is confirmed. */
  onPaid: (result: T) => void;
  /** Shown when the payer asks to check and the payment isn't confirmed. */
  notConfirmed: string;
}

/**
 * Hosted Paystack checkout: keep the reference and page URL, let the payer
 * reopen the page, check, or cancel, and check quietly when they come back.
 *
 * The in-app browser behaves differently per platform: on iOS it returns once
 * the payer closes the page, so a quiet check runs straight away; on Android
 * (and web) it returns as soon as the page opens, so the check waits until the
 * app is active again. A quiet check never says "not confirmed" (the payer may
 * not have paid yet), but does show "still processing" and conflict messages.
 */
export function useHostedCheckout<T>(options: Options<T>) {
  const [pending, setPending] = useState<PendingPayment | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const checking = useRef(false);
  const latest = useRef(options);
  useEffect(() => { latest.current = options; });

  async function check(reference: string, quiet: boolean): Promise<boolean> {
    if (checking.current) return false;
    checking.current = true;
    setBusy(true);
    const { confirm, isPaid, onPaid, notConfirmed } = latest.current;
    try {
      const result = await confirm(reference);
      if (isPaid ? isPaid(result) : true) {
        setPending(null); setMessage("");
        onPaid(result);
        return true;
      }
      if (!quiet) setMessage(notConfirmed);
    } catch (e) {
      if (!quiet || isWorthTelling(e)) setMessage(confirmFailureMessage(e, notConfirmed));
    } finally {
      checking.current = false;
      setBusy(false);
    }
    return false;
  }
  const checkRef = useRef(check);
  useEffect(() => { checkRef.current = check; });

  // Android/web: the payer comes back from the browser tab — check quietly.
  const reference = pending?.reference;
  useEffect(() => {
    if (!reference || Platform.OS === "ios") return;
    let last: AppStateStatus = AppState.currentState;
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active" && last !== "active") void checkRef.current(reference, true);
      last = next;
    });
    return () => sub.remove();
  }, [reference]);

  async function show(p: PendingPayment) {
    if (!(await openInAppBrowser(p.url))) { setMessage(OPEN_FAILED); return; }
    if (Platform.OS === "ios") await check(p.reference, true);
  }

  return {
    pending,
    busy,
    message,
    /** Hand a started checkout to the hosted Paystack page. */
    async begin(p: PendingPayment) {
      setPending(p); setMessage("");
      await show(p);
    },
    /** "Check payment": confirm and say so when it isn't settled. */
    async verify() {
      if (pending) { setMessage(""); await check(pending.reference, false); }
    },
    /** "Open payment page": the same checkout again, never a new one. */
    async reopen() {
      if (pending) { setMessage(""); await show(pending); }
    },
    /** Drop the checkout locally; an unpaid Paystack page simply expires. */
    cancel() { setPending(null); setMessage(""); },
  };
}

/** What useHostedCheckout returns, for components that render its controls. */
export type HostedCheckout<T> = ReturnType<typeof useHostedCheckout<T>>;
