import { useState } from "react";
import { Link, useLoaderData } from "react-router-dom";
import { usePageTitle } from "@/lib/use-page-title";
import type { Member } from "@/lib/types";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHero } from "@/components/page-hero";
import { Avatar, Container, CTA as Cta, SampleNote } from "@/components/ui";
import { Adinkra } from "@/components/adinkra";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { LoadMore } from "@/components/pagination";
import { SAMPLE_NOTICE } from "@/lib/content";

const DIASPORA_PAGE = 12;
const ALL_COUNTRIES = "all";

// The diaspora register (spec §4/§5/§15, Phase 2): sons & daughters who have
// opted in as living away from Oguaa — "abroad" includes elsewhere in Ghana.

interface CountryGroup {
  country: string;
  cities: number;
  members: Member[];
}

function groupByCountry(members: Member[]): CountryGroup[] {
  const byCountry = new Map<string, Member[]>();
  for (const member of members) {
    const country = member.diaspora?.country?.trim() || "Elsewhere";
    byCountry.set(country, [...(byCountry.get(country) ?? []), member]);
  }
  return [...byCountry.entries()]
    .map(([country, countryMembers]) => ({
      country,
      cities: new Set(countryMembers.map((member) => (member.diaspora?.city ?? "").trim()).filter(Boolean)).size,
      members: countryMembers,
    }))
    .sort((a, b) => b.members.length - a.members.length || a.country.localeCompare(b.country));
}

function countryAnchor(country: string): string {
  const slug = country.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return "country-" + (slug || "elsewhere");
}

function memberMatches(member: Member, query: string): boolean {
  const haystack = [
    member.displayName,
    member.bio,
    member.diaspora?.city,
    member.diaspora?.country,
  ].filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(query);
}

function visibleGroups(groups: CountryGroup[], budget: number): Array<CountryGroup & { shown: Member[] }> {
  let remaining = budget;
  return groups
    .map((group) => {
      const shown = group.members.slice(0, Math.max(0, remaining));
      remaining -= shown.length;
      return { ...group, shown };
    })
    .filter((group) => group.shown.length > 0);
}

export async function loader(): Promise<{ members: Member[] }> {
  return { members: await api.diaspora() };
}

function JoinCta() {
  const { member } = useAuth();
  if (member?.diaspora?.abroad) {
    return <Cta to="/me" variant="gold">You're on the register — update your details</Cta>;
  }
  if (member) {
    return <Cta to="/me" variant="gold">Add yourself from your profile</Cta>;
  }
  return <Cta to="/signin" variant="gold">Sign in to join the register</Cta>;
}

function DiasporaPerson({ member }: Readonly<{ member: Member }>) {
  const city = member.diaspora?.city?.trim() ?? "";
  const country = member.diaspora?.country?.trim() ?? "";
  const where = [city, country].filter(Boolean).join(", ");

  return (
    <Link
      to={"/members/" + member.slug}
      className="group grid h-full grid-cols-[3.25rem_minmax(0,1fr)] gap-4 border-b border-sand px-1 py-5 transition-colors hover:border-gold-border hover:bg-gold/[0.04] sm:px-3"
    >
      <Avatar initials={member.initials} photoUrl={member.photoUrl} size={52} className="border border-sand" />
      <span className="min-w-0">
        <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span className="font-semibold text-ink transition-colors group-hover:text-gold-text">{member.displayName}</span>
          {where && <span className="text-xs font-semibold uppercase tracking-wide text-gold-text">{where}</span>}
        </span>
        {member.bio && <span className="mt-1.5 line-clamp-2 block text-sm leading-relaxed text-ink-muted">{member.bio}</span>}
        <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-green-text opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          View profile <span aria-hidden>→</span>
        </span>
      </span>
    </Link>
  );
}

export function Component() {
  const { members } = useLoaderData() as { members: Member[] };
  usePageTitle("Oguaa Diaspora");
  const groups = groupByCountry(members);
  const cityCount = groups.reduce((total, group) => total + group.cities, 0);
  const [visibleCount, setVisibleCount] = useState(DIASPORA_PAGE);
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState(ALL_COUNTRIES);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredGroups = groups
    .filter((group) => country === ALL_COUNTRIES || group.country === country)
    .map((group) => {
      const matchedMembers = normalizedQuery ? group.members.filter((member) => memberMatches(member, normalizedQuery)) : group.members;
      return {
        ...group,
        cities: new Set(matchedMembers.map((member) => member.diaspora?.city?.trim()).filter(Boolean)).size,
        members: matchedMembers,
      };
    })
    .filter((group) => group.members.length > 0);
  const filteredTotal = filteredGroups.reduce((total, group) => total + group.members.length, 0);
  const shownGroups = visibleGroups(filteredGroups, visibleCount);
  const shownTotal = shownGroups.reduce((total, group) => total + group.shown.length, 0);

  function clearFilters() {
    setQuery("");
    setCountry(ALL_COUNTRIES);
  }

  return (
    <article>
      <PageHero
        tone="gold"
        kicker="Oguaa abroad · the diaspora register"
        title="Sons & daughters, everywhere."
        fanteName="Abɔkyirfoɔ"
        symbol="sankofa"
        image="/uploads/seed/elmina-pano.jpg"
        lede="The register of Cape Coasters living away from home — across the world and across Ghana. Sankofa: the bridge for homecomings, projects, and the doors we open for the young."
      >
        <div className="flex flex-wrap gap-3">
          <JoinCta />
          <Cta to="/visit" variant="outline-dark">Plan a return home</Cta>
        </div>
      </PageHero>

      {members.length > 0 && (
        <section className="border-b border-sand bg-cream" aria-label="Register summary">
          <Container size="wide" className="grid lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-stretch">
            <dl className="grid grid-cols-3 divide-x divide-sand py-5 lg:max-w-2xl">
              <Stat value={String(members.length)} label="people" />
              <Stat value={String(groups.length)} label={groups.length === 1 ? "country" : "countries"} />
              <Stat value={String(cityCount)} label={cityCount === 1 ? "city" : "cities"} />
            </dl>
            <div className="flex items-center gap-3 border-t border-sand py-4 lg:border-l lg:border-t-0 lg:pl-7">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green/[0.08] text-green-text" aria-hidden>
                <PrivacyIcon />
              </span>
              <p className="text-xs leading-relaxed text-ink-muted"><strong className="text-ink">Opt-in and privacy-first.</strong> Phone and email stay private. Elsewhere in Ghana counts too.</p>
            </div>
          </Container>
        </section>
      )}

      <Container size="wide" className="py-12 lg:py-16">
        {groups.length === 0 ? (
          <Reveal className="mx-auto max-w-3xl border-y border-dashed border-gold-border/50 py-14 text-center">
            <Adinkra name="sankofa" size={44} className="mx-auto text-gold-brand" />
            <h2 className="mt-5 text-3xl font-semibold text-ink">The register is open</h2>
            <p className="mx-auto mt-3 max-w-lg text-ink-muted">Be the first son or daughter abroad on it — homecomings, projects and mentorship start with knowing where we all are.</p>
            <div className="mt-7"><JoinCta /></div>
          </Reveal>
        ) : (
          <div className="grid gap-10 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-14">
            <aside className="lg:sticky lg:top-24 lg:self-start">
              <p className="eyebrow text-gold-text">The living atlas</p>
              <h2 className="mt-3 text-3xl font-semibold text-ink">Find our people</h2>
              <p className="mt-3 text-sm leading-relaxed text-ink-muted">Search the voluntary public register by name, city, country, or the story someone chose to share.</p>

              <label className="mt-6 block">
                <span className="sr-only">Search the diaspora register</span>
                <span className="flex items-center gap-2 rounded-full border border-sand bg-cream px-4 py-2.5 focus-within:border-gold-border">
                  <SearchIcon />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Name or place"
                    className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
                  />
                </span>
              </label>

              <div className="mt-6">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-ink-faint">Country</p>
                <div className="mt-3 flex gap-2 overflow-x-auto pb-2 lg:max-h-[calc(100vh-18rem)] lg:flex-col lg:overflow-x-visible lg:overflow-y-auto lg:pr-1">
                  <CountryButton label="All places" count={members.length} selected={country === ALL_COUNTRIES} onClick={() => setCountry(ALL_COUNTRIES)} />
                  {groups.map((group) => (
                    <CountryButton key={group.country} label={group.country} count={group.members.length} selected={country === group.country} onClick={() => setCountry(group.country)} />
                  ))}
                </div>
              </div>

              {(query || country !== ALL_COUNTRIES) && (
                <button type="button" onClick={clearFilters} className="mt-3 text-sm font-semibold text-clay-text hover:underline">Clear filters</button>
              )}
            </aside>

            <div className="min-w-0">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-sand pb-4">
                <div>
                  <p className="eyebrow text-green-text">Public register</p>
                  <h2 className="mt-2 text-3xl font-semibold text-ink">Across borders, still Oguaa</h2>
                </div>
                <p className="text-sm text-ink-muted" aria-live="polite">Showing <strong className="text-ink">{Math.min(shownTotal, filteredTotal)}</strong> of <strong className="text-ink">{filteredTotal}</strong></p>
              </div>

              {shownGroups.length > 0 ? (
                <div>
                  {shownGroups.map((group) => (
                    <section key={group.country} id={countryAnchor(group.country)} className="scroll-mt-28 border-b border-sand py-9 last:border-b-0">
                      <Reveal className="grid gap-5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-8">
                        <header>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-text">{group.country === "Ghana" ? "Away, never far" : group.cities + (group.cities === 1 ? " city" : " cities")}</p>
                          <h2 className="mt-2 text-3xl font-semibold text-ink">{group.country}</h2>
                          <p className="mt-2 text-sm text-ink-muted">{group.members.length} {group.members.length === 1 ? "person" : "people"}</p>
                        </header>
                        <Stagger as="ul" className="grid gap-x-6 sm:grid-cols-2">
                          {group.shown.map((member, index) => (
                            <StaggerItem as="li" key={member.id} index={index}><DiasporaPerson member={member} /></StaggerItem>
                          ))}
                        </Stagger>
                      </Reveal>
                    </section>
                  ))}
                  <LoadMore hasMore={shownTotal < filteredTotal} remaining={filteredTotal - shownTotal} onClick={() => setVisibleCount((count) => count + DIASPORA_PAGE)} label="More of the register" />
                </div>
              ) : (
                <div className="border-b border-dashed border-sand py-16 text-center">
                  <SearchIcon size={32} className="mx-auto text-gold-text" />
                  <h2 className="mt-4 text-2xl font-semibold text-ink">No public profiles match</h2>
                  <p className="mt-2 text-ink-muted">Try another name or place. Only people who opted in appear here.</p>
                  <button type="button" onClick={clearFilters} className="mt-5 rounded-full border border-green/30 px-5 py-2 text-sm font-semibold text-green-text hover:border-green">Show everyone</button>
                </div>
              )}
            </div>
          </div>
        )}
      </Container>

      <section className="border-y border-sand bg-cream py-12 lg:py-16">
        <Container size="wide">
          <Reveal className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-end">
            <div>
              <p className="eyebrow text-gold-text">The bridge works both ways</p>
              <h2 className="mt-3 text-3xl font-semibold text-ink sm:text-4xl">What the register feeds</h2>
            </div>
            <p className="max-w-2xl text-ink-muted">Knowing where our people are is how the homecoming, the funding and the mentorship actually happen.</p>
          </Reveal>

          <Stagger as="ol" className="mt-9 divide-y divide-sand border-y border-sand sm:grid sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <BridgeItem number="01" title="Come home for Afahye" body="Fetu Afahye is the annual homecoming beat — the first Saturday of September, every year, no matter where you live." to="/festivals" action="The festival archive" />
            <BridgeItem number="02" title="Back a project" body="Adopt-a-project lets the diaspora fund classrooms, boreholes and sea walls back home — openly, pesewa by pesewa." to="/projects" action="See the projects" />
            <StaggerItem as="li" className="px-1 py-7 sm:px-7">
              <p className="text-xs font-semibold tabular-nums text-gold-text">03</p>
              <h3 className="mt-4 text-xl font-semibold text-ink">Mentor the young</h3>
              <p className="mt-3 text-sm leading-relaxed text-ink-muted">Alumni and diaspora mentoring the next generation — launching once the safeguarding policy, vetting and guardian consent are in place.</p>
              <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-ink-faint">Coming with safeguards</p>
            </StaggerItem>
          </Stagger>
        </Container>
      </section>

      <section className="on-dark on-dark-pin relative overflow-hidden bg-green py-16 text-cream">
        <div className="bg-dotgrid absolute inset-0 opacity-30" aria-hidden />
        <Container size="narrow" className="relative text-center">
          <Adinkra name="sankofa" size={38} className="mx-auto text-gold" />
          <h2 className="mt-5 text-3xl font-semibold text-cream sm:text-4xl">Wherever you are, Oguaa keeps your name</h2>
          <p className="mx-auto mt-4 max-w-xl text-cream/80">Joining is opt-in and takes a minute. Your phone and email stay private; the register only shows the profile details you choose to share.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <JoinCta />
            <Cta to="/visit" variant="outline-dark">Plan the trip home</Cta>
          </div>
        </Container>
      </section>

      <Container><SampleNote>{SAMPLE_NOTICE}</SampleNote></Container>
    </article>
  );
}

function Stat({ value, label }: Readonly<{ value: string; label: string }>) {
  return (
    <div className="flex flex-col px-3 text-center sm:px-6 sm:text-left">
      <dt className="order-2 mt-0.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">{label}</dt>
      <dd className="order-1 text-3xl font-semibold tabular-nums text-gold-text">{value}</dd>
    </div>
  );
}

function CountryButton({ label, count, selected, onClick }: Readonly<{ label: string; count: number; selected: boolean; onClick: () => void }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={selected
        ? "flex shrink-0 items-center justify-between gap-5 rounded-full bg-green px-4 py-2 text-left text-sm font-semibold text-on-green lg:w-full"
        : "flex shrink-0 items-center justify-between gap-5 rounded-full border border-sand bg-cream px-4 py-2 text-left text-sm font-medium text-ink-muted transition-colors hover:border-gold-border hover:text-ink lg:w-full"}
    >
      <span>{label}</span>
      <span className={selected ? "text-xs tabular-nums text-gold" : "text-xs tabular-nums text-ink-faint"}>{count}</span>
    </button>
  );
}

function BridgeItem({ number, title, body, to, action }: Readonly<{ number: string; title: string; body: string; to: string; action: string }>) {
  return (
    <StaggerItem as="li" className="px-1 py-7 sm:px-7">
      <Link to={to} className="group block h-full">
        <p className="text-xs font-semibold tabular-nums text-gold-text">{number}</p>
        <h3 className="mt-4 text-xl font-semibold text-ink transition-colors group-hover:text-gold-text">{title}</h3>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">{body}</p>
        <p className="mt-5 text-sm font-semibold text-gold-text">{action} <span className="inline-block transition-transform group-hover:translate-x-1" aria-hidden>→</span></p>
      </Link>
    </StaggerItem>
  );
}

function SearchIcon({ size = 18, className = "text-ink-faint" }: Readonly<{ size?: number; className?: string }>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className={className} aria-hidden>
      <circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" />
    </svg>
  );
}

function PrivacyIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3 5 6v5c0 4.8 2.8 8.1 7 10 4.2-1.9 7-5.2 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" />
    </svg>
  );
}
