import { Container, CTA as Cta, Eyebrow } from "@/components/ui";
import { Parallax, Stagger, StaggerItem, WordReveal } from "@/components/motion";
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
      {/* Texture + warm glow */}
      <Parallax className="absolute -inset-16 -z-10" distance={40} aria-hidden>
        <div className="bg-contours h-full w-full" />
      </Parallax>
      <div
        className="absolute inset-0 -z-10 bg-gradient-to-b from-green-900 via-green-900 to-green/60 aurora-bg"
        aria-hidden
      />
      <Parallax className="absolute -right-24 -top-24 -z-10 h-[36rem] w-[36rem]" distance={70} aria-hidden>
        <div className="h-full w-full rounded-full bg-gold/10 blur-3xl" />
      </Parallax>

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
                className="text-4xl font-semibold leading-[1.05] tracking-tight text-cream sm:text-5xl lg:text-[3.75rem]"
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

      {/* Soft fade into the next band */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-green-900/0"
        aria-hidden
      />
    </section>
  );
}
