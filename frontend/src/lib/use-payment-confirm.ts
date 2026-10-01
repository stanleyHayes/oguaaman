import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { completePayment, PAYMENT_NOT_COMPLETED, type PaymentStart } from "./paystack";
import { confirmErrorMessage } from "./payments";

/** A confirm problem the payer can re-check: the message and the reference it is about. */
export interface PaymentNoticeState {
  message: string;
  reference: string;
}

export interface PaymentConfirm<T> {
  /** The settled record once the server confirmed the payment. */
  confirmed: T | null;
  /** True while a confirm call is in flight. */
  confirming: boolean;
  /** Why the last payment is not confirmed yet (null when there is nothing to say). */
  notice: PaymentNoticeState | null;
  /** Confirm `reference` with the server; resolves to the record, or null on failure. */
  confirm: (reference: string) => Promise<T | null>;
  /** Open the inline checkout for a started payment, then confirm it in place. */
  complete: (start: PaymentStart) => Promise<void>;
  /** Confirm the noticed reference again. */
  recheck: () => void;
  /** Forget the notice (e.g. when a new payment starts). */
  clearNotice: () => void;
}

/**
 * One payment-confirm flow for a page (contract C1): runs the inline checkout,
 * confirms the reference server-side, and keeps a re-check for a payment that
 * is still processing, could not be checked, or was closed before it finished.
 * With `returnParam`, a hosted-checkout return (?pledge_ref=… and the like) is
 * confirmed once on load and the parameter is removed once it settles.
 */
export function usePaymentConfirm<T>(
  confirmFn: (reference: string) => Promise<T>,
  options: { returnParam?: string; onConfirmed?: (record: T) => void } = {},
): PaymentConfirm<T> {
  const { returnParam, onConfirmed } = options;
  const [params, setParams] = useSearchParams();
  const [confirmed, setConfirmed] = useState<T | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<PaymentNoticeState | null>(null);
  const handled = useRef<string | null>(null);

  // The latest callbacks, read only from handlers (never during render).
  const latest = useRef({ confirmFn, onConfirmed });
  useEffect(() => {
    latest.current = { confirmFn, onConfirmed };
  });

  const confirm = useCallback(async (reference: string): Promise<T | null> => {
    setConfirming(true);
    try {
      const record = await latest.current.confirmFn(reference);
      setNotice(null);
      setConfirmed(record);
      latest.current.onConfirmed?.(record);
      return record;
    } catch (err) {
      setNotice({ message: confirmErrorMessage(err), reference });
      return null;
    } finally {
      setConfirming(false);
    }
  }, []);

  const complete = useCallback(async (start: PaymentStart) => {
    setNotice(null);
    await completePayment(start, {
      onSuccess: async () => { await confirm(start.reference); },
      onCancel: () => setNotice({ message: PAYMENT_NOT_COMPLETED, reference: start.reference }),
    });
  }, [confirm]);

  const recheck = useCallback(() => {
    if (notice) void confirm(notice.reference);
  }, [confirm, notice]);

  const clearNotice = useCallback(() => setNotice(null), []);

  // Hosted-checkout return: confirm once per reference, then drop the param.
  const returned = returnParam ? params.get(returnParam) : null;
  const confirmReturn = useEffectEvent(async (reference: string) => {
    const record = await confirm(reference);
    if (!record || !returnParam) return;
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete(returnParam);
      return next;
    }, { replace: true });
  });
  useEffect(() => {
    if (!returned || handled.current === returned) return;
    handled.current = returned;
    void confirmReturn(returned);
  }, [returned]);

  return { confirmed, confirming, notice, confirm, complete, recheck, clearNotice };
}
