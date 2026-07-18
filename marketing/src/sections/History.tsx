import { SymbolDivider } from "@/components/adinkra";
import { Reveal } from "@/components/motion";
import { Section, SectionHeading } from "@/components/ui";
import { mediaUrl } from "@/lib/media";

/**
 * The story of Oguaa — the heart of the marketing site. This page is about Cape
 * Coast first; the platform is only the keeper of this story. Dates are
 * fact-checked (Cape Coast Castle 1653; British Gold Coast capital until 1877;
 * UNESCO World Heritage 1979).
 */

interface Moment {
  year: string;
  title: string;
  text: string;
  sober?: boolean;
}

const TIMELINE = [
  {
    year: "15th c.",
    title: "Kotokuraba — the crab market",
    text: "A Fante fishing and trading settlement grows on the coast around a crab-sellers' market. The name endures: Oguaa, the place of the market.",
  },
  {
    year: "1653",
    title: "Carolusborg rises",
    text: "The Swedes raise a timber lodge named for their king; it grows into Cape Coast Castle and passes through Danish, Dutch and finally British hands — first for gold and timber.",
  },
  {
    year: "17th–19th c.",
    title: "The Door of No Return",
    text: "The castle becomes one of the largest holds of the transatlantic slave trade. We hold this history soberly — it is why Cape Coast is a place of return for the diaspora.",
    sober: true,
  },
  {
    year: "1700s",
    title: "The seven Asafo companies",
    text: "Oguaa's Asafo companies — Bentsir, Anaafo, Ntsin, Nkum, Amanful, Brofomba, Akrampa — take shape as its citizen guard and culture-keepers. Each September, Fetu Afahye gives thanks to the 77 gods of Oguaa.",
  },
  {
    year: "1821–1877",
    title: "Capital of the Gold Coast",
    text: "Cape Coast serves as the British seat of government on the Gold Coast — the colony's first capital — until the seat moves to Accra in 1877.",
  },
  {
    year: "1871",
    title: "The Mankessim Constitution",
    text: "The Fante Confederacy drafts a written constitution at Mankessim — one of Africa's earliest bids for self-government, born on this coast.",
  },
  {
    year: "1876",
    title: "The Citadel of Education",
    text: "Mfantsipim is founded — the oldest secondary school in Ghana — joining Wesley Girls' (traced to 1836) and, later, Adisadel and Holy Child. Cape Coast becomes the nation's schoolhouse.",
  },
  {
    year: "1962",
    title: "University of Cape Coast",
    text: "UCC opens, keeping the pipeline of teachers, scholars and the famous music-and-dance tradition flowing through Oguaa.",
  },
  {
    year: "1979",
    title: "A World Heritage Site",
    text: "Cape Coast Castle is inscribed by UNESCO. Today Emancipation Day and (every other year) PANAFEST draw the diaspora home, to a metropolis of about 190,000 — the 2021 census — that has seen the world come and go.",
  },
] as const satisfies readonly Moment[];

function ArchivePhoto({
  src,
  alt,
  caption,
  credit,
  sourceUrl,
  license,
  licenseUrl,
  className = "aspect-[4/3]",
  imageClassName = "",
  dark = false,
}: Readonly<{
  src: string;
  alt: string;
  caption: string;
  credit: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
  className?: string;
  imageClassName?: string;
  dark?: boolean;
}>) {
  return (
    <figure className="min-w-0">
      <div className={`overflow-hidden rounded-[var(--radius-card)] bg-sand ${className}`}>
        <img
          src={mediaUrl(src)}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={`h-full w-full object-cover ${imageClassName}`}
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      </div>
      <figcaption className={`mt-3 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs leading-relaxed ${dark ? "text-cream/75" : "text-ink-faint"}`}>
        <span>{caption}</span>
        <span>
          <a href={sourceUrl} target="_blank" rel="noreferrer" className="underline decoration-current/40 underline-offset-2 hover:decoration-current">{credit}</a>
          {" · "}
          <a href={licenseUrl} target="_blank" rel="noreferrer" className="underline decoration-current/40 underline-offset-2 hover:decoration-current">{license}</a>
        </span>
      </figcaption>
    </figure>
  );
}

function LedgerEntry({
  moment,
  folio,
  className = "",
}: Readonly<{ moment: Moment; folio: number; className?: string }>) {
  return (
    <li value={folio} className="list-none">
      <Reveal className={`grid min-w-0 grid-cols-[4.6rem_minmax(0,1fr)] gap-x-4 border-t border-green/15 py-7 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-x-6 lg:py-9 ${className}`}>
        <div className="min-w-0">
          <p className="text-[0.62rem] font-semibold tracking-[0.18em] text-ink-faint" aria-label={`Record ${folio} of 9`}>
            {String(folio).padStart(2, "0")}
          </p>
          <p className="mt-2 text-sm font-semibold text-gold-text">{moment.year}</p>
        </div>
        <div className="min-w-0">
          <h4 className="text-xl font-semibold leading-tight text-ink sm:text-2xl">{moment.title}</h4>
          <p className="mt-3 max-w-2xl leading-relaxed text-ink-muted">{moment.text}</p>
        </div>
      </Reveal>
    </li>
  );
}

function ChapterIntro({
  number,
  kicker,
  title,
  body,
  titleId,
}: Readonly<{ number: string; kicker: string; title: string; body: string; titleId: string }>) {
  return (
    <div className="grid gap-5 border-y border-green/15 py-7 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-6">
      <p className="text-[0.66rem] font-semibold tracking-[0.2em] text-gold-text">CHAPTER {number}</p>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-faint">{kicker}</p>
        <h3 id={titleId} className="mt-2 text-3xl font-semibold leading-tight text-ink sm:text-4xl">{title}</h3>
        <p className="mt-4 max-w-2xl leading-relaxed text-ink-muted">{body}</p>
      </div>
    </div>
  );
}

export function History() {
  const market = TIMELINE[0];
  const carolusborg = TIMELINE[1];
  const crossing = TIMELINE[2];
  const asafo = TIMELINE[3];
  const capital = TIMELINE[4];
  const constitution = TIMELINE[5];
  const citadel = TIMELINE[6];
  const university = TIMELINE[7];
  const heritage = TIMELINE[8];

  return (
    <Section id="history" tone="paper" size="wide" className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] bg-[radial-gradient(circle_at_15%_0%,rgba(14,124,107,0.09),transparent_42%)]" aria-hidden="true" />

      <div className="relative">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-end">
          <SectionHeading
            kicker="THE STORY OF OGUAA"
            title="A town that has seen the world come and go."
            lede="Cape Coast — Oguaa — is one of the oldest and most storied towns in Ghana: a Fante market that became a castle, a colonial capital, the nation's Citadel of Education, and a place of return for the African diaspora. This is its story; Oguaa the platform only keeps it."
          />
          <Reveal delay={0.08}>
            <dl className="grid grid-cols-2 gap-4 border-y border-green/15 py-5 lg:grid-cols-1">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint">Markers</dt>
                <dd className="text-2xl font-semibold text-green">09</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint">Arc</dt>
                <dd className="text-sm font-semibold text-ink">15th c. → today</dd>
              </div>
            </dl>
          </Reveal>
        </div>

        <article aria-labelledby="origins-title" className="mt-16 scroll-mt-24 sm:mt-24">
          <ChapterIntro
            number="01"
            kicker="Origins"
            title="The market comes first."
            body="Before the forts, governments and schools, Oguaa was a fishing and trading settlement gathered around its market. The Castle changed the town's course; it did not begin its story."
            titleId="origins-title"
          />
          <div className="mt-10 grid min-w-0 gap-10 lg:grid-cols-[minmax(18rem,0.9fr)_minmax(0,1.1fr)] lg:items-start lg:gap-14">
            <Reveal className="min-w-0 lg:sticky lg:top-28">
              <ArchivePhoto
                src="/uploads/seed/downtown.jpg"
                alt="A wide view over Cape Coast toward the Atlantic"
                caption="Cape Coast townscape · contextual photography"
                credit="Dave Ley"
                sourceUrl="https://commons.wikimedia.org/wiki/File%3ACape_Coast_downtown.JPG"
                license="CC BY-SA 3.0"
                licenseUrl="https://creativecommons.org/licenses/by-sa/3.0/"
                className="aspect-[4/3]"
              />
            </Reveal>
            <ol start={1} className="min-w-0">
              <LedgerEntry moment={market} folio={1} />
              <LedgerEntry moment={carolusborg} folio={2} />
            </ol>
          </div>
        </article>

        <article
          id="castle-memory"
          aria-labelledby="castle-memory-title"
          className="on-dark on-dark-pin mt-16 scroll-mt-24 overflow-hidden rounded-[var(--radius-card)] bg-maroon-900 px-5 py-12 text-cream sm:mt-24 sm:px-8 sm:py-16 lg:px-12 lg:py-20"
        >
          <ol start={3} className="mx-auto max-w-6xl">
            <li value={3} className="list-none">
              <div className="grid min-w-0 gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-14">
                <Reveal className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cream/85" aria-label={`Record 3 of 9. A sober record. ${crossing.year}`}>
                    03 · A SOBER RECORD · {crossing.year}
                  </p>
                  <h3 id="castle-memory-title" className="mt-4 text-3xl font-semibold leading-tight text-cream sm:text-5xl">
                    {crossing.title}
                  </h3>
                  <p className="mt-6 max-w-xl text-lg leading-relaxed text-cream/85">{crossing.text}</p>
                  <a
                    href="/visit/cape-coast-castle"
                    className="mt-8 inline-flex min-h-11 items-center gap-2 border-b border-cream/55 pb-1 text-sm font-semibold text-cream transition-colors hover:border-cream"
                  >
                    Approach the Castle with care <span aria-hidden="true">→</span>
                  </a>
                </Reveal>
                <Reveal className="min-w-0" delay={0.08}>
                  <ArchivePhoto
                    src="/uploads/seed/castle-museum.jpg"
                    alt="The inner courtyard and white stone walls of Cape Coast Castle"
                    caption="Cape Coast Castle courtyard · contextual architecture"
                    credit="tootoo22"
                    sourceUrl="https://commons.wikimedia.org/wiki/File%3ACape_Coast_Castle_Museum_2012-09-01_15-08-26.jpg"
                    license="CC BY-SA 3.0"
                    licenseUrl="https://creativecommons.org/licenses/by-sa/3.0/"
                    className="aspect-[4/3]"
                    imageClassName="object-center"
                    dark
                  />
                </Reveal>
              </div>
            </li>
          </ol>
        </article>

        <article id="civic-order" aria-labelledby="civic-order-title" className="mt-16 scroll-mt-24 sm:mt-24">
          <ChapterIntro
            number="02"
            kicker="Companies, capital, constitution"
            title="A town ordering itself."
            body="Asafo authority, colonial government and the Fante Confederacy sit beside one another in the record — different systems of power meeting on the same coast."
            titleId="civic-order-title"
          />
          <div className="mt-10 grid min-w-0 gap-10 lg:grid-cols-[minmax(18rem,0.9fr)_minmax(0,1.1fr)] lg:items-start lg:gap-14">
            <Reveal className="min-w-0 lg:sticky lg:top-28">
              <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-1">
                <ArchivePhoto
                  src="/uploads/seed/posuban.jpg"
                  alt="A sculpted Asafo company shrine"
                  caption="An Asafo company shrine · contextual photography"
                  credit="David Stanley from Nanaimo, Canada"
                  sourceUrl="https://commons.wikimedia.org/wiki/File%3AAsafo_Company_Shrine_%2822618988608%29.jpg"
                  license="CC BY 2.0"
                  licenseUrl="https://creativecommons.org/licenses/by/2.0/"
                  className="aspect-[4/3]"
                />
                <ArchivePhoto
                  src="/uploads/seed/town-view.jpg"
                  alt="A view across Cape Coast from the Castle"
                  caption="Cape Coast civic landscape · contextual photography"
                  credit="Loek Tangel"
                  sourceUrl="https://commons.wikimedia.org/wiki/File%3AStadsgezicht_vanaf_Cape_Coast_Castle_-_Cape_Coast_-_20375148_-_RCE.jpg"
                  license="CC BY-SA 4.0"
                  licenseUrl="https://creativecommons.org/licenses/by-sa/4.0/"
                  className="aspect-[3/2]"
                />
              </div>
            </Reveal>
            <ol start={4} className="min-w-0">
              <LedgerEntry moment={asafo} folio={4} />
              <LedgerEntry moment={capital} folio={5} />
              <LedgerEntry moment={constitution} folio={6} />
            </ol>
          </div>
        </article>

        <article id="citadel" aria-labelledby="citadel-title" className="mt-16 scroll-mt-24 sm:mt-24">
          <ChapterIntro
            number="03"
            kicker="Learning & return"
            title="The schoolhouse on the coast."
            body="Education becomes Oguaa's next great institution, while the Castle's inscription and the diaspora's return place the town in a wider world of memory."
            titleId="citadel-title"
          />
          <div className="mt-10 grid min-w-0 gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)] lg:items-start lg:gap-14">
            <Reveal className="min-w-0 lg:order-2 lg:sticky lg:top-28">
              <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-1">
                <ArchivePhoto
                  src="/uploads/seed/mfantsipim-entrance.jpg"
                  alt="The main entrance gate of Mfantsipim School"
                  caption="Mfantsipim School · the gate carries 1876"
                  credit="Enock4seth"
                  sourceUrl="https://commons.wikimedia.org/wiki/File%3AMfantsipim_School_main_entrance.jpg"
                  license="CC BY-SA 4.0"
                  licenseUrl="https://creativecommons.org/licenses/by-sa/4.0/"
                  className="aspect-[4/3]"
                />
                <ArchivePhoto
                  src="/uploads/seed/ucc-library.jpg"
                  alt="The University of Cape Coast library complex and grounds"
                  caption="University of Cape Coast library complex"
                  credit="Kobebigs"
                  sourceUrl="https://commons.wikimedia.org/wiki/File%3AUniversity_Library_complex.JPG"
                  license="CC BY-SA 3.0"
                  licenseUrl="https://creativecommons.org/licenses/by-sa/3.0/"
                  className="aspect-[3/2]"
                />
              </div>
            </Reveal>
            <ol start={7} className="min-w-0 lg:order-1">
              <LedgerEntry moment={citadel} folio={7} />
              <LedgerEntry moment={university} folio={8} />
              <LedgerEntry moment={heritage} folio={9} />
            </ol>
          </div>
        </article>

        <SymbolDivider name="sankofa" className="mt-20" />
        <p className="mx-auto mt-5 max-w-xl text-center text-base italic text-ink-muted">
          Sankofa — go back and fetch it. What we remember, we carry forward.
        </p>
      </div>
    </Section>
  );
}
