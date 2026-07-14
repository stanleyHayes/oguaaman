import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/**
 * Lightweight i18n for the mobile app — mirrors the portal (spec §11). English
 * is the BASE; other languages translate where a translation exists and fall
 * back to English otherwise. Translations are filled in over time by fluent
 * speakers.
 */

export const LANGS = [
  { code: "en", label: "English", native: "English" },
  { code: "fante", label: "Fante", native: "Mfantse" },
  { code: "twi", label: "Twi", native: "Twi" },
  { code: "ga", label: "Ga", native: "Gã" },
  { code: "ewe", label: "Ewe", native: "Eʋe" },
] as const;

export type Lang = (typeof LANGS)[number]["code"];

const STRINGS: Record<string, Partial<Record<Lang, string>>> = {
  "nav.home": { en: "Home", fante: "Fie" },
  "nav.music": { en: "Music" },
  "nav.memoriam": { en: "In Memoriam", fante: "Yɛnkae" },
  "nav.more": { en: "More" },
  "common.welcome": { en: "Welcome", fante: "Akwaaba", twi: "Akwaaba" },
};

const KEY = "oguaa.lang";
let mem: Lang = "en";

function isLang(v: string | null | undefined): v is Lang {
  return !!v && LANGS.some((l) => l.code === v);
}

function readLang(): Lang {
  if (Platform.OS === "web") {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    const v = ls?.getItem(KEY);
    if (isLang(v)) return v;
  }
  return mem;
}

// Persist the choice: localStorage on web, the encrypted store on native (the
// same mechanism the auth token uses, so it survives app restarts).
function writeLang(l: Lang) {
  mem = l;
  if (Platform.OS === "web") {
    (globalThis as { localStorage?: Storage }).localStorage?.setItem(KEY, l);
  } else {
    SecureStore.setItemAsync(KEY, l).catch(() => {});
  }
}

interface LangState {
  lang: Lang;
  setLang: (l: Lang) => void;
}

const Ctx = createContext<LangState | null>(null);

export function LanguageProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [lang, setLang] = useState<Lang>(() => readLang());
  // On native, hydrate the persisted choice once at startup.
  useEffect(() => {
    if (Platform.OS === "web") return;
    let alive = true;
    SecureStore.getItemAsync(KEY)
      .then((v) => { if (alive && isLang(v)) { mem = v; setLang(v); } })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const changeLang = useCallback((l: Lang) => {
    setLang(l);
    writeLang(l);
  }, []);
  const value = useMemo(() => ({ lang, setLang: changeLang }), [lang, changeLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLang() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useLang must be used within LanguageProvider");
  const t = (key: string): string => {
    const entry = STRINGS[key];
    return entry?.[c.lang] ?? entry?.en ?? key;
  };
  return { lang: c.lang, setLang: c.setLang, t };
}
