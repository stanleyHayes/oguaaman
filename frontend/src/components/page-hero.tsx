import type { ReactNode } from "react";
import { Container, Eyebrow } from "./ui";
import { Adinkra, type AdinkraName } from "./adinkra";
import { Parallax, Reveal } from "./motion";
import { TONES, type Tone } from "@/lib/sections";

/** Standard top-of-section hero — a slim accent border on the cream field.
 *  Pass `image` for the photo-forward variant: the photo carries the band under
 *  a green-900 scrim, the tonal border keeps the section's identity, and the
 *  kicker goes gold (dark-on-cream tone tokens would fail contrast on a photo). */
export function PageHero({
  tone,
  kicker,
  title,
  fanteName,
  lede,
  symbol,
  image,
  children,
}: Readonly<{
  tone: Tone;
  kicker: string;
  title: ReactNode;
  fanteName?: string;
  lede?: ReactNode;
  symbol?: AdinkraName;
  /** Optional seed photo (e.g. /uploads/seed/castle-exterior.jpg) — media variant. */
  image?: string;
  children?: ReactNode;
}>) {
  const t = TONES[tone];

  if (image) {
    return (
      <section className={`on-dark-pin relative overflow-hidden border-t-4 ${t.border} bg-green-900`}>
        <img src={image} alt="" fetchPriority="high" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-green-900/95 via-green-900/70 to-green-900/25" />
        <div className="absolute inset-0 bg-gradient-to-t from-green-900/70 via-transparent to-green-900/20" />
        {symbol && (
          <Parallax strength={20} className="pointer-events-none absolute right-4 top-6 hidden text-gold sm:block">
            <Adinkra name={symbol} size={120} labelled={false} className="opacity-[0.10]" />
          </Parallax>
        )}
        <Container className="relative py-16 sm:py-20">
          <Reveal>
            <Eyebrow className="text-gold">{kicker}</Eyebrow>
            <h1 className="mt-3 text-4xl font-semibold text-cream sm:text-5xl">
              {title}
              {fanteName && <span className="ml-3 italic text-gold">{fanteName}</span>}
            </h1>
          </Reveal>
          {lede && <Reveal as="p" delay={0.08} className="mt-5 max-w-2xl text-lg leading-relaxed text-cream/85">{lede}</Reveal>}
          {children && <div className="mt-7">{children}</div>}
        </Container>
      </section>
    );
  }

  return (
    <section className={`relative border-t-4 ${t.border} bg-cream`}>
      <Container className="relative py-14 sm:py-16">
        {symbol && (
          <Parallax strength={20} className={`pointer-events-none absolute right-4 top-6 hidden sm:block ${t.text}`}>
            <Adinkra name={symbol} size={120} labelled={false} className="opacity-[0.06]" />
          </Parallax>
        )}
        <Reveal>
          <Eyebrow className={t.text}>{kicker}</Eyebrow>
          <h1 className="mt-3 text-4xl font-semibold text-ink sm:text-5xl">
            {title}
            {fanteName && <span className={`ml-3 italic ${t.text}`}>{fanteName}</span>}
          </h1>
        </Reveal>
        {lede && <Reveal as="p" delay={0.08} className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-muted">{lede}</Reveal>}
        {children && <div className="mt-7">{children}</div>}
      </Container>
    </section>
  );
}
