import type { ReactNode } from "react";
import { Container, Eyebrow } from "./ui";
import { Adinkra, type AdinkraName } from "./adinkra";
import { Parallax, Reveal } from "./motion";
import { TONES, type Tone } from "@/lib/sections";

/** Standard top-of-section hero — a slim accent border on the cream field. */
export function PageHero({
  tone,
  kicker,
  title,
  fanteName,
  lede,
  symbol,
  children,
}: Readonly<{
  tone: Tone;
  kicker: string;
  title: ReactNode;
  fanteName?: string;
  lede?: ReactNode;
  symbol?: AdinkraName;
  children?: ReactNode;
}>) {
  const t = TONES[tone];
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
