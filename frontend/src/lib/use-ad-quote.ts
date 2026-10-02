import { useEffect, useState } from "react";
import { api } from "./api";
import type { AdQuote, AdQuoteRequest } from "./types";

export interface QuoteState {
  /** The price for the current request; while `loading`, the previous price. */
  quote: AdQuote | null;
  /** The failed quote call, for its code and message. */
  error: unknown;
  loading: boolean;
}

interface Settled {
  key: string;
  quote: AdQuote | null;
  error: unknown;
}

/**
 * A live quote for the draft (POST /api/ads/quote), debounced 400 ms after the
 * last change. Only the answer for the current request is ever shown: a slow
 * reply to an older request is dropped, and an unchanged request is not sent
 * again.
 */
export function useAdQuote(req: AdQuoteRequest | null): QuoteState {
  const key = req ? JSON.stringify(req) : "";
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    if (!key) return;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => {
      api
        .adQuote(JSON.parse(key) as AdQuoteRequest, ctrl.signal)
        .then((quote) => setSettled({ key, quote, error: null }))
        .catch((error: unknown) => {
          if (ctrl.signal.aborted) return;
          setSettled({ key, quote: null, error });
        });
    }, 400);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [key]);

  if (!key) return { quote: null, error: null, loading: false };
  // While a new price loads, keep the last one on screen (dimmed by the panel).
  if (settled?.key !== key) return { quote: settled?.quote ?? null, error: null, loading: true };
  return { quote: settled.quote, error: settled.error, loading: false };
}
