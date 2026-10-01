import { PageHero } from "@/components/page-hero";
import { LagoonScene } from "@/components/scenes";
import { LegalDocument } from "@/components/legal-document";
import { LEGAL_DOCS } from "@/content/legal.gen";

// The canonical Privacy Notice (docs/legal/privacy.md) — the same text the
// portal and the mobile app show.
const doc = LEGAL_DOCS.privacy;

export function Component() {
  return (
    <>
      <PageHero scene={LagoonScene} kicker={doc.kicker} title={doc.title} lede={doc.lede} />
      <LegalDocument doc={doc} />
    </>
  );
}
