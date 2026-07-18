import { useState } from "react";
import { Link, useLoaderData } from "react-router-dom";
import { usePageTitle } from "@/lib/use-page-title";
import type { Listing } from "@/lib/types";
import { api } from "@/lib/api";
import { PageHero } from "@/components/page-hero";
import { Container, CTA as Cta, SampleNote } from "@/components/ui";
import { Adinkra } from "@/components/adinkra";
import { Thumb } from "@/components/cards";
import { EventCalendar } from "@/components/event-calendar";
import { LocationMap } from "@/components/location-map";
import { LayoutPill, Reveal, StaggerItem } from "@/components/motion";
import { LoadMore } from "@/components/pagination";
import { formatDate } from "@/lib/format";
import { SAMPLE_NOTICE } from "@/lib/content";

const NOW = new Date();
const TODAY = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, "0")}-${String(NOW.getDate()).padStart(2, "0")}`;
const EVENTS_PAGE = 6;

export async function loader() {
  return api.events();
}

type EventsView = "list" | "calendar" | "map";
type EventScope = "upcoming" | "festival" | "ticketed" | "past";

const VIEW_OPTIONS: { id: EventsView; label: string; glyph: string }[] = [
  { id: "list", label: "Agenda", glyph: "☷" },
  { id: "calendar", label: "Calendar", glyph: "▦" },
  { id: "map", label: "Venues", glyph: "⌖" },
];

const SCOPE_OPTIONS: { id: EventScope; label: string }[] = [
  { id: "upcoming", label: "Upcoming" },
  { id: "festival", label: "Festivals" },
  { id: "ticketed", label: "Ticketed" },
  { id: "past", label: "Past dates" },
];

function eventDate(event: Listing): string {
  return event.details.startsAt?.slice(0, 10) ?? "";
}

function compareEvents(a: Listing, b: Listing): number {
  return eventDate(a).localeCompare(eventDate(b));
}

function eventDateLabel(event: Listing): string {
  const date = eventDate(event);
  return date ? formatDate(date) : "Date TBC";
}

function shortMonth(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return date.toLocaleDateString("en-GB", { month: "short" }).toUpperCase();
}

function dayNumber(iso: string): string {
  return String(Number(iso.slice(8, 10)) || 1).padStart(2, "0");
}

function eventType(event: Listing): string {
  if (event.details.festival) return "Festival";
  if ((event.details.tiers?.length ?? 0) > 0) return "Ticketed";
  return event.tags[0] ? event.tags[0].replaceAll("-", " ") : "Community";
}

function dateSignal(event: Listing): string {
  const date = eventDate(event);
  if (!date) return "Date to be confirmed";
  if (date === TODAY) return "Happening today";
  if (date < TODAY) return "Past edition";
  const days = Math.round((Date.parse(date) - Date.parse(TODAY)) / 86_400_000);
  if (days === 1) return "Tomorrow";
  if (days < 8) return `In ${days} days`;
  return eventDateLabel(event);
}

function ticketCue(event: Listing): string {
  const tiers = event.details.tiers ?? [];
  if (tiers.length === 0) return "Event details";
  const prices = tiers.map((tier) => tier.pricePesewas);
  if (prices.every((price) => price === 0)) return "Free entry";
  if (prices.some((price) => price === 0)) return "Free + paid tiers";
  const lowest = Math.min(...prices) / 100;
  return `From GH₵ ${lowest.toLocaleString("en-GH", { maximumFractionDigits: 2 })}`;
}

function ViewToggle({ view, onChange }: Readonly<{ view: EventsView; onChange: (v: EventsView) => void }>) {
  return (
    <fieldset aria-label="Events view" className="m-0 inline-flex rounded-2xl border border-sand bg-paper p-1 shadow-sm">
      {VIEW_OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-label={option.label}
          aria-pressed={view === option.id}
          onClick={() => onChange(option.id)}
          className={`relative inline-flex min-h-11 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition-colors sm:px-4 ${view === option.id ? "on-dark-pin text-on-green" : "text-ink-muted hover:text-ink"}`}
        >
          {view === option.id && <LayoutPill layoutId="events-view" className="absolute inset-0 rounded-xl bg-green" />}
          <span className="relative text-base leading-none" aria-hidden>{option.glyph}</span>
          <span className="relative hidden sm:inline">{option.label}</span>
        </button>
      ))}
    </fieldset>
  );
}

function ScopeToggle({ scope, counts, onChange }: Readonly<{ scope: EventScope; counts: Record<EventScope, number>; onChange: (scope: EventScope) => void }>) {
  return (
    <fieldset aria-label="Filter events" className="flex max-w-full gap-2 overflow-x-auto pb-1">
      {SCOPE_OPTIONS.map((option) => {
        const active = scope === option.id;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.id)}
            className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3.5 text-sm font-semibold transition-colors ${active ? "on-dark-pin border-green bg-green text-on-green" : "border-sand bg-cream text-ink-muted hover:border-green/35 hover:text-green-text"}`}
          >
            {option.label} <span className={`grid min-w-6 place-items-center rounded-full px-1.5 py-0.5 text-[0.65rem] ${active ? "bg-cream/10 text-cream/75" : "bg-paper text-ink-faint"}`}>{counts[option.id]}</span>
          </button>
        );
      })}
    </fieldset>
  );
}

function CalendarPulse({ upcoming, all }: Readonly<{ upcoming: Listing[]; all: Listing[] }>) {
  const nextThirty = upcoming.filter((event) => {
    const days = (Date.parse(eventDate(event)) - Date.parse(TODAY)) / 86_400_000;
    return days >= 0 && days <= 30;
  }).length;
  const venues = new Set(upcoming.map((event) => event.details.venue).filter(Boolean)).size;
  const ticketed = upcoming.filter((event) => (event.details.tiers?.length ?? 0) > 0).length;
  const stats = [
    { value: upcoming.length, label: "Coming up" },
    { value: nextThirty, label: "Next 30 days" },
    { value: ticketed, label: "With tickets" },
    { value: venues, label: "Venues" },
  ];

  return (
    <Reveal>
      <section aria-label="Calendar overview" className="overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-lift)]">
        <div className="grid lg:grid-cols-[1.15fr_2.85fr]">
          <div className="on-dark-pin flex items-center gap-4 bg-green px-5 py-4 text-cream sm:px-6">
            <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full border border-cream/20 bg-cream/10" aria-hidden>
              <span className="h-2.5 w-2.5 rounded-full bg-gold shadow-[0_0_0_6px_rgba(199,162,74,0.15)]" />
            </span>
            <div>
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-gold">Town pulse</p>
              <p className="mt-0.5 text-sm text-cream/75">{all.length} dates across Oguaa's live calendar</p>
            </div>
          </div>
          <div className="grid grid-cols-2 divide-x divide-y divide-sand sm:grid-cols-4 sm:divide-y-0">
            {stats.map((stat) => (
              <div key={stat.label} className="flex items-center justify-between gap-3 px-4 py-3.5 sm:block sm:px-5">
                <strong className="text-2xl font-semibold leading-none text-green">{stat.value}</strong>
                <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-ink-faint sm:mt-1.5">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </Reveal>
  );
}

function NextEventCard({ event }: Readonly<{ event: Listing }>) {
  const startsAt = eventDate(event);
  return (
    <Link to={`/events/${event.slug}`} className="group grid h-full overflow-hidden rounded-[var(--radius-card)] border border-green/15 bg-green-900 shadow-[var(--shadow-lift)] sm:grid-cols-[1.15fr_0.85fr]">
      <div className="relative min-h-64 overflow-hidden sm:min-h-[22rem]">
        <Thumb seed={event.slug} src={event.coverImageUrl} rounded="rounded-none" className="h-full w-full transition-transform duration-700 group-hover:scale-[1.035]" coverWidth={900} />
        <div className="absolute inset-0 bg-gradient-to-t from-green-900/70 via-transparent to-green-900/10" aria-hidden />
        <span className="on-dark-pin absolute left-4 top-4 inline-flex min-h-9 items-center gap-2 rounded-full border border-cream/20 bg-green-900/75 px-3 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-cream backdrop-blur-sm">
          <span className="h-2 w-2 rounded-full bg-gold" aria-hidden /> {dateSignal(event)}
        </span>
      </div>
      <div className="on-dark-pin relative flex flex-col p-5 text-cream sm:p-7">
        <div className="bg-dotgrid absolute inset-0 opacity-20" aria-hidden />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-gold">Up next · {eventType(event)}</p>
            <p className="mt-2 text-sm text-cream/65">{eventDateLabel(event)}</p>
          </div>
          <span className="grid h-[4.25rem] w-[4.25rem] shrink-0 place-items-center rounded-2xl bg-gold-brand text-center text-green-900 shadow-[var(--shadow-card)]">
            <span>
              <b className="block text-2xl leading-none">{dayNumber(startsAt)}</b>
              <span className="mt-1 block text-[0.58rem] font-bold tracking-[0.18em]">{shortMonth(startsAt)}</span>
            </span>
          </span>
        </div>
        <h2 className="relative mt-5 text-3xl font-semibold leading-[1.08] text-cream sm:text-4xl">{event.title}</h2>
        {event.details.description && <p className="relative mt-3 line-clamp-3 text-sm leading-relaxed text-cream/75">{event.details.description}</p>}
        <div className="relative mt-5 space-y-2 border-t border-cream/10 pt-4 text-xs text-cream/70">
          {event.details.venue && <p className="line-clamp-1"><span className="text-gold" aria-hidden>⌖</span> {event.details.venue}</p>}
          {event.details.organiser && <p className="line-clamp-1">Hosted by {event.details.organiser}</p>}
        </div>
        <div className="relative mt-auto flex min-h-11 items-end justify-between gap-3 pt-5 text-sm font-semibold">
          <span className="rounded-full bg-cream/10 px-3 py-1.5 text-cream">{ticketCue(event)}</span>
          <span className="text-gold transition-transform group-hover:translate-x-1">Full details →</span>
        </div>
      </div>
    </Link>
  );
}

function AnchorCard({ event }: Readonly<{ event: Listing }>) {
  const archiveHref = event.details.festival ? `/festivals/${event.details.festival}` : "/festivals";
  return (
    <article className="grid overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)] sm:grid-cols-[9rem_1fr_auto]">
      <div className="relative min-h-32 overflow-hidden sm:min-h-full">
        <Thumb seed={event.slug} src={event.coverImageUrl} rounded="rounded-none" className="h-full w-full" coverWidth={360} />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-green-900/15" aria-hidden />
      </div>
      <div className="min-w-0 p-4 sm:px-5">
        <p className="inline-flex items-center gap-2 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-gold-text"><Adinkra name="sankofa" size={15} labelled={false} /> Annual homecoming · {eventDateLabel(event)}</p>
        <h3 className="mt-1.5 truncate text-lg font-semibold text-ink">
          <Link to={`/events/${event.slug}`} className="hover:text-green-text">{event.title}</Link>
        </h3>
        {event.details.venue && <p className="mt-1 truncate text-sm text-ink-muted">{event.details.venue}</p>}
        {event.details.description && <p className="mt-1 line-clamp-1 text-xs text-ink-faint">{event.details.description}</p>}
      </div>
      <Link to={archiveHref} className="flex min-h-11 items-center justify-between gap-5 border-t border-sand px-5 text-sm font-semibold text-gold-text sm:border-l sm:border-t-0">
        Every edition <span aria-hidden>→</span>
      </Link>
    </article>
  );
}

function PlanningCard() {
  return (
    <article className="on-dark-pin relative overflow-hidden rounded-[var(--radius-card)] bg-maroon-900 px-5 py-5 text-cream shadow-[var(--shadow-card)] sm:flex sm:items-center sm:justify-between sm:gap-6 sm:px-6">
      <div className="bg-dotgrid absolute inset-0 opacity-30" aria-hidden />
      <div className="relative max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-cream/85">Open calendar</p>
        <h3 className="mt-1 text-xl font-semibold">Bring the town together.</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-cream/75">School gathering, live show, workshop or community meeting—put it on Oguaa's calendar.</p>
      </div>
      <Cta to="/submit?type=event" variant="gold" className="relative mt-4 min-h-11 shrink-0 sm:mt-0">Post an event</Cta>
    </article>
  );
}

function OnDeck({ events }: Readonly<{ events: Listing[] }>) {
  return (
    <aside aria-labelledby="on-deck-title" className="overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)]">
      <div className="flex items-end justify-between gap-4 border-b border-sand bg-paper px-4 py-3.5">
        <div>
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.18em] text-gold-text">After the headline</p>
          <h3 id="on-deck-title" className="mt-0.5 text-lg font-semibold text-ink">On deck</h3>
        </div>
        <span className="text-xs text-ink-faint">{events.length} picks</span>
      </div>
      <div>
        {events.map((event) => {
          const date = eventDate(event);
          return (
            <Link key={event.id} to={`/events/${event.slug}`} className="group grid min-h-[5.65rem] grid-cols-[3rem_4.75rem_1fr_auto] items-center gap-3 border-b border-sand px-3 py-3 last:border-b-0 hover:bg-paper">
              <span className="text-center">
                <b className="block text-xl leading-none text-green">{date ? dayNumber(date) : "--"}</b>
                <span className="mt-1 block text-[0.55rem] font-bold uppercase tracking-[0.14em] text-gold-text">{date ? shortMonth(date) : "TBC"}</span>
              </span>
              <Thumb seed={event.slug} src={event.coverImageUrl} rounded="rounded-xl" className="h-16 w-full transition-transform duration-300 group-hover:scale-[1.03]" coverWidth={180} />
              <span className="min-w-0">
                <strong className="line-clamp-2 text-sm font-semibold leading-snug text-ink group-hover:text-green-text">{event.title}</strong>
                <span className="mt-1 block truncate text-xs text-ink-faint">{event.details.venue ?? eventType(event)}</span>
              </span>
              <span className="text-gold-text transition-transform group-hover:translate-x-1" aria-hidden>→</span>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}

function EventAgendaCard({ event }: Readonly<{ event: Listing }>) {
  const startsAt = eventDate(event);
  return (
    <Link to={`/events/${event.slug}`} className="group grid h-full min-h-48 grid-cols-[8.5rem_1fr] overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-0.5 hover:border-green/25 hover:shadow-[var(--shadow-lift)] sm:grid-cols-[10rem_1fr]">
      <div className="relative min-h-full overflow-hidden">
        <Thumb seed={event.slug} src={event.coverImageUrl} rounded="rounded-none" className="h-full w-full transition-transform duration-500 group-hover:scale-105" coverWidth={400} />
        <div className="absolute inset-0 bg-gradient-to-t from-green-900/35 via-transparent to-transparent" aria-hidden />
        {startsAt ? (
          <span className="absolute left-3 top-3 grid h-14 w-12 place-items-center rounded-xl bg-cream text-center text-green shadow-[var(--shadow-card)]">
            <span>
              <b className="block text-lg leading-none">{dayNumber(startsAt)}</b>
              <span className="mt-1 block text-[0.55rem] font-bold tracking-[0.14em] text-gold-text">{shortMonth(startsAt)}</span>
            </span>
          </span>
        ) : (
          <span className="absolute left-3 top-3 grid h-14 w-12 place-items-center rounded-xl bg-cream px-1 text-center text-[0.55rem] font-bold uppercase tracking-wider text-gold-text shadow-[var(--shadow-card)]">Date<br />TBC</span>
        )}
        <span className="on-dark-pin absolute inset-x-3 bottom-3 truncate rounded-full bg-green-900/85 px-2.5 py-1 text-center text-[0.58rem] font-bold uppercase tracking-[0.12em] text-cream backdrop-blur-sm">{eventType(event)}</span>
      </div>
      <div className="flex min-w-0 flex-col p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2 text-[0.62rem] font-bold uppercase tracking-[0.13em]">
          <span className="text-gold-text">{dateSignal(event)}</span>
          <span className="text-ink-faint" aria-hidden>·</span>
          <span className="text-teal-text">{ticketCue(event)}</span>
        </div>
        <h3 className="mt-2 line-clamp-2 text-lg font-semibold leading-snug text-ink group-hover:text-green-text">{event.title}</h3>
        {event.details.description && <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-ink-muted sm:text-sm">{event.details.description}</p>}
        <div className="mt-auto space-y-1 border-t border-sand pt-3 text-xs text-ink-faint">
          {event.details.venue && <p className="truncate"><span className="text-teal-text">⌖</span> {event.details.venue}</p>}
          {event.details.organiser && <p className="truncate">By {event.details.organiser}</p>}
        </div>
      </div>
    </Link>
  );
}

function VenueExplorer({ events, selectedId, onSelect }: Readonly<{ events: Listing[]; selectedId: string; onSelect: (id: string) => void }>) {
  const selected = events.find((event) => event.id === selectedId) ?? events[0];
  if (!selected) {
    return <EmptyPanel title="No venues listed here yet" body="Try another event filter or check the full calendar." />;
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[0.82fr_1.18fr]">
      <div className="max-h-[36rem] overflow-y-auto rounded-[var(--radius-card)] border border-sand bg-paper shadow-[var(--shadow-card)]">
        <div className="sticky top-0 z-10 border-b border-sand bg-paper/95 px-5 py-4 backdrop-blur-sm">
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-gold-text">Venue navigator</p>
          <p className="mt-1 text-sm text-ink-muted">Choose from {events.length} event {events.length === 1 ? "venue" : "venues"}</p>
        </div>
        {events.map((event) => {
          const active = event.id === selected.id;
          return (
            <button
              key={event.id}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(event.id)}
              className={`grid min-h-20 w-full grid-cols-[3.75rem_1fr_auto] items-center gap-3 border-b border-sand px-3 py-3 text-left transition-colors last:border-b-0 ${active ? "on-dark-pin bg-green text-on-green" : "hover:bg-cream"}`}
            >
              <Thumb seed={event.slug} src={event.coverImageUrl} rounded="rounded-xl" className="h-14 w-full" coverWidth={140} />
              <span className="min-w-0">
                <span className={`block text-[0.62rem] font-bold uppercase tracking-[0.13em] ${active ? "text-gold" : "text-gold-text"}`}>{dateSignal(event)}</span>
                <strong className="mt-1 block truncate text-sm font-semibold">{event.title}</strong>
                <span className={`mt-1 block truncate text-xs ${active ? "text-cream/70" : "text-ink-faint"}`}>{event.details.venue}</span>
              </span>
              <span className={active ? "text-gold" : "text-ink-faint"} aria-hidden>⌖</span>
            </button>
          );
        })}
      </div>
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)]">
        <div className="grid border-b border-sand sm:grid-cols-[6.5rem_1fr_auto] sm:items-center">
          <Thumb seed={selected.slug} src={selected.coverImageUrl} rounded="rounded-none" className="h-28 w-full sm:h-full" coverWidth={260} />
          <div className="min-w-0 px-4 py-3.5">
            <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-teal-text">Pinned · {eventDateLabel(selected)}</p>
            <Link to={`/events/${selected.slug}`} className="mt-1 block truncate text-lg font-semibold text-ink hover:text-green-text">{selected.title}</Link>
            <p className="mt-1 truncate text-sm text-ink-muted">{selected.details.venue}</p>
          </div>
          <Link to={`/events/${selected.slug}`} className="m-3 inline-flex min-h-11 items-center justify-center rounded-xl border border-green/25 px-4 text-xs font-semibold text-green">Event details →</Link>
        </div>
        <div className="p-3 sm:p-4">
          <LocationMap
            key={selected.id}
            address={selected.details.venue}
            query={selected.details.venue}
            latitude={selected.latitude}
            longitude={selected.longitude}
            className="rounded-xl"
          />
        </div>
      </div>
    </div>
  );
}

function EmptyPanel({ title, body }: Readonly<{ title: string; body: string }>) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-sand bg-paper px-6 py-10 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-gold/[0.12] text-xl text-gold-text" aria-hidden>◇</span>
      <h3 className="mt-4 text-xl font-semibold text-ink">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">{body}</p>
    </div>
  );
}

function scopeEvents(all: Listing[], scope: EventScope): Listing[] {
  if (scope === "past") return all.filter((event) => eventDate(event) && eventDate(event) < TODAY).sort(compareEvents).reverse();
  if (scope === "festival") {
    const festivals = all.filter((event) => Boolean(event.details.festival)).sort(compareEvents);
    return [
      ...festivals.filter((event) => eventDate(event) >= TODAY),
      ...festivals.filter((event) => eventDate(event) && eventDate(event) < TODAY).reverse(),
      ...festivals.filter((event) => !eventDate(event)),
    ];
  }
  if (scope === "ticketed") return all.filter((event) => eventDate(event) >= TODAY && (event.details.tiers?.length ?? 0) > 0).sort(compareEvents);
  return all.filter((event) => eventDate(event) >= TODAY).sort(compareEvents);
}

export function Component() {
  const all = useLoaderData() as Listing[];
  usePageTitle("Events");
  const [view, setView] = useState<EventsView>("list");
  const [scope, setScope] = useState<EventScope>("upcoming");
  const [shownCount, setShownCount] = useState(EVENTS_PAGE);
  const [selectedVenueId, setSelectedVenueId] = useState("");

  const upcoming = all.filter((event) => eventDate(event) >= TODAY).sort(compareEvents);
  const next = upcoming[0] ?? null;
  const anchor = upcoming.find((event) => event.details.anchorFestival) ?? all.find((event) => event.details.anchorFestival) ?? null;
  const onDeck = upcoming.filter((event) => event.id !== next?.id && event.id !== anchor?.id).slice(0, 3);
  const scoped = scopeEvents(all, scope);
  const highlighted = new Set(scope === "upcoming" ? [next?.id, anchor?.id].filter(Boolean) : []);
  const agenda = scoped.filter((event) => !highlighted.has(event.id));
  const venueEvents = scoped.filter((event) => Boolean(event.details.venue));
  const activeVenueId = venueEvents.some((event) => event.id === selectedVenueId) ? selectedVenueId : (venueEvents[0]?.id ?? "");
  const counts: Record<EventScope, number> = {
    upcoming: upcoming.length,
    festival: all.filter((event) => Boolean(event.details.festival)).length,
    ticketed: upcoming.filter((event) => (event.details.tiers?.length ?? 0) > 0).length,
    past: all.filter((event) => eventDate(event) && eventDate(event) < TODAY).length,
  };

  function changeScope(nextScope: EventScope) {
    setScope(nextScope);
    setShownCount(EVENTS_PAGE);
  }

  let sectionTitle = "More dates for your diary";
  if (view === "calendar") sectionTitle = "The full town calendar";
  else if (view === "map") sectionTitle = "Find your way there";
  else if (scope === "festival") sectionTitle = "Festival calendar";
  else if (scope === "ticketed") sectionTitle = "Ticketed experiences";
  else if (scope === "past") sectionTitle = "Past dates & editions";

  return (
    <>
      <PageHero tone="gold" kicker="Town pulse" title="What's on in Oguaa" symbol="sankofa" image={next?.coverImageUrl ?? "/uploads/seed/bakatue-2016.jpg"} lede="A living guide to festivals, school homecomings, performances and community gatherings across Cape Coast.">
        <div className="flex flex-wrap items-center gap-3">
          {next && (
            <Link
              to={`/events/${next.slug}`}
              aria-label={`Next event: ${next.title}. ${dateSignal(next)}`}
              className="on-dark-pin inline-flex min-h-11 max-w-full items-center gap-3 rounded-full border border-cream/20 bg-green-900/55 px-4 text-sm text-cream backdrop-blur-sm hover:border-gold/70"
            >
              <span className="flex shrink-0 items-center gap-2 font-bold uppercase tracking-[0.12em] text-gold"><span className="h-2 w-2 rounded-full bg-gold" aria-hidden /> {dateSignal(next)}</span>
              <span className="hidden h-4 w-px bg-cream/20 sm:block" aria-hidden />
              <span className="hidden max-w-64 truncate font-medium sm:block">{next.title}</span>
              <span className="text-gold" aria-hidden>→</span>
            </Link>
          )}
          <Cta to="/submit?type=event" variant="gold" className="min-h-11">Post an event</Cta>
          <Cta to="/festivals" variant="outline-dark" className="min-h-11">Festival archive</Cta>
        </div>
      </PageHero>

      <Container size="wide" className="relative z-10 -mt-7 pb-14">
        <CalendarPulse upcoming={upcoming} all={all} />

        <section aria-labelledby="pulse-headline" className="mt-8">
          <h2 id="pulse-headline" className="sr-only">The next dates in Oguaa</h2>
          <div className={`grid gap-5 ${onDeck.length > 0 ? "lg:grid-cols-[1.45fr_0.72fr]" : ""}`}>
            {next ? <Reveal className="h-full"><NextEventCard event={next} /></Reveal> : <EmptyPanel title="The next date is yours" body="There are no upcoming events yet. Post a gathering and put it on Oguaa's calendar." />}
            {onDeck.length > 0 && <Reveal delay={0.08}><OnDeck events={onDeck} /></Reveal>}
          </div>
          <div className={`mt-4 grid gap-4 ${anchor ? "xl:grid-cols-[1.45fr_0.72fr]" : ""}`}>
            {anchor && <Reveal><AnchorCard event={anchor} /></Reveal>}
            <PlanningCard />
          </div>
        </section>

        <section className="mt-12">
          <div className="flex flex-wrap items-end justify-between gap-5 border-b border-sand pb-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-gold-text">Browse the calendar</p>
              <h2 className="mt-2 text-3xl font-semibold text-ink">{sectionTitle}</h2>
            </div>
            <ViewToggle view={view} onChange={setView} />
          </div>

          {view !== "calendar" && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <ScopeToggle scope={scope} counts={counts} onChange={changeScope} />
              <p aria-live="polite" className="text-xs text-ink-faint">
                {view === "map" ? `${venueEvents.length} event ${venueEvents.length === 1 ? "venue" : "venues"} in this view` : `${agenda.length} ${agenda.length === 1 ? "date" : "dates"} in this view`}
              </p>
            </div>
          )}

          <div className="mt-7">
            {view === "list" ? (
              agenda.length > 0 ? (
                <>
                  <div className="grid gap-4 lg:grid-cols-2">
                    {agenda.slice(0, shownCount).map((event, index) => (
                      <StaggerItem key={event.id} index={index} lift><EventAgendaCard event={event} /></StaggerItem>
                    ))}
                  </div>
                  <LoadMore hasMore={shownCount < agenda.length} remaining={agenda.length - shownCount} onClick={() => setShownCount((count) => count + EVENTS_PAGE)} />
                </>
              ) : (
                <EmptyPanel title="No more dates in this view" body={scope === "upcoming" ? "The highlighted events above are the full upcoming agenda for now." : "Try another filter or add a new community date."} />
              )
            ) : view === "calendar" ? (
              <EventCalendar events={all} />
            ) : (
              <VenueExplorer events={venueEvents} selectedId={activeVenueId} onSelect={setSelectedVenueId} />
            )}
          </div>
        </section>

        <SampleNote>{SAMPLE_NOTICE}</SampleNote>
      </Container>
    </>
  );
}
