// Real institution marks live in admin/public/logos/<slug>.<ext> and are served
// at /logos/<file>. The table renders the real logo when a slug is listed here,
// and falls back to a house-colour Crest placeholder otherwise.
//
// To add an official logo: drop the file into admin/public/logos/ and add a line
// below (e.g. mfantsipim: "/logos/mfantsipim.png").
export const LOGOS: Record<string, string> = {
  adisadel: "/logos/adisadel.gif", // Adisadel College crest (Vel primus vel cum primis)
};
