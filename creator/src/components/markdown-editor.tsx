import { useId, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bold,
  Italic,
  Heading,
  Link,
  List,
  ListOrdered,
  Quote,
  Code,
  FileCode,
  Eye,
  PenLine,
} from "lucide-react";

type Tab = "write" | "preview";
type ToolbarCommand = "bold" | "italic" | "heading" | "link" | "unordered-list" | "ordered-list" | "quote" | "code" | "code-block";

const TOOLBAR = [
  { icon: Bold, label: "Bold", command: "bold" },
  { icon: Italic, label: "Italic", command: "italic" },
  { icon: Heading, label: "Heading", command: "heading" },
  { icon: Link, label: "Link", command: "link" },
  { icon: List, label: "Bulleted list", command: "unordered-list" },
  { icon: ListOrdered, label: "Numbered list", command: "ordered-list" },
  { icon: Quote, label: "Quote", command: "quote" },
  { icon: Code, label: "Inline code", command: "code" },
  { icon: FileCode, label: "Code block", command: "code-block" },
] as const satisfies ReadonlyArray<{ icon: typeof Bold; label: string; command: ToolbarCommand }>;

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  minRows?: number;
}

export function MarkdownEditor({
  value,
  onChange,
  label,
  placeholder,
  minRows = 10,
}: Readonly<MarkdownEditorProps>) {
  const bodyId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [tab, setTab] = useState<Tab>("write");

  function insert(before: string, after?: string, placeholder = "text") {
    const el = textareaRef.current;
    if (!el) return;

    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const selected = value.slice(start, end);
    const replacement = selected || placeholder;
    const suffix = after ?? before;

    const newValue = value.slice(0, start) + before + replacement + suffix + value.slice(end);
    onChange(newValue);

    const caret = start + before.length + replacement.length + suffix.length;
    window.setTimeout(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    }, 0);
  }

  function insertLine(prefix: string) {
    const el = textareaRef.current;
    if (!el) return;

    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const before = value.slice(0, start);
    const selected = value.slice(start, end);
    const after = value.slice(end);

    const lines = selected.length > 0 ? selected.split("\n") : [""];
    const prefixed = lines.map((line) => (line.startsWith(prefix) ? line : `${prefix}${line}`)).join("\n");

    const newValue = `${before}${prefixed}${after}`;
    onChange(newValue);

    const caret = start + prefixed.length;
    window.setTimeout(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    }, 0);
  }

  function heading() {
    const el = textareaRef.current;
    if (!el) return;

    const start = el.selectionStart ?? 0;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const lineEnd = value.indexOf("\n", start);
    const end = lineEnd === -1 ? value.length : lineEnd;
    const line = value.slice(lineStart, end);

    const newLine = line.startsWith("## ") ? line.replace(/^##\s?/, "") : `## ${line}`;
    const newValue = value.slice(0, lineStart) + newLine + value.slice(end);
    onChange(newValue);

    const caret = lineStart + newLine.length;
    window.setTimeout(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    }, 0);
  }

  function runCommand(command: ToolbarCommand) {
    if (command === "bold") insert("**");
    else if (command === "italic") insert("*");
    else if (command === "heading") heading();
    else if (command === "link") insert("[", "](https://)", "link text");
    else if (command === "unordered-list") insertLine("- ");
    else if (command === "ordered-list") insertLine("1. ");
    else if (command === "quote") insertLine("> ");
    else if (command === "code") insert("`");
    else insert("```\n", "\n```", "code");
  }

  return (
    <div>
      {label && (
        <label htmlFor={bodyId} className="mb-1.5 block text-sm font-medium text-ink">
          {label} <span className="font-normal text-ink-faint">(Markdown)</span>
        </label>
      )}

      <div className="rounded-lg border border-sand bg-paper">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sand px-2 py-2">
          <div className="flex flex-wrap items-center gap-1">
            {TOOLBAR.map(({ icon: Icon, label: name, command }) => (
              <button
                key={name}
                type="button"
                onClick={() => runCommand(command)}
                aria-label={name}
                title={name}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-sand hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ai"
              >
                <Icon size={16} aria-hidden />
              </button>
            ))}
          </div>

          <div className="flex items-center rounded-md border border-sand bg-cream p-0.5">
            <TabButton active={tab === "write"} onClick={() => setTab("write")} icon={PenLine} label="Write" />
            <TabButton active={tab === "preview"} onClick={() => setTab("preview")} icon={Eye} label="Preview" />
          </div>
        </div>

        <div className="relative">
          {tab === "write" ? (
            <textarea
              id={bodyId}
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              rows={minRows}
              placeholder={placeholder}
              className="w-full resize-y bg-paper p-3.5 text-sm leading-relaxed text-ink placeholder:text-ink-faint focus:outline-none"
            />
          ) : (
            <div className="min-h-[12rem] overflow-auto p-3.5 text-sm leading-relaxed text-ink">
              {value.trim() ? (
                <MarkdownPreview>{value}</MarkdownPreview>
              ) : (
                <p className="italic text-ink-faint">Nothing to preview yet.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: Readonly<{ active: boolean; onClick: () => void; icon: typeof PenLine; label: string }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? "bg-paper text-ink shadow-sm" : "text-ink-muted hover:text-ink"
      }`}
    >
      <Icon size={14} aria-hidden />
      {label}
    </button>
  );
}

function MarkdownPreview({ children }: Readonly<{ children: string }>) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children: c }) => <h1 className="mb-3 mt-4 text-2xl font-semibold text-ink">{c}</h1>,
        h2: ({ children: c }) => <h2 className="mb-2 mt-4 text-xl font-semibold text-ink">{c}</h2>,
        h3: ({ children: c }) => <h3 className="mb-2 mt-3 text-lg font-semibold text-ink">{c}</h3>,
        p: ({ children: c }) => <p className="mb-3 text-ink">{c}</p>,
        a: ({ children: c, href }) => (
          <a href={href} className="text-teal-text underline hover:text-teal" target="_blank" rel="noreferrer">
            {c}
          </a>
        ),
        ul: ({ children: c }) => <ul className="mb-3 list-disc pl-5 text-ink">{c}</ul>,
        ol: ({ children: c }) => <ol className="mb-3 list-decimal pl-5 text-ink">{c}</ol>,
        li: ({ children: c }) => <li className="mb-1">{c}</li>,
        blockquote: ({ children: c }) => (
          <blockquote className="mb-3 border-l-4 border-gold pl-3 italic text-ink-muted">{c}</blockquote>
        ),
        code: ({ children: c, className }) => {
          const inline = !className;
          return inline ? (
            <code className="rounded bg-sand px-1 py-0.5 font-mono text-xs text-ink">{c}</code>
          ) : (
            <pre className="mb-3 overflow-auto rounded-lg bg-cream p-3 font-mono text-xs text-ink">
              <code>{c}</code>
            </pre>
          );
        },
        hr: () => <hr className="my-4 border-sand" />,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
