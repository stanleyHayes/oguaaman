import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/**
 * Device-local persistence for the civic pledge (Build a better Oguaa). Mirrors
 * the theme-context readSetting/writeSetting pattern EXACTLY: an in-memory sync
 * cache hydrated once at startup, persisted to localStorage on web and the
 * encrypted store on native (the same mechanism the theme + auth token use, so
 * the pledge survives app restarts). Nothing is ever sent to the server — the
 * pledge is a private promise from a resident to their town.
 */

const KEY = "oguaa.civic-pledge";
let mem: string[] = [];

/** Parse a stored JSON array of behaviour slugs, tolerating anything malformed. */
function parse(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function readPledge(): string[] {
  if (Platform.OS === "web") {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    return parse(ls?.getItem(KEY));
  }
  return mem;
}

// Persist the pledged slugs: localStorage on web, the encrypted store on native
// (SecureStore has no web support — hence the branch, matching theme-context).
function writePledge(slugs: string[]) {
  mem = slugs;
  const raw = JSON.stringify(slugs);
  if (Platform.OS === "web") {
    (globalThis as { localStorage?: Storage }).localStorage?.setItem(KEY, raw);
  } else {
    SecureStore.setItemAsync(KEY, raw).catch(() => {});
  }
}

export interface PledgeState {
  /** The set of behaviour slugs the resident has pledged. */
  pledged: Set<string>;
  /** Add/remove a behaviour from the pledge (persists immediately). */
  toggle: (slug: string) => void;
  /** Clear the whole pledge. */
  clear: () => void;
}

/**
 * The civic pledge, kept on this device. `pledged` starts from the sync cache
 * (populated instantly on web); on native it hydrates once from SecureStore.
 */
export function usePledge(): PledgeState {
  const [pledged, setPledged] = useState<Set<string>>(() => new Set(readPledge()));

  // On native, SecureStore reads are async — hydrate the persisted pledge once
  // at startup (web already has it synchronously from localStorage).
  useEffect(() => {
    if (Platform.OS === "web") return;
    let alive = true;
    SecureStore.getItemAsync(KEY)
      .then((raw) => {
        if (!alive) return;
        const list = parse(raw);
        mem = list;
        setPledged(new Set(list));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const toggle = useCallback((slug: string) => {
    setPledged((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      writePledge([...next]);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setPledged(new Set());
    writePledge([]);
  }, []);

  return { pledged, toggle, clear };
}
