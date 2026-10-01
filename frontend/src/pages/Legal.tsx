import { useLocation, Link } from "react-router-dom";
import { PageHero } from "@/components/page-hero";
import { Container } from "@/components/ui";
import {
  LEGAL_DOCS,
  LEGAL_DOC_KEYS,
  legalBlockLabel,
  legalDocKeyForPath,
  legalKeyed,
  legalPath,
  legalPlainText,
  type LegalBlock,
  type LegalInline,
} from "@/content/legal.gen";

// The legal texts are generated from docs/legal/*.md (scripts/sync-legal.mjs),
// so the portal, the mobile app and the marketing site show identical wording.

const LINK_CLASS = "text-teal-text underline-offset-2 hover:underline";

function Inline({ parts }: Readonly<{ parts: readonly LegalInline[] }>) {
  return (
    <>
      {legalKeyed(parts, (p) => `${p.href ?? ""}|${p.bold ? "b" : ""}|${p.text}`).map(([key, p]) => {
        if (p.href?.startsWith("/")) {
          return <Link key={key} to={p.href} className={LINK_CLASS}>{p.text}</Link>;
        }
        if (p.href) {
          return <a key={key} href={p.href} className={LINK_CLASS}>{p.text}</a>;
        }
        return p.bold ? <strong key={key} className="font-semibold text-ink">{p.text}</strong> : <span key={key}>{p.text}</span>;
      })}
    </>
  );
}

function Block({ block }: Readonly<{ block: LegalBlock }>) {
  if (block.kind === "h3") {
    return <h3 className="mt-6 text-lg font-semibold text-ink">{block.text}</h3>;
  }
  if (block.kind === "p") {
    return <p className="mt-3 leading-relaxed text-ink-muted"><Inline parts={block.parts} /></p>;
  }
  const items = legalKeyed(block.items, legalPlainText).map(([key, item]) => (
    <li key={key} className="pl-1 leading-relaxed"><Inline parts={item} /></li>
  ));
  return block.kind === "ol"
    ? <ol className="mt-3 list-decimal space-y-2 pl-6 text-ink-muted">{items}</ol>
    : <ul className="mt-3 list-disc space-y-2 pl-6 text-ink-muted">{items}</ul>;
}

function Blocks({ blocks }: Readonly<{ blocks: readonly LegalBlock[] }>) {
  return (
    <>
      {legalKeyed(blocks, legalBlockLabel).map(([key, b]) => <Block key={key} block={b} />)}
    </>
  );
}

export function Component() {
  const { pathname } = useLocation();
  const doc = LEGAL_DOCS[legalDocKeyForPath(pathname) ?? "privacy"];
  return (
    <>
      <PageHero tone="green" kicker={doc.kicker} title={doc.title} symbol="gye-nyame" lede={doc.lede} />
      <Container size="prose" className="py-12">
        <article className="space-y-8">
          {doc.intro.length > 0 && <div><Blocks blocks={doc.intro} /></div>}
          {doc.sections.map((s) => (
            <section key={s.heading}>
              <h2 className="text-2xl font-semibold text-ink">{s.heading}</h2>
              <Blocks blocks={s.blocks} />
            </section>
          ))}
        </article>
        <p className="mt-12 border-t border-sand pt-6 text-sm text-ink-faint">
          Version {doc.version} · effective {doc.effectiveLabel}
        </p>
        <nav aria-label="Legal documents" className="mt-6 flex flex-wrap gap-4 text-sm">
          {LEGAL_DOC_KEYS.map((key) => (
            <Link
              key={key}
              to={legalPath(key)}
              aria-current={key === doc.key ? "page" : undefined}
              className={key === doc.key ? "font-semibold text-ink" : "text-teal-text hover:underline"}
            >
              {LEGAL_DOCS[key].title}
            </Link>
          ))}
        </nav>
      </Container>
    </>
  );
}
