import { Link, useLoaderData } from "react-router-dom";
import { usePageTitle } from "@/lib/use-page-title";
import type { Member } from "@/lib/types";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHero } from "@/components/page-hero";
import { Container, CTA as Cta, SectionHeading, SampleNote } from "@/components/ui";
import { Adinkra } from "@/components/adinkra";
import { Reveal, StaggerItem } from "@/components/motion";
import { SAMPLE_NOTICE } from "@/lib/content";

// The diaspora register (spec §4/§5/§15, Phase 2): sons & daughters who have
// opted in as living away from Oguaa — "abroad" includes elsewhere in Ghana.

interface CountryGroup {
  country: string;
  cities: number;
  members: Member[];
}

function groupByCountry(members: Member[]): CountryGroup[] {
  const byCountry = new Map<string, Member[]>();
  for (const m of members) {
    const country = m.diaspora?.country?.trim() || "Elsewhere";
    byCountry.set(country, [...(byCountry.get(country) ?? []), m]);
  }
  return [...byCountry.entries()]
    .map(([country, ms]) => ({
      country,
      cities: new Set(ms.map((m) => (m.diaspora?.city ?? "").trim()).filter(Boolean)).size,
      members: ms,
    }))
    .sort((a, b) => b.members.length - a.members.length || a.country.localeCompare(b.country));
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
    return <Cta to="/me" variant="gold">Add yourself — the “Oguaa abroad” panel on your profile</Cta>;
  }
  return <Cta to="/signin" variant="gold">Sign in to join the register</Cta>;
}

function DiasporaCard({ member }: Readonly<{ member: Member }>) {
  const city = member.diaspora?.city?.trim() ?? "";
  const country = member.diaspora?.country?.trim() ?? "";
  const where = [city, country].filter(Boolean).join(", ");
  return (
    <Link
      to={`/members/${member.slug}`}
      className="group flex h-full items-start gap-4 rounded-2xl border border-ink/10 bg-white p-5 shadow-sm transition hover:border-gold-brand hover:shadow-md"
    >
      {member.photoUrl ? (
        <img src={member.photoUrl} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-full border border-ink/10 object-cover" />
      ) : (
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-green text-lg font-semibold text-on-green">{member.initials}</span>
      )}
      <span className="min-w-0">
        <span className="block font-semibold text-ink group-hover:underline">{member.displayName}</span>
        {where && <span className="block text-sm font-medium text-gold-text">{where}</span>}
        {member.bio && <span className="mt-1.5 line-clamp-2 block text-sm leading-relaxed text-ink-muted">{member.bio}</span>}
      </span>
    </Link>
  );
}

export function Component() {
  const { members } = useLoaderData() as { members: Member[] };
  usePageTitle("Oguaa Diaspora");
  const groups = groupByCountry(members);
  const cityCount = groups.reduce((n, g) => n + g.cities, 0);

  return (
    <>
      <PageHero
        tone="gold"
        kicker="Oguaa abroad · the diaspora register"
        title="Sons & daughters, everywhere."
        fanteName="Abɔkyirfoɔ"
        symbol="sankofa"
        image="/uploads/seed/elmina-pano.jpg"
        lede="The register of Cape Coasters living away from home — across the world and across Ghana. Sankofa: the bridge for homecomings, projects, and the doors we open for the young."
      />

      {members.length > 0 && (
        <div className="border-b border-ink/10 bg-cream">
          <Container size="wide" className="flex flex-wrap items-center gap-x-8 gap-y-2 py-5">
            <p className="text-sm font-semibold tracking-wide text-ink">
              <span className="text-2xl font-bold text-gold-text">{members.length}</span> on the register
            </p>
            <p className="text-sm text-ink-muted"><span className="font-semibold text-ink">{groups.length}</span> {groups.length === 1 ? "country" : "countries"}</p>
            <p className="text-sm text-ink-muted"><span className="font-semibold text-ink">{cityCount}</span> {cityCount === 1 ? "city" : "cities"}</p>
            <p className="ml-auto hidden text-xs text-ink-faint sm:block">Opt-in only — add yourself from your profile. Elsewhere in Ghana counts too.</p>
          </Container>
        </div>
      )}

      <Container size="wide" className="py-12">
        {groups.length === 0 ? (
          <Reveal className="rounded-3xl border border-dashed border-gold-brand/50 bg-cream p-10 text-center">
            <Adinkra name="sankofa" size={40} className="mx-auto text-gold-brand" />
            <h2 className="mt-4 text-2xl font-semibold text-ink">The register is open</h2>
            <p className="mx-auto mt-3 max-w-md text-ink-muted">Be the first son or daughter abroad on it — homecomings, projects and mentorship start with knowing where we all are.</p>
            <div className="mt-6"><JoinCta /></div>
          </Reveal>
        ) : (
          groups.map((g) => (
            <section key={g.country} className="mb-12 last:mb-0">
              <Reveal>
                <SectionHeading
                  kicker={g.country === "Ghana" ? "Elsewhere in Ghana — away, never far" : `${g.members.length} ${g.members.length === 1 ? "son or daughter" : "sons & daughters"}`}
                  title={g.country}
                  accentClass="bg-gold-brand"
                />
              </Reveal>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {g.members.map((m, i) => (
                  <StaggerItem key={m.id} index={i} lift><DiasporaCard member={m} /></StaggerItem>
                ))}
              </div>
            </section>
          ))
        )}
      </Container>

      <section className="bg-cream py-12">
        <Container size="wide">
          <Reveal><SectionHeading kicker="The bridge works both ways" title="What the register feeds" lede="Knowing where our people are is how the homecoming, the funding and the mentorship actually happen." accentClass="bg-gold-brand" /></Reveal>
          <div className="mt-8 grid gap-5 sm:grid-cols-3">
            <StaggerItem index={0} lift>
              <Link to="/festivals" className="block h-full rounded-2xl border border-ink/10 bg-white p-6 shadow-sm transition hover:border-gold-brand hover:shadow-md">
                <p className="font-semibold text-ink">Come home for Afahye</p>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">Fetu Afahye is the annual homecoming beat — the first Saturday of September, every year, no matter where you live.</p>
                <p className="mt-3 text-sm font-semibold text-gold-text">The festival archive →</p>
              </Link>
            </StaggerItem>
            <StaggerItem index={1} lift>
              <Link to="/projects" className="block h-full rounded-2xl border border-ink/10 bg-white p-6 shadow-sm transition hover:border-gold-brand hover:shadow-md">
                <p className="font-semibold text-ink">Back a project</p>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">Adopt-a-project lets the diaspora fund the classrooms, boreholes and sea walls back home — openly, pesewa by pesewa.</p>
                <p className="mt-3 text-sm font-semibold text-gold-text">See the projects →</p>
              </Link>
            </StaggerItem>
            <StaggerItem index={2} lift>
              <div className="flex h-full flex-col rounded-2xl border border-dashed border-ink/15 bg-white/60 p-6">
                <p className="font-semibold text-ink">Mentor the young</p>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">Alumni and diaspora mentoring the next generation — launching once the safeguarding policy, vetting and guardian consent are in place.</p>
                <p className="mt-auto pt-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">Coming with safeguards</p>
              </div>
            </StaggerItem>
          </div>
        </Container>
      </section>

      <section className="on-dark on-dark-pin bg-green py-16 text-cream">
        <Container size="narrow" className="text-center">
          <Adinkra name="sankofa" size={36} className="mx-auto text-gold" />
          <h2 className="mt-5 text-3xl font-semibold sm:text-4xl">Wherever you are, Oguaa keeps your name</h2>
          <p className="mx-auto mt-4 max-w-xl text-cream/80">Joining the register is opt-in and takes a minute — it is how the town finds you for homecomings, projects and the doors we open together. Your phone stays private; only what you choose to show is shown.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <JoinCta />
            <Cta to="/visit" variant="outline-dark">Plan the trip home</Cta>
          </div>
        </Container>
      </section>

      <Container><SampleNote>{SAMPLE_NOTICE}</SampleNote></Container>
    </>
  );
}
