import { usePageTitle } from "@/lib/use-page-title";
import { PageHero } from "@/components/page-hero";
import { Container, Card, SectionHeading, CTA as Cta } from "@/components/ui";
import { Thumb } from "@/components/cards";
import { Reveal, StaggerItem } from "@/components/motion";
import { VISIT_BLURB } from "@/lib/content";
import { PHOTOS } from "@/lib/cape-coast-photos";

const SPOTS = [
  { t: "Cape Coast Castle", b: "Stand at the Door of No Return — a UNESCO World Heritage site and the heart of the diaspora homecoming.", seed: "castle", src: PHOTOS.capeCoastCastle },
  { t: "Kakum National Park", b: "Thirty-three kilometres north: seven canopy bridges, ~350 m of swaying walkway up to 40 m above the rainforest.", seed: "kakum", src: PHOTOS.kakum },
  { t: "The coast & the castles", b: "Atlantic beaches, the fishing harbour, and Elmina's São Jorge da Mina half an hour west along the shore.", seed: "coast", src: PHOTOS.elminaCastle },
  { t: "Fante kenkey (dokonu)", b: "Fermented corn dough steamed in plantain leaves — softer and sourer than its Ga cousin — with fresh fish, shito and pepper.", seed: "kenkey", src: "https://res.cloudinary.com/demo/image/upload/samples/food/spices.jpg" },
];

export function Component() {
  usePageTitle("Visit Oguaa");
  return (
    <>
      <PageHero tone="teal" kicker="Tourism · the coast" title="Visit Oguaa" symbol="crab" image="/uploads/seed/kakum-canopy.jpg" lede="Come for the Castle and stay for the coast — the canopy, the beaches, the markets, the food, and a festival in September.">
        <Cta to="/culture" variant="gold">Time it for Fetu Afahye →</Cta>
      </PageHero>
      <Container size="prose" className="py-12"><p className="font-serif text-lg leading-relaxed text-ink">{VISIT_BLURB}</p></Container>
      <Container size="wide" className="pb-14">
        <Reveal><SectionHeading kicker="What to see & eat" title="The essentials" accentClass="bg-teal" /></Reveal>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {SPOTS.map((s, i) => (
            <StaggerItem key={s.t} index={i} lift className="h-full">
            <Card as="article" className="h-full overflow-hidden">
              <Thumb seed={s.seed} src={s.src} className="aspect-[16/7] w-full" rounded="rounded-none" coverWidth={500} />
              <div className="p-5"><h3 className="text-xl font-semibold text-ink">{s.t}</h3><p className="mt-2 text-sm text-ink-muted">{s.b}</p></div>
            </Card>
            </StaggerItem>
          ))}
        </div>
      </Container>
    </>
  );
}
