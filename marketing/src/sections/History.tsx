import { Section, SectionHeading } from "@/components/ui";
import { SymbolDivider } from "@/components/adinkra";
import { Stagger, StaggerItem } from "@/components/motion";

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

const TIMELINE: Moment[] = [
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
];

export function History() {
  return (
    <Section id="history" tone="paper" size="wide">
      <SectionHeading
        kicker="THE STORY OF OGUAA"
        title="A town that has seen the world come and go."
        lede="Cape Coast — Oguaa — is one of the oldest and most storied towns in Ghana: a Fante market that became a castle, a colonial capital, the nation's Citadel of Education, and a place of return for the African diaspora. This is its story; Oguaa the platform only keeps it."
      />

      <Stagger as="ol" className="relative mt-14 space-y-10 border-l-2 border-sand pl-6 sm:pl-8">
        {TIMELINE.map((m, i) => (
          <StaggerItem as="li" key={m.year} index={i} className="relative">
            <span
              className={`absolute -left-[33px] mt-1 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-paper sm:-left-[41px] ${
                m.sober ? "bg-maroon-900" : "bg-gold-brand"
              }`}
              aria-hidden
            />
            <p className={`font-mono text-xs font-semibold uppercase tracking-[0.18em] ${m.sober ? "text-maroon-900" : "text-gold-text"}`}>
              {m.year}
            </p>
            <h3 className="mt-1 text-2xl font-semibold text-ink">{m.title}</h3>
            <p className="mt-2 max-w-2xl leading-relaxed text-ink-muted">{m.text}</p>
          </StaggerItem>
        ))}
      </Stagger>

      <SymbolDivider name="sankofa" className="mt-16" />
      <p className="mx-auto mt-5 max-w-xl text-center font-serif text-base italic text-ink-muted">
        Sankofa — go back and fetch it. What we remember, we carry forward.
      </p>
    </Section>
  );
}
