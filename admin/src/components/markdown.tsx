import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Renders Markdown with Oguaa typography (no typography plugin needed). */
export function Markdown({ children }: Readonly<{ children: string }>) {
  return (
    <div className="leading-relaxed text-ink [&_a]:text-ai [&_a]:underline [&_blockquote]:mt-3 [&_blockquote]:border-l-4 [&_blockquote]:border-gold-brand [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-ink-muted [&_code]:rounded [&_code]:bg-sand [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-sm [&_h1]:mt-6 [&_h1]:[&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mt-5 [&_h2]:[&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:font-semibold [&_hr]:my-6 [&_hr]:border-sand [&_li]:mt-1 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mt-3 [&_strong]:font-semibold [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
