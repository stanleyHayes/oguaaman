import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const CITATION_HREF = /^#source-(\d+)$/;

/** `[n]` markers (already turned into `#source-n` links) render as quiet footnote numbers. */
const citationComponents: Components = {
  a({ href, title, children }) {
    const match = href ? CITATION_HREF.exec(href) : null;
    if (!match) {
      return (
        <a href={href} title={title}>
          {children}
        </a>
      );
    }
    return (
      <sup className="ml-px">
        <a
          href={href}
          aria-label={`Source ${match[1]}`}
          className="rounded-sm px-0.5 font-sans text-[0.72em] font-semibold tabular-nums text-gold-text no-underline! transition-colors duration-200 hover:bg-gold/15"
        >
          [{children}]
        </a>
      </sup>
    );
  },
};

/** With `allowImages={false}` a Markdown image shows as its alt text: nothing is loaded from the host it names. */
const noImageComponents: Components = {
  img({ alt }) {
    return alt ? <span>{alt}</span> : null;
  },
};

const citationNoImageComponents: Components = { ...citationComponents, ...noImageComponents };

function componentsFor(citations: boolean, allowImages: boolean): Components | undefined {
  if (citations) return allowImages ? citationComponents : citationNoImageComponents;
  return allowImages ? undefined : noImageComponents;
}

/** Renders Markdown with Oguaa editorial typography. Pass `citations` to style `#source-n` links as footnotes.
 *  News bodies pass `allowImages={false}`: their text can be AI-assisted, and an image there would have every
 *  reader's browser fetch from whatever host it names. */
export function Markdown({
  children,
  citations = false,
  allowImages = true,
}: Readonly<{ children: string; citations?: boolean; allowImages?: boolean }>) {
  return (
    <div className="font-serif text-[1.05rem] leading-relaxed text-ink [&_a]:text-teal-text [&_a]:underline [&_blockquote]:mt-4 [&_blockquote]:border-l-4 [&_blockquote]:border-gold-brand [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-ink-muted [&_code]:rounded [&_code]:bg-sand [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-sm [&_h1]:mt-8 [&_h1]:mt-8 [&_h1]:text-3xl [&_h1]:font-semibold [&_h2]:mt-7 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mt-5 [&_h3]:text-xl [&_hr]:my-8 [&_hr]:border-sand [&_li]:mt-1.5 [&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mt-4 [&_p]:text-pretty [&_strong]:font-semibold [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-6">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={componentsFor(citations, allowImages)}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
