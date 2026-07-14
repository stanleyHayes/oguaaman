import { Section, SectionHeading } from "@/components/ui";
import { Seal } from "@/components/scenes";
import { Adinkra } from "@/components/adinkra";

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

const ACCENT_BORDER: Record<Hierarchy["accent"], string> = {
  gold: "border-gold/45",
  clay: "border-clay/55",
};

function HolderLine({ node }: Readonly<{ node: Node }>) {
  if (node.holder) {
    return (
      <p className="mt-2 flex items-center gap-2">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold" aria-hidden />
        <span className="text-lg font-semibold leading-tight text-cream">{node.holder}</span>
      </p>
    );
  }
  return (
    <p className="mt-2 text-sm italic text-cream/55">(current holder — to confirm)</p>
  );
}

function NodeCard({ node, accent }: Readonly<{ node: Node; accent: Hierarchy["accent"] }>) {
  if (node.feature) {
    return (
      <div className={`flex flex-col gap-5 rounded-[var(--radius-card)] border-l-2 ${ACCENT_BORDER[accent]} border-y border-r border-cream/12 bg-green-900/45 p-7 sm:flex-row sm:items-start`}>
        {node.seal && <Seal variant={node.seal} className="h-20 w-20 shrink-0" />}
        <div>
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-gold/80">
            {node.role} · {node.body}
          </p>
          {node.holder && (
            <h3 className="mt-2 text-3xl font-semibold text-cream">{node.holder}</h3>
          )}
          <p className="mt-3 max-w-2xl leading-relaxed text-cream/80">{node.note}</p>
        </div>
      </div>
    );
  }
  return (
    <div className={`flex h-full flex-col rounded-[var(--radius-card)] border-l-2 ${ACCENT_BORDER[accent]} border-y border-r border-cream/12 bg-green-900/30 p-5`}>
      <div className="flex items-start gap-3">
        {node.seal && <Seal variant={node.seal} className="h-11 w-11 shrink-0" />}
        <div className="min-w-0">
          <h4 className="text-xl font-semibold leading-tight text-cream">
            {node.role}
            {node.ref && <sup className="ml-0.5 font-sans text-[0.6rem] text-gold/70">{node.ref}</sup>}
          </h4>
          <p className="mt-0.5 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-gold/70">{node.body}</p>
        </div>
      </div>
      <HolderLine node={node} />
      <p className="mt-2 text-sm leading-relaxed text-cream/75">{node.note}</p>
    </div>
  );
}

function Ladder({ hierarchy }: Readonly<{ hierarchy: Hierarchy }>) {
  return (
    <div>
      <p className="eyebrow text-gold/80">{hierarchy.eyebrow}</p>
      <h3 className="mt-2 text-3xl font-semibold text-cream sm:text-4xl">{hierarchy.title}</h3>
      <p className="mt-4 max-w-2xl leading-relaxed text-cream/80">{hierarchy.intro}</p>

      <ol className="mt-10">
        {hierarchy.tiers.map((tier, ti) => (
          <li key={tier.label}>
            {ti > 0 && (
              <div className="flex justify-center" aria-hidden>
                <span className="block h-7 w-px bg-gold/30" />
              </div>
            )}
            <div className="flex items-center gap-3">
              <span className="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-gold/70">
                Tier {ti + 1} · {tier.label}
              </span>
              <span className="h-px flex-1 bg-cream/10" />
            </div>
            <div className={`mt-4 grid gap-4 ${tier.nodes.some((n) => n.feature) ? "" : "sm:grid-cols-2"}`}>
              {tier.nodes.map((node) => (
                <NodeCard key={node.role} node={node} accent={hierarchy.accent} />
              ))}
            </div>
          </li>
        ))}
      </ol>
    </div>
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

        {/* Stacked, not side by side: the stool on top, the ballot below. */}
        <div className="mt-14 grid gap-16">
          <Ladder hierarchy={TRADITIONAL} />
          <Ladder hierarchy={POLITICAL} />
        </div>

        <div className="mt-16 border-t border-cream/12 pt-8">
          <p className="flex items-center gap-2 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-gold/70">
            <Adinkra name="dwennimmen" size={16} labelled={false} className="text-gold/70" />
            On the record
          </p>
          <ol className="mt-3 max-w-3xl space-y-1.5">
            {FOOTNOTES.map((f, i) => (
              <li key={f} className="flex gap-2 text-xs leading-relaxed text-cream/50">
                <span className="text-gold/60">{i + 1}.</span>
                <span>{f}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Section>
  );
}
