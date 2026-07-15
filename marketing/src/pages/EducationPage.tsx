import { PageHero } from "@/components/page-hero";
import { CollegeScene } from "@/components/scenes";
import { Section, SectionHeading, Card } from "@/components/ui";
import { SymbolDivider } from "@/components/adinkra";
import { LiveCollection } from "@/components/live-collection";
import { Stagger, StaggerItem } from "@/components/motion";
import { OPPORTUNITIES_FALLBACK } from "@/lib/fallbacks";
import { useSchools, SCHOOLS_FALLBACK, schoolInitials, type SchoolOrg } from "@/lib/schools";
import { PORTAL_APP_URL } from "@/config";

interface Alum {
  name: string;
  meta: string;
  body: string;
}

const SCHOOLED: Alum[] = [
  { name: "Kofi Annan", meta: "1938–2018 · Mfantsipim, 1954–57", body: "Seventh UN Secretary-General and 2001 Nobel Peace laureate. Born in Kumasi; he learned at Mfantsipim that suffering anywhere concerns people everywhere." },
  { name: "Jane Naana Opoku-Agyemang", meta: "b. 1951 · Wesley Girls', 1964–71", body: "First female Vice-President of Ghana, and the first woman to be Vice-Chancellor of a Ghanaian public university — the University of Cape Coast itself." },
  { name: "Ama Ata Aidoo", meta: "1942–2023 · Wesley Girls'", body: "Author of Our Sister Killjoy and Anowa; one of Africa's great writers, and a Minister of Education." },
  { name: "Sophia Akuffo", meta: "b. 1949 · Wesley Girls'", body: "13th Chief Justice of Ghana, and a former President of the African Court on Human and Peoples' Rights." },
  { name: "Nii Quaynor", meta: "b. 1947 · Adisadel", body: "A father of the internet in Africa, who built the continent's early connectivity. A Santaclausian." },
  { name: "George Alfred “Paa” Grant", meta: "1878–1956 · Wesleyan School, Cape Coast", body: "Timber magnate who founded and financed the UGCC and paid Nkrumah's passage home. Born in Beyin, schooled here." },
];

/** A small house-colour crest from the school's own colours. */
function SchoolCrest({ school }: Readonly<{ school: SchoolOrg }>) {
  const bg = school.houseColors?.[0] ?? "#123F2D";
  return (
    <span
      className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-sm font-semibold text-cream ring-1 ring-black/10"
      style={{ backgroundColor: bg }}
      aria-hidden
    >
      {schoolInitials(school.name)}
    </span>
  );
}

/** One school, read live from /api/schools — opens its profile in the portal. */
function SchoolCard({ school }: Readonly<{ school: SchoolOrg }>) {
  const meta = [school.founded ? `Est. ${school.founded}` : null, school.classification].filter(Boolean).join(" · ");
  return (
    <a href={`${PORTAL_APP_URL}/education/${school.slug}`} target="_blank" rel="noopener noreferrer" className="group block h-full">
      <Card className="flex h-full gap-5 p-6 transition-shadow duration-300 hover:shadow-[var(--shadow-lift)] sm:p-7">
        <SchoolCrest school={school} />
        <div className="flex min-w-0 flex-1 flex-col">
          <h3 className="text-xl font-semibold text-ink">{school.name}</h3>
          {meta && <p className="mt-1 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-gold-text">{meta}</p>}
          {school.motto && <p className="mt-2 text-base italic text-gold-text">{school.motto}</p>}
          {school.summary && <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-ink-muted">{school.summary}</p>}
          {school.osaName && <p className="mt-auto pt-3 text-xs font-medium text-ink-faint">Old students: {school.osaName}</p>}
        </div>
      </Card>
    </a>
  );
}

export function Component() {
  const schools = useSchools(SCHOOLS_FALLBACK);

  return (
    <>
      <PageHero
        scene={CollegeScene}
        kicker="The cradle of education"
        title="Cape Coast does not boast. It teaches."
        lede="The oldest school in Ghana stands on a hill here. So do the schools that taught a UN Secretary-General, a Chief Justice, a Vice-President, and the mother of Ghanaian theatre. They call this town the Citadel — not for the castle on the shore, but for the classrooms on the hills."
      />

      {/* Why Oguaa */}
      <Section tone="paper" size="wide">
        <SectionHeading
          kicker="WHY OGUAA"
          title="The town that taught a country to teach."
        />
        <p className="mt-8 max-w-3xl font-serif text-lg leading-relaxed text-ink">
          In 1876, on the grounds of Cape Coast Castle, the Methodists opened the Wesleyan High School with a
          handful of boys — the first secondary school in the country. It moved up to Kwabotwe Hill and took
          the name Mfantsipim. Within sixty years the Anglicans, the Catholics and the Methodist mission had
          planted more schools and a university on the hills around it. A boy named Kofi Annan studied here and
          left in 1957, the year Ghana became free, and went on to run the United Nations.
        </p>
      </Section>

      {/* The schools — read LIVE from the platform */}
      <Section tone="cream" size="wide">
        <SectionHeading
          kicker="THE SCHOOLS ON THE HILLS"
          title="The foundations of a town."
          lede="Each with its colours, its motto, and its old students who answer to a name only their school understands — from the oldest school in Ghana to the basic school by the sea."
        />
        <Stagger className="mt-12 grid gap-5 sm:grid-cols-2">
          {schools.map((s, idx) => (
            <StaggerItem key={s.id} index={idx}>
              <SchoolCard school={s} />
            </StaggerItem>
          ))}
        </Stagger>
        <p className="mt-8 text-center text-sm text-ink-faint">
          {schools.length} schools listed — and growing, as each claims its profile in the app.
        </p>
      </Section>

      {/* The rivalry */}
      <Section tone="paper" size="wide">
        <SectionHeading
          kicker="SOUTH-SOUTH COOPERATION"
          title="The Fun Games."
        />
        <p className="mt-8 max-w-3xl font-serif text-lg leading-relaxed text-ink">
          Mfantsipim and Adisadel have argued about who is better since 1910, when the younger school was born.
          In 1992 the old boys turned the quarrel into the Fun Games — an annual football gala run by MOBA and
          the Santaclausians. The argument never ends; nobody gets hurt. One of Ghana's oldest school
          rivalries, played out with full lungs and no malice.
        </p>
      </Section>

      {/* Famous schooled — dark band */}
      <Section tone="deep" size="wide" className="relative overflow-hidden">
        <span aria-hidden className="pointer-events-none absolute inset-0 bg-contours opacity-[0.06]" />
        <div className="relative">
          <SectionHeading
            onDark
            kicker="SCHOOLED IN OGUAA"
            title="Large lives, small classrooms."
            lede="Not all of them were born here. All of them were shaped here."
          />
          <Stagger className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SCHOOLED.map((a, idx) => (
              <StaggerItem key={a.name} index={idx}>
                <div className="flex h-full flex-col rounded-[var(--radius-card)] border border-cream/12 bg-green-900/30 p-6">
                  <h3 className="text-xl font-semibold text-cream">{a.name}</h3>
                  <p className="mt-1 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-gold/80">{a.meta}</p>
                  <p className="mt-3 text-sm leading-relaxed text-cream/75">{a.body}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </Section>

      {/* Mfantsipim at 150 */}
      <Section tone="cream" size="wide">
        <SectionHeading
          kicker="THIS YEAR"
          title="A hundred and fifty years on Kwabotwe Hill."
        />
        <p className="mt-8 max-w-3xl font-serif text-lg leading-relaxed text-ink">
          In 2026 Mfantsipim turns 150. The sesquicentennial runs the length of the year under the banner
          “A Legacy of Excellence, Leadership and Service to Inspire the Future,” with a grand finale set for
          31 October 2026. The marquee events gather in Accra — but the hill, and the story, are Oguaa's.
        </p>
        <SymbolDivider name="adinkrahene" className="mt-12" />
        <p className="mx-auto mt-5 max-w-xl text-center font-serif text-base italic text-ink-muted">
          Dwen hwɛ kan — think and look ahead. After a century and a half, the looking-ahead continues.
        </p>
      </Section>

      <LiveCollection
        kicker="OPEN NOW"
        title="Scholarships & apprenticeships."
        lede="The Old Students networks and institutions of Oguaa are the natural source of mentors and funders for the next generation. Here is what is open, straight from the app."
        endpoint="/api/opportunities"
        fallback={OPPORTUNITIES_FALLBACK}
        cta={{ href: `${PORTAL_APP_URL}/events`, label: "See every opportunity", external: true }}
      />
    </>
  );
}
