import { Container, CTA as Cta, Eyebrow } from "@/components/ui";
import { Stagger, StaggerItem, WordReveal } from "@/components/motion";
import { HeroWireframe } from "@/components/hero-wireframe";
import { Wordmark } from "@/components/wordmark";
import { PORTAL_APP_URL } from "@/config";

/**
 * Opening hero for the Oguaa marketing site — a tall dark green band carrying the
 * promise of "the community home of Cape Coast." Left: wordmark, headline, subhead,
 * two CTAs and a trust line. Right (lg+): an interactive wireframe object inspired
 * by the Graphify hero treatment.
 */
export function Hero() {
  return (
    <section
      id="top"
      className="relative isolate overflow-hidden bg-green-900 text-cream on-dark on-dark-pin"
    >
      <div className="hero-gold-grid pointer-events-none -z-10" aria-hidden />
      <Container size="wide" className="relative">
        <div className="grid min-h-[88vh] grid-cols-1 items-center gap-12 py-24 sm:py-28 lg:min-h-[92vh] lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          {/* ---- Left: the message ---- */}
          <Stagger className="max-w-2xl">
            <StaggerItem index={0}>
              <Wordmark size="text-xl" />
            </StaggerItem>

            <StaggerItem index={1}>
              <Eyebrow className="mt-8 text-gold/80">
                Oguaa · Cape Coast, Ghana
              </Eyebrow>
            </StaggerItem>

            <div className="mt-4">
              <WordReveal
                text="The home of Cape Coast."
                accentWords={["Cape", "Coast"]}
                accentClassName="text-gradient-gold text-shimmer-gold"
                className="font-sans text-[clamp(2.8rem,6vw,5.4rem)] font-semibold leading-[0.92] tracking-[-0.035em] text-cream"
              />
            </div>

            <StaggerItem index={2}>
              <p className="mt-6 max-w-xl font-serif text-lg leading-relaxed text-cream/80 sm:text-xl">
                A living gathering-place for its music, people, heritage, schools
                and the ones we remember. Built by Cape Coasters at home and in the
                diaspora — made by us, for us.
              </p>
            </StaggerItem>

            <StaggerItem index={3}>
              <div className="mt-9 flex flex-col gap-3">
                <Cta href={PORTAL_APP_URL} variant="gold" external className="w-full justify-center">
                  Open the web app
                  <svg
                    width={16}
                    height={16}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </Cta>
                <Cta href="#get" variant="outline-dark" className="w-full justify-center">
                  Get the mobile app
                </Cta>
              </div>
            </StaggerItem>

            <StaggerItem index={4}>
              <p className="mt-6 font-mono text-xs tracking-wide text-cream/55">
                Free · Community-owned · Your number stays private.
              </p>
            </StaggerItem>
          </Stagger>

          {/* ---- Right: interactive wireframe object (lg+) ---- */}
          <HeroWireframe />
        </div>
      </Container>
    </section>
  );
}
