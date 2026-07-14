import type { ComponentType, ReactNode } from "react";
import { Container, Eyebrow } from "./ui";

/**
 * An immersive page header: a full-bleed Cape Coast scene illustration behind a
 * dark wash, with a kicker, big title and short lede. Image-led, little text.
 */
export function PageHero({
  scene: Scene,
  coverUrl,
  kicker,
  title,
  lede,
  children,
}: Readonly<{
  scene: ComponentType<{ className?: string }>;
  /** When present, a real photo is shown behind the wash instead of the scene. */
  coverUrl?: string;
  kicker: string;
  title: ReactNode;
  lede?: string;
  children?: ReactNode;
}>) {
  return (
    <header className="on-dark relative isolate overflow-hidden bg-green-900 text-cream">
      <div className="absolute inset-0" aria-hidden>
        {coverUrl ? (
          <img
            src={coverUrl}
            alt=""
            className="h-full w-full object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="h-full w-full opacity-45"><Scene /></div>
        )}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-green-900 via-green-900/85 to-green-900/40" aria-hidden />
      <Container className="relative py-24 sm:py-32" size="wide">
        <Eyebrow className="text-gold">{kicker}</Eyebrow>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-[1.05] text-cream sm:text-6xl">{title}</h1>
        {lede && <p className="mt-5 max-w-2xl text-lg leading-relaxed text-cream/85">{lede}</p>}
        {children && <div className="mt-8">{children}</div>}
      </Container>
    </header>
  );
}
