import { useState } from "react";
import { Link, useLoaderData } from "react-router-dom";
import { api } from "@/lib/api";
import type { Report } from "@/lib/types";
import { PageHeader, Card, Empty, Pill } from "@/components/ui";
import { Stagger, StaggerItem } from "@/components/motion";
import { Pagination } from "@/components/pagination";
import { formatDate } from "@/lib/format";
import { BusyLabel } from "@/components/skeleton";

const PAGE_SIZE = 24;

export async function loader() {
  return api.reports();
}

const REASON_LABEL: Record<string, string> = {
  inaccurate: "Not accurate", inappropriate: "Inappropriate", impersonation: "Impersonation",
  bereavement: "Memorial concern", other: "Other",
};
const TONE: Record<string, "clay" | "gold" | "neutral"> = {
  bereavement: "clay", impersonation: "clay", inappropriate: "gold", inaccurate: "gold", other: "neutral",
};

export function Component() {
  const initial = useLoaderData() as Report[];
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [page, setPage] = useState(1);

  const open = rows.filter((r) => r.status === "open");
  const resolved = rows.filter((r) => r.status !== "open");
  const shown = showResolved ? rows : open;

  // Toggling the resolved view resets to page 1 (adjust-during-render); the
  // clamp keeps the slice valid as rows resolve out of the open set.
  const [prevToggle, setPrevToggle] = useState(showResolved);
  if (prevToggle !== showResolved) { setPrevToggle(showResolved); setPage(1); }
  const totalPages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = shown.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  async function resolve(r: Report, status: "actioned" | "dismissed") {
    setBusy(r.id);
    try {
      await api.resolveReport(r.id, status);
      setRows((cur) => cur.map((x) => (x.id === r.id ? { ...x, status } : x)));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader kicker="Safeguarding" title="Reports">
        <button type="button" onClick={() => setShowResolved((v) => !v)} className="rounded-full border border-sand px-4 py-2 text-sm font-medium text-ink-muted hover:bg-paper">
          {showResolved ? `Hide resolved (${resolved.length})` : `Show resolved (${resolved.length})`}
        </button>
      </PageHeader>
      <p className="mb-5 max-w-2xl text-sm text-ink-muted">
        Member-filed reports against published content. Contested or sensitive items (memorials, leadership
        claims) are held and referred — never auto-removed. Open the listing to take a moderation action,
        then mark the report resolved here.
      </p>

      {shown.length === 0 ? (
        <Empty icon="shield" title={open.length === 0 ? "No open reports" : "Nothing to show"}>The community queue is clear. New reports notify every steward.</Empty>
      ) : (
        <Stagger className="space-y-3">
          {pageItems.map((r, idx) => (
            <StaggerItem key={r.id} index={idx}>
              <Card className={`p-5 ${r.status !== "open" ? "opacity-70" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {r.keeperClaim && <Pill tone="clay">Keeper claim</Pill>}
                    <Pill tone={TONE[r.reason] ?? "neutral"}>{REASON_LABEL[r.reason] ?? r.reason}</Pill>
                    <span className="text-xs uppercase tracking-wide text-ink-faint">{r.listingType}</span>
                    {r.status !== "open" && <span className="text-xs font-semibold capitalize text-ink-muted">· {r.status}</span>}
                  </div>
                  <Link to={`/listings/${r.listingId}`} className="mt-2 block text-lg font-semibold text-green-text hover:underline">
                    {r.listingTitle}
                  </Link>
                  {r.detail && <p className="mt-1.5 max-w-xl text-sm italic text-ink-faint">“{r.detail}”</p>}
                  <div className="mt-2 text-xs text-ink-faint">
                    {r.reporterName ? <>Reported by {r.reporterName} · </> : <>Reported anonymously · </>}
                    {formatDate(r.createdAt)}
                  </div>
                </div>
                {r.status === "open" && (
                  <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-2">
                    {busy === r.id ? <BusyLabel label="Updating report" /> : <>
                    {r.keeperClaim && r.reporterId && (
                      <button type="button"
                        disabled={busy === r.id}
                        onClick={async () => {
                          setBusy(r.id);
                          try {
                            await api.grantKeeperRole(r.listingId, r.reporterId!, r.id);
                            setRows((prev) => prev.map((x) => x.id === r.id ? { ...x, status: "actioned" } : x));
                          } finally { setBusy(null); }
                        }}
                        className="rounded-full bg-green px-4 py-2 text-xs font-semibold text-on-green transition-colors hover:bg-green-900 disabled:opacity-50"
                      >
                        Grant keeper
                      </button>
                    )}
                    <button type="button" disabled={busy === r.id} onClick={() => resolve(r, "actioned")} className="rounded-full bg-maroon-900 px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50">
                      Mark actioned
                    </button>
                    <button type="button" disabled={busy === r.id} onClick={() => resolve(r, "dismissed")} className="rounded-full border border-sand px-4 py-2 text-xs font-semibold text-ink-muted transition-colors hover:border-ink hover:text-ink disabled:opacity-50">
                      Dismiss
                    </button>
                    </>}
                  </div>
                )}
              </div>
            </Card>
            </StaggerItem>
          ))}
        </Stagger>
      )}
      <Pagination page={safePage} totalPages={totalPages} onChange={setPage} total={shown.length} pageSize={PAGE_SIZE} />
    </>
  );
}
