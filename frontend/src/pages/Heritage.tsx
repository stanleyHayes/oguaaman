import { Link, useLoaderData } from "react-router-dom";
import { usePageTitle } from "@/lib/use-page-title";
import type { HistoryView, Organization } from "@/lib/types";
import { api } from "@/lib/api";
import { PageHero } from "@/components/page-hero";
import { Container, Eyebrow } from "@/components/ui";
import { Adinkra } from "@/components/adinkra";
import { MemoryCard, Thumb } from "@/components/cards";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { HERITAGE_BLURB } from "@/lib/content";

export async function loader(): Promise<HistoryView> {
  return api.history();
}

function excerpt(text: string, max = 170): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const last = cut.lastIndexOf(" ");
  return cut.slice(0, last > 0 ? last : max).trimEnd() + "…";
}

function placePhoto(place: Organization): string | undefined {
  return place.gallery?.find((asset) => asset.kind === "photo")?.url;
}

function PlaceCard({ place, featured = false }: Readonly<{ place: Organization; featured?: boolean }>) {
  const photo = placePhoto(place);
  return (
    <Link
      to={`/education/${place.slug}`}
      className={`group relative isolate block overflow-hidden bg-green-900 ${featured ? "min-h-[30rem] rounded-[1.75rem] sm:min-h-[38rem]" : "min-h-72 rounded-[1.25rem]"}`}
    >
      <Thumb seed={place.slug} src={photo} rounded="rounded-none" className="absolute inset-0 h-full w-full transition-transform duration-700 group-hover:scale-[1.035]" coverWidth={featured ? 900 : 560} />
      <div className="absolute inset-0 bg-gradient-to-t from-green-900 via-green-900/30 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-6 text-cream sm:p-8">
        {place.classification && <p className="mb-3 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-gold">{place.classification}</p>}
        <h3 className={`${featured ? "max-w-xl text-3xl sm:text-4xl" : "text-2xl"} font-semibold leading-tight text-cream`}>{place.name}</h3>
        <p className={`mt-3 max-w-xl leading-relaxed text-cream/75 ${featured ? "text-base" : "text-sm"}`}>{excerpt(place.history || place.summary, featured ? 230 : 130)}</p>
        <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-gold transition-[gap] duration-300 group-hover:gap-3">Read its story <span aria-hidden>→</span></span>
      </div>
    </Link>
  );
}

export function Component() {
  const { timeline, heritage, people, memories } = useLoaderData() as HistoryView;
  const [featuredPlace, ...otherPlaces] = heritage;
  usePageTitle("Heritage & History");

  return (
    <>
      <PageHero
        tone="green"
        kicker="Sankofa · go back and fetch it"
        title="Our history is still speaking"
        symbol="sankofa"
        image="/uploads/seed/castle-courtyard.jpg"
        lede="From the old Fante shore to the classrooms, forts, festivals and fishing quarters of today—meet the people and places that made Oguaa."
      >
        <nav aria-label="Explore this page" className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-cream/80">
          <a href="#chronicle" className="border-b border-gold/50 pb-1 transition-colors hover:text-gold">The chronicle</a>
          <a href="#places" className="border-b border-gold/50 pb-1 transition-colors hover:text-gold">Historic places</a>
          <a href="#people" className="border-b border-gold/50 pb-1 transition-colors hover:text-gold">People & memory</a>
        </nav>
      </PageHero>

      <section className="relative overflow-hidden border-b border-sand bg-paper py-16 sm:py-24">
        <Adinkra name="sankofa" size={240} labelled={false} className="pointer-events-none absolute -right-12 top-1/2 -translate-y-1/2 text-gold-brand opacity-[0.045]" />
        <Container className="relative grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
          <Reveal>
            <Eyebrow className="text-gold-text">A living archive</Eyebrow>
            <p className="mt-4 text-sm leading-relaxed text-ink-faint">History here is not held behind glass. It lives in family names, school songs, festival drums and the routes people still walk.</p>
          </Reveal>
          <Reveal delay={0.08}>
            <p className="max-w-[43rem] text-2xl font-medium leading-[1.35] tracking-[-0.015em] text-ink sm:text-3xl">{HERITAGE_BLURB}</p>
            <div className="mt-8 grid grid-cols-3 gap-4 border-t border-sand pt-6 text-sm text-ink-muted">
              <p><strong className="block text-2xl font-semibold text-green tabular-nums">{timeline.length}</strong> turning points</p>
              <p><strong className="block text-2xl font-semibold text-green tabular-nums">{heritage.length}</strong> places recorded</p>
              <p><strong className="block text-2xl font-semibold text-green tabular-nums">{people.length + memories.length}</strong> living records</p>
            </div>
          </Reveal>
        </Container>
      </section>

      <section id="chronicle" className="scroll-mt-24 bg-cream py-16 sm:py-24">
        <Container>
          <Reveal className="max-w-2xl">
            <Eyebrow className="text-gold-text">Nkyinkyim · the path is twisted</Eyebrow>
            <h2 className="mt-4 text-4xl font-semibold sm:text-5xl">The Oguaa chronicle</h2>
            <p className="mt-5 text-lg leading-relaxed text-ink-muted">Five centuries of arrival, resistance, learning, independence and return.</p>
          </Reveal>
          <Stagger as="ol" className="mt-12 border-t border-green/20">
            {timeline.map((event, index) => (
              <StaggerItem as="li" key={event.id} className="group grid gap-3 border-b border-green/15 py-6 sm:grid-cols-[7rem_1fr_1.4fr] sm:gap-8 sm:py-8">
                <time className="text-3xl font-semibold tracking-[-0.03em] text-gold-text tabular-nums">{event.year}</time>
                <h3 className="text-xl font-semibold leading-snug text-ink">{event.title}</h3>
                <div>
                  <p className="leading-relaxed text-ink-muted">{event.summary}</p>
                  {event.tags?.length ? <p className="mt-3 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-ink-faint">{event.tags.join(" · ")}</p> : null}
                </div>
                <span className="sr-only">Entry {index + 1} of {timeline.length}</span>
              </StaggerItem>
            ))}
          </Stagger>
        </Container>
      </section>

      <section id="places" className="scroll-mt-24 bg-paper py-16 sm:py-24">
        <Container size="wide">
          <div className="grid gap-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-end">
            <Reveal>
              <Eyebrow className="text-clay-text">A sense of place</Eyebrow>
              <h2 className="mt-4 max-w-lg text-4xl font-semibold sm:text-5xl">Where the story is held</h2>
            </Reveal>
            <Reveal delay={0.08} as="p" className="max-w-2xl text-lg leading-relaxed text-ink-muted lg:justify-self-end">Walk the coast, climb the old hills and enter the grounds where local memory meets world history.</Reveal>
          </div>
          {featuredPlace && (
            <Stagger className="mt-12 grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
              <StaggerItem className="lg:row-span-2"><PlaceCard place={featuredPlace} featured /></StaggerItem>
              {otherPlaces.slice(0, 2).map((place) => <StaggerItem key={place.id}><PlaceCard place={place} /></StaggerItem>)}
            </Stagger>
          )}
          <Stagger className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {otherPlaces.slice(2).map((place) => <StaggerItem key={place.id}><PlaceCard place={place} /></StaggerItem>)}
          </Stagger>
        </Container>
      </section>

      <section id="people" className="scroll-mt-24 bg-green-900 py-16 text-cream sm:py-24">
        <Container>
          <div className="grid gap-10 lg:grid-cols-[0.7fr_1.3fr]">
            <Reveal>
              <Eyebrow className="text-gold">Sons & daughters</Eyebrow>
              <h2 className="mt-4 text-4xl font-semibold text-cream sm:text-5xl">Lives that shaped the coast</h2>
              <Link to="/people" className="mt-7 inline-flex items-center gap-2 border-b border-gold pb-1 text-sm font-semibold text-gold">Meet all notable people <span aria-hidden>→</span></Link>
            </Reveal>
            <Stagger className="border-t border-cream/20">
              {people.map((person, index) => (
                <StaggerItem key={person.id}>
                  <Link to={`/people/${person.slug}`} className="group grid grid-cols-[2.5rem_1fr_auto] items-center gap-4 border-b border-cream/15 py-5 transition-colors hover:text-gold">
                    <span className="text-xs text-cream/40 tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                    <span className="text-lg font-medium">{person.title}</span>
                    <span className="hidden text-sm text-cream/55 sm:block">{person.details.era ?? "View story"} <span className="ml-2 transition-transform group-hover:translate-x-1" aria-hidden>→</span></span>
                  </Link>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </Container>
      </section>

      <section className="bg-paper py-16 sm:py-24">
        <Container>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <Reveal>
              <Eyebrow className="text-gold-text">Heritage, preserved</Eyebrow>
              <h2 className="mt-4 text-4xl font-semibold sm:text-5xl">Memories of the town</h2>
            </Reveal>
            <Link to="/community" className="w-fit border-b border-green pb-1 text-sm font-semibold text-green">Visit the Memory Wall →</Link>
          </div>
          <Stagger className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {memories.map((memory) => <StaggerItem key={memory.id} lift><MemoryCard memory={memory} /></StaggerItem>)}
          </Stagger>
          <Reveal className="mt-16 flex items-center gap-5 border-t border-sand pt-8 sm:justify-end">
            <Adinkra name="nkyinkyim" size={32} labelled={false} className="shrink-0 text-gold-brand" />
            <p className="max-w-md text-xl italic leading-relaxed text-ink-muted">We hold both stories: the pride and the wound.</p>
          </Reveal>
        </Container>
      </section>
    </>
  );
}
