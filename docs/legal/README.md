# Oguaa legal texts

These Markdown files are the single, versioned source of every user-facing legal document (decision D7). The apps never
hold their own copy of the wording: `scripts/sync-legal.mjs` generates one identical module per app from these files.

| Source | Published at (portal) | Mobile route | Marketing |
| --- | --- | --- | --- |
| `privacy.md` — Privacy Notice | `/privacy` | `/legal/privacy` | `/privacy` |
| `terms.md` — Terms of Use | `/terms` | `/legal/terms` | `/terms` |
| `acceptable-use.md` — Acceptable Use Policy | `/acceptable-use` | `/legal/acceptable-use` | links to portal |
| `terms-of-sale.md` — Terms of Sale | `/terms-of-sale` | `/legal/terms-of-sale` | links to portal |
| `child-safety.md` — Child Safety Standards (Google Play) | `/child-safety` | `/legal/child-safety` | links to portal |
| `safeguarding.md` — Youth & Guardian Consent Policy | `/safeguarding` | `/legal/safeguarding` | links to portal |
| `advertising.md` — Advertising Policy | `/advertising` | `/legal/advertising` (web-only blocks left out) | links to portal |
| `editorial.md` — Editorial standards and AI | `/editorial` | `/legal/editorial` | links to portal |

Generated modules (never edit by hand): `frontend/src/content/legal.gen.ts`, `mobile/src/content/legal.gen.ts`,
`marketing/src/content/legal.gen.ts`. The two web modules are identical. The mobile module is the app variant: it leaves
out every block marked `<!-- web-only -->` in the source.

## Changing a document

1. Edit the Markdown. Keep to the supported subset (see the header of `scripts/sync-legal.mjs`): front matter,
   `##`/`###` headings, paragraphs, `-` and `1.` lists, `**bold**` and `[links](/path | https://… | mailto:…)`.
   Wrap text that must not appear in the mobile app in `<!-- web-only -->` … `<!-- /web-only -->`, each marker on a
   line of its own. Use it for anything that points people to buying on the web (pricing pages, checkout links, "buy
   on the website"), which the App Store and Google Play treat as steering. A block can hold whole `##` sections,
   paragraphs, list items or a single line of a paragraph; a block holding a `##` heading must end just before the
   next `##` heading or at the end of the file.
2. For a material change, bump `version` and `effective` in the front matter (YYYY-MM-DD). When the Terms of Use or the
   Privacy Notice version changes, also bump `domain.CurrentTermsVersion` / `domain.CurrentPrivacyVersion` in the
   backend so members are asked to accept the new version (the `consentRequired` flag).
3. Run `node scripts/sync-legal.mjs` and commit the Markdown together with the regenerated modules. CI runs
   `node scripts/sync-legal.mjs --check` and fails when they differ.

## Rules for the wording

- Describe what the code actually does. When a data flow, provider or retention period changes in the code, update
  `privacy.md` (and `processors.md` / `retention.md`) in the same change, and the backend's
  `service.ProcessingNoticeForExport` (the "processing" section of the data export).
- Do not invent company details. The operator's published facts are: Dev Track, business registration number
  BN843072020, Ghana Post GPS digital address GE-161-2814, phone +233 55 518 0048, `hello@oguaaman.com`, the
  `/privacy/request` form and `/account/delete`. The Data Protection Commission registration number is not yet
  published — add it here and in `privacy.md` when it is.
- The internal registers `processors.md` and `retention.md` are not published in the apps; they back the notice.
