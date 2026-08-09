import { Link } from "react-router-dom";
import { usePageTitle } from "@/lib/use-page-title";
import { PageHero } from "@/components/page-hero";
import { Container, CTA as Cta, Eyebrow } from "@/components/ui";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { Adinkra } from "@/components/adinkra";
import { cldCover } from "@/lib/cloudinary";
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
  { role: "Omanhene", note: "The paramount chief and head of the Traditional Council.", number: "01" },
  { role: "Ohemaa", note: "The queen mother, who nominates candidates to a vacant stool.", number: "02" },
  { role: "Okyeame", note: "The linguist who speaks for the chief and pours libation.", number: "03" },
  { role: "Asafohene", note: "The head of an Asafo company and commander of its brotherhood.", number: "04" },
];

export function Component() {
  usePageTitle("Culture & Festivals");
  return (
    <>
      <PageHero tone="gold" kicker="The brightest register" title="The soul of the Fante, in full colour" symbol="funtunfunefu" image="/uploads/seed/fetu-procession.jpg" lede="Asafo colours, frankaa proverbs, palace language and the September festival that turns all of Oguaa into one percussion section.">
        <nav aria-label="Explore culture" className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-cream/80"><a href="#fetu" className="border-b border-gold/50 pb-1 hover:text-gold">Fetu Afahye</a><a href="#asafo" className="border-b border-gold/50 pb-1 hover:text-gold">The seven Asafo</a><a href="#council" className="border-b border-gold/50 pb-1 hover:text-gold">Traditional authority</a></nav>
      </PageHero>

      <section className="relative overflow-hidden border-b border-sand bg-paper py-16 sm:py-24">
        <Adinkra name="funtunfunefu" size={260} labelled={false} className="pointer-events-none absolute -right-16 top-1/2 -translate-y-1/2 text-gold-brand opacity-[0.045]" />
        <Container className="relative grid gap-10 lg:grid-cols-[0.65fr_1.35fr]">
          <Reveal><Eyebrow className="text-gold-text">Culture is a public language</Eyebrow><p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-faint">Every colour, drum pattern and public role carries meaning. This guide offers context without reproducing sacred flags or shrine imagery.</p></Reveal>
          <Reveal delay={0.08}><p className="max-w-[45rem] text-2xl font-medium leading-[1.35] tracking-[-0.015em] text-ink sm:text-3xl">{CULTURE_BLURB}</p></Reveal>
        </Container>
      </section>

      <section id="fetu" className="scroll-mt-24 bg-cream py-16 sm:py-24">
        <Container size="wide">
          <div className="grid overflow-hidden rounded-[2rem] bg-green-900 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="relative min-h-80 lg:min-h-[36rem]"><img src={cldCover("/uploads/seed/fetu-queenmother.jpg", 800)} alt="A queen mother in ceremonial regalia during Fetu Afahye" loading="lazy" className="absolute inset-0 h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-green-900/55 to-transparent" /></div>
            <Reveal className="flex flex-col justify-center p-8 text-cream sm:p-12 lg:p-14"><Eyebrow className="text-gold">The anchor festival</Eyebrow><h2 className="mt-4 text-4xl font-semibold text-cream sm:text-5xl">Oguaa Fetu Afahye</h2><p className="mt-6 max-w-xl text-lg leading-relaxed text-cream/75">The harvest and cleansing festival reaches its height on the first Saturday of September: a grand durbar, chiefs beneath state umbrellas, Asafo processions and the city gathered around its traditional authority.</p><dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-cream/15"><div className="bg-green-900/50 p-4"><dt className="text-xs uppercase tracking-widest text-cream/50">2026 climax</dt><dd className="mt-1 font-semibold text-gold">5 September</dd></div><div className="bg-green-900/50 p-4"><dt className="text-xs uppercase tracking-widest text-cream/50">Meaning</dt><dd className="mt-1 font-semibold text-gold">Clearing the dirt</dd></div></dl><div className="mt-8"><Cta to="/festivals" variant="gold">Explore festival editions →</Cta></div></Reveal>
          </div>
        </Container>
      </section>

      <section id="asafo" className="scroll-mt-24 bg-paper py-16 sm:py-24">
        <Container>
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-end"><Reveal><Eyebrow className="text-clay-text">Seven companies</Eyebrow><h2 className="mt-4 text-4xl font-semibold sm:text-5xl">The Asafo of Oguaa</h2></Reveal><Reveal delay={0.08} as="p" className="max-w-xl text-lg leading-relaxed text-ink-muted lg:justify-self-end">Once town soldiers, now ceremonial brotherhoods. Each carries its own colour, songs, offices and visual grammar.</Reveal></div>
          <Stagger as="ol" className="mt-12 border-t border-sand">
            {COMPANIES.map((company, index) => <StaggerItem as="li" key={company.name} className="group grid grid-cols-[2.5rem_2.5rem_1fr_auto] items-center gap-4 border-b border-sand py-5 sm:gap-6"><span className="text-xs text-ink-faint tabular-nums">{String(index + 1).padStart(2, "0")}</span><span className="h-9 w-9 rounded-full border border-ink/10 shadow-inner" style={{ backgroundColor: company.hex }} aria-hidden /><h3 className="text-xl font-semibold text-ink">{company.name}</h3><span className="text-sm text-ink-muted">{company.colour}</span></StaggerItem>)}
          </Stagger>
          <p className="mt-6 max-w-2xl text-sm leading-relaxed text-ink-faint">We honour the companies' visual grammar; this guide does not reproduce a real company's frankaa flag or shrine.</p>
        </Container>
      </section>

      <section id="council" className="scroll-mt-24 bg-gold/[0.10] py-16 sm:py-24">
        <Container>
          <Reveal><Eyebrow className="text-gold-text">The Traditional Council</Eyebrow><h2 className="mt-4 text-4xl font-semibold sm:text-5xl">How authority speaks</h2><p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-muted">The stool is an institution, held through defined roles and a public language of responsibility.</p></Reveal>
          <Stagger className="mt-12 grid gap-x-10 border-t border-gold-border/30 sm:grid-cols-2">
            {OFFICES.map((office) => <StaggerItem key={office.role} className="grid grid-cols-[2.5rem_1fr] gap-4 border-b border-gold-border/30 py-7"><span className="text-xs font-semibold text-gold-text tabular-nums">{office.number}</span><div><h3 className="text-2xl font-semibold text-ink">{office.role}</h3><p className="mt-2 leading-relaxed text-ink-muted">{office.note}</p></div></StaggerItem>)}
          </Stagger>
          <Reveal className="mt-10 flex flex-col gap-5 border-l-2 border-clay pl-6 sm:flex-row sm:items-center sm:justify-between"><p className="max-w-xl text-lg text-ink-muted">Meet the office-holders and learn how the Oguaa Traditional Area is organised.</p><Link to="/education/oguaa-traditional-area" className="w-fit border-b border-green pb-1 text-sm font-semibold text-green">Open the official profile →</Link></Reveal>
        </Container>
      </section>

      <section className="on-dark-pin relative overflow-hidden bg-green-900 py-16 text-cream"><img src={cldCover("/uploads/seed/fetu-crowd.jpg", 1400)} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover opacity-20" /><div className="absolute inset-0 bg-green-900/75" /><Container className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between"><div><Eyebrow className="text-gold">Come with context</Eyebrow><h2 className="mt-3 text-3xl font-semibold text-cream">Planning a September visit?</h2></div><Link to="/visit" className="w-fit border-b border-gold pb-1 font-semibold text-gold">Open the visitor guide →</Link></Container></section>
    </>
  );
}
