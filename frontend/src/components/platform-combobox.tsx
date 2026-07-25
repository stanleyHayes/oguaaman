import { useEffect, useId, useMemo, useRef, useState } from "react";
import { STREAMING_PLATFORMS } from "@/lib/streaming-platforms";
import { SOCIAL_PLATFORMS } from "@/lib/social-platforms";

export function PlatformCombobox({ value, onChange, label, kind = "streaming" }: Readonly<{ value: string; onChange: (value: string) => void; label: string; kind?: "streaming" | "social" }>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const platforms = kind === "social" ? SOCIAL_PLATFORMS : STREAMING_PLATFORMS;
  const selected = platforms.find((platform) => platform.label === value);
  const filtered = useMemo(() => platforms.filter((platform) => platform.label.toLowerCase().includes(query.trim().toLowerCase())), [platforms, query]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  function choose(next: string) { onChange(next); setOpen(false); setQuery(""); setActive(0); }
  function toggle() { setOpen((current) => !current); setQuery(""); setActive(0); }

  return <div ref={root} className="relative">
    <button type="button" role="combobox" aria-label={label} aria-expanded={open} aria-controls={listId} onClick={toggle} className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-sand bg-paper py-2.5 pl-3 pr-4 text-left text-ink transition focus:border-green focus:outline-none focus:ring-2 focus:ring-green/15">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green text-[0.68rem] font-bold text-on-green">{selected?.mark ?? (kind === "social" ? "@" : "♪")}</span>
      <span className="min-w-0 flex-1 truncate font-medium">{selected?.label ?? (value ? `Current · ${value}` : kind === "social" ? "Choose social platform" : "Choose platform")}</span>
      <svg className={`mr-0.5 h-4 w-4 shrink-0 text-ink-muted transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="m5 7.5 5 5 5-5" /></svg>
    </button>
    {open && <div className="absolute left-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-sand bg-paper shadow-[0_18px_48px_rgba(6,38,27,0.2)]">
      <div className="border-b border-sand p-3"><div className="flex items-center gap-2 rounded-lg border border-sand bg-cream px-3 focus-within:border-green focus-within:ring-2 focus-within:ring-green/15"><svg className="h-4 w-4 text-ink-faint" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/></svg><input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setActive(0); }} onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
        if (event.key === "ArrowDown") { event.preventDefault(); setActive((current) => Math.min(current + 1, filtered.length - 1)); }
        if (event.key === "ArrowUp") { event.preventDefault(); setActive((current) => Math.max(current - 1, 0)); }
        if (event.key === "Enter" && filtered[active]) { event.preventDefault(); choose(filtered[active].label); }
      }} className="min-h-10 min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint" placeholder={kind === "social" ? "Search social platforms…" : "Search platforms…"} aria-label={kind === "social" ? "Search social platforms" : "Search streaming platforms"} /></div></div>
      <div id={listId} role="listbox" className="max-h-72 overflow-y-auto p-2">{filtered.length ? filtered.map((platform, index) => <button type="button" role="option" aria-selected={platform.label === value} key={platform.label} onMouseEnter={() => setActive(index)} onClick={() => choose(platform.label)} className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition ${index === active ? "bg-green/[0.08] text-green-text" : "text-ink-muted hover:bg-cream"}`}><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green text-[0.6rem] font-bold text-on-green">{platform.mark}</span><span className="flex-1 font-medium">{platform.label}</span>{platform.label === value && <span className="font-bold text-green-text">✓</span>}</button>) : <p className="px-3 py-6 text-center text-sm text-ink-faint">No matching platform</p>}</div>
    </div>}
  </div>;
}
