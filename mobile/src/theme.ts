// Oguaa "Castle, Canopy, and Canoe" palette (agent_plan.md §2), for React Native.
// Phase D (dark theme): the palette is now themeable. LIGHT/DARK mirror the web
// token blocks in frontend/src/index.css exactly; components should read the
// active palette via useTheme() from "@/lib/theme-context".

export type ThemeName = "light" | "dark";

export interface Palette {
  paper: string;
  cream: string;
  sand: string;
  ink: string;
  inkMuted: string;
  inkFaint: string;
  green900: string;
  green: string;
  greenSlate: string;
  greenText: string;
  gold: string;
  goldBrand: string;
  goldBorder: string;
  goldText: string;
  clay: string;
  clayText: string;
  maroon: string;
  maroonText: string;
  teal: string;
  tealText: string;
  ai: string;
  aiTint: string;
  aiLine: string;
  // Semantic alpha tokens — named for their role so screens stop hand-rolling
  // rgba() literals (which can't follow the theme).
  /** Dark scrim over hero imagery (green900-based). */
  heroScrim: string;
  /** Lighter hero scrim for the readable edge of a gradient. */
  heroScrimLow: string;
  /** Primary light text on dark-green surfaces (headers, heroes). */
  onDarkText85: string;
  onDarkText60: string;
  onDarkText50: string;
  onDarkText30: string;
  /** Hairlines / faint fills on dark-green surfaces. */
  onDarkText10: string;
  /** Soft gold wash behind badges and decorative circles. */
  goldTint14: string;
  /** Translucent gold border (chips, decorative rings). */
  goldBorder35: string;
  /** Faint clay wash behind alerts/incident chips. */
  clayTint: string;
}

/** `#RRGGBB` (or `#RGB`) + alpha -> `rgba(r,g,b,a)`. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  const n = Number.parseInt(full, 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}

export const LIGHT: Palette = {
  paper: "#FBF8F1",
  cream: "#F6F1E7",
  sand: "#ECE4D3",
  ink: "#1A2E22",
  inkMuted: "#4A5A50",
  inkFaint: "#6E7A70",
  green900: "#0C2C1F",
  green: "#123F2D",
  greenSlate: "#3B473D",
  greenText: "#123F2D",
  gold: "#C7A24A",
  goldBrand: "#B07D32",
  goldBorder: "#B8862F",
  goldText: "#8A5E1F",
  clay: "#B0503C",
  clayText: "#9A4030",
  maroon: "#7C2D2D",
  maroonText: "#7C2D2D",
  teal: "#0E7C6B",
  tealText: "#0B6557",
  ai: "#4C40A8",
  aiTint: "#F6F5FD",
  aiLine: "#E2DFF4",
  heroScrim: withAlpha("#0C2C1F", 0.72),
  heroScrimLow: withAlpha("#0C2C1F", 0.55),
  onDarkText85: withAlpha("#F6F1E7", 0.85),
  onDarkText60: withAlpha("#F6F1E7", 0.6),
  onDarkText50: withAlpha("#F6F1E7", 0.5),
  onDarkText30: withAlpha("#F6F1E7", 0.3),
  onDarkText10: withAlpha("#F6F1E7", 0.1),
  goldTint14: withAlpha("#C7A24A", 0.14),
  goldBorder35: withAlpha("#B8862F", 0.35),
  clayTint: withAlpha("#B0503C", 0.06),
};

// Mirrors the web dark block (frontend/src/index.css `html[data-theme="dark"]`).
export const DARK: Palette = {
  paper: "#0F1A15",
  cream: "#16241E",
  sand: "#24352D",
  ink: "#F4F0E8",
  inkMuted: "#B8C4B9",
  inkFaint: "#8D9A8E",
  green900: "#05150E",
  green: "#1A5A42",
  greenSlate: "#2A3B33",
  greenText: "#7FD9A8",
  gold: "#E0C270",
  goldBrand: "#D4A85C",
  goldBorder: "#C99C4A",
  goldText: "#E8D19A",
  clay: "#D77A66",
  clayText: "#E9A08D",
  maroon: "#5C1F1F",
  maroonText: "#E9A08D",
  teal: "#2DBFA5",
  tealText: "#6EE7D2",
  ai: "#7B6FD6",
  aiTint: "#1A1833",
  aiLine: "#3D3966",
  // "On dark" surfaces (green headers/heroes) stay dark in both themes, so the
  // overlay text stays light — derived from dark-mode ink, alphas unchanged.
  heroScrim: withAlpha("#05150E", 0.78),
  heroScrimLow: withAlpha("#05150E", 0.62),
  onDarkText85: withAlpha("#F4F0E8", 0.85),
  onDarkText60: withAlpha("#F4F0E8", 0.6),
  onDarkText50: withAlpha("#F4F0E8", 0.5),
  onDarkText30: withAlpha("#F4F0E8", 0.3),
  onDarkText10: withAlpha("#F4F0E8", 0.1),
  goldTint14: withAlpha("#E0C270", 0.14),
  // Translucent borders need a touch more presence against dark paper.
  goldBorder35: withAlpha("#C99C4A", 0.45),
  clayTint: withAlpha("#D77A66", 0.12),
};

/**
 * @deprecated Static light palette kept for compatibility during the Phase D
 * migration. Use `const { C } = useTheme()` (from "@/lib/theme-context") so the
 * screen follows the active theme.
 */
export const C = LIGHT;

// Brand type: Fraunces is the display voice (the h1/h2 of a screen — page
// titles and section headings); Outfit is everything else. Both are bundled
// via @expo-google-fonts and loaded in app/_layout.tsx. On RN each weight is
// its own family, so use the S()/D() helpers instead of raw names — they also
// keep fontWeight declarations honest (the family IS the weight).
export const DISPLAY = { 600: "Fraunces_600SemiBold", 700: "Fraunces_700Bold" } as const;
export const DISPLAY_ITALIC = "Fraunces_600SemiBold_Italic";
export const SANS = {
  400: "Outfit_400Regular",
  500: "Outfit_500Medium",
  600: "Outfit_600SemiBold",
  700: "Outfit_700Bold",
} as const;

export type SansWeight = keyof typeof SANS;
export type DisplayWeight = keyof typeof DISPLAY;

/** Outfit at a weight — body text. Replaces `fontWeight` on RN. */
export const S = (w: SansWeight = 400) => ({ fontFamily: SANS[w] });
/** Outfit italic — quotes, epitaphs, mottos in the body. The Outfit package
    ships no italic cut; iOS/web slant it, Android shows upright (graceful). */
export const SI = (w: SansWeight = 400) => ({ fontFamily: SANS[w], fontStyle: "italic" as const });
/** Fraunces at a weight — display titles only (screen h1, section h2). */
export const D = (w: DisplayWeight = 700) => ({ fontFamily: DISPLAY[w] });
/** Fraunces italic — the rare display-level italic (hero motto). */
export const DI = () => ({ fontFamily: DISPLAY_ITALIC, fontStyle: "italic" as const });

// Deterministic warm gradient-ish fill seed (we render a flat tinted block in RN).
export function fillFor(seed: string, palette: Palette = LIGHT): string {
  const fills = [palette.green, palette.goldBrand, palette.clay, palette.teal, palette.greenSlate, palette.maroon];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = Math.trunc(h * 31 + (seed.codePointAt(i) ?? 0));
  return fills[Math.abs(h) % fills.length];
}

export function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}
