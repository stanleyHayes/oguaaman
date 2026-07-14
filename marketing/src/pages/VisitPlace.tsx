import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PageHero } from "@/components/page-hero";
import { Section, CTA as Cta } from "@/components/ui";
import { sceneForSlug } from "@/components/scenes";
import { SectionRenderer, Gallery } from "@/components/profile-sections";
import { fetchPlace, type Organization } from "@/lib/org";
import { listingSubtitle, portalHref, type Listing } from "@/lib/listings";
import { setMeta } from "@/lib/meta";
import { PORTAL_APP_URL } from "@/config";

type State =
  | { status: "loading" }
  | { status: "ready"; org: Organization; events: Listing[] }
  | { status: "missing" };

export function Component() {
  const { slug = "" } = useParams();
  // State is keyed by the slug it was fetched for: when the slug changes we
  // render "loading" until the fetch resolves — no synchronous setState in the
  // effect body (react-hooks/set-state-in-effect).
  const [fetched, setFetched] = useState<{ slug: string; s: State }>({ slug, s: { status: "loading" } });

  useEffect(() => {
    let alive = true;
    fetchPlace(slug).then((res) => {
      if (!alive) return;
      setFetched({ slug, s: res ? { status: "ready", org: res.org, events: res.officialEvents } : { status: "missing" } });
    });
    return () => { alive = false; };
  }, [slug]);

  const state: State = fetched.slug === slug ? fetched.s : { status: "loading" };

  useEffect(() => {
    const state: State = fetched.slug === slug ? fetched.s : { status: "loading" };
    if (state.status !== "ready") return;
    const org = state.org;
    const title = `${org.name} — Visit Cape Coast — Oguaa`;
    const desc = org.summary || `${org.name} — a place to see in and around Cape Coast (Oguaa), Ghana.`;
    document.title = title;
    setMeta("property", "og:title", title);
    setMeta("name", "twitter:title", title);
    setMeta("name", "description", desc);
    setMeta("property", "og:description", desc);
    setMeta("name", "twitter:description", desc);
    const cover = (org.gallery ?? []).find((m) => m.url)?.url;
    if (cover) {
      setMeta("property", "og:image", cover);
      setMeta("name", "twitter:image", cover);
    }
  }, [fetched, slug]);

  if (state.status === "loading") {
    return (
      <div className="grid min-h-[60vh] place-items-center bg-paper">
        <p className="font-mono text-sm uppercase tracking-[0.2em] text-ink-faint">Loading…</p>
      </div>
    );
  }

  if (state.status === "missing") {
    return (
      <Section tone="paper" size="narrow" className="min-h-[60vh] text-center">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-gold-text">Visit</p>
        <h1 className="mt-3 text-4xl font-semibold text-ink">We couldn't find that place.</h1>
        <p className="mt-3 text-ink-muted">It may have moved, or the name has changed.</p>
        <Link to="/visit" className="mt-7 inline-flex rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-cream hover:bg-green-900">
          ← Back to Visit
        </Link>
      </Section>
    );
  }

  const { org, events } = state;
  const Scene = sceneForSlug(org.slug);
  const coverUrl = (org.gallery ?? []).find((m) => m.url)?.url;
  const history = (org.history ?? "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const hasGallery = (org.gallery ?? []).some((m) => m.url || m.caption);
  const hasSections = (org.sections ?? []).some((s) => !s.hidden);

  return (
    <>
      <PageHero
        scene={Scene}
        coverUrl={coverUrl}
        kicker={org.classification || "Visit Cape Coast"}
        title={org.name}
        lede={org.summary}
      >
        <Link
          to="/visit"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-gold transition-colors hover:text-cream"
        >
          ← All of Cape Coast to see
        </Link>
      </PageHero>

      {/* History + the configured sections + gallery */}
      <Section tone="paper" size="default">
        {org.jurisdiction && (
          <p className="mb-8 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.16em] text-ink-faint">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" />
            </svg>
            {org.jurisdiction}
          </p>
        )}

        {history.length > 0 && (
          <div className="mb-12 max-w-3xl">
            <p className="eyebrow mb-3">The story</p>
            <div className="font-serif text-lg leading-relaxed text-ink">
              {history.map((p, i) => (
                <p key={p} className={i === 0 ? "" : "mt-5"}>{p}</p>
              ))}
            </div>
          </div>
        )}

        {hasSections && <SectionRenderer sections={org.sections} />}

        {hasGallery && (
          <section className={hasSections ? "mt-12" : ""}>
            <h2 className="mb-5 flex items-center gap-3 text-2xl font-semibold text-ink">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-gold-brand" aria-hidden />
              {"Photos"}
              <span className="h-px flex-1 bg-sand" />
            </h2>
            <Gallery media={org.gallery ?? []} />
          </section>
        )}

        {events.length > 0 && (
          <section className={hasSections || hasGallery ? "mt-12" : ""}>
            <h2 className="mb-5 flex items-center gap-3 text-2xl font-semibold text-ink">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-teal" aria-hidden />
              {"What's on here"}
              <span className="h-px flex-1 bg-sand" />
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2">
              {events.map((e) => (
                <li key={e.id}>
                  <a href={portalHref(e)} target="_blank" rel="noopener noreferrer" className="block h-full rounded-[var(--radius-card)] border border-sand bg-cream p-5 transition-shadow hover:shadow-[var(--shadow-card)]">
                    <h3 className="text-lg font-semibold text-ink">{e.title}</h3>
                    <p className="mt-1 text-sm text-ink-muted">{listingSubtitle(e)}</p>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </Section>

      {/* Footer nav */}
      <Section tone="cream" size="default">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link to="/visit" className="inline-flex items-center gap-1.5 text-sm font-semibold text-green transition-colors hover:text-green-900">
            ← More of Cape Coast to see
          </Link>
          <Cta href={PORTAL_APP_URL} variant="primary" external>
            Open the app
          </Cta>
        </div>
      </Section>
    </>
  );
}
