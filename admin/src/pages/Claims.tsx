import { useState } from "react";
import { useLoaderData } from "react-router-dom";
import { api } from "@/lib/api";
import type { OrgClaim } from "@/lib/types";
import { PageHeader, Card, Empty } from "@/components/ui";
import { Stagger, StaggerItem } from "@/components/motion";
import { formatDate } from "@/lib/format";
import { BusyLabel } from "@/components/skeleton";

export async function loader() {
  return api.claims();
}

export function Component() {
  const initial = useLoaderData() as OrgClaim[];
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function review(c: OrgClaim, approve: boolean) {
    setBusy(c.id);
    try {
      await api.reviewClaim(c.id, approve);
      setRows((cur) => cur.filter((x) => x.id !== c.id));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader kicker="Institution management" title="Claims to review" />
      <p className="mb-5 max-w-2xl text-sm text-ink-muted">
        Members requesting to manage an institution’s official presence. Approve only after
        confirming the person holds the office they claim — approval lets them edit the profile,
        manage the roster, and publish official events.
      </p>

      {rows.length === 0 ? (
        <Empty icon="check" title="Queue clear">No claims awaiting review.</Empty>
      ) : (
        <Stagger className="space-y-3">
          {rows.map((c, idx) => (
            <StaggerItem key={c.id} index={idx}>
              <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-medium">
                    <span className="text-green-text">{c.memberName || c.memberId}</span>
                    <span className="text-ink-muted">{c.newOrg ? " requests a new institution " : " wants to manage "}</span>
                    <span className="text-green-text">{c.orgName || c.newOrg?.name || c.orgId}</span>
                    {c.newOrg && <span className="ml-2 rounded-full bg-gold/[0.18] px-2.5 py-0.5 text-xs font-semibold text-gold-text">new · {c.newOrg.kind} · {c.newOrg.seat}</span>}
                  </div>
                  <div className="mt-1 text-sm text-ink-muted">
                    Claimed office: <span className="font-medium text-ink">{c.requestedRole}</span>
                  </div>
                  {c.note && <p className="mt-2 max-w-xl text-sm italic text-ink-faint">“{c.note}”</p>}
                  <div className="mt-2 text-xs text-ink-faint">Requested {formatDate(c.createdAt)}</div>
                </div>
                <div className="flex min-h-9 shrink-0 items-center gap-2">
                  {busy === c.id ? <BusyLabel label="Updating institution claim" /> : <>
                    <button type="button" onClick={() => review(c, true)} className="rounded-full bg-ai px-4 py-2 text-xs font-semibold text-white transition-colors hover:opacity-90">Approve</button>
                    <button type="button" onClick={() => review(c, false)} className="rounded-full border border-sand px-4 py-2 text-xs font-semibold text-ink-muted transition-colors hover:border-clay hover:text-clay-text">Reject</button>
                  </>}
                </div>
              </div>
            </Card>
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </>
  );
}
