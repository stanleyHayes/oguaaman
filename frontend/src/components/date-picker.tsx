import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const ENABLED_OPTION_SELECTOR = '[role="option"]:not(:disabled)';
const DAY_BUTTON_SELECTOR = "[data-calendar-day]";
const TYPEAHEAD_RESET_MS = 800;
const DAY_KEY_OFFSETS: Readonly<Record<string, number>> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -7,
  ArrowDown: 7,
};

const triggerCls =
  "flex items-center justify-between gap-2 rounded-xl border border-sand bg-cream px-4 py-3 text-left text-ink transition-colors focus:border-gold-border focus:bg-paper focus:outline-none focus:ring-2 focus:ring-gold/20 disabled:opacity-60";

function parseDate(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]) - 1;
  const d = Number(match[3]);
  if (m < 0 || m > 11 || d < 1 || d > 31) return null;
  return { y, m, d };
}

function iso(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function isoFromDate(date: Date) {
  return iso(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDisplay(value: string) {
  const parsed = parseDate(value);
  if (!parsed) return value;
  const date = new Date(parsed.y, parsed.m, parsed.d);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDayLabel(date: Date) {
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function buildGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const mondayOffset = (first.getDay() + 6) % 7; // Monday = 0
  const start = new Date(year, month, 1 - mondayOffset);
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return { date, inMonth: date.getMonth() === month };
  });
}

function addMonths(y: number, m: number, delta: number) {
  const date = new Date(y, m + delta, 1);
  return { y: date.getFullYear(), m: date.getMonth() };
}

function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}

function outOfRange(value: string, min?: string, max?: string) {
  if (min && value < min) return true;
  if (max && value > max) return true;
  return false;
}

function monthHasNoSelectableDays(y: number, m: number, min?: string, max?: string) {
  for (let d = 1; d <= daysInMonth(y, m); d += 1) {
    if (!outOfRange(iso(y, m, d), min, max)) return false;
  }
  return true;
}

function yearBounds(min: string | undefined, max: string | undefined, currentYear: number) {
  const minParsed = min ? parseDate(min) : null;
  const maxParsed = max ? parseDate(max) : null;
  let minY = minParsed?.y ?? currentYear - 100;
  let maxY = maxParsed?.y ?? currentYear + 20;
  if (minY > maxY) [minY, maxY] = [maxY, minY];
  return { minY, maxY };
}

// Month the calendar opens on: the selected value's month, else today clamped
// into [min, max]. Without the clamp a max-only picker (e.g. the date-of-birth
// cut-off 18 years back) opens on the current month where EVERY day is
// disabled, making the field look broken.
function initialView(parsed: { y: number; m: number } | null, min: string | undefined, max: string | undefined, today: Date) {
  if (parsed) return { y: parsed.y, m: parsed.m };
  const t = isoFromDate(today);
  if (max && t > max) {
    const p = parseDate(max);
    if (p) return { y: p.y, m: p.m };
  }
  if (min && t < min) {
    const p = parseDate(min);
    if (p) return { y: p.y, m: p.m };
  }
  return { y: today.getFullYear(), m: today.getMonth() };
}

function dayClass(isSelected: boolean, isToday: boolean, inMonth: boolean, disabled: boolean) {
  if (isSelected) return "bg-green font-semibold text-on-green";
  if (isToday) return "border border-gold-border bg-gold/[0.08] text-ink hover:bg-gold/[0.14]";
  if (inMonth) return "text-ink hover:bg-cream";
  return disabled ? "text-ink-faint opacity-30" : "text-ink-faint hover:bg-cream";
}

interface CalendarMenuOption {
  value: number;
  label: string;
  disabled?: boolean;
}

interface CalendarMenuProps {
  label: string;
  listboxId: string;
  value: number;
  valueLabel: string;
  options: readonly CalendarMenuOption[];
  open: boolean;
  align?: "left" | "right";
  className?: string;
  onOpenChange: (open: boolean) => void;
  onSelect: (value: number) => void;
}

function CalendarMenu({
  label,
  listboxId,
  value,
  valueLabel,
  options,
  open,
  align = "left",
  className,
  onOpenChange,
  onSelect,
}: Readonly<CalendarMenuProps>) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typeaheadRef = useRef({ query: "", at: 0 });
  const selectedIsEnabled = options.some((option) => option.value === value && !option.disabled);
  const initialFocusValue = selectedIsEnabled ? value : options.find((option) => !option.disabled)?.value;

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const selected = listRef.current?.querySelector<HTMLButtonElement>(
        '[role="option"][aria-selected="true"]:not(:disabled)',
      );
      const first = listRef.current?.querySelector<HTMLButtonElement>(ENABLED_OPTION_SELECTOR);
      const target = selected ?? first;
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        typeaheadRef.current = { query: "", at: 0 };
        onOpenChange(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [onOpenChange, open]);

  const enabledOptions = () => Array.from(
    listRef.current?.querySelectorAll<HTMLButtonElement>(ENABLED_OPTION_SELECTOR) ?? [],
  );

  const focusOption = (index: number) => {
    const enabled = enabledOptions();
    if (enabled.length === 0) return;
    const next = ((index % enabled.length) + enabled.length) % enabled.length;
    enabled.forEach((option, optionIndex) => {
      option.tabIndex = optionIndex === next ? 0 : -1;
    });
    enabled[next].focus();
    enabled[next].scrollIntoView({ block: "nearest" });
  };

  const focusTypeaheadMatch = (key: string) => {
    const now = Date.now();
    const previous = typeaheadRef.current;
    const normalizedKey = key.toLocaleLowerCase();
    const query = now - previous.at > TYPEAHEAD_RESET_MS
      ? normalizedKey
      : `${previous.query}${normalizedKey}`;
    typeaheadRef.current = { query, at: now };

    const enabled = enabledOptions();
    const currentIndex = enabled.indexOf(document.activeElement as HTMLButtonElement);
    const repeatedCharacter = query.length > 1 && [...query].every((character) => character === query[0]);
    const search = repeatedCharacter ? query[0] : query;
    const start = search.length === 1 && currentIndex >= 0 ? currentIndex + 1 : 0;
    const ordered = [...enabled.slice(start), ...enabled.slice(0, start)];
    const match = ordered.find((option) => option.dataset.optionLabel?.startsWith(search));
    if (match) focusOption(enabled.indexOf(match));
  };

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      typeaheadRef.current = { query: "", at: 0 };
      onOpenChange(false);
      triggerRef.current?.focus();
      return;
    }

    if (!open) {
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        typeaheadRef.current = { query: "", at: 0 };
        onOpenChange(true);
      }
      return;
    }

    const enabled = enabledOptions();
    const currentIndex = enabled.indexOf(document.activeElement as HTMLButtonElement);
    const isTypeaheadKey = event.key.length === 1
      && event.key.trim().length === 1
      && !event.altKey
      && !event.ctrlKey
      && !event.metaKey;
    if (isTypeaheadKey) {
      event.preventDefault();
      focusTypeaheadMatch(event.key);
    } else if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      focusOption(currentIndex + 1);
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      focusOption(currentIndex - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusOption(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusOption(enabled.length - 1);
    } else if (event.key === "Tab") {
      typeaheadRef.current = { query: "", at: 0 };
      onOpenChange(false);
    }
  };

  return (
    <div ref={wrapperRef} className={`relative ${className ?? ""}`} onKeyDown={onMenuKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`${label}: ${valueLabel}`}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-expanded={open}
        onClick={() => {
          typeaheadRef.current = { query: "", at: 0 };
          onOpenChange(!open);
        }}
        className={`group flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/25 ${
          open
            ? "border-gold-border bg-gold/[0.1] text-green-text shadow-sm"
            : "border-sand bg-cream text-ink hover:border-gold-border/60 hover:bg-paper"
        }`}
      >
        <span className="truncate">{valueLabel}</span>
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 text-ink-faint transition-transform duration-200 group-hover:text-green-text ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path d="m7 10 5 5 5-5" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label={`${label} options`}
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
            className={`absolute top-full z-40 mt-2 max-h-56 min-w-full overflow-y-auto rounded-xl border border-sand bg-paper p-1.5 shadow-[var(--shadow-lift)] ${
              align === "right" ? "right-0" : "left-0"
            }`}
          >
            {options.map((option) => {
              const selected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  aria-disabled={option.disabled || undefined}
                  disabled={option.disabled}
                  data-option-label={option.label.toLocaleLowerCase()}
                  tabIndex={option.value === initialFocusValue ? 0 : -1}
                  onFocus={(event) => {
                    enabledOptions().forEach((enabled) => {
                      enabled.tabIndex = enabled === event.currentTarget ? 0 : -1;
                    });
                  }}
                  onClick={() => {
                    onSelect(option.value);
                    typeaheadRef.current = { query: "", at: 0 };
                    onOpenChange(false);
                    triggerRef.current?.focus();
                  }}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold/35 disabled:cursor-not-allowed disabled:opacity-35 ${
                    selected
                      ? "bg-green font-semibold text-on-green"
                      : "text-ink hover:bg-cream"
                  }`}
                >
                  <span>{option.label}</span>
                  {selected && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="m5 12 4 4L19 6" />
                    </svg>
                  )}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface DatePickerProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  className?: string;
  name?: string;
  id?: string;
  "aria-label"?: string;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  min,
  max,
  disabled,
  className,
  name,
  id,
  "aria-label": ariaLabel,
}: Readonly<DatePickerProps>) {
  const [open, setOpen] = useState(false);
  const [internal, setInternal] = useState(value ?? "");
  const current = value ?? internal;
  const parsed = parseDate(current);
  const today = new Date();
  const todayIso = isoFromDate(today);
  const [view, setView] = useState(() => initialView(parsed, min, max, today));
  const [jumpMenu, setJumpMenu] = useState<"month" | "year" | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dayGridRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  // The calendar renders in a portal (document.body) with fixed positioning so
  // it can never be clipped by an `overflow-hidden`/scrolling ancestor (e.g. the
  // rounded sign-in card). We anchor it to the trigger and flip above when
  // there isn't room below.
  const [coords, setCoords] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null);

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (el == null || typeof window === "undefined") return;
    const r = el.getBoundingClientRect();
    const gap = 8;
    const estimatedHeight = 380; // approx calendar panel height
    const width = Math.min(320, window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;
    const openUp = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;
    // Cap the panel to the room on the chosen side so it never overflows the
    // viewport unreachably (a fixed element can't be scrolled into view); the
    // panel scrolls internally on very short screens.
    const maxHeight = Math.min(estimatedHeight, Math.max(0, (openUp ? spaceAbove : spaceBelow) - gap - 8));
    setCoords(openUp
      ? { left, width, bottom: window.innerHeight - r.top + gap, maxHeight }
      : { left, width, top: r.bottom + gap, maxHeight });
  }, []);

  // Position on open, and keep it anchored while scrolling/resizing.
  useLayoutEffect(() => {
    if (!open) return; // keep last coords so the exit animation stays anchored
    place();
    const onReflow = () => place();
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    return () => {
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
    };
  }, [open, place]);

  // Move focus into the day grid when the calendar opens. It's portalled to the
  // end of <body>, so a keyboard user tabbing from the trigger would otherwise
  // skip past it entirely; focusing the active day keeps arrow-key nav reachable.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const grid = dayGridRef.current;
      const target = grid?.querySelector<HTMLButtonElement>('[data-calendar-day][tabindex="0"]')
        ?? grid?.querySelector<HTMLButtonElement>('[data-calendar-day]:not(:disabled)');
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      // The panel is portalled to <body>, so also treat clicks inside it as inside.
      if (!ref.current?.contains(target) && !panelRef.current?.contains(target)) {
        setJumpMenu(null);
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (jumpMenu) {
        setJumpMenu(null);
      } else {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [jumpMenu, open]);

  const grid = buildGrid(view.y, view.m).map(({ date, inMonth }) => {
    const dateIso = isoFromDate(date);
    return { date, dateIso, inMonth, disabled: outOfRange(dateIso, min, max) };
  });
  const selected = current || undefined;
  const focusableDay = grid.find((day) => day.dateIso === selected && !day.disabled)
    ?? grid.find((day) => day.dateIso === todayIso && !day.disabled)
    ?? grid.find((day) => day.inMonth && !day.disabled)
    ?? grid.find((day) => !day.disabled);
  const { minY, maxY } = yearBounds(min, max, today.getFullYear());
  // Extend to cover the viewed year so the select never shows a blank value
  // (an old selected date, or arrow navigation past the fallback range).
  const yearLo = Math.min(minY, view.y);
  const yearHi = Math.max(maxY, view.y);
  const years = Array.from({ length: yearHi - yearLo + 1 }, (_, i) => yearLo + i);

  const dayButtons = () => Array.from(
    dayGridRef.current?.querySelectorAll<HTMLButtonElement>(DAY_BUTTON_SELECTOR) ?? [],
  );

  const focusDayButton = (index: number) => {
    const buttons = dayButtons();
    const target = buttons[index];
    if (!target || target.disabled) return;
    buttons.forEach((button) => {
      button.tabIndex = button === target ? 0 : -1;
    });
    target.focus();
  };

  const onDayKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let targetIndex: number;
    if (event.key === "Home") {
      targetIndex = index - (index % 7);
    } else if (event.key === "End") {
      targetIndex = index - (index % 7) + 6;
    } else {
      const offset = DAY_KEY_OFFSETS[event.key];
      if (offset === undefined) return;
      targetIndex = index + offset;
    }
    event.preventDefault();
    focusDayButton(targetIndex);
  };

  const setVal = (v: string) => {
    if (value === undefined) setInternal(v);
    onChange?.(v);
  };

  const pick = (dateIso: string) => {
    if (outOfRange(dateIso, min, max)) return;
    setVal(dateIso);
    setJumpMenu(null);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const prev = () => setView((v) => addMonths(v.y, v.m, -1));
  const next = () => setView((v) => addMonths(v.y, v.m, 1));

  const goToday = () => {
    const t = isoFromDate(new Date());
    if (!outOfRange(t, min, max)) pick(t);
  };

  return (
    <div ref={ref} className="relative">
      {name && <input type="hidden" name={name} value={current} />}
      <button
        ref={triggerRef}
        type="button"
        id={id}
        onClick={() => {
          if (open) {
            setJumpMenu(null);
            setOpen(false);
          } else {
            setView(initialView(parsed, min, max, today));
            setOpen(true);
          }
        }}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={ariaLabel}
        className={`${triggerCls} ${className ?? ""}`}
      >
        <span className={current ? "text-ink" : "text-ink-faint"}>{current ? formatDisplay(current) : placeholder}</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-faint" aria-hidden>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </button>

      {typeof document !== "undefined" && createPortal(
      <AnimatePresence>
        {open && coords && (
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
            role="dialog"
            aria-label="Choose a date"
            style={{ position: "fixed", left: coords.left, width: coords.width, top: coords.top, bottom: coords.bottom, maxHeight: coords.maxHeight, overflowY: "auto", zIndex: 80 }}
            className="rounded-2xl border border-sand bg-paper p-3 shadow-xl sm:p-4"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <button type="button" onClick={prev} className="shrink-0 rounded-lg p-1.5 text-ink-muted hover:bg-cream sm:p-2" aria-label="Previous month">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
              </button>
              <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
                <CalendarMenu
                  label="Choose month"
                  listboxId={`${menuId}-month`}
                  value={view.m}
                  valueLabel={MONTHS[view.m]}
                  options={MONTHS.map((month, idx) => ({
                    value: idx,
                    label: month,
                    disabled: monthHasNoSelectableDays(view.y, idx, min, max),
                  }))}
                  open={jumpMenu === "month"}
                  className="min-w-0 flex-1"
                  onOpenChange={(isOpen) => setJumpMenu(isOpen ? "month" : null)}
                  onSelect={(month) => setView((currentView) => ({ ...currentView, m: month }))}
                />
                <CalendarMenu
                  label="Choose year"
                  listboxId={`${menuId}-year`}
                  value={view.y}
                  valueLabel={String(view.y)}
                  options={years.map((year) => ({ value: year, label: String(year) }))}
                  open={jumpMenu === "year"}
                  align="right"
                  className="w-[5.75rem] shrink-0 sm:w-[6.75rem]"
                  onOpenChange={(isOpen) => setJumpMenu(isOpen ? "year" : null)}
                  onSelect={(year) => setView((currentView) => ({ ...currentView, y: year }))}
                />
              </div>
              <button type="button" onClick={next} className="shrink-0 rounded-lg p-1.5 text-ink-muted hover:bg-cream sm:p-2" aria-label="Next month">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
              </button>
            </div>

            <div
              ref={dayGridRef}
              role="group"
              aria-label={`${MONTHS[view.m]} ${view.y} calendar. Use arrow keys to move between dates.`}
              className="grid grid-cols-7 gap-1"
            >
              {WEEKDAYS.map((w, i) => (
                <span key={`${w}-${i}`} className="py-1 text-center text-[0.68rem] font-bold uppercase tracking-wider text-ink-faint">
                  {w}
                </span>
              ))}
              {grid.map(({ date, dateIso, inMonth, disabled }, index) => {
                const dIso = dateIso;
                const isSelected = selected === dIso;
                const isToday = todayIso === dIso;
                return (
                  <button
                    key={dIso}
                    type="button"
                    data-calendar-day
                    onClick={() => pick(dIso)}
                    onKeyDown={(event) => onDayKeyDown(event, index)}
                    onFocus={(event) => {
                      dayButtons().forEach((button) => {
                        button.tabIndex = button === event.currentTarget ? 0 : -1;
                      });
                    }}
                    disabled={disabled}
                    tabIndex={focusableDay?.dateIso === dIso ? 0 : -1}
                    aria-label={formatDayLabel(date)}
                    aria-pressed={isSelected}
                    aria-current={isToday ? "date" : undefined}
                    className={`aspect-square rounded-lg text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${dayClass(isSelected, isToday, inMonth, disabled)}`}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-sand pt-3">
              <button
                type="button"
                onClick={() => {
                  setVal("");
                  setJumpMenu(null);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                className="text-sm font-medium text-ink-muted hover:text-ink"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={goToday}
                disabled={outOfRange(todayIso, min, max)}
                className="rounded-full bg-green px-3 py-1.5 text-sm font-semibold text-on-green hover:bg-green-900 disabled:opacity-40"
              >
                Today
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
