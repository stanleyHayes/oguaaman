import { useState } from "react";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router-dom";
import type { ReactNode } from "react";
import type { LostFound, LostFoundStatus, Place } from "@/lib/types";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Container, Pill } from "@/components/ui";
import { PageHero } from "@/components/page-hero";
import { formatDate } from "@/lib/format";
import { KIND_LABEL, LF_STATUS_CLASS, LF_STATUS_LABEL } from "@/lib/lostfound";

interface Data {
  notice: LostFound;
  places: Place[];
}

export async function loader({ params }: LoaderFunctionArgs): Promise<Data> {
  const [notice, places] = await Promise.all([
    api.lostFound(params.slug!),
    api.places().catch(() => []),
  ]);
  return { notice, places };
}

export function Component() {
  const { notice, places } = useLoaderData() as Data;
  const { member } = useAuth();
  const [lfStatus, setLfStatus] = useState<LostFoundStatus>(notice.details.lfStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const d = notice.details;
  const missing = d.kind === "missing_person";
  const town = places.find((p) => p.id === notice.townId);
  const isOwner = member != null && member.id === notice.ownerId;
  const canResolve = isOwner || member?.role === "curator" || member?.role === "steward";

  async function resolve(status: LostFoundStatus) {
    setBusy(true);
    setError(null);
    try {
      await api.resolveLostFound(notice.slug, status);
      setLfStatus(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the notice — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHero tone={missing ? "maroon" : "teal"} kicker={`Lost & found · ${KIND_LABEL[d.kind] ?? d.kind}`} title={notice.title} lede={d.description}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${LF_STATUS_CLASS[lfStatus]}`}>
            {LF_STATUS_LABEL[lfStatus] ?? lfStatus}
          </span>
          {town && <Pill tone="green">{town.name}</Pill>}
        </div>
      </PageHero>
      <Container size="narrow" className="py-12">
        {notice.coverImageUrl && (
          <img src={notice.coverImageUrl} alt="" className="mb-8 aspect-[16/9] w-full rounded-[var(--radius-card)] border border-sand object-cover" />
        )}

        <dl className="rounded-[var(--radius-card)] border border-sand bg-cream p-6">
          {d.lastSeenLocation && <KeyVal label={missing ? "Last seen at" : d.kind === "lost_item" ? "Lost at" : "Found at"}>{d.lastSeenLocation}</KeyVal>}
          {d.lastSeenDate && <KeyVal label="When">{formatDate(d.lastSeenDate)}</KeyVal>}
          <KeyVal label="Contact">{d.contact}</KeyVal>
          <KeyVal label="Posted">{formatDate(notice.createdAt)}</KeyVal>
        </dl>

        {canResolve && lfStatus === "open" && (
          <div className="mt-8 rounded-[var(--radius-card)] border border-sand bg-cream p-6">
            <h2 className="font-display text-lg font-semibold text-ink">Resolve this notice</h2>
            <p className="mt-1.5 text-sm text-ink-muted">
              {missing ? "Found them safe? Mark it reunited so the search can stand down." : "Back with its owner? Mark it reunited — or close the notice if it's run its course."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button disabled={busy} onClick={() => resolve("reunited")} className="rounded-full bg-green px-5 py-2 text-sm font-semibold text-cream transition-colors hover:bg-green-900 disabled:opacity-60">
                Mark as reunited
              </button>
              <button disabled={busy} onClick={() => resolve("closed")} className="rounded-full border border-sand px-5 py-2 text-sm font-semibold text-ink-muted transition-colors hover:border-green/40 disabled:opacity-60">
                Close
              </button>
            </div>
            {error && <p className="mt-3 text-sm text-maroon-900">{error}</p>}
          </div>
        )}

        {lfStatus === "reunited" && (
          <p className="mt-8 rounded-[var(--radius-card)] border border-green/30 bg-green/[0.06] p-5 text-sm text-green">
            Reunited — this notice has a happy ending. Thank you, Oguaa.
          </p>
        )}

        <p className="mt-10 border-t border-sand pt-5 text-sm text-ink-faint">
          {isOwner ? "You posted this notice." : "Only the person who posted this notice or a curator can resolve it."}
          <Link to="/lost-found" className="ml-2 font-semibold text-green hover:underline">← All notices</Link>
        </p>
      </Container>
    </>
  );
}

function KeyVal({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-sand py-3 last:border-0 sm:flex-row sm:gap-4">
      <dt className="w-40 shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="text-sm text-ink">{children}</dd>
    </div>
  );
}
