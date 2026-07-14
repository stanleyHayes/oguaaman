import { Link } from "react-router-dom";
import { PageHero } from "@/components/page-hero";
import { Container, Card, SectionHeading, CTA as Cta } from "@/components/ui";
import { Reveal, Reveal3D, StaggerItem } from "@/components/motion";
import { CULTURE_BLURB } from "@/lib/content";

const COMPANIES = [
  { name: "Bentsir", colour: "Red", hex: "#A4161A" },
  { name: "Anaafo", colour: "Blue & white", hex: "#1F4E79" },
  { name: "Ntsin", colour: "Green", hex: "#1E6B3A" },
  { name: "Nkum", colour: "Yellow", hex: "#E3B23C" },
  { name: "Brofomba", colour: "White", hex: "#E8E2D2" },
  { name: "Akrampa", colour: "Black & white", hex: "#161616" },
  { name: "Amanful", colour: "Wine & black", hex: "#6E1F2B" },
];
const OFFICES = [
  { role: "Omanhene", note: "The paramount chief; head of the Traditional Council." },
  { role: "Ohemaa", note: "The queen mother, who nominates candidates to a vacant stool." },
  { role: "Okyeame", note: "The linguist who speaks for the chief and pours libation." },
  { role: "Asafohene", note: "The head of an Asafo company; commander of the town's brotherhoods." },
];

export function Component() {
  return (
    <>
      <PageHero tone="gold" kicker="The brightest register" title="Culture & festivals" symbol="funtunfunefu" lede="Stitched on cloth and poured in libation — the Asafo, the durbar, and the festival that turns the whole town into one percussion section." />
      <Container size="prose" className="py-12"><p className="font-serif text-lg leading-relaxed text-ink">{CULTURE_BLURB}</p></Container>

      <section className="bg-cream py-12">
        <Container>
          <Reveal3D><Card className="overflow-hidden p-0">
            <div className="grid gap-6 p-7 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <p className="eyebrow text-gold-text">The anchor festival</p>
                <h2 className="mt-2 text-3xl font-semibold text-ink">Oguaa Fetu Afahye</h2>
                <p className="mt-3 text-ink-muted">The harvest and cleansing festival, climaxing the first Saturday of September — thanks to the 77 gods of Oguaa and to the sea, a ban on drumming that lets the spirits lead, and a grand durbar of chiefs in palanquins under state umbrellas.</p>
                <div className="mt-5"><Cta to="/events" variant="gold">See the festival event →</Cta></div>
              </div>
            </div>
          </Card></Reveal3D>
        </Container>
      </section>

      <Container className="py-12">
        <Reveal><SectionHeading kicker="Seven companies" title="The Asafo of Oguaa" lede="Once town soldiers, now ceremonial brotherhoods, each with its own colours and frankaa flags. (We honour their grammar; we never reproduce a real company's flag or shrine.)" accentClass="bg-clay" /></Reveal>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {COMPANIES.map((c, i) => (
            <StaggerItem key={c.name} index={i} className="flex items-center gap-3 rounded-[var(--radius-card)] border border-sand bg-cream p-4">
              <span className="h-8 w-8 shrink-0 rounded-full border border-sand" style={{ background: c.hex }} aria-hidden />
              <div><p className="text-lg text-ink">{c.name}</p><p className="text-xs text-ink-faint">{c.colour}</p></div>
            </StaggerItem>
          ))}
        </div>
      </Container>

      <section className="bg-cream py-12">
        <Container>
          <Reveal><SectionHeading kicker="The Traditional Council" title="Who holds authority" accentClass="bg-gold-brand" /></Reveal>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {OFFICES.map((o, i) => (<StaggerItem key={o.role} index={i} lift><Card className="h-full p-5"><h3 className="text-xl font-semibold text-ink">{o.role}</h3><p className="mt-1.5 text-sm text-ink-muted">{o.note}</p></Card></StaggerItem>))}
          </div>
          <p className="mt-6 text-sm text-ink-muted">See the <Link to="/education/oguaa-traditional-area" className="font-semibold text-gold-text hover:underline">Oguaa Traditional Area profile →</Link></p>
        </Container>
      </section>
    </>
  );
}
