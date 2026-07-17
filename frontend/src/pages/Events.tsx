import { useState } from "react";
import { Link, useLoaderData } from "react-router-dom";
import { usePageTitle } from "@/lib/use-page-title";
import type { Listing } from "@/lib/types";
import { api } from "@/lib/api";
import { PageHero } from "@/components/page-hero";
import { Container, CTA as Cta, SampleNote } from "@/components/ui";
import { Adinkra } from "@/components/adinkra";
import { EventCard } from "@/components/cards";
import { EventCalendar } from "@/components/event-calendar";
import { LocationMap } from "@/components/location-map";
import { LayoutPill, Reveal, StaggerItem } from "@/components/motion";
import { LoadMore } from "@/components/pagination";
import { formatDate } from "@/lib/format";
import { SAMPLE_NOTICE } from "@/lib/content";
import { cldCover } from "@/lib/cloudinary";

const TODAY = new Date().toISOString().slice(0, 10);
const EVENTS_PAGE = 8;

export async function loader() {
  return api.events();
}

type EventsView = "list" | "calendar" | "map";

function ViewToggle({ view, onChange }: Readonly<{ view: EventsView; onChange: (v: EventsView) => void }>) {
  const options: { id: EventsView; label: string }[] = [
    { id: "list", label: "List" },
    { id: "calendar", label: "Calendar" },
    { id: "map", label: "Map" },
  ];
  return (
    <fieldset aria-label="Events view" className="m-0 inline-flex rounded-full border border-sand bg-paper p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={view === o.id}
          onClick={() => onChange(o.id)}
          className={`relative rounded-full px-4 py-1 text-sm font-semibold transition-colors ${view === o.id ? "text-on-green" : "text-ink-muted hover:text-ink"}`}
        >
          {view === o.id && <LayoutPill layoutId="events-view" className="absolute inset-0 rounded-full bg-green" />}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </fieldset>
  );
}

export function Component() {
  const all = useLoaderData() as Listing[];
  usePageTitle("Events");
  const [view, setView] = useState<EventsView>("list");
  const [shownCount, setShownCount] = useState(EVENTS_PAGE);
  const upcoming = all.filter((e) => (e.details.startsAt ?? "") >= TODAY);
  const anchor = all.find((e) => e.details.anchorFestival) ?? null;
  const rest = upcoming.filter((e) => e.id !== anchor?.id);

  const anchorClass = "on-dark on-dark-pin relative mb-10 block overflow-hidden rounded-[var(--radius-card)] bg-green p-6 text-cream sm:p-8";
  const anchorBody = anchor && (
    <>
      {anchor.coverImageUrl && (
        <>
          <img src={cldCover(anchor.coverImageUrl, 1000)} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} className="absolute inset-0 h-full w-full object-cover opacity-50" />
          <div className="absolute inset-0 bg-gradient-to-t from-green via-green/70 to-green/30" aria-hidden />
        </>
      )}
      <div className="bg-dotgrid absolute inset-0 opacity-40" aria-hidden />
      <div className="relative">
        <p className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-gold"><Adinkra name="sankofa" size={15} labelled={false} /> The anchor · homecoming</p>
        <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">{anchor.title}</h2>
        <p className="mt-2 text-gold">{formatDate(anchor.details.startsAt!)} · {anchor.details.venue}</p>
        <p className="mt-3 max-w-2xl text-cream/85">{anchor.details.description}</p>
        {anchor.details.festival && <p className="mt-4 text-sm font-semibold text-gold">See every edition in the festival archive →</p>}
      </div>
    </>
  );

  return (
    <>
      <PageHero tone="gold" kicker="The connective tissue" title="Events & calendar" symbol="sankofa" image="/uploads/seed/bakatue-2016.jpg" lede="School reunions, youth workshops, music gigs and the festival itself — the calendar of the town, anchored on Fetu Afahye as the annual homecoming beat.">
        <Cta to="/submit?type=event" variant="gold">Post an event</Cta>
      </PageHero>
      <Container size="wide" className="py-12">
        {anchor && (anchor.details.festival
          ? <Reveal><Link to={`/festivals/${anchor.details.festival}`} className={anchorClass}>{anchorBody}</Link></Reveal>
          : <Reveal><article className={anchorClass}>{anchorBody}</article></Reveal>
        )}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold text-ink">{view === "list" ? "Coming up" : view === "calendar" ? "Calendar" : "Venues"}</h2>
          <ViewToggle view={view} onChange={setView} />
        </div>
        {view === "list" ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">{rest.slice(0, shownCount).map((e, i) => <StaggerItem key={e.id} index={i} lift><EventCard event={e} /></StaggerItem>)}</div>
            <LoadMore hasMore={shownCount < rest.length} remaining={rest.length - shownCount} onClick={() => setShownCount((n) => n + EVENTS_PAGE)} />
          </>
        ) : view === "calendar" ? (
          <EventCalendar events={all} />
        ) : (
          <div className="space-y-4">
            {upcoming.filter((e) => e.details.venue).map((e) => (
              <div key={e.id} className="rounded-[var(--radius-card)] border border-sand bg-paper p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link to={`/events/${e.slug}`} className="font-semibold text-ink hover:text-green-text">{e.title}</Link>
                    <p className="mt-0.5 text-sm text-ink-muted">{e.details.venue} · {formatDate(e.details.startsAt!)}</p>
                  </div>
                </div>
                <LocationMap address={e.details.venue} query={`${e.details.venue ?? ""}, Cape Coast, Ghana`} className="h-52 rounded-lg" />
              </div>
            ))}
            {upcoming.filter((e) => e.details.venue).length === 0 && (
              <p className="py-12 text-center text-ink-muted">No upcoming events with venue information.</p>
            )}
          </div>
        )}
        <SampleNote>{SAMPLE_NOTICE}</SampleNote>
      </Container>
    </>
  );
}
