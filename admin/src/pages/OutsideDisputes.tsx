import { useState } from "react";
import { useLoaderData, useRevalidator } from "react-router-dom";
import { api } from "@/lib/api";
import type { AgentJob } from "@/lib/types";
import { PageHeader, Card, Empty, Pill } from "@/components/ui";
import { Stagger, StaggerItem } from "@/components/motion";
import { formatDate } from "@/lib/format";
import { BusyLabel } from "@/components/skeleton";
import { useAuth } from "@/lib/auth";

/** Non-vetting staff who open the page directly get a friendly wall rather than
 *  the route error boundary — the loader turns a 403 into this sentinel. */
const FORBIDDEN = { forbidden: true } as const;
type DisputesData = AgentJob[] | typeof FORBIDDEN;

export async function loader(): Promise<DisputesData> {
  try {
    return await api.adminDisputes();
  } catch (e) {
    if ((e as { status?: number }).status === 403) return FORBIDDEN;
    throw e;
  }
}

const FORBIDDEN_MSG = "Only a vetting officer can resolve disputes.";

const cedis = (pesewas?: number) =>
  `GH₵ ${((pesewas ?? 0) / 100).toLocaleString("en-GH", { maximumFractionDigits: 2 })}`;

const labelCls = "mb-1 block text-xs font-medium text-ink-muted";
const inputCls = "w-full rounded-lg border border-sand bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-green-text focus:outline-none focus:ring-2 focus:ring-green/15";

type Resolution = "release" | "refund";

export function Component() {
  const data = useLoaderData() as DisputesData;
  const { revalidate } = useRevalidator();
  const { member } = useAuth();
  const role = member?.role;
  const canResolve = role === "vetting" || role === "steward";

  if ("forbidden" in data) {
    return (
      <>
        <PageHeader kicker="Oguaa Outside · escrow" title="Disputes" />
        <Empty icon="shield" tone="gold" title="Vetting officers only">{FORBIDDEN_MSG}</Empty>
      </>
    );
  }

  const jobs = data;
  const heldTotal = jobs.reduce((sum, j) => sum + (j.escrow?.heldPesewas ?? 0), 0);

  return (
    <>
      <PageHeader kicker="Oguaa Outside · escrow" title="Disputes">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={jobs.length > 0 ? "clay" : "neutral"}>{jobs.length} open</Pill>
          {heldTotal > 0 && <Pill tone="gold">{cedis(heldTotal)} in escrow</Pill>}
        </div>
      </PageHeader>

      <p className="mb-5 max-w-2xl text-sm text-ink-muted">
        Jobs a client has escalated. The vetting desk rules on the held escrow — <b>release</b> it to the agent (minus
        the platform fee) or <b>refund</b> the client — with a note for the record. On a refund you may also forfeit the
        agent's good-conduct bond when they are at fault.
      </p>

      {jobs.length === 0 ? (
        <Empty icon="check" tone="green" title="No open disputes">
          Every escrow-backed job is settled. New disputes will appear here for a ruling.
        </Empty>
      ) : (
        <Stagger className="space-y-3">
          {jobs.map((j, idx) => (
            <StaggerItem key={j.id} index={idx}>
              <DisputeCard job={j} canResolve={canResolve} onChanged={revalidate} />
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </>
  );
}

interface DisputeCardProps {
  job: AgentJob;
  canResolve: boolean;
  onChanged: () => void;
}

function DisputeCard({ job, canResolve, onChanged }: Readonly<DisputeCardProps>) {
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [note, setNote] = useState("");
  const [forfeitBond, setForfeitBond] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const escrow = job.escrow;

  function open(next: Resolution) {
    setResolution(next);
    setNote("");
    // Forfeiting the bond only makes sense on a refund (agent at fault).
    setForfeitBond(false);
    setError(null);
  }

  function pick(next: Resolution) {
    setResolution(next);
    if (next === "release") setForfeitBond(false);
  }

  async function submit() {
    if (!resolution) return;
    if (!note.trim()) { setError("A note is required to record the ruling."); return; }
    setBusy(true); setError(null);
    try {
      await api.resolveDispute(job.id, {
        resolution,
        note: note.trim(),
        // Only meaningful on a refund; force false on a release.
        forfeitBond: resolution === "refund" && forfeitBond,
      });
      setResolution(null); setNote(""); setForfeitBond(false);
      onChanged();
    } catch (e) {
      const status = (e as { status?: number }).status;
      setError(status === 403 ? FORBIDDEN_MSG : e instanceof Error ? e.message : "Could not resolve the dispute.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-clay/25 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-clay/[0.12] px-2.5 py-0.5 text-xs font-semibold text-clay-text">Disputed</span>
        <Pill tone="neutral">{job.service}</Pill>
        {job.status && <Pill tone="neutral">{job.status}</Pill>}
      </div>

      <h3 className="mt-2 text-lg font-semibold text-ink">{job.title}</h3>
      {job.description && <p className="mt-1 max-w-2xl text-sm text-ink-muted">{job.description}</p>}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-sand bg-paper px-4 py-3">
          <p className="text-[0.65rem] font-bold uppercase tracking-wide text-ink-faint">Parties</p>
          <dl className="mt-1.5 space-y-1 text-sm text-ink">
            <div className="flex justify-between gap-3"><dt className="text-ink-muted">Agent</dt><dd className="font-medium">{job.agentName}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-ink-muted">Client</dt><dd className="font-medium">{job.clientName}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-ink-muted">Filed</dt><dd>{formatDate(job.createdAt)}</dd></div>
          </dl>
        </div>
        <div className="rounded-xl border border-sand bg-paper px-4 py-3">
          <p className="text-[0.65rem] font-bold uppercase tracking-wide text-ink-faint">Money in escrow</p>
          <dl className="mt-1.5 space-y-1 text-sm text-ink">
            <div className="flex justify-between gap-3"><dt className="text-ink-muted">Held</dt><dd className="font-semibold text-green-text">{cedis(escrow?.heldPesewas)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-ink-muted">Platform fee</dt><dd>{cedis(escrow?.platformFeePesewas)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-ink-muted">Agent payout</dt><dd>{cedis(escrow?.payoutPesewas)}</dd></div>
            {escrow?.status && <div className="flex justify-between gap-3"><dt className="text-ink-muted">Escrow status</dt><dd className="capitalize">{escrow.status}</dd></div>}
          </dl>
          <p className="mt-2 text-xs text-ink-faint">Budget {cedis(job.budgetPesewas)} · Quote {cedis(job.quotePesewas)}</p>
        </div>
      </div>

      {job.disputeReason && (
        <p className="mt-3 rounded-lg border border-clay/25 bg-clay/[0.05] px-3 py-2 text-sm text-clay-text">
          <span className="font-semibold">Dispute · </span>{job.disputeReason}
        </p>
      )}

      {canResolve && resolution === null && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-sand pt-4">
          <span className="mr-1 text-xs text-ink-faint">Rule on the escrow:</span>
          <button type="button" onClick={() => open("release")} className="rounded-full border border-green-text/40 px-4 py-1.5 text-xs font-semibold text-green-text hover:bg-green/[0.06]">Release to agent</button>
          <button type="button" onClick={() => open("refund")} className="rounded-full border border-clay/40 px-4 py-1.5 text-xs font-semibold text-clay-text hover:bg-clay/[0.06]">Refund client</button>
        </div>
      )}

      {canResolve && resolution !== null && (
        <div className="mt-3 rounded-xl border border-sand bg-paper p-4">
          <p className="text-sm font-semibold text-ink">Resolve — {job.title}</p>
          <div className="mt-2 inline-flex w-full rounded-lg border border-sand bg-cream p-1 sm:w-auto">
            {(["release", "refund"] as Resolution[]).map((r) => {
              const active = resolution === r;
              const activeCls = r === "release" ? "bg-green text-on-green" : "bg-clay text-white";
              return (
                <button key={r} type="button" onClick={() => pick(r)} aria-pressed={active}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors sm:flex-none ${active ? activeCls : "text-ink-muted hover:bg-paper"}`}>
                  {r === "release" ? "Release to agent" : "Refund client"}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            {resolution === "release"
              ? `Releases ${cedis(escrow?.payoutPesewas)} to ${job.agentName} (fee ${cedis(escrow?.platformFeePesewas)} kept).`
              : `Refunds ${cedis(escrow?.heldPesewas)} to ${job.clientName}.`}
          </p>

          <label className="mt-3 block"><span className={labelCls}>Note (required — recorded on the ruling)</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={inputCls} placeholder={resolution === "release" ? "Why the agent gets the escrow…" : "Why the client is refunded…"} /></label>

          <label className={`mt-2 flex items-center gap-2 text-sm ${resolution === "refund" ? "text-ink" : "text-ink-faint"}`}>
            <input type="checkbox" checked={forfeitBond} disabled={resolution !== "refund"} onChange={(e) => setForfeitBond(e.target.checked)} className="accent-clay disabled:opacity-40" />
            Forfeit the agent's good-conduct bond {resolution !== "refund" && <span className="text-xs">(refund only)</span>}
          </label>

          {error && <p className="mt-2 text-sm text-clay-text">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={submit} disabled={busy} className="rounded-full bg-green px-4 py-1.5 text-xs font-semibold text-on-green hover:bg-green-900 disabled:opacity-50">
              {busy ? <BusyLabel label="Recording ruling" className="justify-center" /> : "Confirm resolution"}
            </button>
            <button type="button" onClick={() => { setResolution(null); setError(null); }} className="rounded-full border border-sand px-4 py-1.5 text-xs text-ink-muted hover:bg-cream">Cancel</button>
          </div>
        </div>
      )}

      {/* A 403 can still land here if the caller lacks the vetting role. */}
      {canResolve && resolution === null && error && <p className="mt-2 text-sm text-clay-text">{error}</p>}
    </Card>
  );
}
