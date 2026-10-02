// Purple is reserved for AI (design brief §1): the "AI illustration" and
// "AI-assisted" chips on news, and nothing else — never on ads.

/** A small purple chip that marks AI involvement in a story. */
export function AIChip({ children, className = "" }: Readonly<{ children: string; className?: string }>) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border border-ai-line bg-ai-tint px-2 py-0.5 text-[0.62rem] font-semibold uppercase leading-none tracking-[0.1em] text-ai ${className}`}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4z" /></svg>
      {children}
    </span>
  );
}
