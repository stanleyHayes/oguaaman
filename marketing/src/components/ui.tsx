import type { ReactNode } from "react";

/** Marketing UI primitives — self-contained (no router); CTAs are plain anchors. */

export function Container({
  children,
  className = "",
  size = "default",
}: Readonly<{
  children: ReactNode;
  className?: string;
  size?: "default" | "narrow" | "wide" | "prose";
}>) {
  const maxes: Record<string, string> = {
    narrow: "max-w-3xl",
    prose: "max-w-[46rem]",
    wide: "max-w-6xl",
    default: "max-w-5xl",
  };
  return <div className={`mx-auto w-full ${maxes[size]} px-5 sm:px-6 ${className}`}>{children}</div>;
}

type Tone = "paper" | "cream" | "sand" | "green" | "deep";

/** A full-width section band with consistent vertical rhythm and a surface tone. */
export function Section({
  id,
  children,
  className = "",
  tone = "paper",
  size = "default",
}: Readonly<{
  id?: string;
  children: ReactNode;
  className?: string;
  tone?: Tone;
  size?: "default" | "narrow" | "wide" | "prose";
}>) {
  const tones: Record<Tone, string> = {
    paper: "bg-paper text-ink",
    cream: "bg-cream text-ink",
    sand: "bg-sand text-ink",
    green: "bg-green text-cream on-dark",
    deep: "bg-green-900 text-cream on-dark",
  };
  return (
    <section id={id} className={`scroll-mt-20 py-20 sm:py-28 ${tones[tone]} ${className}`}>
      <Container size={size}>{children}</Container>
    </section>
  );
}

export function Eyebrow({ children, className = "" }: Readonly<{ children: ReactNode; className?: string }>) {
  return <p className={`eyebrow ${className}`}>{children}</p>;
}

export function SectionHeading({
  kicker,
  title,
  lede,
  accentClass = "bg-gold-brand",
  center = false,
  onDark = false,
}: Readonly<{
  kicker?: string;
  title: ReactNode;
  lede?: ReactNode;
  accentClass?: string;
  center?: boolean;
  onDark?: boolean;
}>) {
  return (
    <div className={center ? "text-center" : ""}>
      {kicker && <Eyebrow className={`mb-3 ${onDark ? "text-gold/80" : ""}`}>{kicker}</Eyebrow>}
      <h2 className={`text-3xl sm:text-[2.6rem] font-semibold ${onDark ? "text-cream" : "text-ink"}`}>
        {title}
      </h2>
      <div className={`mt-4 h-[3px] w-14 rounded-full ${accentClass} ${center ? "mx-auto" : ""}`} />
      {lede && (
        <p className={`mt-5 max-w-2xl leading-relaxed ${onDark ? "text-cream/80" : "text-ink-muted"} ${center ? "mx-auto" : ""}`}>
          {lede}
        </p>
      )}
    </div>
  );
}

export function Pill({
  children,
  tone = "neutral",
  className = "",
}: Readonly<{
  children: ReactNode;
  tone?: "neutral" | "green" | "gold" | "clay" | "teal" | "on-dark";
  className?: string;
}>) {
  const tones: Record<string, string> = {
    neutral: "border-sand bg-cream text-ink-muted",
    green: "border-green/30 bg-green/[0.06] text-green",
    gold: "border-gold-border/40 bg-gold/[0.12] text-gold-text",
    clay: "border-clay/30 bg-clay/[0.08] text-clay-text",
    teal: "border-teal/30 bg-teal/[0.09] text-teal-text",
    "on-dark": "border-cream/20 bg-cream/[0.08] text-cream/90",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function Card({
  children,
  className = "",
  as: Tag = "div",
}: Readonly<{
  children: ReactNode;
  className?: string;
  as?: "div" | "article" | "li";
}>) {
  return (
    <Tag className={`rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)] ${className}`}>
      {children}
    </Tag>
  );
}

export function CTA({
  href,
  children,
  variant = "primary",
  className = "",
  external = false,
}: Readonly<{
  href: string;
  children: ReactNode;
  variant?: "primary" | "gold" | "outline" | "outline-dark";
  className?: string;
  external?: boolean;
}>) {
  const styles: Record<string, string> = {
    primary: "bg-green text-cream hover:bg-green-900",
    gold: "bg-gold-brand text-green-900 hover:bg-gold",
    outline: "border border-green/30 text-green hover:border-green",
    "outline-dark": "border border-cream/30 text-cream hover:border-gold",
  };
  const cls = `inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors ${styles[variant]} ${className}`;
  return (
    <a
      href={href}
      className={cls}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
    </a>
  );
}
