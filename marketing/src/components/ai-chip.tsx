import type { ReactNode } from "react";

/**
 * The AI disclosure chip ("AI illustration", "AI-assisted"). Purple is reserved
 * for AI on Oguaa, so this is the only place the AI tokens show up in a card.
 * A tight radius keeps it distinct from the rounded topic pills.
 */
export function AiChip({
  children,
  size = "md",
  className = "",
}: Readonly<{ children: ReactNode; size?: "sm" | "md"; className?: string }>) {
  const sizes = {
    sm: "px-1.5 py-0.5 text-[0.66rem]",
    md: "px-2 py-1 text-[0.68rem]",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[0.3rem] border border-ai-line bg-ai-tint font-semibold leading-none tracking-[0.01em] text-ai ${sizes[size]} ${className}`}
    >
      {size === "md" && (
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M6.3 17.7l2.5-2.5M15.2 8.8l2.5-2.5" />
        </svg>
      )}
      {children}
    </span>
  );
}
