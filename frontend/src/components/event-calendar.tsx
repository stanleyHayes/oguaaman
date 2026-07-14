import { useMemo, useState } from "react";
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
      className={`flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-xs transition-colors ${tone}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${anchor ? "bg-gold-brand" : dotColor(event.details.category)}`} aria-hidden />
      <span className="truncate">{event.title}</span>
    </Link>
  );
}

function DayCell({ date, inMonth, isToday, events }: Readonly<{ date: Date; inMonth: boolean; isToday: boolean; events: Listing[] }>) {
  const shown = events.slice(0, 3);
  const extra = events.length - shown.length;
  const dayClass = isToday
    ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-green text-[0.7rem] font-bold text-cream"
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

function shiftMonth(view: { year: number; month: number }, delta: number): { year: number; month: number } {
  const m = view.month + delta;
  if (m < 0) return { year: view.year - 1, month: 11 };
  if (m > 11) return { year: view.year + 1, month: 0 };
  return { year: view.year, month: m };
}

/** Month-grid calendar of events. Prev/next navigation, today highlighted. */
export function EventCalendar({ events }: Readonly<{ events: Listing[] }>) {
  const today = useMemo(() => dayKey(new Date()), []);
  const [view, setView] = useState(() => initialMonth(events, today));
  const byDay = useMemo(() => eventsByDay(events), [events]);
  const navBtn = "flex h-8 w-8 items-center justify-center rounded-full border border-sand bg-paper text-ink transition-colors hover:border-gold-border/50 hover:text-gold-text";
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <button type="button" onClick={() => setView((v) => shiftMonth(v, -1))} aria-label="Previous month" className={navBtn}>←</button>
        <h3 className="text-xl font-semibold text-ink">{MONTHS_LONG[view.month]} {view.year}</h3>
        <button type="button" onClick={() => setView((v) => shiftMonth(v, 1))} aria-label="Next month" className={navBtn}>→</button>
      </div>
      <MonthGrid year={view.year} month={view.month} byDay={byDay} today={today} />
    </div>
  );
}
