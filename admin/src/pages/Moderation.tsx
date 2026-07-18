import { useState } from "react";
import { Link, useLoaderData } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { api } from "@/lib/api";
import type { Listing, Member, Paged } from "@/lib/types";
import { Card, Empty, Pill, Select } from "@/components/ui";
import { Stagger, StaggerItem } from "@/components/motion";
import { LoadMore } from "@/components/pagination";
import { titleCase } from "@/lib/format";
import { cldCover } from "@/lib/cloudinary";
import { BusyLabel } from "@/components/skeleton";

interface Data { queue: Paged<Listing>; members: Member[] }
interface Log { action: string; title: string; reason?: string; tone: "ok" | "bad" | "warn" }

const LISTING_TYPES = [
  { value: "", label: "All types" },
  { value: "artist", label: "Artist" },
  { value: "business", label: "Business" },
  { value: "event", label: "Event" },
  { value: "incident", label: "Incident" },
  { value: "lostfound", label: "Lost & Found" },
  { value: "memorial", label: "Memorial" },
  { value: "memory", label: "Memory" },
  { value: "opportunity", label: "Opportunity" },
  { value: "person", label: "Person" },
  { value: "project", label: "Project" },
];

function toneClass(tone: Log["tone"]): string {
  if (tone === "ok") return "text-green-text";
  if (tone === "bad") return "text-maroon-text";
  return "text-gold-text";
}

export async function loader(): Promise<Data> {
  const [queue, members] = await Promise.all([api.queuePaged({ page: 1 }), api.members()]);
  return { queue, members };
}

function snippet(l: Listing): string {
  const d = l.details;
  return (d.bio ?? d.description ?? d.text ?? d.whyNotable ?? d.epitaph ?? d.lifeStory ?? "") as string;
}

export function Component() {
  const { queue, members } = useLoaderData() as Data;
  const [items, setItems] = useState(queue.items);
  const [page, setPage] = useState(queue.page);
  const [total, setTotal] = useState(queue.total);
  const [totalPages, setTotalPages] = useState(queue.totalPages);
  const [typeFilter, setTypeFilter] = useState("");
  const [log, setLog] = useState<Log[]>([]);
  const [rejecting, setRejecting] = useState<{ id: string; mode: "reject" | "changes" } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [loadingFilter, setLoadingFilter] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const nameOf = (id: string) => members.find((m) => m.id === id)?.displayName ?? "A member";

  async function applyTypeFilter(type: string) {
    setTypeFilter(type);
    setLoadingFilter(true);
    try {
      const res = await api.queuePaged({ page: 1, type: type || undefined });
      setItems(res.items);
      setPage(res.page);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch {
      // fall back to client-side filter over the loaded page if the request fails
      setItems((cur) => (type ? cur.filter((i) => i.type === type) : cur));
    } finally {
      setLoadingFilter(false);
    }
  }

  async function loadMore() {
    if (page >= totalPages || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.queuePaged({ page: page + 1, type: typeFilter || undefined });
      setItems((cur) => [...cur, ...res.items]);
      setPage(res.page);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } finally {
      setLoadingMore(false);
    }
  }

  async function act(l: Listing, action: string, entry: Log, why?: string) {
    setBusy(l.id);
    try {
      await api.moderate({ listingId: l.id, action, reason: why });
      setItems((cur) => cur.filter((i) => i.id !== l.id));
      setTotal((t) => Math.max(0, t - 1));
      setLog((cur) => [entry, ...cur]);
    } catch {
      setLog((cur) => [{ action: "Failed", title: l.title, tone: "bad" }, ...cur]);
    } finally { setBusy(null); setRejecting(null); setReason(""); }
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-gold-text">Moderation</p>
          <h1 className="mt-1 text-3xl font-semibold text-ink">Review queue</h1>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={typeFilter}
            onValueChange={applyTypeFilter}
            disabled={loadingFilter}
            className="w-40 font-medium"
          >
            {LISTING_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
          {loadingFilter && <BusyLabel label="Filtering moderation queue" width="w-12" />}
          <span className="rounded-full bg-gold/[0.16] px-3 py-1 text-sm font-semibold text-gold-text">{total} pending</span>
        </div>
      </div>

      <div>
        <div>
          {items.length === 0 ? (
            <Empty icon="check" title="Queue clear">Nothing waiting. New submissions land here for review.</Empty>
          ) : (
            <Stagger className="space-y-4">
              {items.map((l, idx) => (
                <StaggerItem key={l.id} index={idx}>
                  <Card className="overflow-hidden">
              <div className="flex">
                <span className="w-1 shrink-0 bg-gold" aria-hidden />
                <div className="flex-1 p-5">
                  {l.coverImageUrl && (
                    <img
                      src={cldCover(l.coverImageUrl, 700)}
                      alt=""
                      className="mb-3 h-36 w-full rounded-lg border border-sand object-cover"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                  )}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Pill tone="green">{titleCase(l.type)}</Pill>
                      <h3 className="mt-2 text-xl font-semibold">
                        <Link to={`/listings/${l.id}`} className="hover:text-gold-text hover:underline">{l.title}</Link>
                      </h3>
                      <p className="text-xs text-ink-faint">by {nameOf(l.ownerId)} · submitted {l.submittedAt?.slice(0, 10)}</p>
                    </div>
                    <Link to={`/listings/${l.id}`} className="shrink-0 text-xs font-semibold text-gold-text hover:underline">View full →</Link>
                  </div>

                  {snippet(l) && <p className="mt-3 line-clamp-3 text-sm text-ink-muted">{snippet(l)}</p>}

                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-sand pt-3 text-xs text-ink-faint">
                    <span className="font-medium text-ink-muted">Check:</span>
                    {["real", "local", "categorised", "appropriate"].map((c) => <span key={c} className="rounded bg-paper px-2 py-0.5">{c}</span>)}
                  </div>

                  <AnimatePresence initial={false}>
                    {rejecting?.id === l.id && (
                      <motion.div
                        key="reject-panel"
                        className="mt-4"
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.15 }}
                      >
                        <textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder={rejecting.mode === "reject" ? "Reason (sent to owner)…" : "What changes are needed?"} className="w-full rounded-lg border border-sand bg-paper p-3 text-sm focus:border-gold-border focus:outline-none" />
                        <div className="mt-2 flex gap-2">
                          {busy === l.id ? <BusyLabel label="Updating moderation item" /> : <>
                            <button type="button" onClick={() => act(l, rejecting.mode === "reject" ? "reject" : "request-changes", { action: rejecting.mode === "reject" ? "Rejected" : "Requested changes to", title: l.title, reason: reason.trim() || "(none)", tone: rejecting.mode === "reject" ? "bad" : "warn" }, reason.trim())} className="rounded-full bg-maroon-900 px-4 py-2 text-sm font-semibold text-on-green">Confirm</button>
                            <button type="button" onClick={() => setRejecting(null)} className="rounded-full border border-sand px-4 py-2 text-sm font-semibold">Cancel</button>
                          </>}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {rejecting?.id !== l.id && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {busy === l.id ? <BusyLabel label="Updating moderation item" /> : <>
                        <button type="button" onClick={() => act(l, "approve", { action: "Approved", title: l.title, tone: "ok" })} className="rounded-full bg-green px-4 py-2 text-sm font-semibold text-on-green hover:bg-green-900">Approve</button>
                        <button type="button" onClick={() => setRejecting({ id: l.id, mode: "changes" })} className="rounded-full border border-gold-border/50 px-4 py-2 text-sm font-semibold text-gold-text hover:bg-gold/[0.08]">Request changes</button>
                        <button type="button" onClick={() => setRejecting({ id: l.id, mode: "reject" })} className="rounded-full border border-maroon-text/40 px-4 py-2 text-sm font-semibold text-maroon-text hover:bg-maroon-900/[0.06]">Reject</button>
                      </>}
                    </div>
                  )}
                </div>
              </div>
            </Card>
                </StaggerItem>
              ))}
            </Stagger>
          )}
          {items.length > 0 && (
            <LoadMore onClick={loadMore} loading={loadingMore} hasMore={page < totalPages} loaded={items.length} total={total} />
          )}
        </div>

        <div className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">This session</h2>
          <Card className="p-5">
            {log.length === 0 ? <p className="text-sm text-ink-faint">Your moderation actions appear here and are written to the audit log.</p> : (
              <ul className="space-y-3">
                {log.map((e) => (
                  <li key={`${e.action}-${e.title}-${e.reason ?? ""}`} className="border-b border-sand pb-3 text-sm last:border-0 last:pb-0">
                    <span className={`font-semibold ${toneClass(e.tone)}`}>{e.action}</span> “{e.title}”
                    {e.reason && <span className="block text-xs text-ink-muted">“{e.reason}”</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
