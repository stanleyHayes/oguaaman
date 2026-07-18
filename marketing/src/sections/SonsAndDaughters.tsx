import { Section, SectionHeading } from "@/components/ui";
import { Stagger, StaggerItem } from "@/components/motion";

/**
 * "Sons & daughters of Oguaa" — appended to the Leadership page. The town is
 * precise about its own: figures BORN in Cape Coast are kept distinct from those
 * SCHOOLED here but born elsewhere (Annan in Kumasi, Sarbah & Aggrey in Anomabu,
 * Paa Grant in Beyin). Keeping that line honest is the whole point of the
 * section — a heritage page that over-claims loses the trust it trades on.
 *
 * The photographs are deliberately contextual rather than portraits. They show
 * the streets, schools and civic landmarks that surround each life without
 * pretending an archival likeness exists in the seed library.
 */

interface Figure {
  name: string;
  dates: string;
  body: string;
  image: string;
  imageAlt: string;
  imageCaption: string;
  imagePosition?: string;
  /** For the "schooled here" group: where they were actually born. */
  bornElsewhere?: string;
}

const BORN: Figure[] = [
  {
    name: "Efua Sutherland",
    dates: "1924–1996",
    body: "The mother of Ghanaian theatre. Born here in 1924; founder of the Ghana Drama Studio and the Kodzidan story-house, and author of The Marriage of Anansewa. Her 1980 proposal grew into PANAFEST.",
    image: "/uploads/seed/fetu-crowd.jpg",
    imageAlt: "A crowd gathered for Fetu Afahye in Cape Coast",
    imageCaption: "Fetu Afahye crowds · Cape Coast",
    imagePosition: "object-center",
  },
  {
    name: "Philip Quaque",
    dates: "c. 1741–1816",
    body: "A son of Oguaa, and the first African ordained a priest of the Church of England, in 1765. He was chaplain at Cape Coast Castle for half a century, and lies buried in its courtyard.",
    image: "/uploads/seed/christ-church.jpg",
    imageAlt: "Christ Church in Cape Coast",
    imageCaption: "Christ Church · Cape Coast",
    imagePosition: "object-center",
  },
  {
    name: "J. E. Casely Hayford",
    dates: "1866–1930",
    body: "Born in Cape Coast. Pan-Africanist, lawyer and author of Ethiopia Unbound; a co-founder of the Aborigines' Rights Protection Society and a central mind in the town's nationalist circle.",
    image: "/uploads/seed/town-view.jpg",
    imageAlt: "A wide view across the town of Cape Coast",
    imageCaption: "The Oguaa townscape · Cape Coast",
    imagePosition: "object-center",
  },
  {
    name: "Jacob Wilson Sey — “Kwaa Bonyi”",
    dates: "1832–1902",
    body: "The Gold Coast's first millionaire — a Cape Coast palm-oil trader who chartered a ship to London in 1898 and helped the ARPS win back the people's land from the Crown.",
    image: "/uploads/seed/downtown.jpg",
    imageAlt: "A street scene in downtown Cape Coast",
    imageCaption: "Downtown Oguaa · Cape Coast",
    imagePosition: "object-center",
  },
];

const SCHOOLED: Figure[] = [
  {
    name: "Kofi Annan",
    dates: "1938–2018",
    body: "Mfantsipim, 1954–57. Seventh Secretary-General of the United Nations and a Nobel Peace laureate.",
    bornElsewhere: "Born in Kumasi",
    image: "/uploads/seed/mfantsipim-entrance.jpg",
    imageAlt: "The entrance to Mfantsipim School in Cape Coast",
    imageCaption: "Mfantsipim School · Cape Coast",
    imagePosition: "object-center",
  },
  {
    name: "John Mensah Sarbah",
    dates: "1864–1910",
    body: "Schooled at — and the renamer of — the Wesleyan school that became Mfantsipim; the first from the Gold Coast called to the English Bar, in 1887. He co-founded the ARPS and wrote down Fante customary law.",
    bornElsewhere: "Born in Anomabu",
    image: "/uploads/seed/mfantsipim-campus.jpg",
    imageAlt: "The green campus of Mfantsipim School in Cape Coast",
    imageCaption: "Mfantsipim campus · Cape Coast",
    imagePosition: "object-center",
  },
  {
    name: "Kwegyir Aggrey",
    dates: "1875–1927",
    body: "Educated at, and later a headmaster of, Cape Coast's Wesleyan school; a co-founder of Achimota College and one of Africa's great teachers.",
    bornElsewhere: "Born in Anomabu",
    image: "/uploads/seed/mfantsipim-classroom.jpg",
    imageAlt: "A classroom at Mfantsipim School in Cape Coast",
    imageCaption: "A Mfantsipim classroom · Cape Coast",
    imagePosition: "object-center",
  },
  {
    name: "George Alfred “Paa” Grant",
    dates: "1878–1956",
    body: "Wesleyan School, Cape Coast. The timber magnate who founded and financed the UGCC and paid Nkrumah's passage home — a father of Ghana's independence movement.",
    bornElsewhere: "Born in Beyin",
    image: "/uploads/seed/castle-exterior.jpg",
    imageAlt: "The white exterior of Cape Coast Castle beside the Atlantic",
    imageCaption: "Cape Coast Castle · Oguaa",
    imagePosition: "object-center",
  },
];

const GRID_SPANS = ["lg:col-span-7", "lg:col-span-5", "lg:col-span-5", "lg:col-span-7"];

function FigureCard({
  figure,
  index,
  accent,
}: Readonly<{
  figure: Figure;
  index: number;
  accent: "gold" | "clay";
}>) {
  const isWide = index === 0 || index === 3;
  const accentBorder = accent === "gold" ? "border-t-gold-brand" : "border-t-clay";
  const numberTone = accent === "gold" ? "bg-gold-brand text-green-900" : "bg-clay text-cream";
  const dateTone = accent === "gold" ? "text-gold-text" : "text-clay-text";

  return (
    <div
      className={`grid h-full overflow-hidden rounded-[calc(var(--radius-card)+4px)] border border-sand border-t-2 ${accentBorder} bg-paper shadow-[var(--shadow-card)] ${
        isWide ? "md:grid-cols-[minmax(0,1.12fr)_minmax(15rem,0.88fr)]" : "grid-rows-[auto_1fr]"
      }`}
    >
      <figure className={`group relative min-h-64 overflow-hidden ${isWide ? "md:min-h-[24rem]" : "aspect-[4/3]"}`}>
        <img
          src={figure.image}
          alt={figure.imageAlt}
          loading="lazy"
          decoding="async"
          className={`absolute inset-0 h-full w-full object-cover ${figure.imagePosition ?? "object-center"} transition-transform duration-700 group-hover:scale-[1.025]`}
        />
        <span className="absolute inset-0 bg-gradient-to-t from-green-900/90 via-green-900/5 to-transparent" aria-hidden />
        <span
          className={`absolute left-4 top-4 grid size-9 place-items-center rounded-full font-mono text-[0.64rem] font-bold tracking-[0.08em] shadow-lg ${numberTone}`}
          aria-hidden
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        <figcaption className="absolute inset-x-0 bottom-0 px-5 pb-4 font-mono text-[0.58rem] uppercase tracking-[0.14em] text-cream/85">
          {figure.imageCaption}
        </figcaption>
      </figure>

      <div className="flex flex-col p-6 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sand pb-4">
          <p className={`font-mono text-[0.64rem] font-semibold uppercase tracking-[0.16em] ${dateTone}`}>
            {figure.dates}
          </p>
          {figure.bornElsewhere && (
            <p className="rounded-full border border-clay/25 bg-clay/[0.07] px-3 py-1 font-mono text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-clay-text">
              {figure.bornElsewhere}
            </p>
          )}
        </div>
        <h4 className="mt-5 text-[1.35rem] font-semibold leading-[1.12] text-ink sm:text-2xl">{figure.name}</h4>
        <p className="mt-4 text-sm leading-relaxed text-ink-muted sm:text-[0.95rem]">{figure.body}</p>
        <div className="mt-auto pt-7" aria-hidden>
          <span className={`block h-0.5 w-10 ${accent === "gold" ? "bg-gold-brand" : "bg-clay"}`} />
        </div>
      </div>
    </div>
  );
}

function FigureCollection({
  figures,
  label,
  note,
  accent,
  collectionNumber,
}: Readonly<{
  figures: Figure[];
  label: string;
  note: string;
  accent: "gold" | "clay";
  collectionNumber: string;
}>) {
  const labelTone = accent === "gold" ? "text-gold-text" : "text-clay-text";
  const ruleTone = accent === "gold" ? "from-gold-brand" : "from-clay";

  return (
    <div className="mt-14 border-t border-ink/15 pt-6 sm:mt-16 sm:pt-8">
      <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-end sm:gap-8">
        <p className={`font-mono text-5xl font-light leading-none tracking-[-0.06em] ${labelTone}`} aria-hidden>
          {collectionNumber}
        </p>
        <div className="sm:border-l sm:border-ink/15 sm:pl-8">
          <p className={`eyebrow ${labelTone}`}>{label}</p>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-muted">{note}</p>
        </div>
      </div>

      <Stagger className="mt-7 grid gap-5 lg:grid-cols-12 lg:gap-6">
        {figures.map((figure, index) => (
          <StaggerItem
            as="article"
            key={figure.name}
            index={index}
            className={`${GRID_SPANS[index]} h-full`}
          >
            <FigureCard figure={figure} index={index} accent={accent} />
          </StaggerItem>
        ))}
      </Stagger>

      <div className={`mt-8 h-px w-full bg-gradient-to-r ${ruleTone} via-transparent to-transparent opacity-40`} aria-hidden />
    </div>
  );
}

export function SonsAndDaughters() {
  return (
    <Section id="sons-daughters" tone="cream" size="wide" className="relative overflow-hidden">
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-dotgrid opacity-25" />
      <div className="relative">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <SectionHeading
            kicker="SONS & DAUGHTERS"
            title="A small town that schooled large lives."
            lede="Oguaa is precise about its own. Some were born here. Others, just as great, were shaped in its schools — and we keep the difference honest."
          />
          <div className="flex items-center gap-4 border-y border-ink/15 py-4 lg:min-w-56 lg:border-y-0 lg:border-l lg:py-2 lg:pl-7">
            <span className="font-mono text-4xl font-light leading-none text-green">08</span>
            <p className="max-w-28 font-mono text-[0.6rem] uppercase leading-relaxed tracking-[0.14em] text-ink-faint">
              Lives in the Oguaa archive
            </p>
          </div>
        </div>

        <FigureCollection
          figures={BORN}
          label="Born in Cape Coast"
          note="Four lives whose first chapter began in Oguaa — shown here through the town and civic places around their stories."
          accent="gold"
          collectionNumber="01"
        />

        <FigureCollection
          figures={SCHOOLED}
          label="Shaped in its schools — born elsewhere"
          note="Four lives formed in Cape Coast classrooms. Their birthplaces remain visible, because belonging does not require rewriting the record."
          accent="clay"
          collectionNumber="02"
        />
      </div>
    </Section>
  );
}
