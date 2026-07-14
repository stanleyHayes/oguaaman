import { Container, CTA as Cta, Eyebrow } from "@/components/ui";
import { Adinkra } from "@/components/adinkra";
import { Wordmark } from "@/components/wordmark";
import { PORTAL_APP_URL } from "@/config";

/**
 * Opening hero for the Oguaa marketing site — a tall dark green band carrying the
 * promise of "the community home of Cape Coast." Left: wordmark, headline, subhead,
 * two CTAs and a trust line. Right (lg+): a stylized "portal" card mock crowned by
 * an Atlantic sun-and-waves motif and a quiet row of Adinkra marks.
 */
export function Hero() {
  return (
    <section
      id="top"
      className="relative isolate overflow-hidden bg-green-900 text-cream on-dark"
    >
      {/* Texture + warm glow */}
      <div className="bg-contours absolute inset-0 -z-10" aria-hidden />
      <div
        className="absolute inset-0 -z-10 bg-gradient-to-b from-green-900 via-green-900 to-green/60"
        aria-hidden
      />
      <div
        className="absolute -right-24 -top-24 -z-10 h-[36rem] w-[36rem] rounded-full bg-gold/10 blur-3xl"
        aria-hidden
      />

      <Container size="wide" className="relative">
        <div className="grid min-h-[88vh] grid-cols-1 items-center gap-12 py-24 sm:py-28 lg:min-h-[92vh] lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          {/* ---- Left: the message ---- */}
          <div className="max-w-2xl">
            <div className="rise">
              <Wordmark size="text-xl" />
            </div>

            <Eyebrow className="rise rise-2 mt-8 text-gold/80">
              Oguaa · Cape Coast, Ghana
            </Eyebrow>

            <h1 className="rise rise-2 mt-4 text-4xl font-semibold leading-[1.05] tracking-tight text-cream sm:text-5xl lg:text-[3.75rem]">
              The home of{" "}
              <span className="text-gradient-gold">Cape Coast</span>.
            </h1>

            <p className="rise rise-3 mt-6 max-w-xl font-serif text-lg leading-relaxed text-cream/80 sm:text-xl">
              A living gathering-place for its music, people, heritage, schools
              and the ones we remember. Built by Cape Coasters at home and in the
              diaspora — made by us, for us.
            </p>

            <div className="rise rise-3 mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Cta href={PORTAL_APP_URL} variant="gold" external>
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
              <Cta href="#get" variant="outline-dark">
                Get the mobile app
              </Cta>
            </div>

            <p className="rise rise-4 mt-6 font-mono text-xs tracking-wide text-cream/55">
              Free · Community-owned · Your number stays private.
            </p>
          </div>

          {/* ---- Right: the portal card mock (lg+) ---- */}
          <div className="rise rise-3 relative hidden lg:block" aria-hidden>
            {/* Atlantic sun + waves motif behind the card */}
            <svg
              className="absolute -top-10 right-2 h-40 w-40 text-gold/70"
              viewBox="0 0 120 120"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
            >
              <circle cx="60" cy="44" r="16" />
              {Array.from({ length: 12 }).map((_, i) => {
                const a = (i * Math.PI) / 6;
                const r1 = 22;
                const r2 = 30;
                return (
                  <line
                    key={a}
                    x1={60 + r1 * Math.cos(a)}
                    y1={44 + r1 * Math.sin(a)}
                    x2={60 + r2 * Math.cos(a)}
                    y2={44 + r2 * Math.sin(a)}
                  />
                );
              })}
              <path
                className="text-teal/70"
                d="M6 86c10 0 10-7 20-7s10 7 20 7 10-7 20-7 10 7 20 7 10-7 20-7 10 7 8 7"
              />
              <path
                className="text-teal/50"
                d="M6 100c10 0 10-7 20-7s10 7 20 7 10-7 20-7 10 7 20 7 10-7 20-7 10 7 8 7"
              />
            </svg>

            <div className="relative ml-auto w-full max-w-md rounded-[var(--radius-card)] border border-cream/15 bg-green/40 p-6 shadow-[var(--shadow-lift)] backdrop-blur-sm">
              {/* Card chrome */}
              <div className="flex items-center justify-between border-b border-cream/10 pb-4">
                <Wordmark size="text-lg" markTone="text-gold" />
                <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-[0.65rem] font-medium uppercase tracking-wider text-gold/90">
                  <span className="h-1.5 w-1.5 rounded-full bg-gold" />
                  {"Verified"}
                </span>
              </div>

              {/* Feature rows */}
              <ul className="mt-5 space-y-3">
                {[
                  {
                    name: "funtunfunefu" as const,
                    title: "People & families",
                    note: "Reconnect across the diaspora",
                  },
                  {
                    name: "sankofa" as const,
                    title: "Heritage & schools",
                    note: "Mfantsipim · Adisadel · Wesley Girls'",
                  },
                  {
                    name: "owuo-atwedee" as const,
                    title: "Yɛnkae — those we remember",
                    note: "Da yie. Held with dignity.",
                  },
                ].map((row) => (
                  <li
                    key={row.name}
                    className="flex items-center gap-4 rounded-xl border border-cream/10 bg-green-900/40 px-4 py-3"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-cream/[0.06] text-gold">
                      <Adinkra name={row.name} size={20} labelled={false} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-base font-semibold leading-tight text-cream">
                        {row.title}
                      </span>
                      <span className="block text-xs text-cream/55">
                        {row.note}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>

              {/* Footer chip row */}
              <div className="mt-5 flex items-center justify-between border-t border-cream/10 pt-4">
                <span className="font-mono text-[0.65rem] uppercase tracking-widest text-cream/45">
                  Kotokuraba
                </span>
                <span className="inline-flex items-center gap-2 text-gold/80">
                  <Adinkra name="crab" size={18} labelled={false} />
                  <span className="font-mono text-[0.65rem] uppercase tracking-widest">
                    Akwaaba
                  </span>
                </span>
              </div>
            </div>

            {/* Floating accent mark */}
            <span className="absolute -bottom-6 -left-6 grid h-16 w-16 place-items-center rounded-full border border-gold/30 bg-green-900 text-gold shadow-[var(--shadow-lift)]">
              <Adinkra name="adinkrahene" size={26} labelled={false} />
            </span>
          </div>
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
