import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Renders Markdown with Oguaa typography (serif body for editorial warmth). */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="font-serif text-[1.05rem] leading-relaxed text-ink [&_a]:text-teal-text [&_a]:underline [&_blockquote]:mt-4 [&_blockquote]:border-l-4 [&_blockquote]:border-gold-brand [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-ink-muted [&_code]:rounded [&_code]:bg-sand [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-sm [&_h1]:mt-8 [&_h1]:font-display [&_h1]:text-3xl [&_h1]:font-semibold [&_h2]:mt-7 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mt-5 [&_h3]:font-display [&_h3]:text-xl [&_hr]:my-8 [&_hr]:border-sand [&_li]:mt-1.5 [&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mt-4 [&_strong]:font-semibold [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-6"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
