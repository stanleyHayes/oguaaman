import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

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
}: Readonly<DatePickerProps>) {
  const [open, setOpen] = useState(false);
  const [internal, setInternal] = useState(value ?? "");
  const current = value ?? internal;
  const parsed = parseDate(current);
  const today = new Date();
  const todayIso = isoFromDate(today);
  const [view, setView] = useState(() => initialView(parsed, min, max, today));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const grid = buildGrid(view.y, view.m);
  const selected = current || undefined;
  const { minY, maxY } = yearBounds(min, max, today.getFullYear());
  // Extend to cover the viewed year so the select never shows a blank value
  // (an old selected date, or arrow navigation past the fallback range).
  const yearLo = Math.min(minY, view.y);
  const yearHi = Math.max(maxY, view.y);
  const years = Array.from({ length: yearHi - yearLo + 1 }, (_, i) => yearLo + i);

  const setVal = (v: string) => {
    if (value === undefined) setInternal(v);
    onChange?.(v);
  };

  const pick = (dateIso: string) => {
    if (outOfRange(dateIso, min, max)) return;
    setVal(dateIso);
    setOpen(false);
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
        type="button"
        id={id}
        onClick={() => {
          if (!open) setView(initialView(parsed, min, max, today));
          setOpen((o) => !o);
        }}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`${triggerCls} ${className ?? ""}`}
      >
        <span className={current ? "text-ink" : "text-ink-faint"}>{current ? formatDisplay(current) : placeholder}</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-faint" aria-hidden>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
            role="dialog"
            aria-label="Choose a date"
            className="absolute z-30 mt-2 w-full min-w-[20rem] overflow-hidden rounded-2xl border border-sand bg-paper p-4 shadow-xl"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <button type="button" onClick={prev} className="shrink-0 rounded-lg p-2 text-ink-muted hover:bg-cream" aria-label="Previous month">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
              </button>
              <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
                <select
                  aria-label="Month"
                  value={view.m}
                  onChange={(e) => setView((v) => ({ y: v.y, m: Number(e.target.value) }))}
                  className="min-w-0 flex-1 rounded-lg border border-sand bg-cream px-2 py-1 text-sm text-ink focus:border-green focus:outline-none"
                >
                  {MONTHS.map((month, idx) => (
                    <option key={month} value={idx} disabled={monthHasNoSelectableDays(view.y, idx, min, max)}>
                      {month}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Year"
                  value={view.y}
                  onChange={(e) => setView((v) => ({ y: Number(e.target.value), m: v.m }))}
                  className="shrink-0 rounded-lg border border-sand bg-cream px-2 py-1 text-sm text-ink focus:border-green focus:outline-none"
                >
                  {years.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <button type="button" onClick={next} className="shrink-0 rounded-lg p-2 text-ink-muted hover:bg-cream" aria-label="Next month">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((w, i) => (
                <span key={`${w}-${i}`} className="py-1 text-center text-[0.68rem] font-bold uppercase tracking-wider text-ink-faint">
                  {w}
                </span>
              ))}
              {grid.map(({ date, inMonth }) => {
                const dIso = isoFromDate(date);
                const isSelected = selected === dIso;
                const isToday = todayIso === dIso;
                const disabled = outOfRange(dIso, min, max);
                return (
                  <button
                    key={dIso}
                    type="button"
                    onClick={() => pick(dIso)}
                    disabled={disabled}
                    aria-pressed={isSelected}
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
                onClick={() => { setVal(""); setOpen(false); }}
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
      </AnimatePresence>
    </div>
  );
}
