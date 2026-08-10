import { useState } from "react";
import { Link } from "react-router-dom";
import { Container } from "@/components/ui";
import { Adinkra } from "@/components/adinkra";
import { StructuredData } from "@/components/structured-data";
import { SITE_URL } from "@/config";

/**
 * A time-boxed announcement band for the town's next big festival.
 *
 * ── HOW TO RETIRE OR REPLACE THIS ──────────────────────────────────────────
 * It removes itself: once `ENDS` has passed the component renders null, so
 * nothing has to be deployed the morning after the durbar. To run it again next
 * year, update the four constants in FESTIVAL below. To pull it early, delete
 * the <FestivalAnnouncement /> line from pages/Home.tsx — nothing else imports
 * it.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * The Event JSON-LD is the SEO half: "Fetu Afahye 2026" is a seasonal search
 * spike, and an Event entity with real dates and a real location is what makes
 * a site eligible for the date-stamped event result rather than a blue link.
 */

const FESTIVAL = {
  name: "Oguaa Fetu Afahye 2026",
  /** Festivities open — the durbar is the climax a week later. */
  starts: "2026-08-29",
  /** Grand durbar: the first Saturday of September. */
  durbar: "2026-09-05",
  /** Banner disappears after this date (durbar day + the Sunday after). */
  ends: "2026-09-06",
  place: "Victoria Park, Cape Coast",
} as const;

const DAY_MS = 86_400_000;

/** Midday UTC keeps day-difference arithmetic clear of timezone edges. */
const at = (iso: string) => new Date(`${iso}T12:00:00Z`).getTime();

function formatRange(): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", timeZone: "UTC" };
  const start = new Date(at(FESTIVAL.starts)).toLocaleDateString("en-GB", opts);
  const durbar = new Date(at(FESTIVAL.durbar)).toLocaleDateString("en-GB", {
    ...opts,
    weekday: "long",
    year: "numeric",
  });
  return `${start} — grand durbar ${durbar}`;
}

/** Human countdown, or the live/holding state on the day itself. */
function countdown(now: number): string | null {
  const days = Math.ceil((at(FESTIVAL.durbar) - now) / DAY_MS);
  if (days > 1) return `${days} days to the grand durbar`;
  if (days === 1) return "Tomorrow — the grand durbar";
  if (days === 0) return "Today — the grand durbar";
  return null;
}

export function FestivalAnnouncement() {
  // The clock is read once, in a lazy initialiser, rather than during render:
  // reading it during render is impure (the value would drift between renders),
  // and the copy only changes once a day, so a ticking interval would re-render
  // the home page for no visible gain.
  const [now] = useState(() => Date.now());

  if (now > at(FESTIVAL.ends) + DAY_MS) return null;

  const when = countdown(now);

  return (
    <>
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@type": "Festival",
          name: FESTIVAL.name,
          alternateName: ["Fetu Afahye", "Oguaa Fetu Afahye", "Cape Coast Fetu Afahye"],
          startDate: FESTIVAL.starts,
          endDate: FESTIVAL.ends,
          eventStatus: "https://schema.org/EventScheduled",
          eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
          description:
            "Oguaa Fetu Afahye — Cape Coast's annual festival of purification and thanksgiving. A week of Asafo processions, drumming and rites, climaxing in the grand durbar of chiefs on the first Saturday of September.",
          image: [`${SITE_URL}/og-image.png`],
          location: {
            "@type": "Place",
            name: FESTIVAL.place,
            address: {
              "@type": "PostalAddress",
              addressLocality: "Cape Coast",
              addressRegion: "Central Region",
              addressCountry: "GH",
            },
          },
          // `url` on the organiser and the performer is what lets a search engine
          // resolve them as entities rather than bare strings. Neither the Council
          // nor the companies keep an official site, so each points at the page
          // here that actually describes it.
          organizer: {
            "@type": "Organization",
            name: "Oguaa Traditional Council",
            url: `${SITE_URL}/leadership`,
          },
          performer: {
            "@type": "PerformingGroup",
            name: "The seven Asafo companies of Oguaa",
            url: `${SITE_URL}/culture`,
          },
          // The durbar is free to walk into and always has been. Google still
          // wants that said as an Offer — `isAccessibleForFree` alone doesn't
          // qualify the page for the event result. No tickets are sold, so the
          // free-entry offer simply stands for the whole festival year.
          offers: {
            "@type": "Offer",
            name: "Free public attendance",
            price: 0,
            priceCurrency: "GHS",
            availability: "https://schema.org/InStock",
            validFrom: `${FESTIVAL.starts.slice(0, 4)}-01-01`,
            url: `${SITE_URL}/festivals`,
          },
          url: `${SITE_URL}/festivals`,
          isAccessibleForFree: true,
        }}
      />

      <aside
        aria-labelledby="festival-announcement-title"
        className="on-dark on-dark-pin relative overflow-hidden border-b border-gold/25 bg-green-900 text-cream"
      >
        <div className="bg-dotgrid absolute inset-0 opacity-15" aria-hidden />
        <Container size="wide" className="relative flex flex-col gap-5 py-6 sm:py-7 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
          <div className="flex items-start gap-4">
            <Adinkra name="crab" size={30} labelled={false} strokeWidth={1.4} className="mt-1 shrink-0 text-gold/80" />
            <div>
              {/* Wide tracking makes this string long — let it wrap on narrow phones. */}
              <p className="font-mono text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gold sm:tracking-[0.22em]">
                Announcement{when ? ` · ${when}` : ""}
              </p>
              <h2 id="festival-announcement-title" className="mt-2 text-2xl font-semibold leading-tight sm:text-3xl">
                Oguaa Fetu Afahye 2026 is here.
              </h2>
              <p className="mt-2 max-w-2xl leading-relaxed text-cream/75">
                A week of Asafo processions, drumming and rites across the town, climaxing in the grand durbar of
                chiefs. <span className="font-semibold text-cream">{formatRange()}</span>.
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-3 lg:justify-end">
            <Link
              to="/festivals"
              className="inline-flex items-center justify-center rounded-full bg-gold-brand px-5 py-2.5 text-sm font-semibold text-green-900 transition-colors hover:bg-gold"
            >
              What happens, day by day <span className="ml-2" aria-hidden>→</span>
            </Link>
            <Link
              to="/visit"
              className="inline-flex items-center justify-center rounded-full border border-cream/30 px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:border-gold hover:text-gold"
            >
              Plan your visit
            </Link>
          </div>
        </Container>
      </aside>
    </>
  );
}
