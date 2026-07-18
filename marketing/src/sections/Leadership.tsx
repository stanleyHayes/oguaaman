import { Section, SectionHeading } from "@/components/ui";
import { Seal } from "@/components/scenes";
import { Adinkra } from "@/components/adinkra";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";

/**
 * The custodians of Oguaa, shown as two parallel TOP-DOWN HIERARCHIES — the
 * traditional chieftaincy ("the stool", chosen by lineage) and the civic
 * government ("the ballot", chosen by vote). A town is held by both at once.
 *
 * Publish-safety rule (fact-checked 2026-06-07): a holder NAME is printed only
 * where a current 2025/26 source confirms it; every other office renders
 * "(current holder — to confirm)" so the page never publishes an unverified
 * name. Confirmed holders this build: Omanhene Osabarimba Kwesi Atta II,
 * Obaahemaa Nana Ekua Abookye VI, the Houses-of-Chiefs presidents, President
 * Mahama, the Central Regional Minister, both Cape Coast MPs, and the CCMA
 * mayor & coordinating director.
 */

type SealVariant = "stool" | "asafo" | "civic" | "school";

interface Node {
  role: string;
  /** Present ⇒ a verified current holder (render the name). Absent ⇒ office-only. */
  holder?: string;
  /** The precise body, stool or jurisdiction. */
  body: string;
  note: string;
  seal?: SealVariant;
  /** Tier-1 nodes get the heavier featured treatment. */
  feature?: boolean;
  /** Footnote marker. */
  ref?: number;
}

interface Tier {
  label: string;
  nodes: Node[];
}

interface Hierarchy {
  eyebrow: string;
  title: string;
  intro: string;
  accent: "gold" | "clay";
  tiers: Tier[];
}

const TRADITIONAL: Hierarchy = {
  eyebrow: "Chosen by lineage",
  title: "The stool.",
  intro:
    "Oguaa's traditional order is held not by ballot but by lineage and counsel. At its head reigns the Omanhene — who, by custom, never speaks in the open; when the people gather it is the Okyeame, the linguist, who lends the chief his voice. Beneath the paramount stool the Traditional Council carries the daily work of the state, reaching through the war-wing chiefs and the seven Asafo companies into every ward of the town.",
  accent: "gold",
  tiers: [
    {
      label: "The paramount stool",
      nodes: [
        {
          role: "Omanhene",
          body: "Oguaa Traditional Area",
          holder: "Osabarimba Kwesi Atta II",
          seal: "stool",
          feature: true,
          note: "The apex of the traditional state — ninth occupant of the Nana Birempong Cudjoe royal stool, enstooled in 1998, and President of the Oguaa Traditional Council. By custom he reigns but does not speak in public; each September he gives thanks to the 77 gods of Oguaa at Fetu Afahye.",
        },
        {
          role: "Obaahemaa — Paramount Queen Mother",
          body: "Oguaa Traditional Area",
          holder: "Nana Ekua Abookye VI",
          seal: "stool",
          note: "Counterpart to the paramount stool; by the queen mother's word a chief is first named. Outdoored in 2022.",
        },
      ],
    },
    {
      label: "The Oguaa Traditional Council",
      nodes: [
        {
          role: "The Oguaa Traditional Council",
          body: "The governing body",
          note: "Presided over by the Omanhene, it enstools and destools chiefs, keeps the custom of the state, and convenes Fetu Afahye each year.",
        },
        {
          role: "Tufuhene",
          body: "Commander of the Asafo",
          note: "General commander and master of arms of the seven companies, of divisional-chief rank — the link between the stool and the citizen companies.",
        },
        {
          role: "Okyeame — the linguist",
          body: "The chief's voice",
          note: "The royal spokesman, bearing the linguist's staff: he carries the chief's word to the people, and the people's word back to the chief.",
        },
        {
          role: "Divisional & war-wing chiefs",
          body: "Adontenhen · Twafohen · Benkumhen · Nyimfahen · Nkyidomhen",
          note: "The wings of the old Oguaa war formation, each holding a quarter of the state and a seat at the council.",
          ref: 2,
        },
      ],
    },
    {
      label: "The seven Asafo companies",
      nodes: [
        {
          role: "The seven Asafo companies",
          body: "Bentsir · Anaafo · Ntsin · Nkum · Brofomba · Akrampa · Amanful",
          seal: "asafo",
          note: "The citizen companies — once the town's militia, now its ceremonial brotherhoods — that organise Oguaa ward by ward and carry the Fetu Afahye turn-outs.",
          ref: 1,
        },
        {
          role: "Supi — superior captain",
          body: "One to a company",
          note: "The senior captain at the head of an entire company, with its colours, its posuban shrine and its songs.",
        },
        {
          role: "Safohen — company captains",
          body: "Under the Supi",
          note: "Lead the rank-and-file, with their flag-bearers, drummers and Asafo priests.",
        },
      ],
    },
    {
      label: "The town's elders",
      nodes: [
        {
          role: "Konkohemaa — Queen of the Fishmongers",
          body: "Oguaa fishing community",
          note: "Head of the fish traders; she sets the custom of the trade and carries the women's voice into the council.",
        },
        {
          role: "Abusuapanyin — clan & family heads",
          body: "The Fante abusua (lineages)",
          note: "Heads of lineage; the stools descend through the abusua, and the family elders sit among the state's counsellors.",
        },
      ],
    },
    {
      label: "Within Ghana's chieftaincy",
      nodes: [
        {
          role: "President, Central Regional House of Chiefs",
          body: "The region's paramount stools",
          holder: "Odeefuo Amoakwa Buadu VIII",
          note: "Co-ordinates the Central Region's paramountcies, of which the Oguaamanhen is a member. (Omanhen of Breman Asikuma.)",
        },
        {
          role: "President, National House of Chiefs",
          body: "Seated in Kumasi",
          holder: "Ogyeahoho Yaw Gyebi II",
          note: "The apex chieftaincy institution of Ghana — the constitutional ceiling of the chieftaincy.",
        },
      ],
    },
  ],
};

const POLITICAL: Hierarchy = {
  eyebrow: "Chosen by vote",
  title: "The ballot.",
  intro:
    "Above the stool sits a second order of authority — one that votes, and is voted upon. From Accra the President's hand reaches the Central Region through the Regional Minister; the town speaks in Parliament with two voices, north and south; and closest to the street is the Metropolitan Assembly, which paves the road, lights the lamp and keeps the records of a living town.",
  accent: "clay",
  tiers: [
    {
      label: "National",
      nodes: [
        {
          role: "President of the Republic of Ghana",
          body: "The Executive",
          holder: "John Dramani Mahama",
          seal: "civic",
          feature: true,
          note: "Elected, and inaugurated on 7 January 2025. The apex of executive authority — he appoints the regional ministers and metropolitan chief executives below.",
        },
      ],
    },
    {
      label: "Regional",
      nodes: [
        {
          role: "Central Regional Minister",
          body: "Central Regional Coordinating Council",
          holder: "Ekow Panyin Okyere Eduamoah",
          note: "Appointed by the President and approved by Parliament; he chairs the Coordinating Council, which supervises the region's assemblies — Cape Coast among them.",
        },
        {
          role: "Central Regional Coordinating Council",
          body: "Seated in Cape Coast",
          note: "The administrative arm of central government in the region.",
        },
      ],
    },
    {
      label: "Parliament — the town's two voices",
      nodes: [
        {
          role: "Member of Parliament — Cape Coast South",
          body: "9th Parliament of Ghana",
          holder: "Kweku George Ricketts-Hagan",
          note: "Elected to the historic core of the town — Castle, township and shore. Deputy Majority Leader, and MP for the seat since 2013.",
        },
        {
          role: "Member of Parliament — Cape Coast North",
          body: "9th Parliament of Ghana",
          holder: "Dr. Kwamena Minta Nyarku",
          note: "Elected to the northern, university side of town around UCC; re-elected in December 2024.",
        },
      ],
    },
    {
      label: "Local government — the Metropolitan Assembly",
      nodes: [
        {
          role: "Metropolitan Chief Executive (Mayor)",
          body: "Cape Coast Metropolitan Assembly",
          holder: "George Justice Arthur",
          seal: "civic",
          note: "Appointed by the President and confirmed by the Assembly in 2025 — the political head of the metropolis.",
        },
        {
          role: "Metropolitan Coordinating Director",
          body: "Cape Coast Metropolitan Assembly",
          holder: "Asumah Adam Braimah",
          note: "The career civil-service head of the administration and secretary to the Assembly; the metro's departments report through this office.",
        },
        {
          role: "Presiding Member",
          body: "Cape Coast Metropolitan Assembly",
          note: "Elected from among the Assembly Members to chair the General Assembly — distinct from the executive Mayor.",
        },
        {
          role: "Assembly Members · Sub-Metro Councils · Unit Committees",
          body: "Closest to the street",
          note: "Two-thirds elected and one-third appointed, sitting with the two MPs; below them the sub-metro councils and unit committees — the tier nearest the citizen.",
        },
      ],
    },
  ],
};

const FOOTNOTES = [
  "The Asafo companies are numbered No. 1–4 without dispute (Bentsir, Anaafo, Ntsin, Nkum); Brofomba, Akrampa and Amanful are ordered differently across sources, so we name them without fixing the count.",
  "Wing-chief titles follow the Oguaa stool's own tradition; Oguaa keeps “Nyimfahen” where other Fante states say “Nifahene.”",
  "Offices marked “(current holder — to confirm)” stay deliberately unnamed until a sitting officeholder is verified — a name is published here only when a current source confirms it.",
];

interface ContextImage {
  src: string;
  alt: string;
  label: string;
}

const TRADITIONAL_MEDIA: ContextImage[] = [
  {
    src: "/uploads/seed/fetu-procession.jpg",
    alt: "A Fetu Afahye procession moving through Cape Coast",
    label: "Public ceremony",
  },
  {
    src: "/uploads/seed/fetu-queenmother.jpg",
    alt: "Queen-mother regalia during Fetu Afahye",
    label: "Ceremonial life",
  },
  {
    src: "/uploads/seed/fetu-flagbearer.jpg",
    alt: "An Asafo flag-bearer during Fetu Afahye",
    label: "Asafo tradition",
  },
  {
    src: "/uploads/seed/posuban.jpg",
    alt: "An Asafo posuban shrine in Cape Coast",
    label: "Ward heritage",
  },
];

const CIVIC_MEDIA: ContextImage[] = [
  {
    src: "/uploads/seed/downtown.jpg",
    alt: "A street view of central Cape Coast",
    label: "The town centre",
  },
  {
    src: "/uploads/seed/town-view.jpg",
    alt: "A view across the Cape Coast townscape",
    label: "The metropolis",
  },
  {
    src: "/uploads/seed/fort-william.jpg",
    alt: "Fort William standing above Cape Coast",
    label: "The civic landscape",
  },
];

const ACCENT_STYLE: Record<
  Hierarchy["accent"],
  { border: string; panel: string; marker: string; wash: string }
> = {
  gold: {
    border: "border-gold/45",
    panel: "bg-gold/[0.09]",
    marker: "bg-gold text-green-900",
    wash: "from-gold/20 via-gold/[0.04] to-transparent",
  },
  clay: {
    border: "border-clay/55",
    panel: "bg-clay/[0.09]",
    marker: "bg-clay text-cream",
    wash: "from-clay/20 via-clay/[0.04] to-transparent",
  },
};

function ContextFigure({ image, className = "" }: Readonly<{ image: ContextImage; className?: string }>) {
  return (
    <figure className={`group relative min-h-0 overflow-hidden bg-green-900 ${className}`}>
      <img
        src={image.src}
        alt={image.alt}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover transition-transform duration-700 motion-safe:group-hover:scale-[1.035]"
      />
      <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-green-900/80 via-transparent to-transparent" />
      <figcaption className="absolute inset-x-0 bottom-0 p-3 font-mono text-[0.58rem] uppercase tracking-[0.16em] text-cream/85">
        {image.label}
      </figcaption>
    </figure>
  );
}

function ContextMosaic({ media }: Readonly<{ media: ContextImage[] }>) {
  const secondary = media.slice(1);
  const hasFourImages = media.length === 4;

  return (
    <div className="grid min-h-[28rem] gap-2 bg-green-900/50 p-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(15rem,0.7fr)]">
      <ContextFigure image={media[0]} className="min-h-72 sm:min-h-full" />
      <div className={`grid min-h-56 gap-2 ${hasFourImages ? "grid-cols-2 grid-rows-2" : "grid-rows-2"}`}>
        {secondary.map((image, index) => (
          <ContextFigure
            key={image.src}
            image={image}
            className={hasFourImages && index === 0 ? "col-span-2" : ""}
          />
        ))}
      </div>
    </div>
  );
}

function HolderLine({ node }: Readonly<{ node: Node }>) {
  if (node.holder) {
    return <p className="mt-1 text-lg font-semibold leading-tight text-cream">{node.holder}</p>;
  }
  return <p className="mt-1 text-sm italic text-cream/55">(current holder — to confirm)</p>;
}

function OfficeEntry({
  node,
  accent,
  index,
}: Readonly<{ node: Node; accent: Hierarchy["accent"]; index: number }>) {
  const style = ACCENT_STYLE[accent];

  return (
    <article
      className={`relative overflow-hidden border-b border-cream/10 px-5 py-6 last:border-b-0 sm:px-7 ${
        node.feature ? style.panel : "bg-green-900/20"
      }`}
    >
      {node.feature && (
        <span aria-hidden className={`absolute inset-0 bg-gradient-to-r ${style.wash}`} />
      )}
      <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,0.58fr)_minmax(0,1.25fr)] lg:items-start lg:gap-7">
        <div className="flex min-w-0 items-start gap-4">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-[0.62rem] font-bold ${style.marker}`}
            aria-hidden
          >
            {String(index + 1).padStart(2, "0")}
          </span>
          {node.seal && <Seal variant={node.seal} className={node.feature ? "h-16 w-16 shrink-0" : "h-11 w-11 shrink-0"} />}
          <div className="min-w-0">
            <h4 className={`${node.feature ? "text-2xl" : "text-lg"} font-semibold leading-tight text-cream`}>
              {node.role}
              {node.ref && <sup className="ml-0.5 font-sans text-[0.6rem] text-gold/70">{node.ref}</sup>}
            </h4>
            <p className="mt-1 font-mono text-[0.6rem] uppercase leading-relaxed tracking-[0.13em] text-gold/70">
              {node.body}
            </p>
          </div>
        </div>

        <div className="border-l border-cream/12 pl-4 lg:min-h-14">
          <p className="font-mono text-[0.56rem] uppercase tracking-[0.16em] text-cream/45">Current officeholder</p>
          <HolderLine node={node} />
        </div>

        <p className="text-sm leading-relaxed text-cream/72">{node.note}</p>
      </div>
    </article>
  );
}

function Ladder({
  hierarchy,
  id,
  media,
}: Readonly<{ hierarchy: Hierarchy; id: "traditional" | "civic"; media: ContextImage[] }>) {
  const style = ACCENT_STYLE[hierarchy.accent];
  const titleId = `${id}-hierarchy-title`;

  return (
    <article id={id} aria-labelledby={titleId} className="scroll-mt-24">
      <Reveal>
        <header className={`overflow-hidden rounded-[var(--radius-card)] border ${style.border} bg-green-900/45 shadow-[var(--shadow-card)]`}>
          <div className="grid lg:grid-cols-[minmax(20rem,0.72fr)_minmax(0,1.28fr)]">
            <div className="relative flex flex-col justify-between overflow-hidden p-7 sm:p-9 lg:p-10">
              <span aria-hidden className={`absolute inset-0 bg-gradient-to-br ${style.wash}`} />
              <div className="relative">
                <p className="eyebrow text-gold/80">{hierarchy.eyebrow}</p>
                <h3 id={titleId} className="mt-3 text-4xl font-semibold leading-none text-cream sm:text-5xl">
                  {hierarchy.title}
                </h3>
                <p className="mt-6 leading-relaxed text-cream/80">{hierarchy.intro}</p>
              </div>
              <p className="relative mt-9 border-t border-cream/12 pt-4 font-mono text-[0.58rem] uppercase leading-relaxed tracking-[0.15em] text-cream/48">
                Place and ceremony imagery · shown as context, never as portraits of officeholders
              </p>
            </div>
            <ContextMosaic media={media} />
          </div>
        </header>
      </Reveal>

      <ol className="relative mt-8 space-y-6 before:absolute before:bottom-8 before:left-[1.12rem] before:top-8 before:w-px before:bg-cream/12 lg:space-y-8 lg:before:left-[5.45rem]">
        {hierarchy.tiers.map((tier, tierIndex) => (
          <li key={tier.label} className="relative grid gap-4 pl-12 lg:grid-cols-[9rem_minmax(0,1fr)] lg:gap-6 lg:pl-0">
            <div className="relative lg:pt-6">
              <span
                className={`absolute -left-[2.95rem] top-0 flex h-9 w-9 items-center justify-center rounded-full ring-4 ring-green lg:left-[4.35rem] lg:top-5 ${style.marker}`}
                aria-hidden
              >
                <span className="font-mono text-[0.62rem] font-bold">{String(tierIndex + 1).padStart(2, "0")}</span>
              </span>
              <p className="font-mono text-[0.56rem] uppercase tracking-[0.17em] text-cream/45">Tier {tierIndex + 1}</p>
              <p className="mt-1 max-w-[8rem] text-sm font-semibold leading-snug text-gold/85">{tier.label}</p>
            </div>

            <Stagger
              as="ul"
              className={`overflow-hidden rounded-[var(--radius-card)] border ${style.border} bg-green-900/25`}
            >
              {tier.nodes.map((node, nodeIndex) => (
                <StaggerItem key={node.role} as="li" index={nodeIndex}>
                  <OfficeEntry node={node} accent={hierarchy.accent} index={nodeIndex} />
                </StaggerItem>
              ))}
            </Stagger>
          </li>
        ))}
      </ol>
    </article>
  );
}

export function Leadership() {
  return (
    <Section id="leaders" tone="green" size="wide" className="relative overflow-hidden">
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-contours opacity-[0.05]" />
      <div className="relative">
        <SectionHeading
          onDark
          kicker="THE CUSTODIANS OF OGUAA"
          title="Two orders, one town."
          lede="Cape Coast is held by two leaderships at once — a chieftaincy chosen by lineage, and a civic government chosen by ballot. Here is each, from its summit to its smallest tier."
        />

        <Reveal delay={0.08}>
          <nav aria-label="Leadership archives" className="mt-9 flex flex-wrap gap-3">
            <a
              href="#traditional"
              className="inline-flex items-center gap-3 rounded-full border border-gold/35 bg-gold/[0.08] px-4 py-2 text-sm font-semibold text-cream transition-colors hover:border-gold hover:bg-gold/[0.14]"
            >
              <span className="h-2 w-2 rounded-full bg-gold" aria-hidden />
              Enter the traditional order
            </a>
            <a
              href="#civic"
              className="inline-flex items-center gap-3 rounded-full border border-clay/45 bg-clay/[0.08] px-4 py-2 text-sm font-semibold text-cream transition-colors hover:border-clay hover:bg-clay/[0.14]"
            >
              <span className="h-2 w-2 rounded-full bg-clay" aria-hidden />
              Enter the civic order
            </a>
          </nav>
        </Reveal>

        <div className="mt-14 grid gap-24 sm:mt-16 sm:gap-28">
          <Ladder id="traditional" hierarchy={TRADITIONAL} media={TRADITIONAL_MEDIA} />
          <Ladder id="civic" hierarchy={POLITICAL} media={CIVIC_MEDIA} />
        </div>

        <aside className="mt-20 grid gap-6 border-t border-cream/12 pt-8 lg:grid-cols-[12rem_minmax(0,1fr)]" aria-labelledby="leadership-record-title">
          <div>
            <p id="leadership-record-title" className="flex items-center gap-2 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-gold/70">
              <Adinkra name="dwennimmen" size={16} labelled={false} className="text-gold/70" />
              On the record
            </p>
            <p className="mt-2 text-xs leading-relaxed text-cream/45">Names, offices and traditions are published with deliberate care.</p>
          </div>
          <ol className="grid gap-3 md:grid-cols-3">
            {FOOTNOTES.map((f, i) => (
              <li key={f} className="flex gap-3 border-l border-cream/12 pl-4 text-xs leading-relaxed text-cream/55">
                <span className="font-mono text-gold/70">{String(i + 1).padStart(2, "0")}</span>
                <span>{f}</span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </Section>
  );
}
