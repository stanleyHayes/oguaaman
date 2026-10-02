// The storage & cookies choice (G124). Essential keys (sign-in, display
// preferences, alert state) are always used; optional keys — today only
// affiliate attribution — are stored only after the visitor accepts them.

export const CONSENT_KEY = "oguaa_cookie_consent";
const AFFILIATE_KEY = "oguaa.affiliate.attribution";
/** Fired on window when the choice changes or the settings should reopen. */
export const CONSENT_EVENT = "oguaa:storage-consent";
export const OPEN_SETTINGS_EVENT = "oguaa:open-storage-settings";

export interface StorageConsent {
  v: 1;
  optional: boolean;
  at: string;
}

/** One row of the storage table shown in the notice. */
export interface StorageKeyInfo {
  key: string;
  purpose: string;
  duration: string;
  kind: "Essential" | "Optional";
}

export const STORAGE_KEYS: StorageKeyInfo[] = [
  { key: "oguaa.token", purpose: "Keeps you signed in", duration: "Until you sign out", kind: "Essential" },
  { key: CONSENT_KEY, purpose: "Remembers this storage choice", duration: "12 months", kind: "Essential" },
  { key: "oguaa.theme", purpose: "Light or dark display", duration: "Until you change it", kind: "Essential" },
  { key: "oguaa.lang", purpose: "Your language", duration: "Until you change it", kind: "Essential" },
  { key: "oguaa.alerts.* and oguaa.alertsPromptDismissed", purpose: "Safety alerts you've seen, muted or dismissed", duration: "Until you clear site data", kind: "Essential" },
  { key: "oguaa.map.cache.v2", purpose: "Keeps the town map working offline", duration: "Until the map refreshes", kind: "Essential" },
  { key: "oguaa.civic-pledge", purpose: "Remembers civic pledges you made on this device", duration: "Until you clear site data", kind: "Essential" },
  { key: "oguaa:chunk-reloaded-at", purpose: "Recovers from an app update mid-visit", duration: "This browser tab only", kind: "Essential" },
  { key: "oguaa.ads.seen and oguaa.ads.fill.*", purpose: "Shows the same ad at most three times a visit and keeps an ad's space while it loads. Never sent to Oguaa", duration: "This browser tab only", kind: "Essential" },
  { key: "oguaa.ads.draft.v1", purpose: "Keeps an ad booking you haven't sent yet", duration: "Until you send it", kind: "Essential" },
  { key: AFFILIATE_KEY, purpose: "Credits the partner whose link brought you to a shop", duration: "30 days", kind: "Optional" },
];

const YEAR_MS = 365 * 86_400_000;

export function readStorageConsent(): StorageConsent | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(CONSENT_KEY) ?? "null") as StorageConsent | null;
    if (parsed?.v !== 1) return null;
    if (Date.now() - Date.parse(parsed.at) > YEAR_MS) return null;
    return parsed;
  } catch {
    return null; // missing, legacy ("accepted") or unavailable storage: ask again
  }
}

export function hasOptionalStorageConsent(): boolean {
  return readStorageConsent()?.optional === true;
}

export function saveStorageConsent(optional: boolean): void {
  const value: StorageConsent = { v: 1, optional, at: new Date().toISOString() };
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(value));
    if (!optional) localStorage.removeItem(AFFILIATE_KEY);
  } catch { /* storage unavailable — the choice lasts for this page only */ }
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: value }));
}

export function openStorageSettings(): void {
  window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT));
}
