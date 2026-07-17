import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent} from "react";
import type { Organization } from "@/lib/types";

// Matches the SchoolingEditor's native-select idiom so the swap is invisible.
const inputCls =
  "w-full rounded-md border border-sand bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-maroon-900 focus:outline-none";

/**
 * SchoolCombobox — a type-to-filter replacement for the "Choose a school…"
 * native <select>. The member types to narrow a list of 45+ schools instead of
 * scrolling a long dropdown. `value` is the currently-chosen school id (""
 * when none); `onSelect` fires with the id the moment a match is picked, so it
 * is a drop-in for the old `onChange={(e) => …(e.target.value)}` contract.
 *
 * Accessibility follows the ARIA combobox pattern: role="combobox" input with
 * aria-autocomplete="list", a role="listbox" popover of role="option" rows, and
 * aria-activedescendant tracking the keyboard-highlighted option. The popover
 * uses the theme surface tokens (bg-paper / border-sand / text-ink), so it is
 * dark-theme-safe without any extra work.
 */
export function SchoolCombobox({
  schools,
  value,
  onSelect,
  placeholder = "Choose a school…",
  className,
  id,
}: Readonly<{
  schools: Organization[];
  value: string;
  onSelect: (schoolId: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}>) {
  const selectedName = useMemo(
    () => schools.find((s) => s.id === value)?.name ?? "",
    [schools, value],
  );
  const [query, setQuery] = useState(selectedName);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const optionId = (i: number) => `${listId}-opt-${i}`;

  // Reflect an external selection change (or reset) back into the field while
  // the member isn't actively editing it.
  useEffect(() => {
    if (!open) setQuery(selectedName);
  }, [selectedName, open]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    // Nothing typed yet (the box still shows the chosen name): offer the whole
    // list so it browses like the old <select>.
    if (q === "" || q === selectedName.toLowerCase()) return schools;
    return schools.filter((s) => {
      const name = s.name.toLowerCase();
      const cls = (s.classification ?? "").toLowerCase();
      return name.includes(q) || cls.includes(q);
    });
  }, [q, schools, selectedName]);

  // Close when a click lands outside; drop any half-typed query.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery(selectedName);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, selectedName]);

  // Keep the highlighted row in range as the filtered list shrinks/grows.
  useEffect(() => {
    setActive((a) => (a >= filtered.length ? 0 : a));
  }, [filtered.length]);

  // Scroll the highlighted option into view during keyboard navigation.
  useEffect(() => {
    if (!open) return;
    document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
    // optionId is derived from the stable listId; active/open drive this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, open]);

  function choose(school: Organization) {
    onSelect(school.id);
    setQuery(school.name);
    setOpen(false);
    inputRef.current?.blur();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) setOpen(true);
        else setActive((a) => Math.min(a + 1, filtered.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!open) setOpen(true);
        else setActive((a) => Math.max(a - 1, 0));
        break;
      case "Enter":
        if (open && filtered[active]) {
          e.preventDefault();
          choose(filtered[active]);
        }
        break;
      case "Escape":
        if (open) {
          e.preventDefault();
          setOpen(false);
          setQuery(selectedName);
        }
        break;
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className ?? ""}`}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && filtered[active] ? optionId(active) : undefined}
        autoComplete="off"
        value={query}
        placeholder={placeholder}
        className={inputCls}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
        onFocus={(e) => { setOpen(true); e.target.select(); }}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Schools"
          className="absolute z-30 mt-1.5 max-h-64 w-full min-w-[14rem] overflow-y-auto overflow-x-hidden rounded-lg border border-sand bg-paper py-1 shadow-[var(--shadow-lift)]"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-ink-faint">No schools match “{query.trim()}”.</li>
          ) : (
            filtered.map((s, i) => {
              const highlighted = i === active;
              return (
                <li
                  key={s.id}
                  id={optionId(i)}
                  role="option"
                  aria-selected={s.id === value}
                  onMouseDown={(e) => { e.preventDefault(); choose(s); }}
                  onMouseEnter={() => setActive(i)}
                  className={`cursor-pointer px-3 py-2 ${highlighted ? "bg-maroon-900/[0.08]" : ""}`}
                >
                  <span className="block text-sm text-ink">{s.name}</span>
                  {s.classification && (
                    <span className="block text-xs text-ink-faint">{s.classification}</span>
                  )}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
