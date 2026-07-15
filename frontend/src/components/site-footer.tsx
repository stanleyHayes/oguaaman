import { Link } from "react-router-dom";
import { Wordmark } from "./wordmark";
import { Adinkra } from "./adinkra";

// Proof pills under the footer CTA — participation entry points, not stats,
// so they never go stale.
const PROOF_PILLS = [
  { to: "/education", label: "Rep your school" },
  { to: "/submit?type=memory", label: "Share a memory" },
  { to: "/submit?type=event", label: "Post an event" },
  { to: "/projects", label: "Fund a project" },
];

const EXPLORE = [
  { to: "/music", label: "Music", fante: "The Oguaa Sound" },
  { to: "/festivals", label: "Festivals" },
  { to: "/heritage", label: "Heritage" },
  { to: "/people", label: "People" },
  { to: "/education", label: "Education" },
  { to: "/youth", label: "Youth" },
];

const TAKE_PART = [
  { to: "/submit", label: "Submit a listing" },
  { to: "/events", label: "Events calendar" },
  { to: "/community", label: "Join the community" },
  { to: "/diaspora", label: "The diaspora register" },
  { to: "/projects", label: "Adopt a project" },
  { to: "/me", label: "Your profile" },
  { to: "/admin", label: "Curator dashboard" },
];

const TOWN_BOARD = [
  { to: "/news", label: "Newsroom" },
  { to: "/safety", label: "Safety & incidents" },
  { to: "/lost-found", label: "Lost & found" },
  { to: "/business", label: "Business directory" },
  { to: "/visit", label: "Visit Cape Coast" },
];

function FooterColumn({ title, links }: Readonly<{ title: string; links: { to: string; label: string; fante?: string }[] }>) {
  return (
    <nav aria-label={title}>
      <h3 className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-cream/55">
        {title}
        <span aria-hidden className="mt-2 block h-0.5 w-6 rounded-full bg-gold-brand" />
      </h3>
      <ul className="mt-4 space-y-2 text-sm">
        {links.map((l) => (
          <li key={l.to}>
            <Link to={l.to} className="transition-colors hover:text-gold">
              {l.label}
              {l.fante && <span className="ml-2 text-cream/45">{l.fante}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer className="on-dark relative mt-20 overflow-hidden bg-gradient-to-b from-green to-green-900 text-cream/80">
      {/* gold glow + dot texture */}
      <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-gold-brand/[0.07] blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-24 h-80 w-80 rounded-full bg-teal/[0.08] blur-3xl" />
      <div className="bg-dotgrid relative">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
          {/* CTA card */}
          <div className="relative mb-14 overflow-hidden rounded-[var(--radius-card)] border border-cream/10 bg-cream/[0.05] p-7 backdrop-blur-sm sm:p-9">
            <Adinkra name="sankofa" size={140} labelled={false} className="pointer-events-none absolute -right-6 -top-8 text-gold/[0.08]" />
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.22em] text-gold">Yɛn ara asaase ni</p>
            <h2 className="mt-3 max-w-xl text-2xl font-semibold text-cream sm:text-3xl">
              This is our own land — and it grows by what each of us adds to it.
            </h2>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link to="/submit" className="rounded-full bg-gold-brand px-5 py-2 text-sm font-semibold text-green-900 transition-colors hover:bg-gold">
                Contribute
              </Link>
              {PROOF_PILLS.map((p) => (
                <Link key={p.to} to={p.to} className="rounded-full border border-cream/20 px-4 py-2 text-sm text-cream/80 transition-colors hover:border-gold hover:text-gold">
                  {p.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="grid gap-10 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
            <div>
              <Wordmark size="text-3xl" />
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-cream/70">
                The community home of Cape Coast, Ghana — its music, people, heritage,
                schools and memories. An independent community initiative. Made by us, for us.
              </p>
              <p className="mt-4 text-lg italic text-gold">Yɛn ara asaase ni — this is our own land.</p>
            </div>

            <FooterColumn title="Explore" links={EXPLORE} />
            <FooterColumn title="Take part" links={TAKE_PART} />
            <FooterColumn title="Town board" links={TOWN_BOARD} />
          </div>

          <nav aria-label="Legal" className="mt-12 flex flex-wrap justify-center gap-x-6 gap-y-2 border-t border-gold-brand/25 pt-6 text-xs text-cream/60 sm:justify-start">
            <Link to="/privacy" className="hover:text-gold">Privacy</Link>
            <Link to="/terms" className="hover:text-gold">Terms of Use</Link>
            <Link to="/acceptable-use" className="hover:text-gold">Acceptable Use</Link>
            <Link to="/search" className="hover:text-gold">Search</Link>
          </nav>

          <div className="mt-6 flex flex-col items-center gap-3 text-center text-xs text-cream/50 sm:flex-row sm:justify-between sm:text-left">
            <p>© {new Date().getFullYear()} Oguaa — a community vehicle (to be incorporated). Not a commercial product. For ages 18+.</p>
            <span className="inline-flex items-center gap-2">
              <Adinkra name="sankofa" size={16} labelled={false} className="text-gold/70" />
              Built on pride → cohesion → visibility.
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
