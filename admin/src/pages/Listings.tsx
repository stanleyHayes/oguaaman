import { useState, useMemo } from "react";
import { Link, useLoaderData, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import type { Listing, Member, ListingStatus } from "@/lib/types";
import { PageHeader, Card, StatusBadge, Empty, Select } from "@/components/ui";
import { Stagger, StaggerItem } from "@/components/motion";
import { Pagination } from "@/components/pagination";
import { formatDate } from "@/lib/format";
import { cldCover } from "@/lib/cloudinary";
import { BusyLabel } from "@/components/skeleton";

interface Data { listings: Listing[]; members: Member[] }
const TYPES = ["all", "artist", "business", "person", "memory", "event", "opportunity", "memorial", "project", "incident", "lostfound"];
const STATUSES = ["all", "approved", "pending", "rejected", "unpublished", "draft"];
const PAGE_SIZE = 24;

export async function loader(): Promise<Data> {
  const [listings, members] = await Promise.all([api.listings(), api.members()]);
  return { listings, members };
}

export function Component() {
  const { listings, members } = useLoaderData() as Data;
  const [params] = useSearchParams();
  const [rows, setRows] = useState(listings);
  const [q, setQ] = useState(params.get("q") ?? "");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const nameOf = (id: string) => members.find((m) => m.id === id)?.displayName ?? "—";

  const filtered = useMemo(() => rows.filter((l) =>
    (type === "all" || l.type === type) &&
    (status === "all" || l.status === status) &&
    (q === "" || l.title.toLowerCase().includes(q.toLowerCase()))
  ), [rows, q, type, status]);

  // The active filters own the page: whenever they change, snap back to page 1
  // (adjust-during-render — no effect needed). Clamp keeps the slice valid after
  // in-place mutations trim the filtered set.
  const filterSig = `${q}|${type}|${status}`;
  const [prevSig, setPrevSig] = useState(filterSig);
  if (prevSig !== filterSig) { setPrevSig(filterSig); setPage(1); }
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  async function unpublish(l: Listing) {
    setBusy(l.id);
    try {
      await api.unpublish(l.id);
      setRows((cur) => cur.map((x) => (x.id === l.id ? { ...x, status: "unpublished" as ListingStatus } : x)));
    } finally { setBusy(null); }
  }

  async function feature(l: Listing, days: number) {
    setBusy(l.id);
    try {
      const { featured, featuredUntil } = await api.feature(l.id, true, days);
      setRows((cur) => cur.map((x) => (x.id === l.id ? { ...x, featured, featuredUntil } : x)));
      setMenuId(null);
    } finally { setBusy(null); }
  }

  async function unfeature(l: Listing) {
    setBusy(l.id);
    try {
      const { featured, featuredUntil } = await api.feature(l.id, false);
      setRows((cur) => cur.map((x) => (x.id === l.id ? { ...x, featured, featuredUntil } : x)));
    } finally { setBusy(null); }
  }

  return (
    <>
      <PageHeader kicker={`${listings.length} total`} title="Listings" />
      <div className="mb-4 flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title…" className="min-w-[12rem] flex-1 rounded-lg border border-sand bg-cream px-3 py-2 text-sm focus:border-ai focus:outline-none" />
        <Select value={type} onValueChange={setType} className="w-40" triggerClassName="capitalize" optionClassName="capitalize">{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</Select>
        <Select value={status} onValueChange={setStatus} className="w-40" triggerClassName="capitalize" optionClassName="capitalize">{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</Select>
      </div>

      {filtered.length === 0 ? <Empty icon="search" title="No matches">No listings match the current filter.</Empty> : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-sand bg-paper text-left text-xs uppercase tracking-wide text-ink-faint">
              <tr><th className="px-4 py-3">Title</th><th className="px-4 py-3">Type</th><th className="px-4 py-3 hidden sm:table-cell">Owner</th><th className="px-4 py-3 hidden md:table-cell">Created</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th></tr>
            </thead>
            <Stagger as="tbody">
              {pageItems.map((l, idx) => (
                <StaggerItem as="tr" key={l.id} index={idx} className="border-b border-sand last:border-0">
                  <td className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-3">
                      {l.coverImageUrl
                        ? <img src={cldCover(l.coverImageUrl, 72)} alt="" className="h-9 w-9 shrink-0 rounded-lg border border-sand object-cover" />
                        : <span className="h-9 w-9 shrink-0 rounded-lg border border-sand bg-paper" aria-hidden />}
                      <Link to={`/listings/${l.id}`} className="hover:text-gold-text hover:underline">{l.title}</Link>
                    </div>
                  </td>
                  <td className="px-4 py-3 capitalize text-ink-muted">{l.type}</td>
                  <td className="px-4 py-3 hidden text-ink-muted sm:table-cell">{nameOf(l.ownerId)}</td>
                  <td className="px-4 py-3 hidden text-ink-faint md:table-cell">{formatDate(l.createdAt)}</td>
                  <td className="px-4 py-3"><StatusBadge status={l.status} /></td>
                  <td className="px-4 py-3 text-right">
                    {l.status === "approved" && (busy === l.id ? <BusyLabel label="Updating listing" className="justify-end" /> : (
                      <span className="inline-flex items-center gap-2">
                        {l.featured ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded-full border border-gold-border/60 bg-gold/[0.14] px-3 py-1 text-xs font-semibold text-gold-text" title={l.featuredUntil ? `Featured until ${formatDate(l.featuredUntil)}` : "Featured with no expiry"}>
                              ★ Featured{" "}
                              <span className="font-normal text-ink-faint">{l.featuredUntil ? `until ${formatDate(l.featuredUntil)}` : "no expiry"}</span>
                            </span>
                            <button type="button" disabled={busy === l.id} onClick={() => unfeature(l)} className="rounded-full border border-maroon-text/40 px-3 py-1 text-xs font-semibold text-maroon-text hover:bg-maroon-900/[0.06] disabled:opacity-50">Unfeature</button>
                          </span>
                        ) : (
                          <span className="relative inline-flex">
                            <button type="button" disabled={busy === l.id} onClick={() => setMenuId((cur) => (cur === l.id ? null : l.id))} className="rounded-full border border-sand px-3 py-1 text-xs font-semibold text-ink-muted hover:border-gold-border/50 disabled:opacity-50">☆ Feature ▾</button>
                            {menuId === l.id && (
                              <span className="absolute right-0 top-full z-10 mt-1 inline-flex gap-1 rounded-lg border border-sand bg-cream p-1 shadow-soft">
                                {[7, 14, 30].map((days) => (
                                  <button type="button" key={days} disabled={busy === l.id} onClick={() => feature(l, days)} className="rounded-full bg-green px-2.5 py-1 text-xs font-semibold text-on-green hover:bg-green-900 disabled:opacity-50">{days}d</button>
                                ))}
                              </span>
                            )}
                          </span>
                        )}
                        <button type="button" disabled={busy === l.id} onClick={() => unpublish(l)} className="rounded-full border border-maroon-text/40 px-3 py-1 text-xs font-semibold text-maroon-text hover:bg-maroon-900/[0.06] disabled:opacity-50">Unpublish</button>
                      </span>
                    ))}
                  </td>
                </StaggerItem>
              ))}
            </Stagger>
          </table>
        </Card>
      )}
      <Pagination page={safePage} totalPages={totalPages} onChange={setPage} total={filtered.length} pageSize={PAGE_SIZE} />
    </>
  );
}
