import { useState } from "react";
import { Link, useLoaderData } from "react-router-dom";
import { api } from "@/lib/api";
import type { Incident, IncidentStatus } from "@/lib/types";
import { PageHeader, Card, Empty, Pill } from "@/components/ui";
import { Stagger, StaggerItem } from "@/components/motion";
import { formatDate } from "@/lib/format";

export async function loader() {
  return api.incidents();
}

const STATUSES: { value: IncidentStatus; label: string }[] = [
  { value: "reported", label: "Reported" },
  { value: "verified", label: "Verified" },
  { value: "responding", label: "Responding" },
  { value: "resolved", label: "Resolved" },
  { value: "recovered", label: "Recovered" },
];

const SEVERITY_CLASS: Record<string, string> = {
  critical: "bg-maroon-900 text-white",
  high: "bg-clay text-white",
  medium: "bg-gold-brand text-green-900",
  low: "bg-teal text-white",
};

const inputCls = "rounded-lg border border-sand bg-paper px-3 py-1.5 text-sm text-ink focus:border-gold-border focus:outline-none";

export function Component() {
  const initial = useLoaderData() as Incident[];
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, { status: string; note: string }>>({});

  const d = (id: string, cur: string) => draft[id] ?? { status: cur, note: "" };
  const setD = (id: string, patch: Partial<{ status: string; note: string }>, cur: string) =>
    setDraft((p) => ({ ...p, [id]: { ...d(id, cur), ...patch } }));

  async function transition(i: Incident) {
    const cur = d(i.id, i.details.incidentStatus);
    setBusy(i.id);
    try {
      await api.transitionIncident(i.id, cur.status, cur.note || undefined);
      setRows((prev) => prev.map((x) => x.id === i.id ? {
        ...x,
        details: {
          ...x.details,
          incidentStatus: cur.status as IncidentStatus,
          statusHistory: [...(x.details.statusHistory ?? []), { status: cur.status as IncidentStatus, by: "you", note: cur.note, at: new Date().toISOString() }],
        },
      } : x));
      setDraft((p) => { const n = { ...p }; delete n[i.id]; return n; });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader kicker="Safety · rescue & early recovery" title="Incidents" />
      <p className="mb-5 max-w-2xl text-sm text-ink-muted">
        Safety reports auto-publish on submission — time matters. Verify them here, move them through
        the lifecycle, and leave a note for the timeline shown to the community. Resolved and recovered
        incidents notify the reporter.
      </p>

      {rows.length === 0 ? (
        <Empty icon="shield" title="No incidents">Nothing reported — the town is quiet.</Empty>
      ) : (
        <Stagger className="space-y-3">
          {rows.map((i, idx) => {
            const cur = d(i.id, i.details.incidentStatus);
            const open = expanded === i.id;
            return (
              <StaggerItem key={i.id} index={idx}>
                <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${SEVERITY_CLASS[i.details.severity] ?? "bg-sand text-ink-muted"}`}>
                        {i.details.severity}
                      </span>
                      <Pill tone="neutral">{i.details.category}</Pill>
                      <Pill tone="gold">{i.details.incidentStatus}</Pill>
                    </div>
                    <h3 className="mt-2 text-lg font-semibold text-ink">{i.title}</h3>
                    <p className="mt-1 text-sm text-ink-muted">{i.details.location}</p>
                    <p className="mt-1 text-xs text-ink-faint">
                      Reported {formatDate(i.createdAt)}{i.details.contact ? <> · contact: {i.details.contact}</> : null}
                    </p>
                  </div>
                  <button type="button" onClick={() => setExpanded(open ? null : i.id)} className="shrink-0 rounded-full border border-sand px-4 py-2 text-xs font-semibold text-ink-muted hover:bg-paper">
                    {open ? "Hide timeline" : "Timeline & transition"}
                  </button>
                </div>

                {open && (
                  <div className="mt-4 border-t border-sand pt-4">
                    {i.details.description && <p className="mb-4 max-w-2xl text-sm text-ink-muted">{i.details.description}</p>}
                    <ol className="mb-5 space-y-3 border-l-2 border-sand pl-4">
                      {(i.details.statusHistory ?? []).map((e) => (
                        <li key={`${e.at}-${e.status}`} className="text-sm">
                          <span className="font-semibold capitalize text-ink">{e.status}</span>
                          {e.note && <span className="text-ink-muted"> — {e.note}</span>}
                          <span className="ml-2 text-xs text-ink-faint">{formatDate(e.at)}{e.at.includes("T") ? ` · ${e.at.slice(11, 16)} GMT` : ""}</span>
                        </li>
                      ))}
                    </ol>
                    <div className="flex flex-wrap items-center gap-2">
                      <select value={cur.status} onChange={(e) => setD(i.id, { status: e.target.value }, i.details.incidentStatus)} aria-label="New incident status" className={inputCls}>
                        {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                      <input
                        value={cur.note}
                        onChange={(e) => setD(i.id, { note: e.target.value }, i.details.incidentStatus)}
                        aria-label="Timeline note"
                        placeholder="Note for the timeline (optional)"
                        className={`${inputCls} min-w-[16rem] flex-1`}
                      />
                      <button type="button"
                        disabled={busy === i.id || cur.status === i.details.incidentStatus}
                        onClick={() => transition(i)}
                        className="rounded-full bg-green px-4 py-2 text-xs font-semibold text-on-green hover:bg-green-900 disabled:opacity-50"
                      >
                        {busy === i.id ? "Updating…" : "Update status"}
                      </button>
                      <Link to={`/listings/${i.id}`} className="text-xs font-semibold text-gold-text hover:underline">Open listing →</Link>
                    </div>
                  </div>
                )}
                </Card>
              </StaggerItem>
            );
          })}
        </Stagger>
      )}
    </>
  );
}
