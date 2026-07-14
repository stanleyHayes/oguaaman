// Renders an institution's custom showcase sections + photo gallery on its
// public page. One block model, many section kinds (richtext / gallery / stats /
// team / timeline / faq / docs). Accents resolve through the shared TONES map so
// blocks stay native to the "Castle, Canopy, and Canoe" system. See
// oguaa/Institution-Pages-Spec.md.
import { useEffect, useRef, useState } from "react";
import type { MediaAsset, ProfileSection, SectionItem, SubEntity } from "@/lib/types";
import { TONES, type Tone, type ToneClasses } from "@/lib/sections";
import { Markdown } from "@/components/markdown";
import { Avatar } from "@/components/ui";
import { SymbolDivider } from "@/components/adinkra";
import { initials } from "@/lib/format";
import { cld, cldCover, cldLogo } from "@/lib/cloudinary";

// Deterministic gradient for image-less / failed tiles (graceful degradation).
const GRADIENTS = [
  "from-green to-green-900",
  "from-clay to-maroon-900",
  "from-teal to-green",
  "from-gold-brand to-clay",
  "from-green-slate to-green-900",
  "from-maroon-900 to-clay",
];
function gradientFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return GRADIENTS[Math.abs(h) % GRADIENTS.length];
}
function tone(t?: string): ToneClasses {
  return TONES[(t as Tone)] ?? TONES.green;
}

// Allow only web-safe link schemes; drop javascript:/data:/etc. React does NOT
// sanitize href, so a hand-rolled <a> must guard (the backend guards too).
// Control chars (\t\n\r…) are stripped first because browsers ignore them when
// resolving an href — so "java\tscript:" would otherwise execute. Then a
// positional check (a ':' before any /?#) rejects any non-allowlisted scheme,
// mirroring the backend safeURL.
function safeHref(raw?: string): string | undefined {
  // \p{Cc} covers C0/C1 control chars (incl. \x00) without a control-char
  // regex literal (eslint no-control-regex); space is stripped too, matching
  // the original [\x00-\x20] semantics.
  const u = (raw ?? "").trim().replace(/[\p{Cc} ]/gu, "");
  if (!u) return undefined;
  if (/^(https?:|mailto:|tel:)/i.test(u)) return u;
  const colon = u.indexOf(":");
  const sep = u.search(/[/?#]/);
  if (colon >= 0 && (sep === -1 || colon < sep)) return undefined; // explicit non-allowlisted scheme
  return u; // relative / anchor / query
}

// A section with no renderable content is skipped entirely (no orphan heading).
function hasContent(s: ProfileSection): boolean {
  switch (s.type) {
    case "richtext":
    case "quote":
      return !!s.body?.trim();
    case "gallery":
      return (s.media ?? []).some((m) => m.url || m.caption);
    case "divider":
      return true;
    case "cta":
    case "hero":
      return !!(s.title || s.body || (s.media ?? []).length || (s.items ?? []).some((i) => i.label));
    case "contact":
      return !!(s.body?.trim() || (s.items ?? []).some((i) => i.label || i.value));
    case "map":
      return !!s.body?.trim();
    case "groups":
      return (s.groups ?? []).some((g) => g.name);
    default:
      return (s.items ?? []).some((i) => i.label || i.value || i.detail || i.image || i.url);
  }
}

// Section kinds whose Title renders as a SecHead. Others (quote/cta/hero/divider)
// use the title inline (attribution / heading) or not at all.
const TITLED_TYPES = new Set(["richtext", "gallery", "stats", "team", "timeline", "faq", "docs", "logos", "groups", "testimonials", "contact", "menu", "schedule", "map"]);

// ── public renderer ──────────────────────────────────────────────────────────

export function SectionRenderer({ sections }: { sections?: ProfileSection[] }) {
  const visible = (sections ?? []).filter((s) => !s.hidden && hasContent(s));
  if (visible.length === 0) return null;
  return (
    <>
      {visible.map((s) => (
        <SectionBlock key={s.id} section={s} />
      ))}
    </>
  );
}

function SectionBlock({ section }: { section: ProfileSection }) {
  const t = tone(section.tone);
  const body = renderBody(section, t);
  if (!body) return null;
  const showTitle = section.title && TITLED_TYPES.has(section.type);
  return (
    <section id={section.anchor || undefined}>
      {showTitle && <SectionTitle tone={t}>{section.title}</SectionTitle>}
      {body}
    </section>
  );
}

function renderBody(section: ProfileSection, t: ToneClasses) {
  switch (section.type) {
    case "richtext":
      return section.body?.trim() ? <Markdown>{section.body}</Markdown> : null;
    case "gallery":
      return <Gallery media={section.media ?? []} />;
    case "stats":
      return <StatsBlock items={section.items ?? []} tone={t} />;
    case "team":
      return <TeamBlock items={section.items ?? []} />;
    case "timeline":
      return <TimelineBlock items={section.items ?? []} tone={t} />;
    case "faq":
      return <FaqBlock items={section.items ?? []} />;
    case "docs":
      return <DocsBlock items={section.items ?? []} />;
    case "quote":
      return <QuoteBlock section={section} tone={t} />;
    case "cta":
      return <CtaBlock section={section} tone={t} />;
    case "logos":
      return <LogosBlock items={section.items ?? []} />;
    case "groups":
      return <GroupsBlock groups={section.groups ?? []} tone={t} />;
    case "hero":
      return <HeroBlock section={section} tone={t} />;
    case "testimonials":
      return <TestimonialsBlock items={section.items ?? []} tone={t} />;
    case "contact":
      return <ContactBlock section={section} tone={t} />;
    case "menu":
      return <MenuBlock items={section.items ?? []} />;
    case "schedule":
      return <ScheduleBlock items={section.items ?? []} tone={t} />;
    case "map":
      return <MapBlock section={section} tone={t} />;
    case "divider":
      return <SymbolDivider tone={t.text} className="py-2" />;
    default:
      return null;
  }
}

function SectionTitle({ tone: t, children }: { tone: ToneClasses; children: React.ReactNode }) {
  return (
    <h2 className="mb-4 flex items-center gap-3 font-display text-xl font-semibold text-ink">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${t.dot}`} aria-hidden />
      {children}
      <span className="h-px flex-1 bg-sand" />
    </h2>
  );
}

// ── gallery ──────────────────────────────────────────────────────────────────

export function Gallery({ media }: { media: MediaAsset[] }) {
  const [open, setOpen] = useState<MediaAsset | null>(null);
  const items = (media ?? []).filter((m) => m && (m.url || m.caption));
  if (items.length === 0) return null;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((m, i) => (
          <button
            key={m.id || i}
            type="button"
            onClick={() => m.url && setOpen(m)}
            className={`group relative block aspect-square overflow-hidden rounded-[var(--radius-card)] border border-sand bg-gradient-to-br text-left ${gradientFor((m.id || "") + (m.caption ?? ""))} ${m.url ? "cursor-zoom-in" : "cursor-default"}`}
            aria-label={m.alt || m.caption || "Photo"}
          >
            <span className="bg-dotgrid absolute inset-0 opacity-30" aria-hidden />
            {m.url && (
              <img
                src={cldCover(m.url, 400)}
                alt={m.alt ?? m.caption ?? ""}
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            )}
            {m.caption && (
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent p-3 pt-8">
                <span className="block font-display text-sm text-cream">{m.caption}</span>
              </span>
            )}
          </button>
        ))}
      </div>
      {open && <Lightbox asset={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function Lightbox({ asset, onClose }: { asset: MediaAsset; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      prevFocus?.focus();
    };
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={asset.alt ?? asset.caption ?? "Image"}
      className="on-dark fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
    >
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 h-full w-full cursor-default" />
      <figure className="relative max-h-full max-w-3xl">
        <img
          src={cld(asset.url, "w_1400,f_auto,q_auto")}
          alt={asset.alt ?? asset.caption ?? ""}
          className="mx-auto max-h-[80vh] w-auto rounded-lg object-contain"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
        {(asset.caption || asset.credit) && (
          <figcaption className="mt-3 text-center text-sm text-cream/85">
            {asset.caption}
            {asset.credit && <span className="text-cream/60"> · {asset.credit}</span>}
          </figcaption>
        )}
      </figure>
      <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 rounded-full bg-white/10 px-3 py-1.5 text-cream hover:bg-white/20">✕</button>
    </div>
  );
}

// ── list blocks ──────────────────────────────────────────────────────────────

function StatsBlock({ items, tone: t }: { items: SectionItem[]; tone: ToneClasses }) {
  const list = items.filter((i) => i.value || i.label);
  if (list.length === 0) return null;
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-sand bg-sand sm:grid-cols-4">
      {list.map((i, idx) => (
        <div key={i.id || idx} className="bg-cream px-4 py-5 text-center">
          <dd className={`font-display text-3xl font-semibold ${t.text}`}>{i.value || "—"}</dd>
          {i.label && <dt className="mt-1 text-[0.66rem] font-semibold uppercase tracking-wider text-ink-faint">{i.label}</dt>}
        </div>
      ))}
    </dl>
  );
}

function TeamBlock({ items }: { items: SectionItem[] }) {
  const list = items.filter((i) => i.value || i.label);
  if (list.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((i, idx) => (
        <div key={i.id || idx} className="flex items-start gap-3 rounded-[var(--radius-card)] border border-sand bg-cream p-4">
          <Avatar initials={initials(i.value || i.label || "?")} photoUrl={i.image || undefined} size={44} />
          <div className="min-w-0">
            {i.value && <p className="font-display text-base text-ink">{i.value}</p>}
            {i.label && <p className="text-[0.66rem] font-bold uppercase tracking-wider text-gold-text">{i.label}</p>}
            {i.detail && <p className="mt-1 text-sm leading-relaxed text-ink-muted">{i.detail}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

function TimelineBlock({ items, tone: t }: { items: SectionItem[]; tone: ToneClasses }) {
  const list = items.filter((i) => i.label || i.value || i.detail);
  if (list.length === 0) return null;
  return (
    <ol className="space-y-5">
      {list.map((i, idx) => (
        <li key={i.id || idx} className="flex gap-4">
          <span className={`mt-1.5 h-3 w-3 shrink-0 rounded-full border-2 bg-paper ${t.border}`} aria-hidden />
          <div className="flex-1 border-b border-dashed border-sand pb-4">
            {i.label && <p className={`font-display text-sm font-semibold ${t.text}`}>{i.label}</p>}
            {i.value && <p className="font-display text-lg text-ink">{i.value}</p>}
            {i.detail && <p className="mt-1 text-sm leading-relaxed text-ink-muted">{i.detail}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function FaqBlock({ items }: { items: SectionItem[] }) {
  const list = items.filter((i) => i.label || i.value);
  if (list.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-sand">
      {list.map((i, idx) => (
        <details key={i.id || idx} className="group border-b border-sand last:border-b-0 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer items-center justify-between gap-3 bg-cream px-4 py-3 font-medium text-ink">
            <span>{i.label || "—"}</span>
            <span className="shrink-0 text-ink-faint transition-transform group-open:rotate-45" aria-hidden>+</span>
          </summary>
          {i.value && <p className="bg-paper px-4 py-3 text-sm leading-relaxed text-ink-muted">{i.value}</p>}
        </details>
      ))}
    </div>
  );
}

function DocsBlock({ items }: { items: SectionItem[] }) {
  const list = items.filter((i) => i.label || i.url);
  if (list.length === 0) return null;
  return (
    <ul className="divide-y divide-sand overflow-hidden rounded-[var(--radius-card)] border border-sand">
      {list.map((i, idx) => {
        const href = safeHref(i.url);
        const inner = (
          <span className="flex items-center gap-3 px-4 py-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-gold-text" aria-hidden>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
            </svg>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-ink">{i.label || i.url}</span>
              {i.detail && <span className="block text-xs text-ink-faint">{i.detail}</span>}
            </span>
            {href && <span className="shrink-0 text-xs font-semibold text-teal-text">Open →</span>}
          </span>
        );
        return (
          <li key={i.id || idx} className="bg-cream hover:bg-sand/40">
            {href ? (
              <a href={href} target="_blank" rel="noreferrer" className="block">{inner}</a>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ul>
  );
}

function QuoteBlock({ section, tone: t }: { section: ProfileSection; tone: ToneClasses }) {
  if (!section.body?.trim()) return null;
  return (
    <figure className={`border-l-4 pl-5 ${t.border}`}>
      <blockquote className="font-display text-2xl italic leading-snug text-ink sm:text-3xl">“{section.body}”</blockquote>
      {section.title && <figcaption className={`mt-3 text-sm font-semibold uppercase tracking-wider ${t.text}`}>— {section.title}</figcaption>}
    </figure>
  );
}

function CtaBlock({ section, tone: t }: { section: ProfileSection; tone: ToneClasses }) {
  const buttons = (section.items ?? []).filter((i) => i.label);
  if (!section.title && !section.body && buttons.length === 0) return null;
  return (
    <div className={`rounded-[var(--radius-card)] border p-6 text-center sm:p-8 ${t.border} ${t.soft}`}>
      {section.title && <h3 className="font-display text-2xl font-semibold text-ink sm:text-3xl">{section.title}</h3>}
      {section.body && <p className="mx-auto mt-2 max-w-xl text-ink-muted">{section.body}</p>}
      {buttons.length > 0 && (
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {buttons.map((b, i) => {
            const href = safeHref(b.url);
            // Primary button uses brand green; secondary is outline — both web-safe
            // (never white-on-gold), independent of the section's accent tone.
            const cls = i === 0
              ? "inline-flex items-center rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-cream hover:bg-green-900"
              : "inline-flex items-center rounded-full border border-green/30 px-5 py-2.5 text-sm font-semibold text-green hover:border-green";
            return href
              ? <a key={b.id || i} href={href} target="_blank" rel="noreferrer" className={cls}>{b.label}</a>
              : <span key={b.id || i} className={cls}>{b.label}</span>;
          })}
        </div>
      )}
    </div>
  );
}

function LogosBlock({ items }: { items: SectionItem[] }) {
  const list = items.filter((i) => i.image || i.label);
  if (list.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {list.map((i, idx) => {
        const href = safeHref(i.url);
        const inner = (
          <span className="flex h-full flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border border-sand bg-cream p-4 text-center">
            {i.image && (
              <img src={cldLogo(i.image, 120)} alt={i.label ?? ""} loading="lazy" className="h-12 w-auto max-w-full object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
            )}
            {i.label && <span className="text-sm font-medium text-ink">{i.label}</span>}
          </span>
        );
        return (
          <div key={i.id || idx}>
            {href ? <a href={href} target="_blank" rel="noreferrer" className="block h-full">{inner}</a> : inner}
          </div>
        );
      })}
    </div>
  );
}

function GroupsBlock({ groups, tone: t }: { groups: SubEntity[]; tone: ToneClasses }) {
  const list = groups.filter((g) => g.name);
  if (list.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {list.map((g, idx) => (
        <div key={g.id || idx} className="rounded-[var(--radius-card)] border border-sand bg-cream p-4">
          <div className="flex items-start gap-3">
            {g.crestUrl ? (
              <img src={cldLogo(g.crestUrl, 120)} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-full border border-sand object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
            ) : (
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green font-display text-sm font-semibold text-cream">{initials(g.name)}</span>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg text-ink">{g.name}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                {g.subtitle && <span className={`text-[0.66rem] font-bold uppercase tracking-wider ${t.text}`}>{g.subtitle}</span>}
                {g.colors && g.colors.length > 0 && (
                  <span className="flex gap-1">
                    {g.colors.map((c, ci) => <span key={ci} className="h-3 w-3 rounded-full border border-sand" style={{ backgroundColor: c }} aria-hidden />)}
                  </span>
                )}
              </div>
            </div>
          </div>
          {g.summary && <p className="mt-3 text-sm leading-relaxed text-ink-muted">{g.summary}</p>}
          {g.attrs && g.attrs.some((a) => a.label || a.value) && (
            <dl className="mt-3 space-y-1">
              {g.attrs.filter((a) => a.label || a.value).map((a, ai) => (
                <div key={a.id || ai} className="flex gap-2 text-sm">
                  <dt className="shrink-0 text-ink-faint">{a.label}</dt>
                  <dd className="min-w-0 font-medium text-ink">{a.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      ))}
    </div>
  );
}

function HeroBlock({ section, tone: t }: { section: ProfileSection; tone: ToneClasses }) {
  const bg = section.media?.[0]?.url;
  const onImage = !!bg;
  const buttons = (section.items ?? []).filter((i) => i.label);
  return (
    <div className={`relative overflow-hidden rounded-[var(--radius-card)] border border-sand ${onImage ? "on-dark" : t.soft}`}>
      {onImage && (
        <>
          <img src={cld(bg, "w_1400,f_auto,q_auto")} alt={section.media?.[0]?.alt ?? ""} className="absolute inset-0 h-full w-full object-cover" />
          <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/45 to-black/25" aria-hidden />
        </>
      )}
      <div className="relative px-6 py-12 text-center sm:px-10 sm:py-16">
        {section.title && <h2 className={`font-display text-3xl font-semibold sm:text-4xl ${onImage ? "text-cream" : "text-ink"}`}>{section.title}</h2>}
        {section.body && <p className={`mx-auto mt-3 max-w-xl ${onImage ? "text-cream/85" : "text-ink-muted"}`}>{section.body}</p>}
        {buttons.length > 0 && (
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {buttons.map((b, i) => {
              const href = safeHref(b.url);
              const cls = i === 0
                ? "inline-flex items-center rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-cream hover:bg-green-900"
                : onImage
                  ? "inline-flex items-center rounded-full border border-cream/40 px-5 py-2.5 text-sm font-semibold text-cream hover:border-gold"
                  : "inline-flex items-center rounded-full border border-green/30 px-5 py-2.5 text-sm font-semibold text-green hover:border-green";
              return href
                ? <a key={b.id || i} href={href} target="_blank" rel="noreferrer" className={cls}>{b.label}</a>
                : <span key={b.id || i} className={cls}>{b.label}</span>;
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function TestimonialsBlock({ items, tone: t }: { items: SectionItem[]; tone: ToneClasses }) {
  const list = items.filter((i) => i.value || i.label);
  if (list.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {list.map((i, idx) => (
        <figure key={i.id || idx} className="rounded-[var(--radius-card)] border border-sand bg-cream p-5">
          {i.value && <blockquote className="font-serif text-lg italic leading-relaxed text-ink">{`“${i.value}”`}</blockquote>}
          {(i.label || i.detail || i.image) && (
            <figcaption className="mt-4 flex items-center gap-3">
              <Avatar initials={initials(i.label || "?")} photoUrl={i.image || undefined} size={36} />
              <span className="min-w-0">
                {i.label && <span className="block font-medium text-ink">{i.label}</span>}
                {i.detail && <span className={`block text-[0.66rem] font-semibold uppercase tracking-wider ${t.text}`}>{i.detail}</span>}
              </span>
            </figcaption>
          )}
        </figure>
      ))}
    </div>
  );
}

function ContactBlock({ section, tone: t }: { section: ProfileSection; tone: ToneClasses }) {
  const rows = (section.items ?? []).filter((i) => i.label || i.value);
  if (!section.body?.trim() && rows.length === 0) return null;
  return (
    <div className="rounded-[var(--radius-card)] border border-sand bg-cream p-5">
      {section.body && <p className="font-serif text-base leading-relaxed text-ink">{section.body}</p>}
      {rows.length > 0 && (
        <dl className={`space-y-2 ${section.body ? "mt-4 border-t border-dashed border-sand pt-4" : ""}`}>
          {rows.map((i, idx) => {
            const href = safeHref(i.url);
            return (
              <div key={i.id || idx} className="flex flex-wrap gap-x-3 text-sm">
                {i.label && <dt className={`w-28 shrink-0 text-[0.66rem] font-semibold uppercase tracking-wide ${t.text}`}>{i.label}</dt>}
                <dd className="min-w-0 flex-1 text-ink">
                  {href ? <a href={href} target="_blank" rel="noreferrer" className="text-teal-text hover:underline">{i.value || i.url}</a> : i.value}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </div>
  );
}

function MenuBlock({ items }: { items: SectionItem[] }) {
  const list = items.filter((i) => i.label || i.value);
  if (list.length === 0) return null;
  return (
    <ul className="divide-y divide-sand overflow-hidden rounded-[var(--radius-card)] border border-sand">
      {list.map((i, idx) => (
        <li key={i.id || idx} className="flex items-baseline justify-between gap-4 bg-cream px-4 py-3">
          <span className="min-w-0">
            {i.label && <span className="font-medium text-ink">{i.label}</span>}
            {i.detail && <span className="block text-sm leading-snug text-ink-muted">{i.detail}</span>}
          </span>
          {i.value && <span className="shrink-0 font-display text-base font-semibold tabular-nums text-gold-text">{i.value}</span>}
        </li>
      ))}
    </ul>
  );
}

function ScheduleBlock({ items, tone: t }: { items: SectionItem[]; tone: ToneClasses }) {
  const list = items.filter((i) => i.label || i.value);
  if (list.length === 0) return null;
  return (
    <ul className="divide-y divide-sand overflow-hidden rounded-[var(--radius-card)] border border-sand">
      {list.map((i, idx) => (
        <li key={i.id || idx} className="flex flex-wrap items-baseline gap-x-4 bg-cream px-4 py-3">
          {i.label && <span className={`w-32 shrink-0 font-display text-base ${t.text}`}>{i.label}</span>}
          <span className="min-w-0 flex-1">
            {i.value && <span className="font-medium text-ink">{i.value}</span>}
            {i.detail && <span className="block text-sm text-ink-muted">{i.detail}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function MapBlock({ section, tone: t }: { section: ProfileSection; tone: ToneClasses }) {
  const addr = section.body?.trim();
  if (!addr) return null;
  const href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
  return (
    <div className="rounded-[var(--radius-card)] border border-sand bg-cream p-5">
      <div className="flex items-start gap-3">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={`mt-0.5 shrink-0 ${t.text}`} aria-hidden>
          <path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" />
        </svg>
        <p className="font-serif text-base leading-relaxed text-ink">{addr}</p>
      </div>
      <a href={href} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center rounded-full bg-green px-4 py-2 text-sm font-semibold text-cream hover:bg-green-900">Get directions →</a>
    </div>
  );
}
