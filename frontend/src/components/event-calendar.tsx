import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Listing } from "@/lib/types";

// ── Pure date helpers (vanilla, no date libraries) ───────────────────────────

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Local YYYY-MM-DD key for a Date (used as map key and React key). */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** YYYY-MM key for a year + zero-based month. */
function monthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

/** The 42 days (6 Monday-first weeks) covering a month, incl. spill-over days. */
function daysInMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7; // Monday-first offset of the 1st
  const start = new Date(year, month, 1 - lead);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    days.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }
  return days;
}

/** Group events by their local YYYY-MM-DD start date. */
function eventsByDay(events: Listing[]): Map<string, Listing[]> {
  const map = new Map<string, Listing[]>();
  for (const e of events) {
    const key = (e.details.startsAt ?? "").slice(0, 10);
    if (key.length !== 10) continue;
    const list = map.get(key) ?? [];
    list.push(e);
    map.set(key, list);
  }
  return map;
}

/** Month to open on: the first upcoming event's month, else the current month. */
function initialMonth(events: Listing[], today: string): { year: number; month: number } {
  const upcoming = events
    .map((e) => (e.details.startsAt ?? "").slice(0, 10))
    .filter((s) => s >= today)
    .sort((a, b) => a.localeCompare(b));
  const first = upcoming[0] ?? `${monthKey(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1)}-01`;
  return { year: Number(first.slice(0, 4)), month: Number(first.slice(5, 7)) - 1 };
}

// ── Chip colours ─────────────────────────────────────────────────────────────

const DOT_COLORS = ["bg-green", "bg-clay", "bg-teal", "bg-gold-brand", "bg-maroon-900"];

function dotColor(category?: string): string {
  if (!category) return "bg-green";
  let h = 0;
  for (const ch of category) h = Math.trunc(h * 31 + (ch.codePointAt(0) ?? 0));
  return DOT_COLORS[Math.abs(h) % DOT_COLORS.length];
}

// ── Components ───────────────────────────────────────────────────────────────

const NO_EVENTS: Listing[] = [];

function EventChip({ event }: Readonly<{ event: Listing }>) {
  const anchor = Boolean(event.details.anchorFestival);
  const tone = anchor
    ? "border-gold-border/50 bg-gold/20 font-semibold text-gold-text hover:bg-gold/30"
    : "border-sand bg-paper text-ink hover:border-gold-border/50";
  return (
    <Link
      to={`/events/${event.slug}`}
      title={event.title}
      className={`flex min-h-6 items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-xs transition-colors ${tone}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${anchor ? "bg-gold-brand" : dotColor(event.tags[0])}`} aria-hidden />
      <span className="truncate">{event.title}</span>
    </Link>
  );
}

function DayCell({ date, inMonth, isToday, events }: Readonly<{ date: Date; inMonth: boolean; isToday: boolean; events: Listing[] }>) {
  const shown = events.slice(0, 3);
  const extra = events.length - shown.length;
  const dayClass = isToday
    ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-green text-[0.7rem] font-bold text-on-green"
    : "text-[0.7rem] font-semibold text-ink-faint";
  return (
    <div className={`flex min-h-20 flex-col gap-1 border-t border-sand p-1 sm:min-h-24 ${inMonth ? "bg-cream" : "bg-paper/60 opacity-60"}`}>
      <span className={dayClass}>{date.getDate()}</span>
      {shown.map((e) => <EventChip key={e.id} event={e} />)}
      {extra > 0 && <span className="px-1 text-[0.65rem] text-ink-faint">+{extra} more</span>}
    </div>
  );
}

function MonthGrid({ year, month, byDay, today }: Readonly<{ year: number; month: number; byDay: Map<string, Listing[]>; today: string }>) {
  const days = daysInMonthGrid(year, month);
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)]">
      <div className="grid grid-cols-7 bg-paper">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-1 py-2 text-center text-[0.65rem] font-bold uppercase tracking-wide text-gold-text">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const key = dayKey(d);
          return (
            <DayCell
              key={key}
              date={d}
              inMonth={d.getMonth() === month}
              isToday={key === today}
              events={byDay.get(key) ?? NO_EVENTS}
            />
          );
        })}
      </div>
    </div>
  );
}

function MonthAgenda({ year, month, events }: Readonly<{ year: number; month: number; events: Listing[] }>) {
  const prefix = monthKey(year, month);
  const inMonth = events
    .filter((event) => (event.details.startsAt ?? "").startsWith(prefix))
    .sort((a, b) => (a.details.startsAt ?? "").localeCompare(b.details.startsAt ?? ""));

  if (inMonth.length === 0) {
    return (
      <div className="rounded-[var(--radius-card)] border border-dashed border-sand bg-paper px-5 py-10 text-center">
        <p className="font-medium text-ink">No dates in {MONTHS_LONG[month]}</p>
        <p className="mt-1 text-sm text-ink-muted">Choose another month to keep exploring.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)]">
      {inMonth.map((event) => {
        const iso = event.details.startsAt ?? "";
        return (
          <Link key={event.id} to={`/events/${event.slug}`} className="group grid grid-cols-[3.25rem_1fr_auto] items-center gap-3 border-b border-sand p-4 last:border-b-0 hover:bg-paper">
            <span className="grid h-12 place-items-center rounded-xl bg-green text-center text-on-green">
              <span>
                <b className="block text-lg leading-none">{Number(iso.slice(8, 10))}</b>
                <span className="mt-0.5 block text-[0.55rem] font-bold uppercase tracking-wider text-gold">{WEEKDAYS[(new Date(`${iso}T12:00:00`).getDay() + 6) % 7]}</span>
              </span>
            </span>
            <span className="min-w-0">
              <strong className="block truncate text-sm font-semibold text-ink group-hover:text-green-text">{event.title}</strong>
              {event.details.venue && <span className="mt-0.5 block truncate text-xs text-ink-faint">{event.details.venue}</span>}
            </span>
            <span className="text-gold-text transition-transform group-hover:translate-x-1" aria-hidden>→</span>
          </Link>
        );
      })}
    </div>
  );
}

function shiftMonth(view: { year: number; month: number }, delta: number): { year: number; month: number } {
  const m = view.month + delta;
  if (m < 0) return { year: view.year - 1, month: 11 };
  if (m > 11) return { year: view.year + 1, month: 0 };
  return { year: view.year, month: m };
}

/** Years offered in the browse header: earliest→latest event year, expanded to
 *  cover the current year and the viewed year; current year ±2 if no events. */
function yearOptions(events: Listing[], currentYear: number, viewYear: number): number[] {
  const eventYears = events
    .map((e) => Number((e.details.startsAt ?? "").slice(0, 4)))
    .filter((y) => Number.isInteger(y) && y > 0);
  const lo = Math.min(...(eventYears.length ? eventYears : [currentYear - 2]), currentYear, viewYear);
  const hi = Math.max(...(eventYears.length ? eventYears : [currentYear + 2]), currentYear, viewYear);
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

/** Month-grid calendar of events. Month/year navigation, today highlighted. */
export function EventCalendar({ events }: Readonly<{ events: Listing[] }>) {
  const today = useMemo(() => dayKey(new Date()), []);
  const [view, setView] = useState(() => initialMonth(events, today));
  const [jumpOpen, setJumpOpen] = useState(false);
  const jumpButtonRef = useRef<HTMLButtonElement>(null);
  const byDay = useMemo(() => eventsByDay(events), [events]);
  const currentYear = Number(today.slice(0, 4));
  const years = useMemo(() => yearOptions(events, currentYear, view.year), [events, currentYear, view.year]);
  const navBtn = "flex h-11 w-11 items-center justify-center rounded-full border border-sand bg-paper text-ink transition-colors hover:border-gold-border/50 hover:text-gold-text";

  function moveMonth(delta: number) {
    setView((current) => shiftMonth(current, delta));
    setJumpOpen(false);
  }

  function goToday() {
    setView({ year: currentYear, month: Number(today.slice(5, 7)) - 1 });
    setJumpOpen(false);
  }

  function closeJump() {
    setJumpOpen(false);
    requestAnimationFrame(() => jumpButtonRef.current?.focus());
  }

  return (
    <div>
      <h3 className="sr-only">{MONTHS_LONG[view.month]} {view.year}</h3>
      <div className={`${jumpOpen ? "mb-3" : "mb-5"} flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-sand bg-cream p-3 shadow-[var(--shadow-card)] sm:p-4`}>
        <div className="flex items-center gap-1 sm:gap-2">
          <button type="button" onClick={() => moveMonth(-1)} aria-label="Previous month" className={navBtn}>←</button>
          <button
            ref={jumpButtonRef}
            type="button"
            aria-label={`Choose month and year. Currently ${MONTHS_LONG[view.month]} ${view.year}`}
            aria-expanded={jumpOpen}
            aria-controls="calendar-jump-menu"
            onClick={() => setJumpOpen((open) => !open)}
            className="flex min-h-11 min-w-36 items-center justify-between gap-3 rounded-full border border-green/20 bg-green/[0.05] px-4 text-left text-sm font-semibold text-green transition-colors hover:border-green/45 sm:min-w-40"
          >
            <span>{MONTHS_LONG[view.month]} {view.year}</span>
            <span className={`text-gold-text transition-transform ${jumpOpen ? "rotate-180" : ""}`} aria-hidden>⌄</span>
          </button>
          <button type="button" onClick={() => moveMonth(1)} aria-label="Next month" className={navBtn}>→</button>
        </div>
        <button
          type="button"
          onClick={goToday}
          className="h-11 rounded-full border border-sand bg-paper px-4 text-sm font-semibold text-ink transition-colors hover:border-gold-border/50 hover:text-gold-text"
        >
          Today
        </button>
      </div>
      {jumpOpen && (
        <div
          id="calendar-jump-menu"
          role="region"
          aria-label="Choose calendar month and year"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closeJump();
            }
          }}
          className="mb-5 rounded-[var(--radius-card)] border border-sand bg-cream p-4 shadow-[var(--shadow-card)] sm:p-5"
        >
          <div className="grid gap-5 md:grid-cols-[1fr_auto]">
            <fieldset>
              <legend className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-gold-text">Choose month</legend>
              <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                {MONTHS_LONG.map((month, index) => (
                  <button
                    key={month}
                    type="button"
                    aria-pressed={view.month === index}
                    onClick={() => setView((current) => ({ ...current, month: index }))}
                    className={`min-h-11 rounded-lg px-2 py-2.5 text-xs font-semibold transition-colors ${view.month === index ? "bg-green text-on-green" : "bg-paper text-ink-muted hover:bg-gold/[0.12] hover:text-gold-text"}`}
                  >
                    {month.slice(0, 3)}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="border-t border-sand pt-4 md:min-w-48 md:border-l md:border-t-0 md:pl-5 md:pt-0">
              <legend className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-gold-text">Choose year</legend>
              <div className="mt-3 flex max-w-full gap-2 overflow-x-auto pb-1 md:grid md:grid-cols-2">
                {years.map((year) => (
                  <button
                    key={year}
                    type="button"
                    aria-pressed={view.year === year}
                    onClick={() => setView((current) => ({ ...current, year }))}
                    className={`min-h-11 shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${view.year === year ? "border-green bg-green text-on-green" : "border-sand bg-paper text-ink-muted hover:border-green/30"}`}
                  >
                    {year}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
          <div className="mt-4 flex justify-end border-t border-sand pt-4">
            <button type="button" onClick={closeJump} className="min-h-11 rounded-full bg-gold-brand px-5 py-2.5 text-xs font-bold text-green-900">Show this month</button>
          </div>
        </div>
      )}
      <div className="sm:hidden"><MonthAgenda year={view.year} month={view.month} events={events} /></div>
      <div className="hidden sm:block"><MonthGrid year={view.year} month={view.month} byDay={byDay} today={today} /></div>
    </div>
  );
}
