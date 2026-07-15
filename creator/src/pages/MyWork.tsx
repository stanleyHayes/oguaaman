import { useState } from "react";
import { Link, useLoaderData, useRevalidator } from "react-router-dom";
import { api } from "@/lib/api";
import { publicPathFor, portalUrl, PORTAL } from "@/lib/portal";
import type { Listing, MemberView, Promotion } from "@/lib/types";
import { Card, Empty, StatusBadge } from "@/components/ui";
import { Stagger, StaggerItem } from "@/components/motion";
import { cedis, formatDate, initials } from "@/lib/format";
import { ExternalLink, Megaphone, Pencil } from "lucide-react";

export async function loader(): Promise<MemberView> {
  const me = await api.me();
  return api.member(me.slug);
}

const TYPE_LABELS: Record<string, string> = {
  business: "Business", artist: "Artist", person: "Person", memory: "Memory",
  event: "Event", opportunity: "Opportunity", memorial: "Memorial", project: "Project",
  incident: "Incident", lostfound: "Lost & found",
};

// The owner editor covers the member-submittable types; incident/lostfound
// have their own flows and projects belong to institutions.
const EDITABLE = new Set(["artist", "business", "event", "memory", "opportunity", "person", "memorial"]);

export function Component() {
  const { listings } = useLoaderData() as MemberView;
  const revalidator = useRevalidator();
  const [promoFor, setPromoFor] = useState<string | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoConfirmed, setPromoConfirmed] = useState<Promotion | null>(null);

  async function promote(l: Listing, days: number) {
    setPromoError(null);
    setPromoBusy(true);
    try {
      const r = await api.promoteListing(l.id, days);
      if (r.simulated) {
        // Dev mode has no Paystack checkout to return from — settle in place.
        const p = await api.confirmPromotion(r.reference);
        setPromoConfirmed(p);
        setPromoFor(null);
        setPromoBusy(false);
        revalidator.revalidate();
      } else {
        window.location.assign(r.authorizationUrl); // off to Paystack
      }
    } catch (e) {
      setPromoError(e instanceof Error ? e.message : "Could not start the payment.");
      setPromoBusy(false);
    }
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-gold-text">My work</p>
          <h1 className="mt-1 text-3xl font-semibold text-ink">Your listings</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Everything you've contributed, with its review status. Promote an approved listing to feature it across the portal — GH₵ 10 per day.
          </p>
        </div>
        <a href={`${PORTAL}/submit`} className="rounded-full bg-green px-4 py-2 text-sm font-semibold text-cream transition-colors hover:bg-green-900">
          Add a listing
        </a>
      </div>

      {promoConfirmed && (
        <p className="mb-4 rounded-lg bg-teal/[0.12] px-4 py-3 text-sm font-medium text-teal-text">
          Payment confirmed — &ldquo;{promoConfirmed.listingTitle}&rdquo; is now featured for {promoConfirmed.days} days. ✓
        </p>
      )}
      {promoError && (
        <p className="mb-4 rounded-lg bg-maroon-900/[0.08] px-4 py-3 text-sm font-medium text-maroon-900">{promoError}</p>
      )}

      {listings.length === 0 ? (
        <Empty icon="pen" title="Nothing yet" actions={
          <a href={`${PORTAL}/submit`} className="rounded-full bg-green px-4 py-2 text-sm font-semibold text-cream">Add your first listing</a>
        }>
          Your businesses, events, art and projects show up here once you submit them on the portal.
        </Empty>
      ) : (
        <Card className="overflow-hidden px-4">
          <Stagger as="ul" className="divide-y divide-sand">
            {listings.map((l, idx) => {
              const path = publicPathFor(l);
              const featuredUntil = l.featuredUntil && l.featuredUntil > new Date().toISOString() ? l.featuredUntil : null;
              return (
                <StaggerItem as="li" key={l.id} index={idx} className="py-3.5">
                  <div className="flex items-center gap-3">
                    {l.coverImageUrl ? (
                      <img src={l.coverImageUrl} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" loading="lazy" />
                    ) : (
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-green/[0.08] text-xs font-bold text-green">{initials(l.title)}</span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">{l.title}</p>
                      <p className="text-xs text-ink-faint">
                        {TYPE_LABELS[l.type] ?? l.type} · added {formatDate(l.submittedAt ?? l.createdAt)}
                        {l.status === "rejected" && l.rejectionReason ? ` — ${l.rejectionReason}` : ""}
                      </p>
                    </div>
                    {featuredUntil && (
                      <span className="hidden shrink-0 rounded-full bg-gold/[0.14] px-2.5 py-1 text-xs font-semibold text-gold-text sm:inline">
                        ★ Featured until {formatDate(featuredUntil)}
                      </span>
                    )}
                    <StatusBadge status={l.status} />
                    {EDITABLE.has(l.type) && (
                      <Link to={`/work/${l.id}/edit`} className="shrink-0 rounded-lg p-1.5 text-ink-faint transition-colors hover:text-gold-text" title="Edit listing" aria-label={`Edit ${l.title}`}>
                        <Pencil size={15} />
                      </Link>
                    )}
                    {path && (
                      <a href={portalUrl(path)} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg p-1.5 text-ink-faint transition-colors hover:text-gold-text" title="View on the portal" aria-label={`View ${l.title} on the portal`}>
                        <ExternalLink size={15} />
                      </a>
                    )}
                  </div>
                  {l.status === "approved" && (
                    <div className="mt-2 pl-14">
                      {promoFor === l.id ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {[7, 14, 30].map((d) => (
                            <button key={d} type="button" onClick={() => promote(l, d)} disabled={promoBusy}
                              className="rounded-full border border-green px-2.5 py-1 text-xs font-semibold text-green transition-colors hover:bg-green hover:text-cream disabled:opacity-60">
                              {d}d · {cedis(d * 1000)}
                            </button>
                          ))}
                          <button type="button" onClick={() => setPromoFor(null)} className="text-xs text-ink-faint hover:text-ink">Cancel</button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => { setPromoFor(l.id); setPromoError(null); }}
                          className="inline-flex items-center gap-1.5 rounded-full border border-gold-brand px-3 py-1 text-xs font-semibold text-gold-text transition-colors hover:bg-gold-brand hover:text-green-900">
                          <Megaphone size={12} aria-hidden /> Promote
                        </button>
                      )}
                    </div>
                  )}
                </StaggerItem>
              );
            })}
          </Stagger>
        </Card>
      )}

      <p className="mt-4 text-xs text-ink-faint">
        Tap the pencil to edit a listing — approved listings stay live, others go back into review.
        Want to grow faster? See <Link to="/grow" className="font-semibold text-gold-text hover:underline">Promote &amp; plan</Link>.
      </p>
    </>
  );
}
