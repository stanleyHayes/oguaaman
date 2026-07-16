import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Container } from "./ui";
import { CircularReveal, Parallax, Reveal } from "./motion";
import { Breadcrumbs, HeroIcon, HeroWatermark } from "./hero-chrome";
import { sectionIdFromPath, type Crumb } from "@/lib/breadcrumbs";
import { cldCover } from "@/lib/cloudinary";

const GRADIENTS = {
  green: "linear-gradient(140deg, #1B5A3F 0%, #123F2D 55%, #0C2C1F 100%)",
  teal: "linear-gradient(140deg, #0E7C6B 0%, #0B6557 55%, #083f37 100%)",
  gold: "linear-gradient(140deg, #B07D32 0%, #8A5E1F 55%, #123F2D 100%)",
} as const;

/**
 * Immersive top-of-page hero for detail pages (event, business, project):
 * toned gradient, gold dotgrid, the cover washed behind the title, a
 * breadcrumb, a pills row (children), and a meta line.
 */
export function DetailHero({
  tone,
  backTo,
  backLabel,
  coverImageUrl,
  title,
  meta,
  sectionId,
  crumbs,
  children,
}: Readonly<{
  tone: keyof typeof GRADIENTS;
  backTo: string;
  backLabel: string;
  coverImageUrl?: string;
  title: ReactNode;
  meta?: ReactNode;
  /** SectionIcon id for the animated icon + watermark. Auto-derived from the route. */
  sectionId?: string;
  /** Override the auto-derived Home / Section / Page breadcrumb trail. */
  crumbs?: Crumb[];
  children?: ReactNode;
}>) {
  const { pathname } = useLocation();
  const iconId = sectionId ?? sectionIdFromPath(pathname);
  const finalLabel = typeof title === "string" ? title : undefined;
  const crumbList = crumbs ?? [
    { label: "Home", to: "/" },
    { label: backLabel, to: backTo },
    ...(finalLabel ? [{ label: finalLabel }] : []),
  ];

  return (
    <section className="on-dark on-dark-pin relative overflow-hidden text-cream">
      <Parallax strength={24} className="absolute -inset-y-6 inset-x-0">
        <div className="absolute inset-0" style={{ background: GRADIENTS[tone] }} aria-hidden />
      </Parallax>
      {coverImageUrl && (
        <Parallax strength={16} className="absolute -inset-y-6 inset-x-0">
          <CircularReveal className="absolute inset-0">
            <img
              src={cldCover(coverImageUrl, 1400)}
              alt=""
              aria-hidden
              className="h-full w-full object-cover opacity-20"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          </CircularReveal>
        </Parallax>
      )}
      <div className="bg-dotgrid absolute inset-0 opacity-40" aria-hidden />
      <HeroWatermark sectionId={iconId} onDark />
      <Container size="wide" className="relative py-10 sm:py-14">
        <Reveal><Breadcrumbs crumbs={crumbList} onDark /></Reveal>
        <Reveal delay={0.05} className="mt-5"><HeroIcon sectionId={iconId} onDark /></Reveal>
        {children && <Reveal delay={0.08} className="mt-4 flex flex-wrap items-center gap-2">{children}</Reveal>}
        <Reveal as="h1" delay={0.12} className="mt-3 max-w-3xl text-4xl font-semibold leading-[1.05] sm:text-5xl">{title}</Reveal>
        {meta && <Reveal delay={0.16} className="mt-3 text-sm text-cream/85 sm:text-base">{meta}</Reveal>}
      </Container>
    </section>
  );
}
