import { Platform } from "react-native";

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

// A serif for the display/heritage voice (system-available; no font bundling needed).
export const serif = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });

// Deterministic warm gradient-ish fill seed (we render a flat tinted block in RN).
const FILLS = [C.green, C.goldBrand, C.clay, C.teal, C.greenSlate, C.maroon];
export function fillFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return FILLS[Math.abs(h) % FILLS.length];
}

export function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}
