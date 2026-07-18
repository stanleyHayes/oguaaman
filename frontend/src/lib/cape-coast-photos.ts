// Real, authentic photographs of Cape Coast and its people, used to give the
// heritage/visit/education surfaces a sense of place. Originally CC-licensed
// Wikimedia Commons files, now re-hosted on the project's Cloudinary
// (cloud "dvoqbonr2", folder oguaa/cape-coast) and delivered through
// `f_auto,q_auto` for automatic format + quality optimisation.
//
// Attribution still lives with each source's Commons page; keep credits when
// these are swapped for final curated photography (e.g. a Castle/Kakum/UCC line).

const C = "https://res.cloudinary.com/dvoqbonr2/image/upload/f_auto,q_auto/oguaa/cape-coast";

export const PHOTOS = {
  capeCoastCastle: `${C}/capeCoastCastle.jpg`,
  kakum: `${C}/kakum.jpg`,
  elminaCastle: `${C}/elminaCastle.jpg`,
  ucc: `${C}/ucc.jpg`,
  mfantsipim: `${C}/mfantsipim.jpg`,
  kofiAnnan: `${C}/kofiAnnan.jpg`,
  eboTaylor: `${C}/eboTaylor.jpg`,
} as const;

/** Landmark gallery — heritage & visitor surfaces. */
export const LANDMARKS: { name: string; src: string; blurb: string }[] = [
  { name: "Cape Coast Castle", src: PHOTOS.capeCoastCastle, blurb: "The whitewashed fortress and the Door of No Return — UNESCO World Heritage." },
  { name: "Kakum National Park", src: PHOTOS.kakum, blurb: "The rainforest canopy walkway, seven bridges strung 40 m above the forest floor." },
  { name: "Elmina Castle", src: PHOTOS.elminaCastle, blurb: "São Jorge da Mina, 1482 — the oldest European building south of the Sahara, half an hour west." },
  { name: "University of Cape Coast", src: PHOTOS.ucc, blurb: "Founded 1962 — the seat of scholarship that keeps the Oguaa pipeline flowing." },
];

/** Per-institution photo by slug (real campus photos, not the trademarked crest). */
export const SCHOOL_PHOTOS: Record<string, string> = {
  mfantsipim: PHOTOS.mfantsipim,
  ucc: PHOTOS.ucc,
};
