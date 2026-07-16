import { Link } from "react-router-dom";
import { Container } from "@/components/ui";
import { Adinkra, SymbolDivider } from "@/components/adinkra";
import { Wordmark } from "@/components/wordmark";
import { Reveal } from "@/components/motion";
import { PORTAL_APP_URL, PORTAL_JOIN_URL, CONTACT_EMAIL } from "@/config";

interface FooterLink {
  label: string;
  to?: string;   // internal route
  href?: string; // external / mailto
  external?: boolean;
}

interface FooterColumn {
  heading: string;
  links: FooterLink[];
}

const COLUMNS: FooterColumn[] = [
  {
    heading: "Discover",
    links: [
      { label: "History", to: "/history" },
      { label: "Culture", to: "/culture" },
      { label: "Festivals", to: "/festivals" },
      { label: "Education", to: "/education" },
      { label: "Visit", to: "/visit" },
      { label: "Leadership", to: "/leadership" },
      { label: "News", to: "/news" },
    ],
  },
  {
    heading: "The app",
    links: [
      { label: "Open the web app", href: PORTAL_APP_URL, external: true },
      { label: "Sign in", href: PORTAL_JOIN_URL, external: true },
    ],
  },
  {
    heading: "Connect",
    links: [{ label: CONTACT_EMAIL, href: `mailto:${CONTACT_EMAIL}` }],
  },
];

function FooterLinkItem({ link }: Readonly<{ link: FooterLink }>) {
  const cls = "inline-block py-0.5 text-cream/70 transition-colors hover:text-gold";
  const externalProps = link.external ? { target: "_blank", rel: "noopener noreferrer" } : {};
  return (
    <li>
      {link.to ? (
        <Link to={link.to} className={cls}>{link.label}</Link>
      ) : (
        <a href={link.href} className={cls} {...externalProps}>
          {link.label}
        </a>
      )}
    </li>
  );
}

function LinkColumn({ column }: Readonly<{ column: FooterColumn }>) {
  return (
    <div>
      <h3 className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-cream/55">
        {column.heading}
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
    <footer className="on-dark relative overflow-hidden bg-green-900 text-cream/80">
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-contours opacity-[0.06]" />
      <span aria-hidden className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-gold-brand/[0.08] blur-3xl" />

      <Container className="relative py-16 sm:py-20" size="wide">
        {/* CTA card */}
        <Reveal className="relative mb-14 overflow-hidden rounded-[var(--radius-card)] border border-cream/10 bg-cream/[0.05] p-7 backdrop-blur-sm sm:p-9">
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
                {connect.heading}
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
            <Link to="/privacy" className="transition-colors hover:text-gold">
              Privacy
            </Link>
            <span aria-hidden className="h-3 w-px bg-cream/20" />
            <Link to="/terms" className="transition-colors hover:text-gold">
              Terms
            </Link>
          </nav>
        </div>
      </Container>
    </footer>
  );
}
