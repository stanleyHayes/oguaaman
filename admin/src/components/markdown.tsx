import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const CITATION = /^#src-(\d+)$/;

/** Footnote-style [n] markers: quiet superscripts that jump to the source list. */
const CITATION_COMPONENTS: Components = {
  a({ href, children, title }) {
    const m = href ? CITATION.exec(href) : null;
    if (m) {
      return (
        <sup className="ml-px">
          <a href={href} aria-label={`Source ${m[1]}`} className="!text-ink-faint !no-underline tabular-nums transition-colors hover:!text-gold-text">[{m[1]}]</a>
        </sup>
      );
    }
    return <a href={href} title={title}>{children}</a>;
  },
};

/** With `allowImages={false}` a Markdown image shows as its alt text: nothing is loaded from the host it names. */
const NO_IMAGE_COMPONENTS: Components = {
  img({ alt }) {
    return alt ? <span>{alt}</span> : null;
  },
};

const CITATION_NO_IMAGE_COMPONENTS: Components = { ...CITATION_COMPONENTS, ...NO_IMAGE_COMPONENTS };

function componentsFor(citations: boolean, allowImages: boolean): Components | undefined {
  if (citations) return allowImages ? CITATION_COMPONENTS : CITATION_NO_IMAGE_COMPONENTS;
  return allowImages ? undefined : NO_IMAGE_COMPONENTS;
}

/** Renders Markdown with Oguaa typography (no typography plugin needed).
 *  `citations` turns "#src-n" links (see lib/newsdesk linkCitations) into
 *  footnote markers. News bodies and report drafts pass `allowImages={false}`:
 *  an image in AI-assisted text would make the browser fetch from whatever
 *  host it names (the staff member's, and later every reader's). */
export function Markdown({ children, citations = false, allowImages = true }: Readonly<{ children: string; citations?: boolean; allowImages?: boolean }>) {
  return (
    <div className="leading-relaxed text-ink [&_a]:text-ai [&_a]:underline [&_blockquote]:mt-3 [&_blockquote]:border-l-4 [&_blockquote]:border-gold-brand [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-ink-muted [&_code]:rounded [&_code]:bg-sand [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-sm [&_h1]:mt-6 [&_h1]:[&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mt-5 [&_h2]:[&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:font-semibold [&_hr]:my-6 [&_hr]:border-sand [&_li]:mt-1 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mt-3 [&_strong]:font-semibold [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={componentsFor(citations, allowImages)}>{children}</ReactMarkdown>
    </div>
  );
}
