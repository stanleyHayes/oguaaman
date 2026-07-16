import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { cldAvatar } from "@/lib/cloudinary";

type ContainerSize = "default" | "narrow" | "wide" | "prose";

function containerMax(size: ContainerSize): string {
  if (size === "narrow") return "max-w-3xl";
  if (size === "prose") return "max-w-[44rem]";
  if (size === "wide") return "max-w-6xl";
  return "max-w-5xl";
}

export function Container({
  children,
  className = "",
  size = "default",
}: Readonly<{
  children: ReactNode;
  className?: string;
  size?: ContainerSize;
}>) {
  const max = containerMax(size);
  return <div className={`mx-auto w-full ${max} px-4 sm:px-6 ${className}`}>{children}</div>;
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
}: Readonly<{
  kicker?: string;
  title: ReactNode;
  lede?: ReactNode;
  accentClass?: string;
  center?: boolean;
}>) {
  return (
    <div className={center ? "text-center" : ""}>
      {kicker && <Eyebrow className="mb-3">{kicker}</Eyebrow>}
      <h2 className="text-3xl sm:text-4xl font-semibold text-ink">{title}</h2>
      <div className={`mt-4 h-[3px] w-14 rounded-full ${accentClass} ${center ? "mx-auto" : ""}`} />
      {lede && <p className={`mt-5 max-w-2xl text-ink-muted leading-relaxed ${center ? "mx-auto" : ""}`}>{lede}</p>}
    </div>
  );
}

export function Pill({
  children,
  tone = "neutral",
  className = "",
}: Readonly<{
  children: ReactNode;
  tone?: "neutral" | "green" | "gold" | "clay" | "teal";
  className?: string;
}>) {
  const tones: Record<string, string> = {
    neutral: "border-sand bg-cream text-ink-muted",
    green: "border-green/30 bg-green/[0.06] text-green",
    gold: "border-gold-border/40 bg-gold/[0.12] text-gold-text",
    clay: "border-clay/30 bg-clay/[0.08] text-clay-text",
    teal: "border-teal/30 bg-teal/[0.09] text-teal-text",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function Avatar({ initials, photoUrl, size = 40, className = "" }: Readonly<{ initials: string; photoUrl?: string; size?: number; className?: string }>) {
  const [failed, setFailed] = useState(false);
  if (photoUrl && !failed) {
    return (
      <img
        src={cldAvatar(photoUrl, size)}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className={`inline-block shrink-0 rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-green text-on-green ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export function VerifiedBadge({ label = "Verified", onDark = false }: Readonly<{ label?: string; onDark?: boolean }>) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-wide ${
        onDark ? "border-gold/50 bg-gold/15 text-gold" : "border-gold-border/40 bg-gold/[0.12] text-gold-text"
      }`}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 2l2.4 1.8 3 .1 1 2.8 2.4 1.7-.9 2.8.9 2.8-2.4 1.7-1 2.8-3 .1L12 22l-2.4-1.8-3-.1-1-2.8L3.2 15l.9-2.8L3.2 9.4 5.6 7.7l1-2.8 3-.1z" fill="currentColor" />
        <path d="M8.5 12.2l2.3 2.3 4.5-4.7" stroke={onDark ? "#0C2C1F" : "var(--color-cream)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </span>
  );
}

export function CTA({
  to,
  children,
  variant = "primary",
  className = "",
  external = false,
}: Readonly<{
  to: string;
  children: ReactNode;
  variant?: "primary" | "gold" | "outline" | "outline-dark";
  className?: string;
  external?: boolean;
}>) {
  const styles: Record<string, string> = {
    primary: "bg-green text-on-green hover:bg-green-900",
    gold: "bg-gold-brand text-green-900 hover:bg-gold",
    outline: "border border-green/30 text-green hover:border-green",
    "outline-dark": "border border-cream/30 text-cream hover:border-gold",
  };
  const cls = `inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors ${styles[variant]} ${className}`;
  if (external) {
    return <a href={to} target="_blank" rel="noopener noreferrer" className={cls}>{children}</a>;
  }
  return <Link to={to} className={cls}>{children}</Link>;
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

export function SampleNote({ children }: Readonly<{ children: ReactNode }>) {
  return <p className="mt-10 text-center text-xs italic text-ink-faint">{children}</p>;
}
