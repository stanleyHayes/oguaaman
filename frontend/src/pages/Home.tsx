import { useState } from "react";
import { Link, useLoaderData } from "react-router-dom";
import { usePageTitle } from "@/lib/use-page-title";
import type { HomeData, NewsArticle, Listing } from "@/lib/types";
import { api } from "@/lib/api";
import { Container, CTA as Cta, Eyebrow, SectionHeading, SampleNote } from "@/components/ui";
import { Adinkra, SymbolDivider } from "@/components/adinkra";
import { Thumb, EventCard, SectionCard, MemorialCard, NewsCard, FeaturedCard } from "@/components/cards";
import { CircularReveal, Parallax, Reveal, Reveal3D, Stagger, StaggerItem } from "@/components/motion";
import { SHOWCASE_SECTIONS } from "@/lib/sections";
import { ABOUT_OGUAA, SAMPLE_NOTICE } from "@/lib/content";
import { cldCover } from "@/lib/cloudinary";
import { initials } from "@/lib/format";

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

const TRADE_CATEGORIES = ["Food & Drink", "Fashion", "Tech", "Health", "Services", "Crafts", "Education"] as const;

export function Component() {
  const { spotlight, artists, events, memorial, stats, news, businesses, featured } = useLoaderData() as HomeLoaderData;
  usePageTitle(null); // Home uses the site name alone
  const [tradeCategory, setTradeCategory] = useState<string | null>(null);
  const featuredSpots = featured.slice(0, 6);
  const moreArtists = artists.filter((a) => a.id !== spotlight.id).slice(0, 3);
  const headlines = news.slice(0, 3);
  // Featured businesses: prefer real paid placements (spec §8.14), fall back to
  // the latest approved businesses so the showcase is never empty in dev/seed.
  const featuredBiz = featuredSpots.filter((l) => l.type === "business");
  const showcase = (featuredBiz.length ? featuredBiz : businesses).slice(0, 3);
  // Trade band: filter by selected category chip, else show supporter-first set.
  const tradeBiz = businesses
    .filter((b) => !tradeCategory || (b.details.category ?? "").toLowerCase().includes(tradeCategory.toLowerCase()))
    .slice(0, 4);

  return (
    <>
      <section className="on-dark relative overflow-hidden bg-green text-cream">
        <Parallax strength={28} className="absolute -inset-y-8 inset-x-0">
          <img src="/uploads/seed/castle-exterior.jpg" alt="" fetchPriority="high" className="absolute inset-0 h-full w-full object-cover" aria-hidden />
          <div className="bg-dotgrid absolute inset-0 opacity-60" aria-hidden />
          <div className="absolute inset-0" style={{ background: "radial-gradient(120% 120% at 80% -10%, rgba(27,90,63,0.88) 0%, rgba(18,63,45,0.92) 45%, rgba(12,44,31,0.97) 100%)" }} aria-hidden />
        </Parallax>
        <Container className="relative py-20 sm:py-28" size="wide">
          <Stagger className="max-w-3xl">
            <StaggerItem><Eyebrow className="text-gold/90">Cape Coast · Central Region · Ghana</Eyebrow></StaggerItem>
            <StaggerItem><h1 className="mt-4 text-5xl font-semibold leading-[1.02] sm:text-7xl">This is <span className="text-gold">Oguaa.</span></h1></StaggerItem>
            <StaggerItem>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-cream/85">
                The town that began as a market — the old Gold Coast capital, the Citadel of Education, home of the Asafo and Fetu Afahye. Its music, its people, its memory, gathered in one place. <span className="text-gold">Made by us, for us.</span>
              </p>
            </StaggerItem>
            <StaggerItem>
              <div className="mt-8 flex flex-wrap gap-3">
                <Cta to="/music" variant="gold">Hear the Oguaa Sound</Cta>
                <Cta to="/community" variant="outline-dark">Join the community</Cta>
              </div>
            </StaggerItem>
          </Stagger>
        </Container>
        <div className="relative border-t border-cream/10 bg-green-900/60">
          <Container size="wide">
            <Parallax strength={12}>
            <dl className="grid grid-cols-2 divide-cream/10 sm:grid-cols-4 sm:divide-x">
              {([["Members", stats.members], ["Listings", stats.listings], ["Schools", stats.schools], ["Artists", stats.artists]] as const).map(([label, n]) => (
                <div key={label} className="px-2 py-5 text-center">
                  <dd className="text-3xl font-semibold text-gold">{n}</dd>
                  <dt className="mt-1 text-xs uppercase tracking-wide text-cream/60">{label}</dt>
                </div>
              ))}
            </dl>
            </Parallax>
          </Container>
        </div>
      </section>

      {featuredSpots.length > 0 && (
        <section className="bg-cream py-14 sm:py-16">
          <Container size="wide">
            <Reveal><SectionHeading kicker="Featured in Oguaa · paid placements" title="In the spotlight" lede="Businesses, artists, events and more — placed front and centre by the people behind them." accentClass="bg-gold-brand" /></Reveal>
            <Stagger className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {featuredSpots.map((l, i) => <StaggerItem key={l.id}><FeaturedCard listing={l} index={i} /></StaggerItem>)}
            </Stagger>
          </Container>
        </section>
      )}

      <section className="on-dark relative overflow-hidden text-cream">
        {/* The stage: clay-to-green wash, gold footlight glow, this week's cover bleeding through */}
        <Parallax strength={24} className="absolute -inset-y-6 inset-x-0">
          <div className="absolute inset-0" style={{ background: "linear-gradient(140deg,#B0503C 0%,#7C2D2D 45%,#0C2C1F 100%)" }} aria-hidden />
          {spotlight.coverImageUrl && (
            <img src={cldCover(spotlight.coverImageUrl, 1400)} alt="" aria-hidden loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-15" onError={(e) => { e.currentTarget.style.display = "none"; }} />
          )}
          <div className="bg-dotgrid absolute inset-0 opacity-40" aria-hidden />
          <div className="absolute inset-0" style={{ background: "radial-gradient(55% 45% at 50% -10%, rgba(199,162,74,0.22), transparent 70%)" }} aria-hidden />
        </Parallax>
        <Container size="wide" className="relative py-16 sm:py-20">
          <div className="flex items-end justify-between gap-4">
            <Reveal>
              <Eyebrow className="text-gold/90">Rotating spotlight · the flagship</Eyebrow>
              <h2 className="mt-2 text-4xl font-semibold leading-[1.05] sm:text-5xl">On the <span className="text-gold">bandstand</span></h2>
              <p className="mt-3 max-w-xl text-cream/75">Each week one act takes the stage — the sound of Oguaa, front and centre.</p>
            </Reveal>
            <Link to="/music" className="hidden shrink-0 text-sm font-semibold text-gold hover:underline sm:inline">All artists →</Link>
          </div>
          <div className="mt-10 grid gap-10 lg:grid-cols-[1.5fr_1fr]">
            {/* The headliner */}
            <article className="flex flex-col gap-6 sm:flex-row sm:items-end">
              <CircularReveal className="shrink-0">
                <Link to={`/music/${spotlight.slug}`} className="group block">
                  <Thumb seed={spotlight.slug} label={initials(spotlight.details.actName ?? spotlight.title)} src={spotlight.coverImageUrl} className="aspect-square w-full border-2 border-gold/40 shadow-xl transition-transform group-hover:-translate-y-0.5 sm:h-52 sm:w-52" coverWidth={500} />
                </Link>
              </CircularReveal>
              <div className="min-w-0">
                <span className="rounded-full bg-gold-brand px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-green-900">★ This week's spotlight</span>
                <h3 className="mt-3 text-3xl font-semibold leading-[1.1] sm:text-4xl">
                  <Link to={`/music/${spotlight.slug}`} className="transition-colors hover:text-gold">{spotlight.details.actName ?? spotlight.title}</Link>
                </h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(spotlight.details.genres ?? []).map((g) => <span key={g} className="rounded-full border border-cream/25 bg-cream/10 px-3 py-1 text-xs text-cream/90 backdrop-blur-sm">{g}</span>)}
                </div>
                <p className="mt-4 line-clamp-3 max-w-md text-sm leading-relaxed text-cream/80">{spotlight.details.bio}</p>
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <Cta to={`/music/${spotlight.slug}`} variant="gold">Open profile</Cta>
                  {(spotlight.details.streamingLinks ?? []).map((l) => (
                    <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-cream/15 px-3.5 py-2 text-xs font-semibold text-cream backdrop-blur-sm transition-colors hover:bg-gold-brand hover:text-green-900">
                      {l.label} <span aria-hidden>↗</span>
                    </a>
                  ))}
                </div>
              </div>
            </article>
            {/* Also on the bill */}
            {moreArtists.length > 0 && (
              <div>
                <p className="eyebrow text-gold/80">Also on the bill</p>
                <Stagger className="mt-3 space-y-3">
                  {moreArtists.map((a) => (
                    <StaggerItem key={a.id}>
                      <Link to={`/music/${a.slug}`} className="group flex items-center gap-4 rounded-[var(--radius-card)] border border-cream/10 bg-cream/[0.06] p-3 backdrop-blur-sm transition-colors hover:border-gold/40 hover:bg-cream/10">
                        <Thumb seed={a.slug} label={initials(a.details.actName ?? a.title)} src={a.coverImageUrl} rounded="rounded-lg" className="h-14 w-14 shrink-0" coverWidth={128} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-lg font-semibold text-cream group-hover:text-gold">{a.details.actName ?? a.title}</p>
                          <p className="truncate text-xs text-cream/60">{(a.details.genres ?? []).join(" · ")}</p>
                        </div>
                        <span className="pr-1 text-cream/40 transition-colors group-hover:text-gold" aria-hidden>→</span>
                      </Link>
                    </StaggerItem>
                  ))}
                </Stagger>
              </div>
            )}
          </div>
          <Link to="/music" className="mt-8 inline-block text-sm font-semibold text-gold hover:underline sm:hidden">All artists →</Link>
        </Container>
      </section>

      {headlines.length > 0 && (
        <section className="bg-cream py-16 sm:py-20">
          <Container size="wide">
            <div className="flex items-end justify-between gap-4">
              <Reveal><SectionHeading kicker="The Oguaa Newsroom" title="Latest headlines" accentClass="bg-green" /></Reveal>
              <Link to="/news" className="hidden shrink-0 text-sm font-semibold text-green hover:underline sm:inline">All the news →</Link>
            </div>
            <Stagger className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {headlines.map((a, i) => <StaggerItem key={a.id} lift className={i === 0 ? "sm:col-span-2 lg:col-span-1" : ""}><NewsCard article={a} lead={i === 0} /></StaggerItem>)}
            </Stagger>
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
              <Reveal>
                <Eyebrow className="text-teal-text">The working city · open for trade</Eyebrow>
                <h2 className="mt-2 text-4xl font-semibold leading-[1.05] text-ink sm:text-5xl">
                  Featured <span className="text-teal-text">businesses</span>
                </h2>
                <p className="mt-3 max-w-xl text-ink-muted">The markets, kitchens and trades that keep Oguaa moving — front and centre.</p>
              </Reveal>
              <Link to="/business" className="hidden shrink-0 text-sm font-semibold text-teal-text hover:underline sm:inline">All businesses →</Link>
            </div>
            <div className="mt-10 grid gap-6 lg:grid-cols-3">
              <div className={showcase.length > 1 ? "lg:col-span-2" : "lg:col-span-3"}>
                <Reveal3D><FeaturedCard listing={showcase[0]} hero index={0} /></Reveal3D>
              </div>
              {showcase.length > 1 && (
                <Stagger className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1">
                  {showcase.slice(1, 3).map((b, i) => <StaggerItem key={b.id}><FeaturedCard listing={b} index={i + 1} /></StaggerItem>)}
                </Stagger>
              )}
            </div>
            <div className="mt-10 text-center sm:hidden">
              <Cta to="/business" variant="primary">All businesses →</Cta>
            </div>
          </Container>
        </section>
      )}

      {businesses.length > 0 && (
        <section className="bg-green/[0.04] py-16 sm:py-20">
          <Container size="wide">
            <Reveal>
              <Eyebrow className="text-teal-text">Trade in Oguaa · the working city</Eyebrow>
              <h2 className="mt-2 text-3xl font-semibold text-ink sm:text-4xl">Find a <span className="text-teal-text">local business</span></h2>
              <p className="mt-2 text-sm text-ink-muted">Markets, kitchens, services and makers — all from Cape Coast.</p>
            </Reveal>
            <div className="mt-5 flex flex-wrap gap-2">
              {TRADE_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setTradeCategory(tradeCategory === cat ? null : cat)}
                  className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${tradeCategory === cat ? "border-teal bg-teal text-cream" : "border-sand bg-cream text-ink-muted hover:border-teal hover:text-teal-text"}`}
                >
                  {cat}
                </button>
              ))}
            </div>
            {tradeBiz.length > 0 ? (
              <Stagger className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {tradeBiz.map((b, i) => <StaggerItem key={b.id}><FeaturedCard listing={b} index={i} /></StaggerItem>)}
              </Stagger>
            ) : (
              <p className="mt-8 text-sm text-ink-faint">No businesses listed in that category yet — <Link to="/submit" className="font-medium text-teal-text hover:underline">be the first</Link>.</p>
            )}
            <div className="mt-8 text-center">
              <Cta to="/business" variant="outline">Browse all businesses →</Cta>
            </div>
          </Container>
        </section>
      )}

      <section className="bg-cream py-16">
        <Container size="wide">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div className="text-center lg:text-left">
              <SymbolDivider name="crab" className="lg:mx-0" />
              <Reveal as="h2" className="mt-6 text-3xl font-semibold text-ink sm:text-4xl">The town that began as a market</Reveal>
              <Reveal as="p" delay={0.08} className="mt-5 text-left font-serif text-lg leading-relaxed text-ink">{ABOUT_OGUAA}</Reveal>
            </div>
            <Reveal delay={0.1} className="grid grid-cols-2 gap-4">
              <img src="/uploads/seed/market-women.jpg" alt="Traders at the Kotokuraba market" loading="lazy" className="col-span-2 aspect-[16/9] w-full rounded-2xl object-cover shadow-md" />
              <img src="/uploads/seed/downtown.jpg" alt="A Cape Coast street" loading="lazy" className="aspect-square w-full rounded-2xl object-cover shadow-md" />
              <img src="/uploads/seed/kenkey-fish.jpg" alt="Fante kenkey with fresh fish" loading="lazy" className="aspect-square w-full rounded-2xl object-cover shadow-md" />
            </Reveal>
          </div>
        </Container>
      </section>

      <section className="py-16 sm:py-20">
        <Container size="wide">
          <Reveal><SectionHeading kicker="Every corner of the town" title="Explore Oguaa" lede="One platform, many rooms. Ship a few deep, fill the rest as the community brings them to life." accentClass="bg-green" /></Reveal>
          <Stagger className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SHOWCASE_SECTIONS.map((s) => <StaggerItem key={s.id}><SectionCard section={s} /></StaggerItem>)}
          </Stagger>
        </Container>
      </section>

      <section className="bg-cream py-16 sm:py-20">
        <Container size="wide">
          <div className="grid gap-12 lg:grid-cols-[1.3fr_1fr]">
            <div>
              <Reveal><SectionHeading kicker="Anchored on Fetu Afahye" title="What's coming up" accentClass="bg-gold-brand" /></Reveal>
              <Stagger className="mt-8 grid grid-cols-1 gap-4">{events.map((e) => <StaggerItem key={e.id} lift><EventCard event={e} /></StaggerItem>)}</Stagger>
              <Link to="/events" className="mt-6 inline-block text-sm font-semibold text-gold-text hover:underline">Full calendar →</Link>
            </div>
            <div>
              <Reveal><SectionHeading kicker="Yɛnkae · In Memoriam" title="We keep them" accentClass="bg-gold-brand" /></Reveal>
              <p className="mt-5 text-sm leading-relaxed text-ink-muted">A permanent, dignified home for those who have passed. Light a candle, leave a tribute, and remember together each year.</p>
              <div className="mt-6">{memorial && <Reveal3D><MemorialCard memorial={memorial} /></Reveal3D>}</div>
              <Link to="/memoriam" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-gold-text hover:underline">
                <Adinkra name="nyame-nwu-na-mawu" size={16} labelled={false} className="text-gold-brand" />Enter Yɛnkae →
              </Link>
            </div>
          </div>
        </Container>
      </section>

      <section className="on-dark bg-green py-16 text-cream">
        <Container size="narrow" className="text-center">
          <Reveal>
            <Adinkra name="funtunfunefu" size={36} className="mx-auto text-gold" />
            <h2 className="mt-5 text-3xl font-semibold sm:text-4xl">Rep your town. Rep your school.</h2>
            <p className="mx-auto mt-4 max-w-xl text-cream/80">Create your profile, share a memory, nominate an artist, list your business, or honour someone you love. The community is a participant, not an audience.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Cta to="/community" variant="gold">Join Oguaa</Cta>
              <Cta to="/submit" variant="outline-dark">Submit a listing</Cta>
            </div>
          </Reveal>
        </Container>
      </section>

      <Container><SampleNote>{SAMPLE_NOTICE}</SampleNote></Container>
    </>
  );
}
