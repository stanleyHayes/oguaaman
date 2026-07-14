import { useMemo, useState } from "react";
import { useLoaderData } from "react-router-dom";
import { api } from "@/lib/api";
import type { Listing, Pledge, PledgeTotals } from "@/lib/types";
import { PageHeader, Card, Empty, Pill, StatCard } from "@/components/ui";
import { formatDate } from "@/lib/format";

export async function loader() {
  const [projects, pledges, pledgeTotals] = await Promise.all([api.projects(), api.pledges(), api.pledgeTotals()]);
  return { projects, pledges, pledgeTotals };
}

const cedis = (pesewas?: number) =>
  `GH₵ ${((pesewas ?? 0) / 100).toLocaleString("en-GH", { maximumFractionDigits: 2 })}`;

const STATUS_TONE: Record<Pledge["status"], string> = {
  success: "bg-green/[0.1] text-green",
  pending: "bg-gold/[0.16] text-gold-text",
  failed: "bg-maroon-900/[0.1] text-maroon-900",
};

export function Component() {
  const { projects, pledges, pledgeTotals } = useLoaderData() as { projects: Listing[]; pledges: Pledge[]; pledgeTotals: PledgeTotals };
  const [filter, setFilter] = useState<"all" | Pledge["status"]>("all");

  const totals = useMemo(() => {
    const confirmed = pledges.filter((p) => p.status === "success");
    return {
      raised: confirmed.reduce((sum, p) => sum + p.amountPesewas, 0),
      confirmed: confirmed.length,
      pending: pledges.filter((p) => p.status === "pending").length,
      simulated: confirmed.filter((p) => p.simulated).length,
    };
  }, [pledges]);

  const shown = filter === "all" ? pledges : pledges.filter((p) => p.status === filter);

  return (
    <>
      <PageHeader kicker="Adopt a project · spec §4/§6" title="Projects & pledges" />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Raised (confirmed)" value={cedis(totals.raised)} />
        <StatCard label="Confirmed pledges" value={totals.confirmed} tone="text-teal-text" />
        <StatCard label="Pending" value={totals.pending} tone="text-gold-text" />
        <StatCard label="Simulated (dev)" value={totals.simulated} tone="text-ink-muted" />
      </div>

      {/* campaigns */}
      <h2 className="mb-3 text-lg font-semibold text-ink">Campaigns</h2>
      {projects.length === 0 ? (
        <Empty title="No open campaigns">Approve a project listing and it appears here with its funding progress.</Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {projects.map((p) => {
            const goal = (p.details.goalPesewas as number) ?? 0;
            const raised = (p.details.raisedPesewas as number) ?? 0;
            const pct = goal ? Math.min(100, Math.round((raised / goal) * 100)) : 0;
            return (
              <Card key={p.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-semibold text-ink">{p.title}</h3>
                    {typeof p.details.organiser === "string" && <p className="text-xs text-gold-text">{p.details.organiser}</p>}
                  </div>
                  <Pill tone="green">{pct}%</Pill>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-sand">
                  <div className="h-full rounded-full bg-green" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-2 text-sm text-ink-muted">
                  <b className="text-green">{cedis(raised)}</b> of {cedis(goal)} · {(p.details.backers as number) ?? 0} backers
                  {typeof p.details.deadline === "string" && <span className="text-ink-faint"> · closes {p.details.deadline}</span>}
                </p>
              </Card>
            );
          })}
        </div>
      )}

      {/* pledge ledger */}
      <div className="mt-8 mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">Pledge ledger</h2>
        <div className="inline-flex rounded-full border border-sand bg-paper p-0.5 text-xs">
          {(["all", "success", "pending", "failed"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 font-semibold capitalize transition-colors ${filter === f ? "bg-green text-cream" : "text-ink-muted hover:text-ink"}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* platform-fee split over successful pledges */}
      <div className="mb-4 grid grid-cols-3 gap-4">
        <StatCard label="Gross charged" value={cedis(pledgeTotals.grossPesewas)} />
        <StatCard label="Platform fee" value={cedis(pledgeTotals.feePesewas)} tone="text-gold-text" />
        <StatCard label="Net to projects" value={cedis(pledgeTotals.netPesewas)} tone="text-teal-text" />
      </div>

      {shown.length === 0 ? (
        <Empty title="No pledges yet">When members pledge to a campaign, every transaction lands here.</Empty>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b border-sand text-left text-[0.65rem] font-bold uppercase tracking-wider text-ink-faint">
                <th className="px-4 py-3">Project</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Fee</th>
                <th className="px-4 py-3">Net</th>
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand">
              {shown.map((p) => (
                <tr key={p.id} className="hover:bg-paper">
                  <td className="max-w-[14rem] truncate px-4 py-3 font-medium text-ink">{p.projectTitle}</td>
                  <td className="px-4 py-3 font-semibold text-green">{cedis(p.amountPesewas)}</td>
                  <td className="px-4 py-3 text-ink-muted">{p.feePesewas ? cedis(p.feePesewas) : <span className="text-ink-faint">—</span>}</td>
                  <td className="px-4 py-3 text-ink-muted">{p.netPesewas ? cedis(p.netPesewas) : <span className="text-ink-faint">—</span>}</td>
                  <td className="px-4 py-3 text-ink-muted">{p.memberId || <span className="text-ink-faint">—</span>}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold capitalize ${STATUS_TONE[p.status]}`}>{p.status}</span>
                    {p.simulated && <span className="ml-1.5 text-[0.6rem] font-bold uppercase tracking-wide text-ink-faint">sim</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-faint">{formatDate(p.confirmedAt ?? p.createdAt)}</td>
                  <td className="max-w-[12rem] truncate px-4 py-3 font-mono text-xs text-ink-faint">{p.reference}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
