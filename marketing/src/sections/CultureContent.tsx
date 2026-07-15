import { Section, SectionHeading, Card } from "@/components/ui";
import { Adinkra, type AdinkraName } from "@/components/adinkra";
import { Stagger, StaggerItem } from "@/components/motion";

interface Strand {
  symbol: AdinkraName;
  title: string;
  body: string;
}

const STRANDS: Strand[] = [
  {
    symbol: "adinkrahene",
    title: "Fetu Afahye",
    body: "On the first Saturday of September, Oguaa erupts into its great festival. After a season's ban on drumming, the town purifies its 77 gods, the Asafo companies parade, and the chiefs sit in a grand durbar at Victoria Park. It binds the living, the departed and the gods.",
  },
  {
    symbol: "funtunfunefu",
    title: "The seven Asafo companies",
    body: "Bentsir, Anaafo, Ntsin, Nkum, Amanful, Brofomba and Akrampa — the people's companies, each with its colours, its posuban shrine and its songs. They are Oguaa's citizen guard and its keepers of custom.",
  },
  {
    symbol: "nyame-nwu-na-mawu",
    title: "The 77 gods & the durbar",
    body: "Oguaa keeps an unusually rich pantheon of deities and a deep tradition of libation, drumming and Adamfo. The durbar of chiefs — palanquins, linguist staffs, fontomfrom drums — is among the most photographed sights in Ghana.",
  },
  {
    symbol: "sankofa",
    title: "The sound & the table",
    body: "Highlife and gospel born in the chapel choirs; brass bands and the osode pulse. And the food: Fante kenkey and fresh fish from the Bakaano shore, fante-fante (palm-soup) and koobi — the taste of the coast.",
  },
];

export function CultureContent() {
  return (
    <Section tone="paper" size="wide">
      <SectionHeading
        kicker="THE LIVING CULTURE"
        title="A town that still keeps its rites."
        lede="Cape Coast is not a museum — its festival, its companies and its sound are alive, carried each year by the people of Oguaa."
      />
      <Stagger className="mt-12 grid gap-5 sm:grid-cols-2">
        {STRANDS.map((s, i) => (
          <StaggerItem key={s.title} index={i}>
            <Card className="flex h-full gap-5 p-7">
              <Adinkra name={s.symbol} size={40} labelled={false} strokeWidth={1.4} className="shrink-0 text-gold-brand" />
              <div>
                <h3 className="text-2xl font-semibold text-ink">{s.title}</h3>
                <p className="mt-2 leading-relaxed text-ink-muted">{s.body}</p>
              </div>
            </Card>
          </StaggerItem>
        ))}
      </Stagger>
    </Section>
  );
}
