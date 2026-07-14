import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// Token storage. On web we persist to localStorage. On native we keep a synchronous
// in-memory cache (so getToken() stays sync for request headers) that is hydrated
// from — and written through to — expo-secure-store (encrypted, survives launches).
const KEY = "oguaa.token";
let mem: string | null = null;
let hydrated = false;

function webLS(): Storage | undefined {
  return (globalThis as { localStorage?: Storage }).localStorage;
}

export function getToken(): string | null {
  if (Platform.OS === "web") return webLS()?.getItem(KEY) ?? null;
  return mem;
}

export function setToken(token: string | null) {
  if (Platform.OS === "web") {
    const ls = webLS();
    if (!ls) return;
    if (token) ls.setItem(KEY, token);
    else ls.removeItem(KEY);
    return;
  }
  mem = token;
  // Write through to the encrypted store (fire-and-forget — the in-memory cache is
  // the source of truth for this session).
  if (token) SecureStore.setItemAsync(KEY, token).catch(() => {});
  else SecureStore.deleteItemAsync(KEY).catch(() => {});
}

// hydrateToken loads any persisted token into the sync cache. Call once at startup
// before reading getToken(); resolves immediately on web.
export async function hydrateToken(): Promise<void> {
  if (hydrated || Platform.OS === "web") {
    hydrated = true;
    return;
  }
  try {
    mem = await SecureStore.getItemAsync(KEY);
  } catch {
    mem = null;
  }
  hydrated = true;
}
