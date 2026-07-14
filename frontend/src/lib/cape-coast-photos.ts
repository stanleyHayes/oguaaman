// Real, authentic photographs of Cape Coast and its people, used to give the
// heritage/visit/education surfaces a sense of place. These are Wikimedia
// Commons files (CC-licensed) served from upload.wikimedia.org at the cached
// 330px width that serves universally. They are demo/seed imagery — for
// production, re-host curated, properly-attributed photos on Cloudinary.
//
// Attribution lives with each file's Commons page; keep credits when these go
// to production (e.g. a Castle/Kakum/UCC photo credit line).

const W = "https://upload.wikimedia.org/wikipedia/commons/thumb";

export const PHOTOS = {
  capeCoastCastle: `${W}/a/a0/Cape_Coast_Castle%2C_Cape_Coast%2C_Ghana.JPG/330px-Cape_Coast_Castle%2C_Cape_Coast%2C_Ghana.JPG`,
  kakum: `${W}/1/16/Kakum.jpg/330px-Kakum.jpg`,
  elminaCastle: `${W}/a/a7/Elmina_Castle_-_Ghana.jpg/330px-Elmina_Castle_-_Ghana.jpg`,
  ucc: `${W}/f/fc/University_Library_complex.JPG/330px-University_Library_complex.JPG`,
  mfantsipim: `${W}/c/cc/Mfantsipim-school-main-entrance-front-view.jpg/330px-Mfantsipim-school-main-entrance-front-view.jpg`,
  kofiAnnan: `${W}/7/72/Kofi_Annan_2012_%28cropped%29.jpg/330px-Kofi_Annan_2012_%28cropped%29.jpg`,
  eboTaylor: `${W}/a/ac/Ebo_Taylor.jpg/330px-Ebo_Taylor.jpg`,
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
