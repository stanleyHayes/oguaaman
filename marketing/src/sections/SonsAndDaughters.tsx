import { Section, SectionHeading, Card } from "@/components/ui";

/**
 * "Sons & daughters of Oguaa" — appended to the Leadership page. The town is
 * precise about its own: figures BORN in Cape Coast are kept distinct from those
 * SCHOOLED here but born elsewhere (Annan in Kumasi, Sarbah & Aggrey in Anomabu,
 * Paa Grant in Beyin). Keeping that line honest is the whole point of the
 * section — a heritage page that over-claims loses the trust it trades on.
 */

interface Figure {
  name: string;
  dates: string;
  body: string;
  /** For the "schooled here" group: where they were actually born. */
  bornElsewhere?: string;
}

const BORN: Figure[] = [
  {
    name: "Efua Sutherland",
    dates: "1924–1996",
    body: "The mother of Ghanaian theatre. Born here in 1924; founder of the Ghana Drama Studio and the Kodzidan story-house, and author of The Marriage of Anansewa. Her 1980 proposal grew into PANAFEST.",
  },
  {
    name: "Philip Quaque",
    dates: "c. 1741–1816",
    body: "A son of Oguaa, and the first African ordained a priest of the Church of England, in 1765. He was chaplain at Cape Coast Castle for half a century, and lies buried in its courtyard.",
  },
  {
    name: "J. E. Casely Hayford",
    dates: "1866–1930",
    body: "Born in Cape Coast. Pan-Africanist, lawyer and author of Ethiopia Unbound; a co-founder of the Aborigines' Rights Protection Society and a central mind in the town's nationalist circle.",
  },
  {
    name: "Jacob Wilson Sey — “Kwaa Bonyi”",
    dates: "1832–1902",
    body: "The Gold Coast's first millionaire — a Cape Coast palm-oil trader who chartered a ship to London in 1898 and helped the ARPS win back the people's land from the Crown.",
  },
];

const SCHOOLED: Figure[] = [
  {
    name: "Kofi Annan",
    dates: "1938–2018",
    body: "Mfantsipim, 1954–57. Seventh Secretary-General of the United Nations and a Nobel Peace laureate.",
    bornElsewhere: "Born in Kumasi",
  },
  {
    name: "John Mensah Sarbah",
    dates: "1864–1910",
    body: "Schooled at — and the renamer of — the Wesleyan school that became Mfantsipim; the first from the Gold Coast called to the English Bar, in 1887. He co-founded the ARPS and wrote down Fante customary law.",
    bornElsewhere: "Born in Anomabu",
  },
  {
    name: "Kwegyir Aggrey",
    dates: "1875–1927",
    body: "Educated at, and later a headmaster of, Cape Coast's Wesleyan school; a co-founder of Achimota College and one of Africa's great teachers.",
    bornElsewhere: "Born in Anomabu",
  },
  {
    name: "George Alfred “Paa” Grant",
    dates: "1878–1956",
    body: "Wesleyan School, Cape Coast. The timber magnate who founded and financed the UGCC and paid Nkrumah's passage home — a father of Ghana's independence movement.",
    bornElsewhere: "Born in Beyin",
  },
];

function FigureCard({ figure, accent }: Readonly<{ figure: Figure; accent: "gold" | "clay" }>) {
  const border = accent === "gold" ? "border-l-gold-brand/60" : "border-l-clay/55";
  return (
    <Card className={`flex flex-col border-l-2 ${border} p-6`}>
      <h4 className="text-xl font-semibold text-ink">{figure.name}</h4>
      <p className="mt-0.5 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-gold-text">{figure.dates}</p>
      <p className="mt-3 text-sm leading-relaxed text-ink-muted">{figure.body}</p>
      {figure.bornElsewhere && (
        <p className="mt-3 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-clay-text">{figure.bornElsewhere}</p>
      )}
    </Card>
  );
}

export function SonsAndDaughters() {
  return (
    <Section tone="cream" size="wide">
      <SectionHeading
        kicker="SONS & DAUGHTERS"
        title="A small town that schooled large lives."
        lede="Oguaa is precise about its own. Some were born here. Others, just as great, were shaped in its schools — and we keep the difference honest."
      />

      <div className="mt-12">
        <p className="eyebrow text-gold-text">Born in Cape Coast</p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          {BORN.map((f) => <FigureCard key={f.name} figure={f} accent="gold" />)}
        </div>
      </div>

      <div className="mt-12">
        <p className="eyebrow text-clay-text">Shaped in its schools — born elsewhere</p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          {SCHOOLED.map((f) => <FigureCard key={f.name} figure={f} accent="clay" />)}
        </div>
      </div>
    </Section>
  );
}
