import { Link, useLoaderData } from "react-router-dom";
import type { Listing } from "@/lib/types";
import { api } from "@/lib/api";
import { PageHero } from "@/components/page-hero";
import { Container, CTA, SampleNote } from "@/components/ui";
import { Adinkra } from "@/components/adinkra";
import { EventCard } from "@/components/cards";
import { formatDate } from "@/lib/format";
import { SAMPLE_NOTICE } from "@/lib/content";
import { cldCover } from "@/lib/cloudinary";

const TODAY = new Date().toISOString().slice(0, 10);

export async function loader() {
  return api.events();
}

export function Component() {
  const all = useLoaderData() as Listing[];
  const upcoming = all.filter((e) => (e.details.startsAt ?? "") >= TODAY);
  const anchor = all.find((e) => e.details.anchorFestival) ?? null;
  const rest = upcoming.filter((e) => e.id !== anchor?.id);

  const anchorClass = "on-dark relative mb-10 block overflow-hidden rounded-[var(--radius-card)] bg-green p-8 text-cream";
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
        <h2 className="mt-3 font-display text-3xl font-semibold sm:text-4xl">{anchor.title}</h2>
        <p className="mt-2 text-gold">{formatDate(anchor.details.startsAt!)} · {anchor.details.venue}</p>
        <p className="mt-3 max-w-2xl text-cream/85">{anchor.details.description}</p>
        {anchor.details.festival && <p className="mt-4 text-sm font-semibold text-gold">See every edition in the festival archive →</p>}
      </div>
    </>
  );

  return (
    <>
      <PageHero tone="gold" kicker="The connective tissue" title="Events & calendar" symbol="sankofa" lede="School reunions, youth workshops, music gigs and the festival itself — the calendar of the town, anchored on Fetu Afahye as the annual homecoming beat.">
        <CTA to="/submit?type=event" variant="primary">Post an event</CTA>
      </PageHero>
      <Container size="wide" className="py-12">
        {anchor && (anchor.details.festival
          ? <Link to={`/festivals/${anchor.details.festival}`} className={anchorClass}>{anchorBody}</Link>
          : <article className={anchorClass}>{anchorBody}</article>
        )}
        <h2 className="mb-5 font-display text-2xl font-semibold text-ink">Coming up</h2>
        <div className="grid gap-4 sm:grid-cols-2">{rest.map((e) => <EventCard key={e.id} event={e} />)}</div>
        <SampleNote>{SAMPLE_NOTICE}</SampleNote>
      </Container>
    </>
  );
}
