import { Link } from "react-router-dom";
import { Wordmark } from "./wordmark";
import { Adinkra } from "./adinkra";
import { SHOWCASE_SECTIONS } from "@/lib/sections";

export function SiteFooter() {
  return (
    <footer className="on-dark mt-20 bg-green-900 text-cream/80">
      <div className="bg-dotgrid">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
          <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
            <div>
              <Wordmark size="text-3xl" />
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-cream/70">
                The community home of Cape Coast, Ghana — its music, people, heritage,
                schools and memories. An independent community initiative. Made by us, for us.
              </p>
              <p className="mt-4 font-display text-lg italic text-gold">Yɛn ara asaase ni — this is our own land.</p>
            </div>

            <nav aria-label="Sections">
              <h3 className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-cream/55">Explore</h3>
              <ul className="mt-4 space-y-2 text-sm">
                {SHOWCASE_SECTIONS.slice(0, 6).map((s) => (
                  <li key={s.id}>
                    <Link to={s.href} className="hover:text-gold">
                      {s.label}
                      {s.fanteName && <span className="ml-2 text-cream/45">{s.fanteName}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <nav aria-label="Participate">
              <h3 className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-cream/55">Take part</h3>
              <ul className="mt-4 space-y-2 text-sm">
                <li><Link to="/submit" className="hover:text-gold">Submit a listing</Link></li>
                <li><Link to="/projects" className="hover:text-gold">Adopt a project</Link></li>
                <li><Link to="/community" className="hover:text-gold">Join the community</Link></li>
                <li><Link to="/events" className="hover:text-gold">Events calendar</Link></li>
                <li><Link to="/me" className="hover:text-gold">Your profile</Link></li>
                <li><Link to="/admin" className="hover:text-gold">Curator dashboard</Link></li>
              </ul>
            </nav>
          </div>

          <nav aria-label="Legal" className="mt-12 flex flex-wrap justify-center gap-x-6 gap-y-2 border-t border-cream/10 pt-6 text-xs text-cream/60 sm:justify-start">
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
