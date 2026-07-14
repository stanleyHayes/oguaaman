import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router-dom";
import type { FestivalView } from "@/lib/types";
import { api } from "@/lib/api";
import { Container, Pill, SampleNote } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { SAMPLE_NOTICE } from "@/lib/content";
import { cldCover } from "@/lib/cloudinary";

export async function loader({ params }: LoaderFunctionArgs) {
  return api.festival(params.slug!);
}

const TODAY = new Date().toISOString().slice(0, 10);

export function Component() {
  const festival = useLoaderData() as FestivalView;
  const cover = festival.editions.flatMap((e) => e.events).find((e) => e.coverImageUrl)?.coverImageUrl;

  return (
    <>
      <section className="on-dark relative overflow-hidden bg-green text-cream">
        {cover && (
          <>
            <img src={cldCover(cover, 1200)} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} className="absolute inset-0 h-full w-full object-cover opacity-50" />
            <div className="absolute inset-0 bg-gradient-to-t from-green via-green/80 to-green/50" aria-hidden />
          </>
        )}
        <div className="bg-dotgrid absolute inset-0 opacity-40" aria-hidden />
        <Container size="wide" className="relative py-14 sm:py-20">
          <Link to="/festivals" className="text-sm text-gold hover:underline">← All festivals</Link>
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-gold">The living archive</p>
          <h1 className="mt-2 text-4xl font-semibold sm:text-6xl">{festival.name}</h1>
          {festival.tagline && <p className="mt-3 text-lg text-gold">{festival.tagline}</p>}
          {festival.history && <p className="mt-5 max-w-3xl leading-relaxed text-cream/85">{festival.history}</p>}
        </Container>
      </section>

      <Container size="wide" className="py-12">
        <h2 className="mb-6 text-2xl font-semibold text-ink">Editions</h2>
        <ol className="space-y-10">
          {festival.editions.map((ed) => {
            const upcoming = ed.events.some((e) => (e.details.startsAt ?? "") >= TODAY);
            let badge: React.ReactNode = null;
            if (upcoming) badge = <Pill tone="gold">Upcoming</Pill>;
            else if (ed.recap) badge = <Pill tone="green">Recap</Pill>;
            return (
              <li key={ed.year} className="relative border-l-2 border-gold-border/50 pl-6">
                <span className="absolute -left-[7px] top-2 h-3 w-3 rounded-full bg-gold-brand" aria-hidden />
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-2xl font-semibold text-ink">{ed.year}</h3>
                  {badge}
                </div>
                {ed.events.map((e) => {
                  const programme = e.details.programme ?? [];
                  return (
                    <div key={e.id} className="mt-4">
                      {e.details.startsAt && (
                        <p className="text-sm font-medium text-gold-text">
                          {formatDate(e.details.startsAt)}{e.details.venue ? ` · ${e.details.venue}` : ""}
                        </p>
                      )}
                      {e.details.description && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-muted">{e.details.description}</p>}
                      {programme.length > 0 && (
                        <ul className="mt-3 max-w-2xl space-y-2">
                          {programme.map((p) => (
                            <li key={`${p.day}-${p.time ?? ""}-${p.title}`} className="flex flex-col gap-1 rounded-lg border border-sand bg-cream px-4 py-2.5 text-sm sm:flex-row sm:gap-4">
                              <span className="shrink-0 font-medium text-ink sm:w-48">
                                {p.day}
                                {p.time && <span className="block text-xs font-normal text-ink-faint">{p.time}</span>}
                              </span>
                              <span className="text-ink-muted">{p.title}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
                {ed.recap && (
                  <p className="mt-4 max-w-2xl border-l-2 border-gold-brand/60 pl-4 font-serif text-sm italic leading-relaxed text-ink">{ed.recap}</p>
                )}
              </li>
            );
          })}
        </ol>
        <SampleNote>{SAMPLE_NOTICE}</SampleNote>
      </Container>
    </>
  );
}
