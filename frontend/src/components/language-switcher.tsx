import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { LANGS, useLang, type Lang } from "@/lib/i18n";

function GlobeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18" />
    </svg>
  );
}

/** A custom language disclosure used by both the utility bar and mobile drawer. */
export function LanguageSwitcher({ className = "", placement = "down", align = "right" }: Readonly<{ className?: string; placement?: "up" | "down"; align?: "left" | "right" }>) {
  const { lang, setLang } = useLang();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = LANGS.find((item) => item.code === lang) ?? LANGS[0];

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
    };
  }, [open]);

  function openAndFocus(index: number) {
    setOpen(true);
    window.requestAnimationFrame(() => optionRefs.current[index]?.focus());
  }

  function choose(next: Lang) {
    setLang(next);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openAndFocus(0);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      openAndFocus(LANGS.length - 1);
    }
  }

  function handleOptionKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === "ArrowDown") next = (index + 1) % LANGS.length;
    else if (event.key === "ArrowUp") next = (index - 1 + LANGS.length) % LANGS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = LANGS.length - 1;
    else return;
    event.preventDefault();
    optionRefs.current[next]?.focus();
  }

  return (
    <div
      ref={rootRef}
      className={`relative ${className}`}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={handleTriggerKeyDown}
        aria-expanded={open}
        aria-label={`Language, ${current.label}`}
        className={`inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm transition-colors ${open ? "border-gold bg-cream/10 text-cream" : "border-cream/20 text-cream/85 hover:border-cream/40 hover:bg-cream/[0.06] hover:text-cream"}`}
      >
        <GlobeIcon />
        <span className="font-medium">{current.native}</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden className={`text-cream/55 transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div role="group" className={`theme-surface absolute z-[70] w-48 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-sand bg-paper p-2 text-ink shadow-[var(--shadow-lift)] ${align === "left" ? "left-0" : "right-0"} ${placement === "up" ? "bottom-full mb-2" : "mt-2"}`} aria-label="Choose language">
          <p className="px-2 pb-2 pt-1 text-[0.64rem] font-bold uppercase tracking-[0.16em] text-ink-faint">Choose language</p>
          <div className="grid gap-0.5">
            {LANGS.map((item, index) => {
              const selected = item.code === lang;
              return (
                <button
                  key={item.code}
                  ref={(element) => { optionRefs.current[index] = element; }}
                  type="button"
                  onClick={() => choose(item.code)}
                  onKeyDown={(event) => handleOptionKeyDown(event, index)}
                  aria-pressed={selected}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${selected ? "bg-green text-on-green" : "text-ink-muted hover:bg-cream hover:text-ink"}`}
                >
                  <span>
                    <span className="block font-semibold">{item.native}</span>
                    {item.native !== item.label && <span className={`block text-xs ${selected ? "text-on-green/65" : "text-ink-faint"}`}>{item.label}</span>}
                  </span>
                  {selected && (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="m5 12 4 4L19 6" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
