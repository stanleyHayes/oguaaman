import { useState } from "react";
import { Link, useLoaderData } from "react-router-dom";
import { api } from "@/lib/api";
import type { Report, ReportAction } from "@/lib/types";
import { PageHeader, Card, Empty, Pill } from "@/components/ui";
import { Stagger, StaggerItem } from "@/components/motion";
import { Pagination } from "@/components/pagination";
import { formatDate } from "@/lib/format";
import { BusyLabel } from "@/components/skeleton";

const PAGE_SIZE = 24;
const OPEN = "open";
const SLA_HOURS = 24;

export async function loader() {
  return api.reports();
}

const REASON_LABEL: Record<string, string> = {
  child_safety: "Child safety", ncii: "Intimate images", harassment: "Harassment", hate: "Hate",
  violence: "Violence", private_info: "Private information", scam: "Scam or fraud",
  inaccurate: "Not accurate", inappropriate: "Inappropriate", impersonation: "Impersonation",
  bereavement: "Memorial concern", other: "Other",
};
const TONE: Record<string, "clay" | "gold" | "neutral"> = {
  child_safety: "clay", ncii: "clay", violence: "clay", hate: "clay", harassment: "clay",
  private_info: "gold", scam: "gold",
  bereavement: "clay", impersonation: "clay", inappropriate: "gold", inaccurate: "gold", other: "neutral",
};
const TARGET_LABEL: Record<string, string> = {
  listing: "Listing", member: "Member", review: "Review", tribute: "Tribute", product: "Product",
  news: "News", agent: "Agent", agent_review: "Agent review", ai_output: "AI output", ad: "Ad",
};
const ACTION_LABEL: Record<ReportAction, string> = {
  none: "No change to the content",
  remove: "Content removed",
  remove_and_suspend: "Content removed, author suspended",
};

/** "45 min old", "3 h old", "2 d old" from the server-computed age. */
function ageLabel(minutes: number | undefined): string {
  if (minutes == null) return "";
  if (minutes < 60) return `${Math.max(0, minutes)} min old`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h old`;
  return `${Math.floor(hours / 24)} d old`;
}

type Resolve = (r: Report, status: "actioned" | "dismissed", action: ReportAction, note: string) => Promise<void>;

export function Component() {
  const initial = useLoaderData() as Report[];
  const [rows, setRows] = useState(initial);
  const [showResolved, setShowResolved] = useState(false);
  const [page, setPage] = useState(1);

  const open = rows.filter((r) => r.status === OPEN);
  const resolved = rows.filter((r) => r.status !== OPEN);
  const breached = open.filter((r) => r.slaBreached).length;
  const shown = showResolved ? rows : open;

  // Toggling the resolved view resets to page 1 (adjust-during-render); the
  // clamp keeps the slice valid as rows resolve out of the open set.
  const [prevToggle, setPrevToggle] = useState(showResolved);
  if (prevToggle !== showResolved) { setPrevToggle(showResolved); setPage(1); }
  const totalPages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = shown.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const resolve: Resolve = async (r, status, action, note) => {
    const res = await api.resolveReport(r.id, { status, resolution: note, action });
    const finalStatus = res.status === "dismissed" ? "dismissed" : "actioned";
    setRows((cur) => cur.map((x) => (x.id === r.id ? { ...x, status: finalStatus, action, resolution: note, slaBreached: false } : x)));
  };

  const keeperGranted = (id: string) => setRows((prev) => prev.map((x) => (x.id === id ? { ...x, status: "actioned" } : x)));

  return (
    <>
      <PageHeader kicker="Safeguarding" title="Reports">
        <button type="button" onClick={() => setShowResolved((v) => !v)} className="rounded-full border border-sand px-4 py-2 text-sm font-medium text-ink-muted hover:bg-paper">
          {showResolved ? `Hide resolved (${resolved.length})` : `Show resolved (${resolved.length})`}
        </button>
      </PageHeader>
      <p className="mb-3 max-w-2xl text-sm text-ink-muted">
        Member reports on any content: listings, members, reviews, tributes, products, news, agents and AI output.
        Act on every report within {SLA_HOURS} hours. Child-safety and intimate-image reports hide the content
        as soon as they arrive; dismissing them puts it back. The most urgent reasons are listed first, then the oldest.
      </p>
      {breached > 0 && (
        <p className="mb-5 max-w-2xl rounded-lg border border-clay/30 bg-clay/5 px-3 py-2 text-sm font-medium text-clay-text" role="status">
          {breached} open {breached === 1 ? "report is" : "reports are"} over {SLA_HOURS} hours old.
        </p>
      )}

      {shown.length === 0 ? (
        <Empty icon="shield" title={open.length === 0 ? "No open reports" : "Nothing to show"}>The community queue is clear. New reports notify every steward.</Empty>
      ) : (
        <Stagger className="space-y-3">
          {pageItems.map((r, idx) => (
            <StaggerItem key={r.id} index={idx}>
              <ReportCard report={r} onResolve={resolve} onKeeperGranted={keeperGranted} />
            </StaggerItem>
          ))}
        </Stagger>
      )}
      <Pagination page={safePage} totalPages={totalPages} onChange={setPage} total={shown.length} pageSize={PAGE_SIZE} />
    </>
  );
}

/** Where the reported content lives: its listing page when there is one. */
function TargetLink({ report }: Readonly<{ report: Report }>) {
  const title = report.targetTitle || report.listingTitle || "Untitled";
  if (report.targetType === "ad" && report.targetId) {
    return <Link to={`/ads/${report.targetId}`} className="mt-2 block text-lg font-semibold text-green-text hover:underline">{title}</Link>;
  }
  if (report.listingId) {
    return <Link to={`/listings/${report.listingId}`} className="mt-2 block text-lg font-semibold text-green-text hover:underline">{title}</Link>;
  }
  return <p className="mt-2 text-lg font-semibold text-ink">{title}</p>;
}

function ReportCard({ report: r, onResolve, onKeeperGranted }: Readonly<{ report: Report; onResolve: Resolve; onKeeperGranted: (id: string) => void }>) {
  const isOpen = r.status === OPEN;
  const target = TARGET_LABEL[r.targetType ?? "listing"] ?? r.targetType ?? r.listingType;
  return (
    <Card className={`p-5 ${isOpen ? "" : "opacity-70"} ${r.slaBreached ? "border-clay/50" : ""}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {r.slaBreached && <Pill tone="clay">Over {SLA_HOURS} h</Pill>}
          {r.keeperClaim && <Pill tone="clay">Keeper claim</Pill>}
          <Pill tone={TONE[r.reason] ?? "neutral"}>{REASON_LABEL[r.reason] ?? r.reason}</Pill>
          {r.autoHidden && <Pill tone="gold">Hidden on arrival</Pill>}
          <span className="text-xs uppercase tracking-wide text-ink-faint">{target}</span>
          {isOpen && r.ageMinutes != null && <span className="text-xs font-semibold text-ink-muted">· {ageLabel(r.ageMinutes)}</span>}
          {!isOpen && <span className="text-xs font-semibold capitalize text-ink-muted">· {r.status}</span>}
        </div>
        <TargetLink report={r} />
        {r.detail && <p className="mt-1.5 max-w-xl text-sm italic text-ink-faint">“{r.detail}”</p>}
        <div className="mt-2 text-xs text-ink-faint">
          {r.reporterName ? <>Reported by {r.reporterName} · </> : <>Reported anonymously · </>}
          {formatDate(r.createdAt)}
        </div>
        {r.evidence && (
          <details className="mt-2 max-w-2xl text-xs text-ink-muted">
            <summary className="cursor-pointer font-medium">Content as reported</summary>
            <pre className="mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-sand bg-paper p-2.5 font-mono">{r.evidence}</pre>
          </details>
        )}
        {!isOpen && (r.action || r.resolution) && (
          <p className="mt-2 text-xs text-ink-muted">
            {r.action ? ACTION_LABEL[r.action] : null}{r.action && r.resolution ? " · " : null}{r.resolution}
          </p>
        )}
      </div>
      {isOpen && <ResolvePanel report={r} onResolve={onResolve} onKeeperGranted={onKeeperGranted} />}
    </Card>
  );
}

const btnBase = "rounded-full px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-50";

/** Resolution note (required) plus the one-step actions: dismiss, keep and
 *  mark actioned, remove, or remove and suspend the author (A017). */
function ResolvePanel({ report: r, onResolve, onKeeperGranted }: Readonly<{ report: Report; onResolve: Resolve; onKeeperGranted: (id: string) => void }>) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [armSuspend, setArmSuspend] = useState(false);
  const noteMissing = note.trim() === "";

  async function run(status: "actioned" | "dismissed", action: ReportAction) {
    if (noteMissing) { setErr("Add a short note explaining the decision."); return; }
    setBusy(true); setErr(null);
    try {
      await onResolve(r, status, action, note.trim());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't resolve this report.");
    } finally {
      setBusy(false);
    }
  }

  async function grantKeeper() {
    if (!r.reporterId) return;
    setBusy(true); setErr(null);
    try {
      await api.grantKeeperRole(r.listingId, r.reporterId, r.id);
      onKeeperGranted(r.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't grant the keeper role.");
    } finally { setBusy(false); }
  }

  return (
    <div className="mt-4 border-t border-sand pt-4">
      <label className="block max-w-2xl">
        <span className="mb-1 block text-xs font-semibold text-ink">Decision note (required; the reporter is told the report was reviewed)</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full rounded-lg border border-sand bg-paper px-3 py-2 text-sm text-ink focus:border-green-text focus:outline-none" placeholder="What you found and what you did" />
      </label>
      {err && <p className="mt-2 text-xs text-clay-text" role="alert">{err}</p>}
      <div className="mt-3 flex min-h-9 flex-wrap items-center gap-2">
        {busy ? <BusyLabel label="Updating report" /> : <>
          {r.keeperClaim && r.reporterId && (
            <button type="button" onClick={grantKeeper} className={`${btnBase} bg-green text-on-green hover:bg-green-900`}>Grant keeper</button>
          )}
          <button type="button" onClick={() => run("dismissed", "none")} className={`${btnBase} border border-sand text-ink-muted hover:border-ink hover:text-ink`}>
            Dismiss
          </button>
          <button type="button" onClick={() => run("actioned", "none")} className={`${btnBase} border border-sand text-ink hover:border-ink`}>
            Mark actioned (keep content)
          </button>
          <button type="button" onClick={() => run("actioned", "remove")} className={`${btnBase} bg-maroon-900 text-white hover:opacity-90`}>
            Remove content
          </button>
          {r.targetOwnerId && !armSuspend && (
            <button type="button" onClick={() => setArmSuspend(true)} className={`${btnBase} border border-clay/50 text-clay-text hover:bg-clay/10`}>
              Remove & suspend author…
            </button>
          )}
          {r.targetOwnerId && armSuspend && (
            <span className="inline-flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => run("actioned", "remove_and_suspend")} className={`${btnBase} bg-clay text-on-green hover:bg-clay-text`}>
                Confirm: remove and suspend
              </button>
              <button type="button" onClick={() => setArmSuspend(false)} className="text-xs font-medium text-ink-muted hover:text-ink">Cancel</button>
            </span>
          )}
        </>}
      </div>
    </div>
  );
}
