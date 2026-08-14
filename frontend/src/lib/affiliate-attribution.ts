const KEY = "oguaa.affiliate.attribution";
const DEFAULT_WINDOW_DAYS = 30;

type Attribution = { code: string; expiresAt: number };

/** Last-touch affiliate attribution, persisted for the programme's default window. */
export function affiliateCodeFromLocation(search = window.location.search): string {
  const incoming = new URLSearchParams(search).get("aff")?.trim().toUpperCase() ?? "";
  if (incoming && /^[A-Z0-9][A-Z0-9_-]{1,30}[A-Z0-9]$/.test(incoming)) {
    const value: Attribution = { code: incoming, expiresAt: Date.now() + DEFAULT_WINDOW_DAYS * 86_400_000 };
    try { localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* storage may be unavailable */ }
    return incoming;
  }
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Attribution | null;
    if (saved?.code && saved.expiresAt > Date.now()) return saved.code;
    localStorage.removeItem(KEY);
  } catch { /* malformed or unavailable storage */ }
  return "";
}
