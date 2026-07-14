import { Link, useLoaderData } from "react-router-dom";
import type { HomeData, NewsArticle, Listing } from "@/lib/types";
import { api } from "@/lib/api";
import { Container, CTA as Cta, Eyebrow, SectionHeading, SampleNote } from "@/components/ui";
import { Adinkra, SymbolDivider } from "@/components/adinkra";
import { ArtistCard, EventCard, SectionCard, MemorialCard, NewsCard, FeaturedCard } from "@/components/cards";
import { SHOWCASE_SECTIONS } from "@/lib/sections";
import { ABOUT_OGUAA, SAMPLE_NOTICE } from "@/lib/content";
import { cldCover } from "@/lib/cloudinary";

type HomeLoaderData = HomeData & { news: NewsArticle[]; businesses: Listing[]; featured: Listing[] };

// The /api/home payload is intentionally lean; the homepage also surfaces the
// latest headlines, paid featured placements, and featured trade, so we fan
// those in alongside it. All are non-critical — a failure still renders the page.
export async function loader(): Promise<HomeLoaderData> {
  const [home, news, businesses, featured] = await Promise.all([
    api.home(),
    api.news().catch(() => [] as NewsArticle[]),
    api.businesses().catch(() => [] as Listing[]),
    api.featured().catch(() => [] as Listing[]),
  ]);
  return { ...home, news, businesses, featured };
}

export function Component() {
  const { spotlight, artists, events, memorial, stats, news, businesses, featured } = useLoaderData() as HomeLoaderData;
  const featuredSpots = featured.slice(0, 6);
  const moreArtists = artists.filter((a) => a.id !== spotlight.id).slice(0, 3);
  const initials = (spotlight.details.actName ?? spotlight.title).split(/\s+/).slice(0, 2).map((w) => w[0]).join("");
  const headlines = news.slice(0, 3);
  // Featured businesses: prefer real paid placements (spec §8.14), fall back to
  // the latest approved businesses so the showcase is never empty in dev/seed.
  const featuredBiz = featuredSpots.filter((l) => l.type === "business");
  const showcase = (featuredBiz.length ? featuredBiz : businesses).slice(0, 3);

  return (
    <>
      <section className="on-dark relative overflow-hidden bg-green text-cream">
        <div className="bg-dotgrid absolute inset-0 opacity-60" aria-hidden />
        <div className="absolute inset-0 opacity-90" style={{ background: "radial-gradient(120% 120% at 80% -10%, #1B5A3F 0%, #123F2D 45%, #0C2C1F 100%)" }} aria-hidden />
        <Container className="relative py-20 sm:py-28" size="wide">
          <div className="max-w-3xl">
            <Eyebrow className="text-gold/90">Cape Coast · Central Region · Ghana</Eyebrow>
            <h1 className="mt-4 font-display text-5xl font-semibold leading-[1.02] sm:text-7xl">This is <span className="text-gold">Oguaa.</span></h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-cream/85">
              The town that began as a market — the old Gold Coast capital, the Citadel of Education, home of the Asafo and Fetu Afahye. Its music, its people, its memory, gathered in one place. <span className="text-gold">Made by us, for us.</span>
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Cta to="/music" variant="gold">Hear the Oguaa Sound</Cta>
              <Cta to="/community" variant="outline-dark">Join the community</Cta>
            </div>
          </div>
        </Container>
        <div className="relative border-t border-cream/10 bg-green-900/60">
          <Container size="wide">
            <dl className="grid grid-cols-2 divide-cream/10 sm:grid-cols-4 sm:divide-x">
              {([["Members", stats.members], ["Listings", stats.listings], ["Schools", stats.schools], ["Artists", stats.artists]] as const).map(([label, n]) => (
                <div key={label} className="px-2 py-5 text-center">
                  <dd className="font-display text-3xl font-semibold text-gold">{n}</dd>
                  <dt className="mt-1 text-xs uppercase tracking-wide text-cream/60">{label}</dt>
                </div>
              ))}
            </dl>
          </Container>
        </div>
      </section>

      {featuredSpots.length > 0 && (
        <section className="bg-cream py-14 sm:py-16">
          <Container size="wide">
            <SectionHeading kicker="Featured in Oguaa · paid placements" title="In the spotlight" lede="Businesses, artists, events and more — placed front and centre by the people behind them." accentClass="bg-gold-brand" />
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {featuredSpots.map((l, i) => <FeaturedCard key={l.id} listing={l} index={i} />)}
            </div>
          </Container>
        </section>
      )}

      <section className="py-16 sm:py-20">
        <Container size="wide">
          <div className="flex items-end justify-between gap-4">
            <SectionHeading kicker="Rotating spotlight · the flagship" title="On the bandstand" accentClass="bg-clay" />
            <Link to="/music" className="shrink-0 text-sm font-semibold text-clay-text hover:underline">All artists →</Link>
          </div>
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <article className="overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)]">
              <Link to={`/music/${spotlight.slug}`} className="group block sm:flex">
                <div className="relative flex aspect-[4/3] items-center justify-center sm:aspect-auto sm:w-2/5" style={{ background: "linear-gradient(135deg,#B0503C,#7C2D2D)" }}>
                  <span className="bg-dotgrid absolute inset-0 opacity-40" aria-hidden />
                  {spotlight.coverImageUrl ? (
                    <img src={cldCover(spotlight.coverImageUrl, 700)} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <span className="relative font-display text-5xl font-semibold text-cream">{initials}</span>
                  )}
                </div>
                <div className="flex-1 p-6">
                  <span className="rounded-full bg-clay px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-cream">This week's spotlight</span>
                  <h3 className="mt-3 font-display text-3xl font-semibold text-ink group-hover:text-clay-text">{spotlight.details.actName}</h3>
                  <p className="mt-1 text-sm text-gold-text">{(spotlight.details.genres ?? []).join(" · ")}</p>
                  <p className="mt-3 text-sm leading-relaxed text-ink-muted">{spotlight.details.bio}</p>
                  <span className="mt-4 inline-block text-sm font-semibold text-clay-text">Open profile & streaming →</span>
                </div>
              </Link>
            </article>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {moreArtists.map((a) => <ArtistCard key={a.id} artist={a} />)}
            </div>
          </div>
        </Container>
      </section>

      {headlines.length > 0 && (
        <section className="bg-cream py-16 sm:py-20">
          <Container size="wide">
            <div className="flex items-end justify-between gap-4">
              <SectionHeading kicker="The Oguaa Newsroom" title="Latest headlines" accentClass="bg-green" />
              <Link to="/news" className="hidden shrink-0 text-sm font-semibold text-green hover:underline sm:inline">All the news →</Link>
            </div>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {headlines.map((a, i) => <NewsCard key={a.id} article={a} lead={i === 0} />)}
            </div>
            <div className="mt-10 text-center">
              <Cta to="/news" variant="primary">Read all the news →</Cta>
            </div>
          </Container>
        </section>
      )}

      {showcase.length > 0 && (
        <section className="relative overflow-hidden py-20 sm:py-28">
          <div className="bg-dotgrid absolute inset-0 opacity-[0.04]" aria-hidden />
          <Container size="wide" className="relative">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <Eyebrow className="text-teal-text">The working city · open for trade</Eyebrow>
                <h2 className="mt-2 font-display text-4xl font-semibold leading-[1.05] text-ink sm:text-5xl">
                  Featured <span className="text-teal-text">businesses</span>
                </h2>
                <p className="mt-3 max-w-xl text-ink-muted">The markets, kitchens and trades that keep Oguaa moving — front and centre.</p>
              </div>
              <Link to="/business" className="hidden shrink-0 text-sm font-semibold text-teal-text hover:underline sm:inline">All businesses →</Link>
            </div>
            <div className="mt-10 grid gap-6 lg:grid-cols-3">
              <div className={showcase.length > 1 ? "lg:col-span-2" : "lg:col-span-3"}>
                <FeaturedCard listing={showcase[0]} hero index={0} />
              </div>
              {showcase.length > 1 && (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1">
                  {showcase.slice(1, 3).map((b, i) => <FeaturedCard key={b.id} listing={b} index={i + 1} />)}
                </div>
              )}
            </div>
            <div className="mt-10 text-center sm:hidden">
              <Cta to="/business" variant="primary">All businesses →</Cta>
            </div>
          </Container>
        </section>
      )}

      <section className="bg-cream py-16">
        <Container size="prose" className="text-center">
          <SymbolDivider name="crab" />
          <h2 className="mt-6 font-display text-3xl font-semibold text-ink sm:text-4xl">The town that began as a market</h2>
          <p className="mt-5 text-left font-serif text-lg leading-relaxed text-ink">{ABOUT_OGUAA}</p>
        </Container>
      </section>

      <section className="py-16 sm:py-20">
        <Container size="wide">
          <SectionHeading kicker="Every corner of the town" title="Explore Oguaa" lede="One platform, many rooms. Ship a few deep, fill the rest as the community brings them to life." accentClass="bg-green" />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SHOWCASE_SECTIONS.map((s) => <SectionCard key={s.id} section={s} />)}
          </div>
        </Container>
      </section>

      <section className="bg-cream py-16 sm:py-20">
        <Container size="wide">
          <div className="grid gap-12 lg:grid-cols-[1.3fr_1fr]">
            <div>
              <SectionHeading kicker="Anchored on Fetu Afahye" title="What's coming up" accentClass="bg-gold-brand" />
              <div className="mt-8 grid grid-cols-1 gap-4">{events.map((e) => <EventCard key={e.id} event={e} />)}</div>
              <Link to="/events" className="mt-6 inline-block text-sm font-semibold text-gold-text hover:underline">Full calendar →</Link>
            </div>
            <div>
              <SectionHeading kicker="Yɛnkae · In Memoriam" title="We keep them" accentClass="bg-gold-brand" />
              <p className="mt-5 text-sm leading-relaxed text-ink-muted">A permanent, dignified home for those who have passed. Light a candle, leave a tribute, and remember together each year.</p>
              <div className="mt-6">{memorial && <MemorialCard memorial={memorial} />}</div>
              <Link to="/memoriam" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-gold-text hover:underline">
                <Adinkra name="nyame-nwu-na-mawu" size={16} labelled={false} className="text-gold-brand" />Enter Yɛnkae →
              </Link>
            </div>
          </div>
        </Container>
      </section>

      <section className="on-dark bg-green py-16 text-cream">
        <Container size="narrow" className="text-center">
          <Adinkra name="funtunfunefu" size={36} className="mx-auto text-gold" />
          <h2 className="mt-5 font-display text-3xl font-semibold sm:text-4xl">Rep your town. Rep your school.</h2>
          <p className="mx-auto mt-4 max-w-xl text-cream/80">Create your profile, share a memory, nominate an artist, list your business, or honour someone you love. The community is a participant, not an audience.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Cta to="/community" variant="gold">Join Oguaa</Cta>
            <Cta to="/submit" variant="outline-dark">Submit a listing</Cta>
          </div>
        </Container>
      </section>

      <Container><SampleNote>{SAMPLE_NOTICE}</SampleNote></Container>
    </>
  );
}
