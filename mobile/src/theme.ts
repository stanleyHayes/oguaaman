// Oguaa "Castle, Canopy, and Canoe" palette (agent_plan.md §2), for React Native.
export const C = {
  paper: "#FBF8F1",
  cream: "#F6F1E7",
  sand: "#ECE4D3",
  ink: "#1A2E22",
  inkMuted: "#4A5A50",
  inkFaint: "#6E7A70",
  green900: "#0C2C1F",
  green: "#123F2D",
  greenSlate: "#3B473D",
  gold: "#C7A24A",
  goldBrand: "#B07D32",
  goldText: "#8A5E1F",
  clay: "#B0503C",
  clayText: "#9A4030",
  maroon: "#7C2D2D",
  teal: "#0E7C6B",
  tealText: "#0B6557",
};

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
const FILLS = [C.green, C.goldBrand, C.clay, C.teal, C.greenSlate, C.maroon];
export function fillFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = Math.trunc(h * 31 + (seed.codePointAt(i) ?? 0));
  return FILLS[Math.abs(h) % FILLS.length];
}

export function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}
