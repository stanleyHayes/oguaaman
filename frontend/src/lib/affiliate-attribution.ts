import { hasOptionalStorageConsent } from "./storage-consent";

const KEY = "oguaa.affiliate.attribution";
const DEFAULT_WINDOW_DAYS = 30;
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,30}[A-Z0-9]$/;

type Attribution = { code: string; expiresAt: number };

// Without optional-storage consent the code lives only in memory for this
// visit (G124): it credits a purchase made now, and is gone on reload.
let visitCode = "";

/**
 * Last-touch affiliate attribution. Persisted for the programme's default
 * window only when the visitor has accepted optional storage.
 */
export function affiliateCodeFromLocation(search = window.location.search): string {
  const incoming = new URLSearchParams(search).get("aff")?.trim().toUpperCase() ?? "";
  const consented = hasOptionalStorageConsent();
  if (incoming && CODE_PATTERN.test(incoming)) {
    visitCode = incoming;
    if (consented) {
      const value: Attribution = { code: incoming, expiresAt: Date.now() + DEFAULT_WINDOW_DAYS * 86_400_000 };
      try { localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* storage may be unavailable */ }
    }
    return incoming;
  }
  if (!consented) return visitCode;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Attribution | null;
    if (saved?.code && saved.expiresAt > Date.now()) return saved.code;
    localStorage.removeItem(KEY);
  } catch { /* malformed or unavailable storage */ }
  return visitCode;
}
