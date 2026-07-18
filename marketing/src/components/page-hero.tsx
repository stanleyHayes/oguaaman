import type { ComponentType, ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Container, Eyebrow } from "./ui";
import { mediaUrl } from "@/lib/media";
import { Parallax, Stagger, StaggerItem, WordReveal } from "./motion";
import { Breadcrumbs, HeroIcon, HeroWatermark } from "./hero-chrome";
import { deriveCrumbs, sectionIdFromPath, type Crumb } from "@/lib/breadcrumbs";

/**
 * An immersive page header: a full-bleed Cape Coast scene illustration behind a
 * dark wash, with a kicker, big title and short lede. Image-led, little text.
 *
 * Every banner also carries a route-derived breadcrumb trail, a mount-animated
 * section icon, and a large faint corner watermark. All three auto-derive from
 * the current route; override with `sectionId` / `crumbs` when needed.
 */
export function PageHero({
  scene: Scene,
  coverUrl,
  kicker,
  title,
  lede,
  sectionId,
  crumbs,
  children,
}: Readonly<{
  scene: ComponentType<{ className?: string }>;
  /** When present, a real photo is shown behind the wash instead of the scene. */
  coverUrl?: string;
  kicker: string;
  title: ReactNode;
  lede?: string;
  /** SectionIcon id for the animated icon + watermark. Auto-derived from the route. */
  sectionId?: string;
  /** Override the auto-derived Home / Section / Page breadcrumb trail. */
  crumbs?: Crumb[];
  children?: ReactNode;
}>) {
  const { pathname } = useLocation();
  const iconId = sectionId ?? sectionIdFromPath(pathname);
  const crumbList = crumbs ?? deriveCrumbs(pathname, typeof title === "string" ? title : undefined);

  return (
    <header className="on-dark on-dark-pin relative isolate overflow-hidden bg-green-900 text-cream">
      <Parallax className="absolute inset-x-0 -inset-y-16" distance={48}>
        <div className="h-full w-full" aria-hidden>
          <div className="absolute inset-0 h-full w-full opacity-45"><Scene /></div>
          {coverUrl && (
            <img
              src={mediaUrl(coverUrl)}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          )}
        </div>
      </Parallax>
      <div className="absolute inset-0 bg-gradient-to-t from-green-900 via-green-900/85 to-green-900/40" aria-hidden />
      <HeroWatermark sectionId={iconId} onDark />
      <Container className="relative py-24 sm:py-32" size="wide">
        <Stagger>
          <StaggerItem index={0}>
            <Breadcrumbs crumbs={crumbList} onDark className="mb-6" />
          </StaggerItem>
          <StaggerItem index={1}>
            <HeroIcon sectionId={iconId} onDark />
            <Eyebrow className="mt-4 text-gold">{kicker}</Eyebrow>
          </StaggerItem>
          {typeof title === "string" ? (
            <WordReveal
              text={title}
              className="mt-3 max-w-3xl text-4xl font-semibold leading-[1.05] text-cream sm:text-6xl"
            />
          ) : (
            <StaggerItem index={2}>
              <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-[1.05] text-cream sm:text-6xl">{title}</h1>
            </StaggerItem>
          )}
          {lede && (
            <StaggerItem index={3}>
              <p className="mt-5 max-w-2xl text-lg leading-relaxed text-cream/85">{lede}</p>
            </StaggerItem>
          )}
          {children && (
            <StaggerItem index={4}>
              <div className="mt-8">{children}</div>
            </StaggerItem>
          )}
        </Stagger>
      </Container>
    </header>
  );
}
