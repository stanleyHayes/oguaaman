// Rotating splash lines — a little wisdom or a fact of Cape Coast to read while
// the app loads, so waiting is never dull. A mix of Akan/Fante proverbs, "did
// you know" facts about Oguaa, and the town's own civic code. Kept in sync with
// the web copy (frontend/src/lib/splash-lines.ts).

export interface SplashLine {
  kind: string;
  text: string;
}

export const SPLASH_LINES: SplashLine[] = [
  // ── Akan / Fante proverbs ──────────────────────────────────────────────────
  { kind: "Akan proverb", text: "Sankɔfa — it is no shame to go back for what you forgot." },
  { kind: "Fante proverb", text: "Wo yɛ adwuma a, wie — if you begin the work, finish it." },
  { kind: "Akan proverb", text: "One head does not hold a council; wisdom is shared." },
  { kind: "Akan proverb", text: "A single broom stick snaps; the bundle holds firm." },
  { kind: "Akan proverb", text: "One hand cannot lift the load." },
  { kind: "Akan proverb", text: "Obra ne wo — your life is your own living." },
  { kind: "African proverb", text: "Knowledge is a baobab tree; no one can embrace it alone." },
  { kind: "African proverb", text: "It takes a whole village to raise a child." },
  { kind: "Akan proverb", text: "The one who asks the way does not get lost." },

  // ── Did you know — Oguaa / Cape Coast ───────────────────────────────────────
  { kind: "Did you know", text: "‘Oguaa’ comes from gua, market — and Kotokuraba means ‘the crab market.’" },
  { kind: "Did you know", text: "Mfantsipim, founded in 1876, is the oldest secondary school in Ghana." },
  { kind: "Did you know", text: "Kakum’s canopy walk sways 40 metres above the rainforest, across seven bridges." },
  { kind: "Did you know", text: "Cape Coast Castle’s Door of No Return is now a Door of Return for the diaspora." },
  { kind: "Did you know", text: "Cape Coast was the Gold Coast’s capital until 1877, before Accra." },
  { kind: "Did you know", text: "The University of Cape Coast was founded in 1962 to teach the nation’s teachers." },
  { kind: "Did you know", text: "Fetu Afahye fills the streets of Oguaa the first Saturday of September." },
  { kind: "Did you know", text: "Kofi Annan, the UN Secretary-General, was schooled here at Mfantsipim." },
  { kind: "Did you know", text: "Cape Coast Castle is a UNESCO World Heritage Site." },
  { kind: "Did you know", text: "Oguaa keeps seven Asafo companies, each with its painted posuban shrine." },

  // ── The town's code — civic sayings ─────────────────────────────────────────
  { kind: "The town’s code", text: "A great town is built by small habits, kept by everyone." },
  { kind: "The town’s code", text: "The gutter you clear in the dry season is the flood you escape in the rains." },
  { kind: "The town’s code", text: "Greet a stranger, and a neighbour is made." },
  { kind: "The town’s code", text: "Keep the shore clean — the sea remembers." },
];

/** A random line to open with, so each load greets you differently. */
export function randomSplashIndex(): number {
  return Math.floor(Math.random() * SPLASH_LINES.length);
}
