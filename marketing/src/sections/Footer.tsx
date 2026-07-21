import { Link, NavLink } from "react-router-dom";
import { Container } from "@/components/ui";
import { Adinkra, SymbolDivider } from "@/components/adinkra";
import { Wordmark } from "@/components/wordmark";
import { Reveal } from "@/components/motion";
import { PORTAL_APP_URL, PORTAL_JOIN_URL, CONTACT_EMAIL } from "@/config";

// Hand-rolled inline icon set — no icon library is installed here, so we mirror
// the house style used by SocialIcon: 24×24 grid, 1.7 stroke, currentColor so
// each glyph inherits the surrounding text tone on this always-dark stage.
type IconName =
  | "compass" | "smartphone" | "mail"
  | "scroll" | "palette" | "sparkles" | "graduation" | "map-pin" | "crown" | "newspaper"
  | "globe" | "app-window" | "login" | "info";

function FooterIcon({ name, className = "" }: Readonly<{ name: IconName; className?: string }>) {
  const body = {
    compass: <><circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88" /></>,
    smartphone: <><rect x="5" y="2" width="14" height="20" rx="2.5" /><line x1="11" y1="18" x2="13" y2="18" /></>,
    mail: <><rect x="2" y="4" width="20" height="16" rx="2.5" /><path d="M22 7l-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></>,
    scroll: <><path d="M19 17V5a2 2 0 0 0-2-2H4" /><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3" /></>,
    palette: <><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.6-.7 1.6-1.6 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1a1.6 1.6 0 0 1 1.6-1.6h1.9c3 0 5.5-2.5 5.5-5.6C22 6 17.5 2 12 2Z" /><circle cx="8.5" cy="8" r=".9" fill="currentColor" stroke="none" /><circle cx="13.5" cy="6.5" r=".9" fill="currentColor" stroke="none" /><circle cx="17.5" cy="10" r=".9" fill="currentColor" stroke="none" /><circle cx="6.5" cy="12.5" r=".9" fill="currentColor" stroke="none" /></>,
    sparkles: <><path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-5.6-1.44a.5.5 0 0 1 0-.96l5.6-1.44A2 2 0 0 0 9.94 8.5l1.44-5.6a.5.5 0 0 1 .96 0l1.44 5.6a2 2 0 0 0 1.44 1.44l5.6 1.44a.5.5 0 0 1 0 .96l-5.6 1.44a2 2 0 0 0-1.44 1.44l-1.44 5.6a.5.5 0 0 1-.96 0Z" /><path d="M19 4v3" /><path d="M20.5 5.5h-3" /></>,
    graduation: <><path d="M12 4 2 9l10 5 10-5Z" /><path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5" /><path d="M22 9v5" /></>,
    "map-pin": <><path d="M20 10c0 5-8 12-8 12s-8-7-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>,
    crown: <><path d="M4 8l3.5 3 4.5-6 4.5 6L20 8l-1.5 10h-13Z" /><line x1="4" y1="21" x2="20" y2="21" /></>,
    newspaper: <><path d="M4 22a2 2 0 0 1-2-2V9a1 1 0 0 1 1-1h3" /><path d="M6 20V5a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1v15a2 2 0 0 1-2 2Z" /><path d="M10 8h7" /><path d="M10 12h7" /><path d="M10 16h4" /></>,
    globe: <><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2c2.6 2.7 4 6.2 4 10s-1.4 7.3-4 10c-2.6-2.7-4-6.2-4-10s1.4-7.3 4-10Z" /></>,
    "app-window": <><rect x="2" y="4" width="20" height="16" rx="2.5" /><path d="M2 9h20" /><circle cx="5.5" cy="6.5" r=".6" fill="currentColor" stroke="none" /><circle cx="8" cy="6.5" r=".6" fill="currentColor" stroke="none" /></>,
    login: <><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" /></>,
    info: <><circle cx="12" cy="12" r="10" /><path d="M12 16v-5" /><path d="M12 8h.01" /></>,
  }[name];
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {body}
    </svg>
  );
}

interface FooterLink {
  label: string;
  to?: string;   // internal route
  href?: string; // external / mailto
  external?: boolean;
  icon: IconName;
}

interface FooterColumn {
  heading: string;
  icon: IconName;
  links: FooterLink[];
}

const COLUMNS: FooterColumn[] = [
  {
    heading: "Discover",
    icon: "compass",
    links: [
      { label: "History", to: "/history", icon: "scroll" },
      { label: "Culture", to: "/culture", icon: "palette" },
      { label: "Festivals", to: "/festivals", icon: "sparkles" },
      { label: "Education", to: "/education", icon: "graduation" },
      { label: "Visit", to: "/visit", icon: "map-pin" },
      { label: "Leadership", to: "/leadership", icon: "crown" },
      { label: "Build a better Oguaa", to: "/better", icon: "sparkles" },
      { label: "Oguaa Outside", to: "/outside", icon: "globe" },
      { label: "News", to: "/news", icon: "newspaper" },
    ],
  },
  {
    heading: "The app",
    icon: "smartphone",
    links: [
      { label: "Open the web app", href: PORTAL_APP_URL, external: true, icon: "app-window" },
      { label: "Sign in", href: PORTAL_JOIN_URL, external: true, icon: "login" },
    ],
  },
  {
    heading: "Connect",
    icon: "mail",
    links: [
      { label: "About Oguaa", to: "/about", icon: "info" },
      { label: "Contact", to: "/contact", icon: "mail" },
      { label: CONTACT_EMAIL, href: `mailto:${CONTACT_EMAIL}`, icon: "mail" },
    ],
  },
];

function FooterLinkItem({ link }: Readonly<{ link: FooterLink }>) {
  const cls = (active = false) => `inline-flex items-center gap-2 py-0.5 transition-colors ${active ? "font-semibold text-gold" : "text-cream/70 hover:text-gold"}`;
  const externalProps = link.external ? { target: "_blank", rel: "noopener noreferrer" } : {};
  const icon = <FooterIcon name={link.icon} className="h-4 w-4 shrink-0 opacity-70" />;
  return (
    <li>
      {link.to ? (
        <NavLink to={link.to} className={({ isActive }) => cls(isActive)}>{icon}<span>{link.label}</span></NavLink>
      ) : (
        <a href={link.href} className={cls()} {...externalProps}>
          {icon}<span>{link.label}</span>
        </a>
      )}
    </li>
  );
}

function LinkColumn({ column }: Readonly<{ column: FooterColumn }>) {
  return (
    <div>
      <h3 className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-cream/55">
        <span className="inline-flex items-center gap-1.5">
          <FooterIcon name={column.icon} className="h-3.5 w-3.5 text-gold-brand/80" />
          {column.heading}
        </span>
        <span aria-hidden className="mt-2 block h-0.5 w-6 rounded-full bg-gold-brand" />
      </h3>
      <ul className="mt-4 space-y-1 text-sm">
        {column.links.map((link) => (
          <FooterLinkItem key={link.label} link={link} />
        ))}
      </ul>
    </div>
  );
}

type SocialName = "instagram" | "facebook" | "x";

const SOCIALS: { name: SocialName; label: string; href: string }[] = [
  { name: "instagram", label: "Instagram", href: "https://instagram.com/oguaa" },
  { name: "facebook", label: "Facebook", href: "https://facebook.com/oguaa" },
  { name: "x", label: "X (Twitter)", href: "https://x.com/oguaa" },
];

function SocialIcon({ name }: Readonly<{ name: SocialName }>) {
  const body = {
    instagram: <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><path d="M17.2 6.8h.01" /></>,
    facebook: <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />,
    x: <><path d="M4 4h4.6L20 20h-4.6Z" /><path d="M4 20l6.8-7.5" /><path d="M13.2 11.4 20 4" /></>,
  }[name];
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
      {body}
    </svg>
  );
}

function SocialRow() {
  return (
    <div className="mt-4 flex items-center gap-3">
      {SOCIALS.map((s) => (
        <a
          key={s.name}
          href={s.href}
          aria-label={s.label}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-cream/15 text-cream/70 transition-colors hover:border-gold-brand/50 hover:text-gold"
        >
          <SocialIcon name={s.name} />
        </a>
      ))}
    </div>
  );
}

export function Footer() {
  const connect = COLUMNS[2];

  return (
    <footer className="on-dark on-dark-pin relative overflow-hidden bg-green-900 text-cream/80">
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-contours opacity-[0.06]" />
      <span aria-hidden className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-gold-brand/[0.08] blur-3xl" />

      <Container className="relative pb-16 pt-5 sm:pb-20 sm:pt-7" size="wide">
        {/* CTA card */}
        <Reveal className="og-card og-card-dark on-dark-pin og-card-accent-gold relative mb-14 border-cream/10 bg-cream/[0.05] p-7 backdrop-blur-sm sm:p-9">
          <p className="text-[0.72rem] font-bold uppercase tracking-[0.22em] text-gold">Yɛn ara asaase ni</p>
          <h2 className="mt-3 max-w-xl text-2xl font-semibold text-cream sm:text-3xl">
            This is our own land — the app is where the town gathers.
          </h2>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <a href={PORTAL_APP_URL} target="_blank" rel="noopener noreferrer" className="rounded-full bg-gold-brand px-5 py-2 text-sm font-semibold text-green-900 transition-colors hover:bg-gold">
              Open the app
            </a>
            <a href={PORTAL_JOIN_URL} target="_blank" rel="noopener noreferrer" className="rounded-full border border-cream/20 px-4 py-2 text-sm text-cream/80 transition-colors hover:border-gold hover:text-gold">
              Create an account
            </a>
            <Link to="/festivals" className="rounded-full border border-cream/20 px-4 py-2 text-sm text-cream/80 transition-colors hover:border-gold hover:text-gold">
              Explore the festivals
            </Link>
          </div>
        </Reveal>

        {/* Top row */}
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-[1.2fr_2fr]">
          <div className="max-w-sm">
            <Wordmark size="text-3xl" />
            <p className="mt-5 font-serif text-lg leading-relaxed text-cream/75">
              The community home of Cape Coast — made by us, for us.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-cream/55">
              For Oguaa at home and the diaspora — celebrating our music, people,
              heritage and institutions, and remembering those who have gone before us.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {COLUMNS.slice(0, 2).map((column) => (
              <LinkColumn key={column.heading} column={column} />
            ))}

            <div>
              <h3 className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-cream/55">
                <span className="inline-flex items-center gap-1.5">
                  <FooterIcon name={connect.icon} className="h-3.5 w-3.5 text-gold-brand/80" />
                  {connect.heading}
                </span>
                <span aria-hidden className="mt-2 block h-0.5 w-6 rounded-full bg-gold-brand" />
              </h3>
              <ul className="mt-4 space-y-1 text-sm">
                {connect.links.map((link) => (
                  <FooterLinkItem key={link.label} link={link} />
                ))}
              </ul>
              <SocialRow />
            </div>
          </div>
        </div>

        {/* Hairline / motif divider */}
        <div className="my-10 sm:my-12">
          <SymbolDivider name="crab" tone="text-gold/70" className="max-w-full" />
        </div>

        {/* Bottom row */}
        <div className="flex flex-col gap-6 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="font-serif text-base italic text-gold/80">Da yie.</p>

          <p className="inline-flex items-center gap-2 text-cream/60">
            <Adinkra name="crab" size={18} labelled={false} className="text-gold/70" />
            <span>© Oguaa. Made in Cape Coast, Ghana.</span>
          </p>

          <nav aria-label="Legal" className="flex items-center gap-5 text-cream/55">
            <NavLink to="/privacy" className={({ isActive }) => `transition-colors hover:text-gold ${isActive ? "font-semibold text-gold" : ""}`}>
              Privacy
            </NavLink>
            <span aria-hidden className="h-3 w-px bg-cream/20" />
            <NavLink to="/terms" className={({ isActive }) => `transition-colors hover:text-gold ${isActive ? "font-semibold text-gold" : ""}`}>
              Terms
            </NavLink>
          </nav>
        </div>
      </Container>
    </footer>
  );
}
