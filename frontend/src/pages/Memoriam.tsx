import { useLoaderData } from "react-router-dom";
import { usePageTitle } from "@/lib/use-page-title";
import type { Listing } from "@/lib/types";
import { api } from "@/lib/api";
import { Container, CTA as Cta } from "@/components/ui";
import { Adinkra, SymbolDivider } from "@/components/adinkra";
import { MemorialCard } from "@/components/cards";
import { Reveal, StaggerItem } from "@/components/motion";
import { YENKAE_DESCRIPTION } from "@/lib/content";

export async function loader() {
  return api.memorials();
}

export function Component() {
  const memorials = useLoaderData() as Listing[];
  usePageTitle("In Memoriam");
  return (
    <>
      <section className="bg-cream">
        <Container size="prose" className="py-16 text-center sm:py-20">
          <p className="eyebrow text-ink-faint">Yɛn<span className="text-gold-text">kae</span> · In Memoriam</p>
          <Adinkra name="gye-nyame" size={44} className="mx-auto mt-8 text-gold-brand" />
          <Reveal as="h1" className="mt-6 text-5xl font-semibold text-ink sm:text-6xl">Let us remember</Reveal>
          <Reveal as="p" delay={0.08} className="mt-6 text-left font-serif text-lg leading-relaxed text-ink">{YENKAE_DESCRIPTION}</Reveal>
        </Container>
      </section>

      <Container size="wide" className="pb-8">
        <SymbolDivider name="owuo-atwedee" className="mb-12" />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {memorials.map((m, i) => <StaggerItem key={m.id} index={i} lift><MemorialCard memorial={m} /></StaggerItem>)}
        </div>
      </Container>

      <section className="py-14">
        <Container size="narrow" className="text-center">
          <Reveal as="h2" className="text-2xl font-semibold text-ink">Honour someone you love</Reveal>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-ink-muted">
            A memorial may be created by a family member, friend, or association on behalf of the departed. Memorials are kept permanently; the family can always claim, correct, or guide them. Each is reviewed with heightened care and dignity before it appears.
          </p>
          <div className="mt-7"><Cta to="/submit?type=memorial" variant="gold">Create a memorial</Cta></div>
        </Container>
      </section>
    </>
  );
}
