import { useMemo, useState } from "react";
import { useLoaderData } from "react-router-dom";
import { api } from "@/lib/api";
import type { PrivacyRequest, PrivacyRequestStatus } from "@/lib/types";
import { PageHeader, Card, Empty, Pill } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { BusyLabel } from "@/components/skeleton";

// Data-rights requests (K10 / GH-DPA-09): access, correction, deletion,
// objection and other requests from the public form, with statutory due dates.
// Steward only.

export async function loader() {
  return api.privacyRequests();
}

const STATUS_LABEL: Record<PrivacyRequestStatus, string> = {
  received: "Received",
  in_progress: "In progress",
  completed: "Completed",
  refused: "Refused",
};
const TYPE_LABEL: Record<string, string> = {
  access: "Access", correction: "Correction", deletion: "Deletion", objection: "Objection", other: "Other",
};
const STATUSES = Object.keys(STATUS_LABEL) as PrivacyRequestStatus[];
type Filter = "open" | "all" | PrivacyRequestStatus;
const FILTERS: { value: Filter; label: string }[] = [
  { value: "open", label: "Open" },
  ...STATUSES.map((s) => ({ value: s as Filter, label: STATUS_LABEL[s] })),
  { value: "all", label: "All" },
];

/** Only http(s) links are rendered as links — the URL is requester-supplied. */
function safeHref(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

function isOpen(r: PrivacyRequest): boolean {
  return r.status === "received" || r.status === "in_progress";
}

function matches(r: PrivacyRequest, f: Filter): boolean {
  if (f === "all") return true;
  if (f === "open") return isOpen(r);
  return r.status === f;
}

/** "Overdue by 3 days", "Due today", "Due in 12 days". */
function dueLabel(r: PrivacyRequest): string {
  if (!isOpen(r)) return `Due ${formatDate(r.dueAt)}`;
  if (r.overdue) {
    const late = Math.max(1, -r.dueInDays);
    return `Overdue by ${late} day${late === 1 ? "" : "s"}`;
  }
  if (r.dueInDays <= 0) return "Due today";
  return `Due in ${r.dueInDays} day${r.dueInDays === 1 ? "" : "s"}`;
}

export function Component() {
  const initial = useLoaderData() as PrivacyRequest[];
  const [rows, setRows] = useState(initial);
  const [filter, setFilter] = useState<Filter>("open");
  const shown = useMemo(() => rows.filter((r) => matches(r, filter)), [rows, filter]);
  const overdue = rows.filter((r) => isOpen(r) && r.overdue).length;

  const replace = (updated: PrivacyRequest) =>
    setRows((cur) => cur.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));

  return (
    <>
      <PageHeader kicker="Data protection" title="Privacy requests" />
      <p className="mb-3 max-w-2xl text-sm text-ink-muted">
        Requests people make through the public privacy-request form. Each has a due date; move it along as you
        work on it and record what you did. Refusing a request needs a note with the reason.
      </p>
      {overdue > 0 && (
        <p className="mb-4 max-w-2xl rounded-lg border border-clay/30 bg-clay/5 px-3 py-2 text-sm font-medium text-clay-text" role="status">
          {overdue} open {overdue === 1 ? "request is" : "requests are"} past the due date.
        </p>
      )}
      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${filter === f.value ? "bg-green text-on-green" : "border border-sand text-ink-muted hover:text-ink"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <Empty icon="shield" title="No requests here">Nothing matches this filter.</Empty>
      ) : (
        <div className="space-y-3">
          {shown.map((r) => <RequestCard key={r.id} request={r} onUpdated={replace} />)}
        </div>
      )}
    </>
  );
}

function RequestCard({ request: r, onUpdated }: Readonly<{ request: PrivacyRequest; onUpdated: (r: PrivacyRequest) => void }>) {
  const [status, setStatus] = useState<PrivacyRequestStatus>(r.status);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (status === "refused" && note.trim() === "") { setErr("Add a note giving the reason for refusing."); return; }
    setBusy(true); setErr(null);
    try {
      const updated = await api.updatePrivacyRequest(r.id, status, note.trim());
      onUpdated(updated);
      setNote("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't update this request.");
    } finally {
      setBusy(false);
    }
  }

  const late = isOpen(r) && r.overdue;
  const href = r.targetUrl ? safeHref(r.targetUrl) : null;
  return (
    <Card className={`p-5 ${late ? "border-clay/50" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-semibold text-ink">{r.reference}</span>
        <Pill tone="neutral">{TYPE_LABEL[r.type] ?? r.type}</Pill>
        <Pill tone={isOpen(r) ? "gold" : "green"}>{STATUS_LABEL[r.status] ?? r.status}</Pill>
        <span className={`text-xs font-semibold ${late ? "text-clay-text" : "text-ink-muted"}`}>{dueLabel(r)}</span>
      </div>
      <p className="mt-2 text-base font-semibold text-ink">{r.name}</p>
      <p className="text-sm text-ink-muted">
        {r.contact} · identity: {r.identityCheck.replaceAll("_", " ")} · received {formatDate(r.receivedAt)}
      </p>
      <p className="mt-2 max-w-2xl whitespace-pre-wrap text-sm text-ink">{r.details}</p>
      {r.targetUrl && (
        <p className="mt-1 break-all text-xs text-ink-muted">
          About:{" "}
          {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="text-green-text underline">{r.targetUrl}</a> : r.targetUrl}
        </p>
      )}
      {r.history.length > 0 && (
        <details className="mt-2 text-xs text-ink-muted">
          <summary className="cursor-pointer font-medium">History ({r.history.length})</summary>
          <ul className="mt-1.5 space-y-1">
            {r.history.map((h) => (
              <li key={`${h.at}-${h.status}`}>{formatDate(h.at)} · {STATUS_LABEL[h.status as PrivacyRequestStatus] ?? h.status}{h.note ? ` — ${h.note}` : ""}</li>
            ))}
          </ul>
        </details>
      )}
      <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-sand pt-4">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-ink">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as PrivacyRequestStatus)} className="rounded-lg border border-sand bg-paper px-3 py-2 text-sm text-ink">
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <label className="block min-w-[14rem] flex-1">
          <span className="mb-1 block text-xs font-semibold text-ink">Note</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was done, or why it was refused" className="w-full rounded-lg border border-sand bg-paper px-3 py-2 text-sm text-ink" />
        </label>
        <button type="button" onClick={save} disabled={busy} className="rounded-full bg-green px-4 py-2 text-sm font-semibold text-on-green hover:bg-green-900 disabled:opacity-60">
          {busy ? <BusyLabel label="Saving" /> : "Update"}
        </button>
      </div>
      {err && <p className="mt-2 text-xs text-clay-text" role="alert">{err}</p>}
    </Card>
  );
}
