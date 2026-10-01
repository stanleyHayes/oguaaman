import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { completePayment, PAYMENT_NOT_COMPLETED, type PaymentStart } from "./paystack";
import { confirmError } from "./payments";

/** A payment that is not confirmed yet, with the reference a re-check uses. */
export type StudioPaymentNotice = { reference: string; text: string };

/**
 * A studio payment from start to confirmation (contract C1/C3): `pay` opens
 * the inline Paystack modal (or confirms straight away in dev simulation),
 * `recheck` confirms a still-processing payment again, and a hosted-checkout
 * return on `?<returnParam>=` is confirmed once, then the param is removed.
 */
export function useStudioPayment<T>(
  confirmFn: (reference: string) => Promise<T>,
  returnParam: string,
  onConfirmed: (record: T) => void,
) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [confirmed, setConfirmed] = useState<T | null>(null);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<StudioPaymentNotice | null>(null);
  const handlers = useRef({ confirmFn, onConfirmed });
  useEffect(() => {
    handlers.current = { confirmFn, onConfirmed };
  });

  const settle = useCallback(async (reference: string) => {
    setChecking(true);
    try {
      const record = await handlers.current.confirmFn(reference);
      setNotice(null);
      setConfirmed(record);
      handlers.current.onConfirmed(record);
      return true;
    } catch (e) {
      setNotice({ reference, text: confirmError(e) });
      return false;
    } finally {
      setChecking(false);
    }
  }, []);

  const pay = useCallback(async (start: PaymentStart) => {
    setNotice(null);
    if (start.simulated) {
      // Dev mode has no Paystack checkout to return from — settle in place.
      await settle(start.reference);
      return;
    }
    await completePayment(start, {
      onSuccess: async () => { await settle(start.reference); },
      onCancel: () => setNotice({ reference: start.reference, text: PAYMENT_NOT_COMPLETED }),
    });
  }, [settle]);

  const recheck = useCallback(() => {
    if (notice) void settle(notice.reference);
  }, [notice, settle]);

  const returnedRef = searchParams.get(returnParam);
  const seen = useRef<string | null>(null);
  const settleReturn = useEffectEvent(async (reference: string) => {
    if (!(await settle(reference))) return;
    const next = new URLSearchParams(searchParams);
    next.delete(returnParam);
    setSearchParams(next, { replace: true });
  });
  useEffect(() => {
    if (!returnedRef || seen.current === returnedRef) return;
    seen.current = returnedRef;
    void settleReturn(returnedRef);
  }, [returnedRef]);

  return { confirmed, checking, notice, pay, recheck };
}
