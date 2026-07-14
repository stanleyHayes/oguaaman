import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Container } from "./ui";
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
  children,
}: Readonly<{
  tone: keyof typeof GRADIENTS;
  backTo: string;
  backLabel: string;
  coverImageUrl?: string;
  title: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
}>) {
  return (
    <section className="on-dark relative overflow-hidden text-cream">
      <div className="absolute inset-0" style={{ background: GRADIENTS[tone] }} aria-hidden />
      {coverImageUrl && (
        <img
          src={cldCover(coverImageUrl, 1400)}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover opacity-20"
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
      )}
      <div className="bg-dotgrid absolute inset-0 opacity-40" aria-hidden />
      <Container size="wide" className="relative py-10 sm:py-14">
        <Link to={backTo} className="text-sm text-cream/70 transition-colors hover:text-gold">← {backLabel}</Link>
        {children && <div className="mt-5 flex flex-wrap items-center gap-2">{children}</div>}
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-[1.05] sm:text-5xl">{title}</h1>
        {meta && <div className="mt-3 text-sm text-cream/85 sm:text-base">{meta}</div>}
      </Container>
    </section>
  );
}
