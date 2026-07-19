import { useState } from "react";
import { Link, useLoaderData } from "react-router-dom";
import { usePageTitle } from "@/lib/use-page-title";
import type { HomeData, NewsArticle, Listing, CivicData, CivicBehaviour, Goal } from "@/lib/types";
import { api } from "@/lib/api";
import { GoalBanner } from "@/components/goals";
import { Container, CTA as Cta, Eyebrow, SectionHeading, SampleNote } from "@/components/ui";
import { Adinkra, SymbolDivider } from "@/components/adinkra";
import { Thumb, EventCard, SectionCard, MemorialCard, NewsCard, FeaturedCard } from "@/components/cards";
import { CircularReveal, Magnetic, Parallax, Reveal, Reveal3D, Stagger, StaggerItem, WordReveal } from "@/components/motion";
import { SHOWCASE_SECTIONS } from "@/lib/sections";
import { ABOUT_OGUAA, SAMPLE_NOTICE } from "@/lib/content";
import { cldCover, mediaUrl } from "@/lib/cloudinary";
import { initials } from "@/lib/format";

type HomeLoaderData = HomeData & { news: NewsArticle[]; businesses: Listing[]; featured: Listing[]; civic: CivicData; goals: Goal[] };

// The /api/home payload is intentionally lean; the homepage also surfaces the
// latest headlines, paid featured placements, featured trade, and the civic
// code ("Build a better Oguaa"), so we fan those in alongside it. All are
// non-critical — a failure still renders the page.
export async function loader(): Promise<HomeLoaderData> {
  const [home, news, businesses, featured, civic, goals] = await Promise.all([
    api.home(),
    api.news().catch(() => [] as NewsArticle[]),
    api.businesses().catch(() => [] as Listing[]),
    api.featured().catch(() => [] as Listing[]),
    api.civic().catch(() => ({ behaviors: [], civilizations: [] } as CivicData)),
    api.goals().catch(() => [] as Goal[]),
  ]);
  return { ...home, news, businesses, featured, civic, goals };
}

const TRADE_CATEGORIES = ["Food & Drink", "Fashion", "Tech", "Health", "Services", "Crafts", "Education"] as const;

// ── "Build a better Oguaa" — the flagship civic band ────────────────────────
// A prominent homepage tease of the town's civic code (GET /api/civic): a few
// live DO/STOP behaviours, the pledge idea, and a strong CTA to /better. The
// green stage matches the /better hero; the behaviour cards reuse that page's
// DO = green/check, STOP = clay/slash language on light theme-surface cards so
// the colour coding stays legible in both light and dark themes.
const CIVIC_GRADIENT = "linear-gradient(140deg, #1B5A3F 0%, #123F2D 55%, #0C2C1F 100%)";
const CIVIC_PREVIEW_SLUGS = ["read-off-screen", "save-monthly", "stop-scrolling", "do-not-litter"] as const;

function civicPreview(behaviors: CivicBehaviour[]): CivicBehaviour[] {
  const selected = CIVIC_PREVIEW_SLUGS
    .map((slug) => behaviors.find((behavior) => behavior.slug === slug))
    .filter((behavior): behavior is CivicBehaviour => Boolean(behavior));
  const selectedSlugs = new Set(selected.map((behavior) => behavior.slug));

  for (const type of ["do", "stop"] as const) {
    const needed = 2 - selected.filter((behavior) => behavior.type === type).length;
    const fallbacks = behaviors
      .filter((behavior) => behavior.type === type && !selectedSlugs.has(behavior.slug))
      .slice(0, Math.max(0, needed));
    selected.push(...fallbacks);
    fallbacks.forEach((behavior) => selectedSlugs.add(behavior.slug));
  }

  return selected.slice(0, 4);
}

function CivicGlyph({ type }: Readonly<{ type: "do" | "stop" }>) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {type === "do" ? <path d="M20 6 9 17l-5-5" /> : <><circle cx="12" cy="12" r="9" /><path d="m6 6 12 12" /></>}
    </svg>
  );
}

function CivicLedgerRow({ b }: Readonly<{ b: CivicBehaviour }>) {
  const isDo = b.type === "do";
  const badge = isDo ? "bg-green/[0.09] text-green-text" : "bg-clay/[0.10] text-clay-text";
  const label = isDo ? "text-green-text" : "text-clay-text";
  return (
    <StaggerItem
      as="li"
      className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 gap-y-2 border-b border-sand px-5 py-5 text-left last:border-b-0 sm:grid-cols-[3rem_minmax(0,1fr)] sm:px-7 sm:py-6 xl:min-h-[9.5rem] xl:grid-cols-[3rem_7.5rem_minmax(0,0.9fr)_minmax(0,1.2fr)] xl:items-start xl:gap-x-5 xl:gap-y-0 xl:px-7 xl:py-7"
    >
      <span className={`row-span-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full sm:h-12 sm:w-12 xl:row-span-1 ${badge}`}>
        <CivicGlyph type={b.type} />
      </span>
      <span className={`self-center text-[0.62rem] font-bold uppercase tracking-[0.16em] xl:self-start xl:pt-4 ${label}`}>
        {isDo ? "Do this" : "Stop this"}
      </span>
      <h3 className="col-start-2 text-base font-semibold leading-snug text-ink xl:col-start-auto xl:pt-3">{b.title}</h3>
      <p className="col-start-2 text-sm leading-relaxed text-ink-muted xl:col-start-auto xl:pt-2">{b.description}</p>
    </StaggerItem>
  );
}

function TownCode({ civic }: Readonly<{ civic: CivicData }>) {
  const { behaviors } = civic;
  const doCount = behaviors.filter((b) => b.type === "do").length;
  const stopCount = behaviors.filter((b) => b.type === "stop").length;
  // Tease a stable editorial slice while still reading every row from the API.
  // The fallback preserves the two-to-keep / two-to-drop balance if authored
  // slugs change in a future seed.
  const preview = civicPreview(behaviors);

  return (
    <section aria-labelledby="town-code-heading" className="on-dark on-dark-pin relative overflow-hidden text-cream" style={{ background: CIVIC_GRADIENT }}>
      <div className="bg-dotgrid absolute inset-0 opacity-35" aria-hidden />
      <Parallax strength={18} className="pointer-events-none absolute -bottom-24 -left-20 hidden text-gold sm:block">
        <Adinkra name="adinkrahene" size={360} labelled={false} className="opacity-[0.08]" />
      </Parallax>
      <div className="relative mx-auto w-full max-w-[104rem] px-4 py-16 sm:px-6 sm:py-20 lg:py-24">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center xl:gap-16">
          <div className="lg:pr-2">
            <Reveal><Eyebrow className="text-cream/90">The civic revolution · Oguaa</Eyebrow></Reveal>
            <Reveal className="mt-4">
              <h2 id="town-code-heading" className="text-4xl font-semibold leading-[1.02] text-cream sm:text-6xl xl:text-7xl">
                Build a <span className="text-gold">better</span> Oguaa.
              </h2>
            </Reveal>
            <Reveal as="p" delay={0.08} className="mt-6 max-w-[43rem] text-lg leading-[1.65] text-cream/85 xl:text-xl">
              Great towns are built by small daily habits — the litter picked up, the queue kept,
              the elder greeted, the work done well. This is <span className="text-gold">the town&apos;s code</span>:
              the behaviours to keep, and the ones to drop, in the name of a better Cape Coast.
            </Reveal>
            <Reveal delay={0.14} className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
              <Cta to="/better#pledge" variant="gold" className="min-h-12 !rounded-xl px-8">Take the pledge</Cta>
              <Link
                to="/better"
                className="inline-flex items-center gap-2 border-b border-gold/60 pb-1 text-sm font-semibold text-cream transition-colors hover:border-gold hover:text-gold"
              >
                See the town&apos;s code <span aria-hidden>→</span>
              </Link>
            </Reveal>
            {behaviors.length > 0 && (
              <Reveal as="div"
                delay={0.2}
                className="mt-9"
              >
                <dl className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-cream/75">
                  <div className="flex items-baseline gap-1.5">
                    <dt className="order-2">behaviours</dt>
                    <dd className="order-1 text-xl font-semibold text-gold">{behaviors.length}</dd>
                    <span aria-hidden className="order-3 ml-2 text-cream/35">·</span>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <dt className="order-2">to keep</dt>
                    <dd className="order-1 text-xl font-semibold text-[#6ee7d2]">{doCount}</dd>
                    <span aria-hidden className="order-3 ml-2 text-cream/35">·</span>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <dt className="order-2">to drop</dt>
                    <dd className="order-1 text-xl font-semibold text-[#e9a08d]">{stopCount}</dd>
                  </div>
                </dl>
              </Reveal>
            )}
          </div>

          {preview.length > 0 ? (
            <Stagger
              as="ul"
              className="theme-surface m-0 list-none overflow-hidden rounded-[20px] border border-sand bg-paper p-0 text-ink shadow-[var(--shadow-lift)]"
            >
              {preview.map((b) => <CivicLedgerRow key={b.slug} b={b} />)}
            </Stagger>
          ) : (
            <Reveal className="theme-surface rounded-[20px] border border-sand bg-paper p-10 text-center text-ink shadow-[var(--shadow-card)]">
              <Adinkra name="funtunfunefu" size={40} className="mx-auto text-gold-text" />
              <p className="mx-auto mt-4 max-w-sm text-sm text-ink-muted">
                The civic charter is being written. The behaviours that build a better Oguaa are on their way.
              </p>
            </Reveal>
          )}
        </div>
      </div>
    </section>
  );
}

export function Component() {
  const { spotlight, artists, events, memorial, stats, news, businesses, featured, civic, goals } = useLoaderData() as HomeLoaderData;
  usePageTitle(null); // Home uses the site name alone
  const [tradeCategory, setTradeCategory] = useState<string | null>(null);
  const featuredSpots = featured.slice(0, 6);
  const moreArtists = artists.filter((a) => a.id !== spotlight?.id).slice(0, 3);
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
      <section className="on-dark on-dark-pin relative overflow-hidden bg-green text-cream">
        <Parallax strength={28} className="absolute -inset-y-8 inset-x-0">
          <img src={mediaUrl("/uploads/seed/castle-exterior.jpg")} alt="" fetchPriority="high" className="absolute inset-0 h-full w-full object-cover" aria-hidden />
          <div className="bg-dotgrid absolute inset-0 opacity-60" aria-hidden />
          <div className="absolute inset-0" style={{ background: "radial-gradient(120% 120% at 80% -10%, rgba(27,90,63,0.88) 0%, rgba(18,63,45,0.92) 45%, rgba(12,44,31,0.97) 100%)" }} aria-hidden />
          <div className="aurora-bg absolute inset-0" aria-hidden />
        </Parallax>
        <Container className="relative py-20 sm:py-28" size="wide">
          <Stagger className="max-w-3xl">
            <StaggerItem><Eyebrow className="text-gold/90">Cape Coast · Central Region · Ghana</Eyebrow></StaggerItem>
            <div className="mt-4">
              <WordReveal
                text="This is Oguaa."
                accentWords={["Oguaa"]}
                accentClassName="text-gold text-shimmer-gold"
                className="text-5xl font-semibold leading-[1.02] sm:text-7xl"
              />
            </div>
            <StaggerItem>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-cream/85">
                The town that began as a market — the old Gold Coast capital, the Citadel of Education, home of the Asafo and Fetu Afahye. Its music, its people, its memory, gathered in one place. <span className="text-gold">Made by us, for us.</span>
              </p>
            </StaggerItem>
            <StaggerItem>
              <div className="mt-8 flex flex-wrap gap-3">
                <Magnetic>
                  <Cta to="/music" variant="gold">Hear the Oguaa Sound</Cta>
                </Magnetic>
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

      {spotlight && (
      <section className="on-dark on-dark-pin relative overflow-hidden text-cream">
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
              <Eyebrow className="text-cream">Rotating spotlight · the flagship</Eyebrow>
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
      )}

      <GoalBanner goals={goals} />

      <TownCode civic={civic} />

      {headlines.length > 0 && (
        <section className="bg-cream py-16 sm:py-20">
          <Container size="wide">
            <div className="flex items-end justify-between gap-4">
              <Reveal><SectionHeading kicker="The Oguaa Newsroom" title="Latest headlines" accentClass="bg-green" /></Reveal>
              <Link to="/news" className="hidden shrink-0 text-sm font-semibold text-green-text hover:underline sm:inline">All the news →</Link>
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
              <img src={mediaUrl("/uploads/seed/market-women.jpg")} alt="Traders at the Kotokuraba market" loading="lazy" className="col-span-2 aspect-[16/9] w-full rounded-2xl object-cover shadow-md" />
              <img src={mediaUrl("/uploads/seed/downtown.jpg")} alt="A Cape Coast street" loading="lazy" className="aspect-square w-full rounded-2xl object-cover shadow-md" />
              <img src={mediaUrl("/uploads/seed/kenkey-fish.jpg")} alt="Fante kenkey with fresh fish" loading="lazy" className="aspect-square w-full rounded-2xl object-cover shadow-md" />
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

      <section className="on-dark on-dark-pin bg-green py-16 text-cream">
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
