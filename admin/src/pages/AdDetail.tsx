import { useState, type ReactNode } from "react";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router-dom";
import { api } from "@/lib/api";
import type { AdApproveChecklist, AdCampaign } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { isCuratorOrAbove, isSteward } from "@/lib/roles";
import { BackLink, KeyVal } from "@/components/ui";
import { FieldError, FlagChip, Notice, Panel, ReasonAction, ToneChip } from "@/components/admin-kit";
import { AdSlotPreview } from "@/components/ad-creative";
import { DailyBars } from "@/components/charts";
import { PrivateDocument } from "@/components/private-document";
import { BusyLabel } from "@/components/skeleton";
import {
  AD_STATUS_LABEL, AD_STATUS_TONE, APPROVE_CHECKLIST, CATEGORY_LABEL, REFUND_REASON_LABEL, REFUND_STATUS_TONE,
  SPONSOR_STATUS_TONE, emptyApproveChecklist, flagLabel, placementMeta, refundable,
} from "@/lib/ads";
import { cedis, count, formatDate, formatDateTime, humanize, percent } from "@/lib/format";
import { describeError, errorNumber } from "@/lib/errors";
import { btnDanger, btnDangerOutline, btnPrimary, btnSecondary, inputCls, labelCls, tableHeadCls } from "@/lib/ui-classes";

export async function loader({ params }: LoaderFunctionArgs) {
  return api.ad(params.id ?? "");
}

const ACTION_ERRORS: Readonly<Record<string, string>> = {
  checklist_incomplete: "Every checklist item must be ticked before approval.",
  sponsor_not_verified: "The sponsor isn't verified yet. Verify them in Ad sponsors first.",
  inventory_unavailable: "There isn't enough inventory left for these dates any more. Reject with a note so the advertiser can rebook.",
  already_approved_by_you: "You've already approved this political ad. A second curator, or the steward, must approve it too.",
  invalid_transition: "The ad changed status while you were looking at it. Reload the page.",
  invalid_amount: "The amount is more than is left to refund.",
  payments_unavailable: "Payments are switched off on this server, so refunds can't be sent.",
};

function ApprovePanel({ ad, onDone }: Readonly<{ ad: AdCampaign; onDone: (next: AdCampaign, message: string) => void }>) {
  const { member } = useAuth();
  const role = member?.role;
  const [checks, setChecks] = useState<AdApproveChecklist>(emptyApproveChecklist);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const approvals = ad.approvals ?? [];
  const mine = approvals.some((a) => a.staffName === member?.displayName);
  const politicalBlocked = ad.political && !isCuratorOrAbove(role);
  const allTicked = APPROVE_CHECKLIST.every((c) => checks[c.key]);
  let blockedReason = "";
  if (politicalBlocked) blockedReason = "Moderators can't approve political ads. A curator or the steward will review it.";
  else if (mine) blockedReason = "You've approved this ad. It needs a second curator, or the steward.";
  const approveLabel = ad.political && approvals.length === 0 && !isSteward(role) ? "Give first approval" : "Approve ad";

  async function approve() {
    if (!allTicked) { setError("Tick every item that holds. If one doesn't, reject the ad with a note instead."); return; }
    setBusy(true);
    setError("");
    try {
      const next = await api.approveAd(ad.id, checks, note.trim());
      const message = next.status === "approved"
        ? "Approved. The advertiser has been emailed a link to pay."
        : "Your approval is recorded. A second curator, or the steward, must approve this political ad too.";
      onDone(next, message);
    } catch (e) {
      const extra = errorNumber(e, "maxAvailable");
      setError(describeError(e, ACTION_ERRORS, "We couldn't approve the ad. Try again.") + (extra === undefined ? "" : ` (${count(extra)} impressions available.)`));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {ad.political && (
        <p className="mb-3 rounded-lg border border-clay/25 bg-clay/[0.07] px-3 py-2 text-sm leading-relaxed text-clay-text">
          Political ads need two curators, or the steward.{" "}
          {approvals.length > 0 && <span className="font-semibold">Approval {approvals.length} of 2: {approvals.map((a) => a.staffName).join(", ")}.</span>}
        </p>
      )}
      {blockedReason ? (
        <p className="text-sm text-ink-muted">{blockedReason}</p>
      ) : (
        <>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-ink">Checklist</legend>
            <ul className="space-y-1">
              {APPROVE_CHECKLIST.map((c) => (
                <li key={c.key}>
                  <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-paper">
                    <input
                      type="checkbox"
                      checked={checks[c.key]}
                      onChange={(e) => { setChecks((cur) => ({ ...cur, [c.key]: e.target.checked })); setError(""); }}
                      className="mt-0.5 size-4 shrink-0 accent-green"
                    />
                    <span className="text-sm leading-snug text-ink">
                      {c.label}
                      {c.hint && <span className="block text-xs text-ink-faint">{c.hint}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          <label htmlFor="approve-note" className={`${labelCls} mt-3`}>Note (optional, staff only)</label>
          <textarea id="approve-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} className={inputCls} placeholder="What you checked, e.g. FDA register entry FDA/CF/24-0091" />
          <FieldError>{error}</FieldError>
          <button type="button" onClick={approve} disabled={busy} className={`${btnPrimary} mt-3 w-full`}>
            {busy ? <BusyLabel label="Approving ad" tone="dark" /> : approveLabel}
          </button>
        </>
      )}
      <div className="mt-3">
        <ReasonAction
          label="Reject"
          confirmLabel="Reject ad"
          placeholder="Tell the advertiser what to fix. They will read this."
          description="The advertiser sees this reason. No money has changed hands."
          buttonClass={`${btnDangerOutline} w-full`}
          confirmClass={btnDanger}
          busyLabel="Rejecting ad"
          maxLength={1000}
          onConfirm={async (reason) => {
            try {
              onDone(await api.rejectAd(ad.id, reason), "Rejected. The advertiser has been emailed your reason.");
            } catch (e) {
              throw new Error(describeError(e, ACTION_ERRORS, "We couldn't reject the ad. Try again."), { cause: e });
            }
          }}
        />
      </div>
    </div>
  );
}

function FlightActions({ ad, onDone }: Readonly<{ ad: AdCampaign; onDone: (next: AdCampaign, message: string) => void }>) {
  const run = (fn: () => Promise<AdCampaign>, message: string, fallback: string) => async () => {
    try {
      onDone(await fn(), message);
    } catch (e) {
      throw new Error(describeError(e, ACTION_ERRORS, fallback), { cause: e });
    }
  };
  const canRemove = ["scheduled", "active", "paused"].includes(ad.status);
  return (
    <div className="space-y-2">
      {ad.status === "active" && (
        <ReasonAction
          label="Pause"
          confirmLabel="Pause campaign"
          placeholder="Why (staff record)"
          description="The flight keeps its dates; paused days are not added back."
          busyLabel="Pausing campaign"
          buttonClass={`${btnSecondary} w-full`}
          onConfirm={(reason) => run(() => api.pauseAd(ad.id, reason), "Paused. It stops showing within a minute.", "We couldn't pause the campaign. Try again.")()}
        />
      )}
      {ad.status === "paused" && (
        <ReasonAction
          label="Resume"
          confirmLabel="Resume campaign"
          placeholder="Why it can run again"
          busyLabel="Resuming campaign"
          buttonClass={`${btnPrimary} w-full`}
          onConfirm={(reason) => run(() => api.resumeAd(ad.id, reason), "Resumed.", "We couldn't resume the campaign. Try again.")()}
        />
      )}
      {canRemove && (
        <ReasonAction
          label="Remove"
          confirmLabel="Remove campaign"
          placeholder="The reason. Political removals show this in the public ad library."
          description="Removal ends the campaign and refunds the undelivered share. The advertiser is emailed."
          busyLabel="Removing campaign"
          buttonClass={`${btnDangerOutline} w-full`}
          confirmClass={btnDanger}
          onConfirm={(reason) => run(() => api.removeAd(ad.id, reason), "Removed. The undelivered share will be refunded.", "We couldn't remove the campaign. Try again.")()}
        />
      )}
    </div>
  );
}

function RefundForm({ ad, onDone }: Readonly<{ ad: AdCampaign; onDone: (next: AdCampaign, message: string) => void }>) {
  const max = refundable(ad);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (max <= 0) return null;

  async function send() {
    const pesewas = Math.round(Number.parseFloat(amount) * 100);
    if (!Number.isFinite(pesewas) || pesewas < 100) { setError("Enter at least GH₵ 1."); return; }
    if (pesewas > max) { setError(`The most you can refund is ${cedis(max)}.`); return; }
    if (reason.trim().length < 5) { setError("Say why, for the record (at least 5 characters)."); return; }
    setBusy(true);
    setError("");
    try {
      const next = await api.refundAd(ad.id, pesewas, reason.trim());
      onDone(next, `Refund of ${cedis(pesewas)} requested from Paystack.`);
      setOpen(false);
      setAmount("");
      setReason("");
    } catch (e) {
      setError(describeError(e, ACTION_ERRORS, "We couldn't request the refund. Try again."));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className={`${btnSecondary} w-full`}>Refund by hand</button>;
  }
  return (
    <div className="rounded-xl border border-sand bg-paper p-3">
      <p className="text-sm text-ink-muted">Up to <span className="font-semibold tabular-nums text-ink">{cedis(max)}</span> can be refunded. Paystack keeps its fee; Dev Track absorbs it.</p>
      <label htmlFor="refund-amount" className={`${labelCls} mt-3`}>Amount (GH₵)</label>
      <input id="refund-amount" value={amount} onChange={(e) => { setAmount(e.target.value); setError(""); }} inputMode="decimal" placeholder={(max / 100).toFixed(2)} className={`${inputCls} tabular-nums`} />
      <label htmlFor="refund-reason" className={`${labelCls} mt-3`}>Reason</label>
      <input id="refund-reason" value={reason} onChange={(e) => { setReason(e.target.value); setError(""); }} maxLength={300} placeholder="e.g. Slot was down for a day" className={inputCls} />
      <FieldError>{error}</FieldError>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={send} disabled={busy} className={btnPrimary}>{busy ? <BusyLabel label="Requesting refund" tone="dark" /> : "Send refund"}</button>
        <button type="button" onClick={() => { setOpen(false); setError(""); }} disabled={busy} className={btnSecondary}>Cancel</button>
      </div>
    </div>
  );
}

function ActionsPanel({ ad, onDone }: Readonly<{ ad: AdCampaign; onDone: (next: AdCampaign, message: string) => void }>) {
  const { member } = useAuth();
  const steward = isSteward(member?.role);
  const inFlight = ["scheduled", "active", "paused"].includes(ad.status);
  let body: ReactNode;
  if (ad.status === "pending_review") body = <ApprovePanel ad={ad} onDone={onDone} />;
  else if (inFlight) body = <FlightActions ad={ad} onDone={onDone} />;
  else body = <p className="text-sm text-ink-muted">No review actions for a campaign that is {AD_STATUS_LABEL[ad.status].toLowerCase()}.</p>;
  return (
    <Panel title={ad.status === "pending_review" ? "Review" : "Actions"} aside={ad.status === "approved" && ad.approvalExpiresAt ? `Approval holds until ${formatDateTime(ad.approvalExpiresAt)} unless the advertiser pays.` : undefined}>
      {ad.rejectReason && <p className="mb-3 rounded-lg bg-maroon-900/[0.06] px-3 py-2 text-sm text-maroon-text"><span className="font-semibold">Rejected:</span> {ad.rejectReason}</p>}
      {ad.removalReason && <p className="mb-3 rounded-lg bg-maroon-900/[0.06] px-3 py-2 text-sm text-maroon-text"><span className="font-semibold">Removed:</span> {ad.removalReason}</p>}
      {body}
      {steward && (
        <div className="mt-4 border-t border-sand pt-4">
          <RefundForm ad={ad} onDone={onDone} />
        </div>
      )}
    </Panel>
  );
}

function SponsorPanel({ ad }: Readonly<{ ad: AdCampaign }>) {
  const s = ad.sponsor;
  if (!s) return <Panel title="Sponsor"><p className="text-sm text-ink-muted">Sponsor details weren't included. Open <Link to="/ad-sponsors" className="font-medium text-green-text underline underline-offset-4">Ad sponsors</Link>.</p></Panel>;
  return (
    <Panel
      title="Sponsor"
      action={<Link to={`/ad-sponsors?sponsor=${encodeURIComponent(s.id)}&status=${s.status}`} className="text-sm font-semibold text-green-text underline-offset-4 hover:underline">Open sponsor</Link>}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="text-base font-semibold text-ink">{s.displayName}</p>
        <ToneChip tone={SPONSOR_STATUS_TONE[s.status]}>{humanize(s.status)}</ToneChip>
        {s.kind === "political" && <FlagChip tone="clay">Political</FlagChip>}
      </div>
      <dl>
        <KeyVal label="Legal name">{s.legalName}</KeyVal>
        <KeyVal label="Entity">{humanize(s.entityType)}</KeyVal>
        <KeyVal label="Registration">{s.registrationNumber}</KeyVal>
        <KeyVal label="Ghana Card">{s.idNumberLast4 ? `•••• ${s.idNumberLast4}` : undefined}</KeyVal>
        <KeyVal label="Party">{s.partyName}</KeyVal>
        <KeyVal label="Candidate">{s.candidateName}</KeyVal>
        <KeyVal label="Constituency">{s.constituency}</KeyVal>
        <KeyVal label="Contact">{s.contactPerson || s.phone || s.email ? (
          <span className="flex flex-col">
            {s.contactPerson && <span>{s.contactPerson}</span>}
            {s.phone && <span className="tabular-nums">{s.phone}</span>}
            {s.email && <span className="break-all">{s.email}</span>}
          </span>
        ) : undefined}</KeyVal>
        <KeyVal label="Verified">{s.verifiedAt ? `${formatDate(s.verifiedAt)}${s.verifiedByName ? ` by ${s.verifiedByName}` : ""}` : undefined}</KeyVal>
      </dl>
    </Panel>
  );
}

function CompliancePanel({ ad }: Readonly<{ ad: AdCampaign }>) {
  const c = ad.compliance ?? {};
  const doc = ad.approvalDocumentUrl;
  return (
    <Panel title="Category and compliance">
      <dl>
        <KeyVal label="Category">{CATEGORY_LABEL[ad.category] ?? humanize(ad.category)}</KeyVal>
        <KeyVal label="Political">{ad.political ? `${humanize(ad.politicalType ?? "election")}${ad.electionName ? ` · ${ad.electionName}` : ""}` : undefined}</KeyVal>
        <KeyVal label="FDA registration">{c.fdaRegistrationNo}</KeyVal>
        <KeyVal label="FDA approval">{c.fdaApprovalRef ? `${c.fdaApprovalRef}${c.fdaApprovalExpiresOn ? `, expires ${formatDate(c.fdaApprovalExpiresOn)}` : ""}` : undefined}</KeyVal>
        <KeyVal label="Regulator">{c.regulator}</KeyVal>
        <KeyVal label="Licence">{c.licenceNumber}</KeyVal>
        <KeyVal label="Approval letter">{doc ? <PrivateDocument docRef={doc} label="approval letter" /> : undefined}</KeyVal>
        <KeyVal label="AI media">{ad.creative.containsSyntheticMedia ? "Declared: contains AI-generated or altered media" : "None declared"}</KeyVal>
        <KeyVal label="Start consent">{ad.startConsentAt ? formatDateTime(ad.startConsentAt) : undefined}</KeyVal>
      </dl>
    </Panel>
  );
}

function PricePanel({ ad }: Readonly<{ ad: AdCampaign }>) {
  const p = ad.price;
  const rows: [string, string][] = [
    ["Booked impressions", count(ad.bookedImpressions)],
    [`CPM${ad.political ? " (political)" : ""}`, cedis(p.cpmPesewas)],
    ["Net", cedis(p.netPesewas)],
    [`Tax (${percent(p.taxRateBps / 10_000, 2)})`, cedis(p.taxPesewas)],
  ];
  return (
    <Panel title="Price" aside={`Locked at rate card version ${p.settingsVersion}.`}>
      <dl className="space-y-1.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3"><dt className="text-ink-muted">{k}</dt><dd className="tabular-nums text-ink">{v}</dd></div>
        ))}
        <div className="flex justify-between gap-3 border-t border-sand pt-2 text-base font-semibold"><dt className="text-ink">Total</dt><dd className="tabular-nums text-ink">{cedis(p.totalPesewas)}</dd></div>
        {ad.refundedPesewas > 0 && <div className="flex justify-between gap-3"><dt className="text-ink-muted">Refunded</dt><dd className="tabular-nums text-clay-text">− {cedis(ad.refundedPesewas)}</dd></div>}
      </dl>
      <dl className="mt-3 border-t border-sand pt-1">
        <KeyVal label="Payment">{humanize(ad.paymentStatus)}{ad.simulated ? " (test payment)" : ""}{ad.paidAt ? `, ${formatDateTime(ad.paidAt)}` : ""}</KeyVal>
        <KeyVal label="Reference">{ad.reference ? <span className="font-mono text-xs">{ad.reference}</span> : undefined}</KeyVal>
        <KeyVal label="Failure">{ad.failureReason}</KeyVal>
      </dl>
    </Panel>
  );
}

function DeliveryPanel({ ad }: Readonly<{ ad: AdCampaign }>) {
  const ctr = ad.delivered > 0 ? ad.clicks / ad.delivered : 0;
  const stats: [string, string][] = [
    ["Delivered", `${count(ad.delivered)} / ${count(ad.bookedImpressions)}`],
    ["Clicks", count(ad.clicks)],
    ["CTR", percent(ctr, 2)],
    ["Last view", ad.lastImpressionAt ? formatDateTime(ad.lastImpressionAt) : "—"],
  ];
  return (
    <Panel title="Delivery" aside="Viewable impressions: half the ad on screen for a full second.">
      <dl className="mb-5 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        {stats.map(([k, v]) => (
          <div key={k}><dt className="text-xs text-ink-faint">{k}</dt><dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{v}</dd></div>
        ))}
      </dl>
      <DailyBars data={ad.daily ?? []} />
    </Panel>
  );
}

function HistoryPanel({ ad }: Readonly<{ ad: AdCampaign }>) {
  const history = [...(ad.statusHistory ?? [])].reverse();
  return (
    <Panel title="Status history">
      {history.length === 0 ? <p className="text-sm text-ink-muted">No changes yet.</p> : (
        <ol className="relative space-y-4 before:absolute before:bottom-1 before:left-[8px] before:top-2 before:w-px before:bg-sand">
          {history.map((h, i) => (
            <li key={`${h.at}-${i}`} className="relative pl-6">
              <span aria-hidden className="absolute left-[5px] top-1.5 h-2 w-2 rounded-full bg-gold-brand ring-4 ring-cream" />
              <p className="text-sm text-ink">
                <span className="font-semibold">{AD_STATUS_LABEL[h.to as keyof typeof AD_STATUS_LABEL] ?? humanize(h.to)}</span>
                {h.from && <span className="text-ink-faint"> from {AD_STATUS_LABEL[h.from as keyof typeof AD_STATUS_LABEL] ?? humanize(h.from)}</span>}
              </p>
              <p className="text-xs tabular-nums text-ink-faint">{formatDateTime(h.at)} · {h.actorName}</p>
              {h.reason && <p className="mt-0.5 max-w-[60ch] text-sm leading-relaxed text-ink-muted">{h.reason}</p>}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

// ResolveRefund lets the steward settle a refund marked for a check, once the
// Paystack dashboard shows what happened to it.
function ResolveRefund({ ad, refundId, onDone }: Readonly<{ ad: AdCampaign; refundId: string; onDone: (next: AdCampaign, message: string) => void }>) {
  const resolve = (status: "processed" | "failed", done: string) => async (reason: string) => {
    try {
      onDone(await api.resolveAdRefund(ad.id, refundId, status, reason), done);
    } catch (e) {
      throw new Error(describeError(e, ACTION_ERRORS, "We couldn't update the refund. Try again."), { cause: e });
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      <ReasonAction
        label="Mark refunded"
        confirmLabel="Mark as refunded"
        placeholder="What the Paystack dashboard shows, e.g. refund rf_123 processed on 3 Oct"
        busyLabel="Saving"
        buttonClass={btnSecondary}
        onConfirm={resolve("processed", "Marked as refunded.")}
      />
      <ReasonAction
        label="Mark failed"
        confirmLabel="Mark as failed"
        placeholder="What the Paystack dashboard shows"
        description="The amount becomes refundable again, so you can send it with Refund by hand."
        busyLabel="Saving"
        buttonClass={btnDangerOutline}
        confirmClass={btnDanger}
        onConfirm={resolve("failed", "Marked as failed. You can refund the amount again.")}
      />
    </div>
  );
}

function RefundsPanel({ ad, onDone }: Readonly<{ ad: AdCampaign; onDone: (next: AdCampaign, message: string) => void }>) {
  const { member } = useAuth();
  const steward = isSteward(member?.role);
  const refunds = ad.refunds ?? [];
  if (refunds.length === 0) return null;
  return (
    <Panel title="Refunds" aside="Refunds that need a check are re-asked of Paystack for 30 days; the steward can settle them after checking the Paystack dashboard.">
      <div className="-mx-5 overflow-x-auto">
        <table className="w-full min-w-[32rem] text-sm">
          <thead><tr className={tableHeadCls}><th scope="col" className="px-5 py-2">Reason</th><th scope="col" className="px-5 py-2 text-right">Amount</th><th scope="col" className="px-5 py-2">Status</th><th scope="col" className="px-5 py-2">Updated</th></tr></thead>
          <tbody className="divide-y divide-sand">
            {refunds.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="px-5 py-2.5 text-ink">
                  {REFUND_REASON_LABEL[r.reason] ?? r.reason}
                  {r.note && <p className="mt-1 text-xs text-ink-muted">{r.note}</p>}
                  {steward && r.status === "manual_check" && <div className="mt-2"><ResolveRefund ad={ad} refundId={r.id} onDone={onDone} /></div>}
                </td>
                <td className="px-5 py-2.5 text-right font-semibold tabular-nums text-ink">{cedis(r.amountPesewas)}</td>
                <td className="px-5 py-2.5"><ToneChip tone={REFUND_STATUS_TONE[r.status]}>{humanize(r.status)}</ToneChip></td>
                <td className="whitespace-nowrap px-5 py-2.5 tabular-nums text-ink-faint">{formatDateTime(r.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function Component() {
  const loaded = useLoaderData() as AdCampaign;
  const [ad, setAd] = useState<AdCampaign>(loaded);
  const [notice, setNotice] = useState("");
  const meta = placementMeta(ad.placement);
  const approvals = ad.approvals?.length ?? 0;

  const onDone = (next: AdCampaign, message: string) => {
    setAd((cur) => ({ ...cur, ...next, sponsor: next.sponsor ?? cur.sponsor, daily: next.daily ?? cur.daily, reportsCount: next.reportsCount ?? cur.reportsCount }));
    setNotice(message);
  };

  return (
    <>
      <BackLink to="/ads">All ads</BackLink>
      <header className="mb-6">
        <p className="eyebrow text-gold-text">{ad.political ? "Political ad" : "Ad campaign"} · {meta?.name ?? ad.placement}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-[-0.02em] text-ink [text-wrap:balance]">{ad.sponsorLine || ad.sponsor?.displayName || "Unnamed sponsor"}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <ToneChip tone={AD_STATUS_TONE[ad.status]}>{AD_STATUS_LABEL[ad.status]}</ToneChip>
          {ad.political && ad.status === "pending_review" && approvals === 1 && <FlagChip tone="gold">Approval 1 of 2</FlagChip>}
          {ad.simulated && <FlagChip tone="neutral">Test payment</FlagChip>}
          {(ad.flags ?? []).filter((f) => f !== "political").map((f) => <FlagChip key={f} tone="gold">{flagLabel(f)}</FlagChip>)}
          <span className="text-sm tabular-nums text-ink-muted">{formatDate(ad.startDate)} to {formatDate(ad.endDate)}</span>
          {(ad.reportsCount ?? 0) > 0 && (
            <Link to="/reports" className="text-sm font-semibold text-clay-text underline underline-offset-4">{ad.reportsCount} reader report{ad.reportsCount === 1 ? "" : "s"}</Link>
          )}
        </div>
      </header>

      {notice && <div className="mb-5"><Notice tone="ok" onDismiss={() => setNotice("")}>{notice}</Notice></div>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="preview-title" className="bg-dotgrid rounded-[var(--radius-card)] border border-sand bg-paper p-5 shadow-[var(--shadow-card)]">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="preview-title" className="text-base font-semibold text-ink">As readers will see it</h2>
              {meta && <p className="text-xs text-ink-faint">{meta.where} · {meta.sizes}</p>}
            </div>
            <AdSlotPreview ad={ad} />
            <dl className="mt-5 grid gap-3 border-t border-sand pt-4 text-sm sm:grid-cols-2">
              <div className="min-w-0">
                <dt className="text-xs text-ink-faint">Alt text</dt>
                <dd className="mt-0.5 text-ink">{ad.creative.alt || "—"}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-ink-faint">Landing page</dt>
                <dd className="mt-0.5 break-all font-mono text-xs text-ink">{ad.creative.landingUrl}</dd>
                {ad.creative.landingUrl.startsWith("https://") && (
                  <a href={ad.creative.landingUrl} target="_blank" rel="noopener noreferrer nofollow" className="mt-1 inline-flex min-h-8 items-center text-xs font-semibold text-green-text underline underline-offset-4">Open in a new tab ↗</a>
                )}
              </div>
            </dl>
          </section>
          <DeliveryPanel ad={ad} />
          <RefundsPanel ad={ad} onDone={onDone} />
          <HistoryPanel ad={ad} />
        </div>

        <div className="min-w-0 space-y-6">
          <ActionsPanel ad={ad} onDone={onDone} />
          <SponsorPanel ad={ad} />
          <CompliancePanel ad={ad} />
          <PricePanel ad={ad} />
        </div>
      </div>
    </>
  );
}
