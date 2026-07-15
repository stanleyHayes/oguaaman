import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { EmptyState, EmptyGlyph } from "@/components/empty-state";

export interface QueueItem {
  id: string;
  type: string;
  title: string;
  owner: string;
  submittedAt: string;
  snippet: string;
}

interface LogEntry {
  action: string;
  title: string;
  reason?: string;
  tone: "ok" | "bad" | "warn";
}

function toneClass(tone: LogEntry["tone"]): string {
  if (tone === "ok") return "text-green";
  if (tone === "bad") return "text-maroon-900";
  return "text-gold-text";
}

/** Moderation queue (spec §8.10) — actions persist to MongoDB via the Go API. */
export function ModerationQueue({ initial }: Readonly<{ initial: QueueItem[] }>) {
  const [items, setItems] = useState(initial);
  const [log, setLog] = useState<(LogEntry & { id: number })[]>([]);
  const logSeq = useRef(0);
  const [rejecting, setRejecting] = useState<{ id: string; mode: "reject" | "changes" } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function act(item: QueueItem, action: string, entry: LogEntry, why?: string) {
    setBusy(item.id);
    try {
      await api.moderate({ listingId: item.id, action, reason: why });
      setItems((cur) => cur.filter((i) => i.id !== item.id));
      setLog((cur) => [{ ...entry, id: logSeq.current++ }, ...cur]);
    } catch {
      setLog((cur) => [{ action: "Failed to moderate", title: item.title, tone: "bad", id: logSeq.current++ }, ...cur]);
    } finally {
      setBusy(null);
      setRejecting(null);
      setReason("");
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.7fr_1fr]">
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-ink">Review queue</h2>
          <span className="rounded-full bg-gold/[0.14] px-3 py-1 text-sm font-semibold text-gold-text">{items.length} pending</span>
        </div>

        {items.length === 0 ? (
          <EmptyState
            icon={<EmptyGlyph name="check" />}
            tone="green"
            title="Queue clear"
            description="Nothing waiting. Median time-to-approval looking healthy."
            className="rounded-[var(--radius-card)] border border-dashed border-sand bg-cream"
          />
        ) : (
          <ul className="space-y-4">
            {items.map((item) => (
              <li key={item.id} className="rounded-[var(--radius-card)] border border-sand bg-cream p-5 shadow-[var(--shadow-card)]">
                <div>
                  <span className="rounded-full border border-sand bg-paper px-2.5 py-0.5 text-xs font-medium capitalize text-green">{item.type}</span>
                  <h3 className="mt-2 text-xl font-semibold text-ink">{item.title}</h3>
                  <p className="text-xs text-ink-faint">by {item.owner} · submitted {item.submittedAt}</p>
                </div>
                <p className="mt-3 text-sm text-ink-muted">{item.snippet}</p>

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-sand pt-4 text-xs text-ink-faint">
                  <span className="font-medium text-ink-muted">Check:</span>
                  {["real", "local", "categorised", "appropriate"].map((c) => (
                    <span key={c} className="rounded bg-paper px-2 py-0.5">{c}</span>
                  ))}
                </div>

                {rejecting?.id === item.id ? (
                  <div className="mt-4">
                    <textarea
                      autoFocus value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
                      placeholder={rejecting.mode === "reject" ? "Reason for rejection (sent to the owner)…" : "What changes are needed?"}
                      className="w-full rounded-lg border border-sand bg-paper p-3 text-sm focus:border-green focus:outline-none"
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        disabled={busy === item.id}
                        onClick={() => act(item, rejecting.mode === "reject" ? "reject" : "request-changes",
                          { action: rejecting.mode === "reject" ? "Rejected" : "Requested changes to", title: item.title, reason: reason.trim() || "(no reason)", tone: rejecting.mode === "reject" ? "bad" : "warn" }, reason.trim())}
                        className="rounded-full bg-maroon-900 px-4 py-2 text-sm font-semibold text-cream disabled:opacity-60"
                      >Confirm</button>
                      <button onClick={() => setRejecting(null)} className="rounded-full border border-sand px-4 py-2 text-sm font-semibold text-ink">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button disabled={busy === item.id} onClick={() => act(item, "approve", { action: "Approved", title: item.title, tone: "ok" })} className="rounded-full bg-green px-4 py-2 text-sm font-semibold text-cream hover:bg-green-900 disabled:opacity-60">Approve</button>
                    <button onClick={() => setRejecting({ id: item.id, mode: "changes" })} className="rounded-full border border-gold-border/50 px-4 py-2 text-sm font-semibold text-gold-text hover:bg-gold/[0.1]">Request changes</button>
                    <button onClick={() => setRejecting({ id: item.id, mode: "reject" })} className="rounded-full border border-maroon-900/40 px-4 py-2 text-sm font-semibold text-maroon-900 hover:bg-maroon-900/[0.06]">Reject</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <aside>
        <h2 className="mb-4 text-2xl font-semibold text-ink">Audit log</h2>
        <div className="rounded-[var(--radius-card)] border border-sand bg-cream p-5">
          {log.length === 0 ? (
            <p className="text-sm text-ink-faint">Every moderation action is recorded here — who, what, when, and why.</p>
          ) : (
            <ul className="space-y-3">
              {log.map((e) => (
                <li key={e.id} className="border-b border-sand pb-3 text-sm last:border-0 last:pb-0">
                  <span className={`font-semibold ${toneClass(e.tone)}`}>{e.action}</span>{" "}
                  <span className="text-ink">“{e.title}”</span>
                  {e.reason && <span className="block text-xs text-ink-muted">“{e.reason}”</span>}
                  <span className="block text-xs text-ink-faint">by you · just now</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
