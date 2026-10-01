import { PageHero } from "@/components/page-hero";
import { LighthouseScene } from "@/components/scenes";
import { LegalDocument } from "@/components/legal-document";
import { LEGAL_DOCS } from "@/content/legal.gen";

// The canonical Terms of Use (docs/legal/terms.md) — the same text the portal
// and the mobile app show.
const doc = LEGAL_DOCS.terms;

export function Component() {
  return (
    <>
      <PageHero scene={LighthouseScene} kicker={doc.kicker} title={doc.title} lede={doc.lede} />
      <LegalDocument doc={doc} />
    </>
  );
}
