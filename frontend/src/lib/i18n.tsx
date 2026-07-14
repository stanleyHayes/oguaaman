import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * Lightweight i18n (spec §11). English is the BASE: every wired string has an
 * English value, and other languages translate where a translation exists and
 * fall back to English otherwise. So the app reads English until a translation
 * is added, and switches to e.g. Fante only for the strings that have it —
 * exactly the "english stays english; fante shows when the user picks fante"
 * behaviour. Translations are added over time by fluent speakers.
 */

export const LANGS = [
  { code: "en", label: "English", native: "English" },
  { code: "fante", label: "Fante", native: "Mfantse" },
  { code: "twi", label: "Twi", native: "Twi" },
  { code: "ga", label: "Ga", native: "Gã" },
  { code: "ewe", label: "Ewe", native: "Eʋe" },
] as const;

export type Lang = (typeof LANGS)[number]["code"];

// UI string table. en is required; other languages are filled in as fluent
// speakers contribute. Missing entries fall back to en (then to the key).
const STRINGS: Record<string, Partial<Record<Lang, string>>> = {
  "nav.memoriam": { en: "In Memoriam", fante: "Yɛnkae" },
  "common.welcome": { en: "Welcome", fante: "Akwaaba", twi: "Akwaaba" },
  "common.remember": { en: "Remember", fante: "Kae" },
  "common.signin": { en: "Sign in" },
  "common.signout": { en: "Sign out" },
  "common.contribute": { en: "Contribute" },
  "common.join": { en: "Join" },
  "lang.label": { en: "Language", fante: "Kasa" },
};

const KEY = "oguaa.lang";

function readLang(): Lang {
  if (typeof localStorage === "undefined") return "en";
  const v = localStorage.getItem(KEY) as Lang | null;
  return v && LANGS.some((l) => l.code === v) ? v : "en";
}

interface LangState {
  lang: Lang;
  setLang: (l: Lang) => void;
}

const Ctx = createContext<LangState | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => readLang());
  function setLang(l: Lang) {
    setLangState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {
      /* private mode / no storage — keep in-memory */
    }
  }
  return <Ctx.Provider value={{ lang, setLang }}>{children}</Ctx.Provider>;
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

/**
 * Label for a sitemap section that carries an English `label` and an optional
 * Fante name (e.g. memoriam → "Yɛnkae"). English unless the user picked Fante
 * and a Fante name exists.
 */
export function sectionLabel(s: { label: string; fanteName?: string }, lang: Lang): string {
  if (lang === "fante" && s.fanteName) return s.fanteName;
  return s.label;
}
