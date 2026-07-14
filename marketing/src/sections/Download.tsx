import type { ReactNode } from "react";
import { Section, Container, Eyebrow, Pill, CTA } from "@/components/ui";
import { SymbolDivider } from "@/components/adinkra";
import { PORTAL_APP_URL, IOS_URL, ANDROID_URL } from "@/config";

/**
 * Download — the conversion / get-the-app band. The climax of the page:
 * one gold web-app CTA plus hand-drawn App Store / Google Play badges, and a
 * decorative "scan to open" QR square. Store links are wired to config; when a
 * store URL is still a placeholder ("#") the badge shows a "Coming soon" pill.
 */

interface StoreBadge {
  href: string;
  glyph: ReactNode;
  topLine: string;
  bottomLine: string;
  ariaLabel: string;
}

const APPLE_GLYPH = (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-7 w-7">
    <path
      d="M16.36 12.78c-.02-2.05 1.68-3.04 1.76-3.09-.96-1.4-2.45-1.6-2.98-1.62-1.27-.13-2.48.75-3.12.75-.64 0-1.64-.73-2.69-.71-1.39.02-2.67.81-3.38 2.05-1.44 2.5-.37 6.2 1.04 8.23.69 1 1.51 2.11 2.59 2.07 1.04-.04 1.43-.67 2.69-.67 1.25 0 1.61.67 2.71.65 1.12-.02 1.83-1.01 2.51-2.01.79-1.15 1.12-2.27 1.14-2.33-.03-.01-2.18-.84-2.2-3.32"
      fill="currentColor"
    />
    <path
      d="M14.3 6.66c.57-.69.95-1.65.85-2.6-.82.03-1.81.54-2.4 1.23-.53.61-.99 1.59-.86 2.52.91.07 1.84-.46 2.41-1.15"
      fill="currentColor"
    />
  </svg>
);

const PLAY_GLYPH = (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-7 w-7">
    <path d="M4.2 3.3 13.6 12 4.2 20.7c-.42.26-.9.02-.9-.5V3.8c0-.52.48-.76.9-.5Z" fill="currentColor" opacity="0.95" />
    <path d="m13.6 12 2.9-2.7 3.6 2.05c.55.32.55 1.18 0 1.5L16.5 14.7 13.6 12Z" fill="currentColor" opacity="0.7" />
    <path d="M4.2 3.3 13.6 12l-2.9 2.7L4.2 3.3Z" fill="currentColor" opacity="0.85" />
    <path d="M13.6 12 10.7 14.7 4.2 20.7 13.6 12Z" fill="currentColor" opacity="0.6" />
  </svg>
);

const STORES: StoreBadge[] = [
  {
    href: IOS_URL,
    glyph: APPLE_GLYPH,
    topLine: "Download on the",
    bottomLine: "App Store",
    ariaLabel: "Download Oguaa on the Apple App Store",
  },
  {
    href: ANDROID_URL,
    glyph: PLAY_GLYPH,
    topLine: "Get it on",
    bottomLine: "Google Play",
    ariaLabel: "Get Oguaa on Google Play",
  },
];

// A small fixed bitmap (1 = filled cell) that reads as a QR code without being one.
// Decorative only; the whole panel is aria-hidden.
const QR_GRID: number[][] = [
  [1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 1, 1, 0, 1],
  [1, 0, 1, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0, 1],
  [1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 0, 0, 1, 1, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0],
  [1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1],
  [0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 1, 0, 1, 0, 0],
  [1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1],
  [0, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1],
  [1, 1, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 0, 1, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 0, 1, 1, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1],
  [1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 0],
];

export function Download() {
  return (
    <Section id="get" tone="deep" size="wide" className="relative overflow-hidden">
      <div aria-hidden="true" className="bg-contours pointer-events-none absolute inset-0 opacity-[0.18]" />

      <Container size="wide" className="relative">
        <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
          <div className="rise">
            <Eyebrow className="mb-4 text-gold/80">YƐNKAE — CARRY IT WITH YOU</Eyebrow>

            <h2 className="font-display text-4xl font-semibold leading-[1.05] text-cream sm:text-5xl lg:text-6xl">
              Bring Oguaa with you.
            </h2>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-cream/80">
              The whole community home of Cape Coast — in your pocket. Festival photos,
              the great schools and their old-students' companies, businesses,
              memories, and the people we remember. From Kotokuraba to the diaspora,
              wherever you are, Oguaa comes too. Made by us, for us.
            </p>

            <div className="mt-9 flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
              <CTA href={PORTAL_APP_URL} variant="gold" external className="px-6 py-3 text-base">
                Open the web app
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14" />
                  <path d="m13 6 6 6-6 6" />
                </svg>
              </CTA>

              <p className="text-sm text-cream/55">
                No download needed — open it right in your browser.
              </p>
            </div>

            <div className="mt-7 flex flex-wrap gap-4">
              {STORES.map((store) => (
                <StoreButton key={store.bottomLine} {...store} />
              ))}
            </div>

            <p className="mt-7 text-xs leading-relaxed text-cream/45">
              Your privacy is part of the build: members connect, but phone numbers
              are never shown. Verified institutions only.
            </p>
          </div>

          <ScanPanel />
        </div>

        <SymbolDivider name="crab" tone="text-gold" className="mt-16 opacity-60" />
      </Container>
    </Section>
  );
}

function StoreButton({ href, glyph, topLine, bottomLine, ariaLabel }: StoreBadge) {
  const comingSoon = href === "#";
  return (
    <a
      href={href}
      aria-label={comingSoon ? `${ariaLabel} — coming soon` : ariaLabel}
      {...(comingSoon ? {} : { target: "_blank", rel: "noopener noreferrer" })}
      className="group inline-flex min-w-[10.5rem] items-center gap-3 rounded-2xl border border-gold-border/35 bg-cream/[0.04] px-4 py-2.5 transition-colors hover:border-gold/70 hover:bg-cream/[0.07] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
    >
      <span className="text-cream/90 transition-colors group-hover:text-gold">{glyph}</span>
      <span className="flex flex-col leading-none">
        <span className="text-[0.62rem] font-medium uppercase tracking-wide text-cream/55">{topLine}</span>
        <span className="mt-1 font-display text-lg font-semibold text-cream">{bottomLine}</span>
        {comingSoon && (
          <Pill tone="gold" className="mt-1.5 self-start px-2 py-0.5 text-[0.6rem]">
            Coming soon
          </Pill>
        )}
      </span>
    </a>
  );
}

function ScanPanel() {
  return (
    <div className="rise rise-2 flex justify-center lg:justify-end">
      <div className="relative w-full max-w-xs rounded-[var(--radius-card)] border border-cream/15 bg-cream/[0.05] p-6 text-center shadow-[var(--shadow-lift)] backdrop-blur-sm">
        <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-gold/80">
          Scan to open
        </p>

        <div
          aria-hidden="true"
          className="mx-auto mt-5 grid aspect-square w-44 max-w-full gap-[2px] rounded-xl bg-cream p-3 shadow-[var(--shadow-card)]"
          style={{ gridTemplateColumns: `repeat(${QR_GRID[0].length}, minmax(0, 1fr))` }}
        >
          {QR_GRID.flat().map((cell, i) => (
            <span
              key={i}
              className={`aspect-square rounded-[1px] ${cell ? "bg-green-900" : "bg-transparent"}`}
            />
          ))}
        </div>

        <p className="mt-5 text-sm leading-relaxed text-cream/70">
          Point your camera at the code to open Oguaa on your phone.
        </p>
        <p className="mt-2 font-serif text-sm italic text-gold/85">Akwaaba — welcome home.</p>
      </div>
    </div>
  );
}
