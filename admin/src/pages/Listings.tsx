import { useState, useMemo } from "react";
import { Link, useLoaderData } from "react-router-dom";
import { api } from "@/lib/api";
import type { Listing, Member, ListingStatus } from "@/lib/types";
import { PageHeader, Card, StatusBadge, Empty } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { cldCover } from "@/lib/cloudinary";

interface Data { listings: Listing[]; members: Member[] }
const TYPES = ["all", "artist", "business", "person", "memory", "event", "opportunity", "memorial", "project", "incident", "lostfound"];
const STATUSES = ["all", "approved", "pending", "rejected", "unpublished", "draft"];

export async function loader(): Promise<Data> {
  const [listings, members] = await Promise.all([api.listings(), api.members()]);
  return { listings, members };
}

export function Component() {
  const { listings, members } = useLoaderData() as Data;
  const [rows, setRows] = useState(listings);
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const nameOf = (id: string) => members.find((m) => m.id === id)?.displayName ?? "—";

  const filtered = useMemo(() => rows.filter((l) =>
    (type === "all" || l.type === type) &&
    (status === "all" || l.status === status) &&
    (q === "" || l.title.toLowerCase().includes(q.toLowerCase()))
  ), [rows, q, type, status]);

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
        <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-lg border border-sand bg-cream px-3 py-2 text-sm capitalize focus:border-ai focus:outline-none">{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-sand bg-cream px-3 py-2 text-sm capitalize focus:border-ai focus:outline-none">{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
      </div>

      {filtered.length === 0 ? <Empty>No listings match.</Empty> : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-sand bg-paper text-left text-xs uppercase tracking-wide text-ink-faint">
              <tr><th className="px-4 py-3">Title</th><th className="px-4 py-3">Type</th><th className="px-4 py-3 hidden sm:table-cell">Owner</th><th className="px-4 py-3 hidden md:table-cell">Created</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th></tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id} className="border-b border-sand last:border-0">
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
                    {l.status === "approved" && (
                      <span className="inline-flex items-center gap-2">
                        {l.featured ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded-full border border-gold-border/60 bg-gold/[0.14] px-3 py-1 text-xs font-semibold text-gold-text" title={l.featuredUntil ? `Featured until ${formatDate(l.featuredUntil)}` : "Featured with no expiry"}>
                              ★ Featured{" "}
                              <span className="font-normal text-ink-faint">{l.featuredUntil ? `until ${formatDate(l.featuredUntil)}` : "no expiry"}</span>
                            </span>
                            <button disabled={busy === l.id} onClick={() => unfeature(l)} className="rounded-full border border-maroon-900/40 px-3 py-1 text-xs font-semibold text-maroon-900 hover:bg-maroon-900/[0.06] disabled:opacity-50">Unfeature</button>
                          </span>
                        ) : (
                          <span className="relative inline-flex">
                            <button disabled={busy === l.id} onClick={() => setMenuId((cur) => (cur === l.id ? null : l.id))} className="rounded-full border border-sand px-3 py-1 text-xs font-semibold text-ink-muted hover:border-gold-border/50 disabled:opacity-50">☆ Feature ▾</button>
                            {menuId === l.id && (
                              <span className="absolute right-0 top-full z-10 mt-1 inline-flex gap-1 rounded-lg border border-sand bg-cream p-1 shadow-soft">
                                {[7, 14, 30].map((days) => (
                                  <button key={days} disabled={busy === l.id} onClick={() => feature(l, days)} className="rounded-full bg-green px-2.5 py-1 text-xs font-semibold text-cream hover:bg-green-900 disabled:opacity-50">{days}d</button>
                                ))}
                              </span>
                            )}
                          </span>
                        )}
                        <button disabled={busy === l.id} onClick={() => unpublish(l)} className="rounded-full border border-maroon-900/40 px-3 py-1 text-xs font-semibold text-maroon-900 hover:bg-maroon-900/[0.06] disabled:opacity-50">Unpublish</button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
