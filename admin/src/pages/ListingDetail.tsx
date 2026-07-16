import { useState } from "react";
import { useLoaderData, useNavigate, type LoaderFunctionArgs } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { api } from "@/lib/api";
import type { Listing, ListingStatus } from "@/lib/types";
import { BackLink, Card, StatusBadge, Pill, KeyVal } from "@/components/ui";
import { AiWritingBar } from "@/components/ai-writing-bar";
import { formatDate, titleCase } from "@/lib/format";
import { cldCover } from "@/lib/cloudinary";

interface Data { listing: Listing; ownerName: string }

export async function loader({ params }: LoaderFunctionArgs): Promise<Data> {
  const [listings, queue, members] = await Promise.all([api.listings(), api.queue(), api.members()]);
  const byId = new Map<string, Listing>();
  for (const l of [...listings, ...queue]) byId.set(l.id, l);
  const listing = byId.get(params.id!);
  if (!listing) throw new Response("Listing not found", { status: 404 });
  const ownerName = members.find((m) => m.id === listing.ownerId)?.displayName ?? listing.ownerId;
  return { listing, ownerName };
}

// Human-friendly labels for the free-form detail keys we know about.
const DETAIL_LABELS: Record<string, string> = {
  actName: "Act name", genres: "Genres", bio: "Bio", booking: "Booking",
  whyNotable: "Why notable", era: "Era", living: "Living",
  text: "Story", description: "Description", startsAt: "Starts", venue: "Venue", organiser: "Organiser",
  kind: "Kind", eligibility: "Eligibility", provider: "Provider", deadline: "Deadline", applyUrl: "Apply URL",
  category: "Category", address: "Address", openingHours: "Opening hours",
  honorific: "Honorific", epitaph: "Epitaph", lifeStory: "Life story",
  bornYear: "Born", diedDate: "Died", birthday: "Birthday", observeBirthday: "Observe birthday",
  associations: "Associations", candles: "Candles", rememberedByCount: "Remembered by",
};
const HIDDEN_KEYS = new Set(["gallery", "streamingLinks", "socials", "services"]);

function renderValue(v: unknown): string {
  if (Array.isArray(v)) return v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ");
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (v == null) return "";
  if (typeof v === "object") return JSON.stringify(v);
  if (typeof v === "string") return v;
  if (typeof v === "bigint") return String(v);
  return JSON.stringify(v) ?? "";
}

export function Component() {
  const { listing, ownerName } = useLoaderData() as Data;
  const nav = useNavigate();
  const [l, setL] = useState(listing);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const d = l.details ?? {};
  const gallery = (d.gallery ?? []).filter((g) => g.url);

  async function moderate(action: "approve" | "reject") {
    if (action === "reject" && !reason.trim()) { setRejecting(true); return; }
    setBusy(true);
    try {
      await api.moderate({ listingId: l.id, action, reason: reason.trim() || undefined });
      setL((x) => ({ ...x, status: (action === "approve" ? "approved" : "rejected") as ListingStatus, rejectionReason: action === "reject" ? reason.trim() : x.rejectionReason }));
      setRejecting(false); setReason("");
    } finally { setBusy(false); }
  }
  async function unpublish() {
    setBusy(true);
    try { await api.unpublish(l.id); setL((x) => ({ ...x, status: "unpublished" as ListingStatus })); }
    finally { setBusy(false); }
  }
  async function feature(days: number) {
    setBusy(true);
    try { const { featured, featuredUntil } = await api.feature(l.id, true, days); setL((x) => ({ ...x, featured, featuredUntil })); }
    finally { setBusy(false); }
  }
  async function unfeature() {
    setBusy(true);
    try { const { featured, featuredUntil } = await api.feature(l.id, false); setL((x) => ({ ...x, featured, featuredUntil })); }
    finally { setBusy(false); }
  }

  const knownDetails = Object.entries(d).filter(([k, v]) => !HIDDEN_KEYS.has(k) && v !== "" && v != null && !(Array.isArray(v) && v.length === 0));

  function renderModeration() {
    if (l.status === "pending" || l.status === "rejected") {
      return (
              <div className="space-y-2.5">
                <button disabled={busy} onClick={() => moderate("approve")} className="w-full rounded-lg bg-green px-4 py-2.5 text-sm font-semibold text-cream hover:bg-green-900 disabled:opacity-50">Approve & publish</button>
                <AnimatePresence initial={false}>
                  {rejecting && (
                    <motion.div
                      key="reject-panel"
                      className="space-y-2"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: 0.15 }}
                    >
                      <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Reason for rejection (sent to the contributor)…" className="w-full rounded-lg border border-sand bg-paper px-3 py-2 text-sm focus:border-maroon-900 focus:outline-none" />
                      <div className="flex gap-2">
                        <button disabled={busy || !reason.trim()} onClick={() => moderate("reject")} className="flex-1 rounded-lg bg-maroon-900 px-4 py-2 text-sm font-semibold text-cream disabled:opacity-50">Confirm reject</button>
                        <button onClick={() => { setRejecting(false); setReason(""); }} className="rounded-lg border border-sand px-4 py-2 text-sm">Cancel</button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                {!rejecting && (
                  <button disabled={busy} onClick={() => setRejecting(true)} className="w-full rounded-lg border border-maroon-900/40 px-4 py-2.5 text-sm font-semibold text-maroon-900 hover:bg-maroon-900/[0.06] disabled:opacity-50">Reject…</button>
                )}
              </div>
      );
    }
    if (l.status === "approved") {
      return (
              <div className="space-y-2.5">
                {l.featured ? (
                  <div className="rounded-lg border border-gold-border/60 bg-gold/[0.1] p-3">
                    <p className="text-sm font-semibold text-gold-text">★ Featured placement</p>
                    <p className="mt-0.5 text-xs text-ink-muted">{l.featuredUntil ? `Runs until ${formatDate(l.featuredUntil)}` : "No expiry (editorial)"}</p>
                    <button disabled={busy} onClick={unfeature} className="mt-2 rounded-full border border-maroon-900/40 px-3 py-1 text-xs font-semibold text-maroon-900 hover:bg-maroon-900/[0.06] disabled:opacity-50">Unfeature</button>
                  </div>
                ) : (
                  <div className="rounded-lg border border-sand p-3">
                    <p className="text-sm font-semibold text-ink">Feature on front pages</p>
                    <p className="mt-0.5 text-xs text-ink-muted">Paid placement — pick a duration.</p>
                    <div className="mt-2 flex gap-2">
                      {[7, 14, 30].map((days) => (
                        <button key={days} disabled={busy} onClick={() => feature(days)} className="flex-1 rounded-lg bg-green px-2 py-1.5 text-xs font-semibold text-cream hover:bg-green-900 disabled:opacity-50">{days} days</button>
                      ))}
                    </div>
                  </div>
                )}
                <button disabled={busy} onClick={unpublish} className="w-full rounded-lg border border-maroon-900/40 px-4 py-2.5 text-sm font-semibold text-maroon-900 hover:bg-maroon-900/[0.06] disabled:opacity-50">Unpublish</button>
              </div>
      );
    }
    return <p className="text-sm text-ink-muted">Status is <b className="capitalize">{l.status}</b>. No actions available.</p>;
  }

  return (
    <>
      <BackLink to="/listings">All listings</BackLink>

      <Card className="overflow-hidden">
        {l.coverImageUrl && (
          <div className="h-44 w-full bg-sand sm:h-56">
            <img src={cldCover(l.coverImageUrl, 800)} alt="" className="h-full w-full object-cover" />
          </div>
        )}
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone="neutral">{titleCase(l.type)}</Pill>
                <StatusBadge status={l.status} />
                {l.featured && <Pill tone="gold">★ Featured</Pill>}
              </div>
              <h1 className="mt-2 text-3xl font-semibold text-ink">{l.title}</h1>
              <p className="mt-1 text-sm text-ink-faint">by {ownerName} · /{l.type}/{l.slug}</p>
            </div>
          </div>

          {l.status === "rejected" && l.rejectionReason && (
            <p className="mt-4 rounded-lg border border-maroon-900/30 bg-maroon-900/[0.06] px-3 py-2 text-sm text-maroon-900">
              <b>Rejected:</b> {l.rejectionReason}
            </p>
          )}

          {l.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {l.tags.map((t) => <span key={t} className="rounded-full bg-paper px-2.5 py-0.5 text-xs text-ink-muted">#{t}</span>)}
            </div>
          )}
        </div>
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.7fr_1fr]">
        <div className="space-y-5">
          <Card className="p-5 sm:p-6">
            <h2 className="mb-3 text-lg font-semibold">Details</h2>
            <dl>
              {knownDetails.map(([k, v]) => (
                <KeyVal key={k} label={DETAIL_LABELS[k] ?? titleCase(k)}>{renderValue(v)}</KeyVal>
              ))}
              {knownDetails.length === 0 && <p className="text-sm text-ink-muted">No extra details provided.</p>}
            </dl>
            {(d.bio || d.description || d.text || l.title) && (
              <div className="mt-5 border-t border-sand pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">AI writing assistant</p>
                <AiWritingBar initialTitle={l.title} initialBody={d.bio ?? d.description ?? d.text ?? ""} />
              </div>
            )}
          </Card>

          {gallery.length > 0 && (
            <Card className="p-5 sm:p-6">
              <h2 className="mb-3 text-lg font-semibold">Gallery</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {gallery.map((g) => (
                  <figure key={g.url} className="overflow-hidden rounded-lg border border-sand">
                    <img src={g.url} alt={g.caption} className="aspect-square w-full object-cover" />
                    {g.caption && <figcaption className="px-2 py-1 text-xs text-ink-faint">{g.caption}</figcaption>}
                  </figure>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="mb-2 text-lg font-semibold">Timeline</h2>
            <dl>
              <KeyVal label="Created">{formatDate(l.createdAt)}</KeyVal>
              <KeyVal label="Submitted">{formatDate(l.submittedAt)}</KeyVal>
              <KeyVal label="Published">{formatDate(l.publishedAt)}</KeyVal>
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-lg font-semibold">Moderation</h2>
            {renderModeration()}
            <button onClick={() => nav("/moderation")} className="mt-3 w-full text-center text-xs text-ink-faint hover:text-ink">Go to the queue →</button>
          </Card>
        </div>
      </div>
    </>
  );
}
