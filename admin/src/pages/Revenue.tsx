import { useMemo } from "react";
import { useLoaderData } from "react-router-dom";
import { api } from "@/lib/api";
import type { Pledge, Subscription, Promotion, RevenueOverview } from "@/lib/types";
import { PageHeader, Card, Empty } from "@/components/ui";
import { MetricCard } from "@/components/metric-card";
import { Stagger, StaggerItem } from "@/components/motion";
import { HandCoins, Ticket, Repeat, Megaphone } from "lucide-react";
import { formatDate } from "@/lib/format";

export async function loader() {
  const [overview, pledges, subscriptions, promotions] = await Promise.all([
    api.revenue(),
    api.pledges(),
    api.subscriptions(),
    api.promotions(),
  ]);
  return { overview, pledges, subscriptions, promotions };
}

const cedis = (pesewas?: number) =>
  `GH₵ ${((pesewas ?? 0) / 100).toLocaleString("en-GH", { maximumFractionDigits: 2 })}`;

const STATUS_TONE: Record<string, string> = {
  success: "bg-green/[0.1] text-green",
  pending: "bg-gold/[0.16] text-gold-text",
  failed: "bg-maroon-900/[0.1] text-maroon-900",
};

// One row in the cross-stream recent-activity feed.
interface Activity {
  id: string;
  stream: string;
  title: string;
  amountPesewas: number;
  status: string;
  simulated?: boolean;
  at: string;
}

export function Component() {
  const { overview, pledges, subscriptions, promotions } = useLoaderData() as {
    overview: RevenueOverview;
    pledges: Pledge[];
    subscriptions: Subscription[];
    promotions: Promotion[];
  };

  const recent = useMemo<Activity[]>(() => {
    const rows: Activity[] = [
      ...pledges.map((p) => ({ id: p.id, stream: "Pledge", title: p.projectTitle, amountPesewas: p.amountPesewas, status: p.status, simulated: p.simulated, at: p.confirmedAt ?? p.createdAt })),
      ...subscriptions.map((s) => ({ id: s.id, stream: "Subscription", title: s.listingTitle, amountPesewas: s.amountPesewas, status: s.status, simulated: s.simulated, at: s.confirmedAt ?? s.createdAt })),
      ...promotions.map((p) => ({ id: p.id, stream: "Promotion", title: `${p.listingTitle} · ${p.days}d`, amountPesewas: p.amountPesewas, status: p.status, simulated: p.simulated, at: p.confirmedAt ?? p.createdAt })),
    ];
    rows.sort((a, b) => (a.at < b.at ? 1 : -1));
    return rows.slice(0, 15);
  }, [pledges, subscriptions, promotions]);

  return (
    <>
      <PageHeader kicker="Money" title="Revenue" />

      {/* platform income — the headline number */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-card)] bg-green p-6 text-cream">
        <div>
          <p className="text-[0.65rem] font-bold uppercase tracking-wider text-cream/70">Platform income (confirmed)</p>
          <p className="mt-1 text-4xl font-semibold">{cedis(overview.totalPesewas)}</p>
        </div>
        <p className="max-w-xs text-sm text-cream/70">Pledge fees plus the full proceeds of ticket sales, subscriptions and promotions.</p>
      </div>

      {/* one card per stream */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-5">
          <p className="text-[0.65rem] font-bold uppercase tracking-wider text-ink-faint">Crowdfunding fees</p>
          <p className="mt-2 text-2xl font-semibold text-green">{cedis(overview.pledges.feePesewas)}</p>
          <p className="mt-1 text-xs text-ink-muted">Platform fee on pledges</p>
          <p className="mt-1 text-xs text-ink-faint">{cedis(overview.pledges.grossPesewas)} pledged · {cedis(overview.pledges.netPesewas)} to projects</p>
        </Card>
        <Card className="p-5">
          <p className="text-[0.65rem] font-bold uppercase tracking-wider text-ink-faint">Ticket sales</p>
          <p className="mt-2 text-2xl font-semibold text-green">{cedis(overview.tickets.grossPesewas)}</p>
          <p className="mt-1 text-xs text-ink-muted">{overview.tickets.count} confirmed sales</p>
          <p className="mt-1 text-xs text-ink-faint">Per-event ledgers under Tickets</p>
        </Card>
        <Card className="p-5">
          <p className="text-[0.65rem] font-bold uppercase tracking-wider text-ink-faint">Subscriptions</p>
          <p className="mt-2 text-2xl font-semibold text-green">{cedis(overview.subscriptions.grossPesewas)}</p>
          <p className="mt-1 text-xs text-ink-muted">{overview.subscriptions.count} payments · {overview.subscriptions.active} active</p>
          <p className="mt-1 text-xs text-ink-faint">Supporter plan renewals</p>
        </Card>
        <Card className="p-5">
          <p className="text-[0.65rem] font-bold uppercase tracking-wider text-ink-faint">Promotions</p>
          <p className="mt-2 text-2xl font-semibold text-green">{cedis(overview.promotions.grossPesewas)}</p>
          <p className="mt-1 text-xs text-ink-muted">{overview.promotions.count} featured placements</p>
          <p className="mt-1 text-xs text-ink-faint">GH₵ 10/day, owner self-serve</p>
        </Card>
      </div>

      {/* headline stats row */}
      <Stagger className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StaggerItem index={0}><MetricCard label="Pledges (gross)" value={cedis(overview.pledges.grossPesewas)} tone="teal" icon={<HandCoins size={18} />} /></StaggerItem>
        <StaggerItem index={1}><MetricCard label="Tickets (gross)" value={cedis(overview.tickets.grossPesewas)} tone="teal" icon={<Ticket size={18} />} /></StaggerItem>
        <StaggerItem index={2}><MetricCard label="Subscriptions (gross)" value={cedis(overview.subscriptions.grossPesewas)} tone="teal" icon={<Repeat size={18} />} /></StaggerItem>
        <StaggerItem index={3}><MetricCard label="Promotions (gross)" value={cedis(overview.promotions.grossPesewas)} tone="teal" icon={<Megaphone size={18} />} /></StaggerItem>
      </Stagger>

      {/* recent activity across streams */}
      <h2 className="mb-3 text-lg font-semibold text-ink">Recent activity</h2>
      {recent.length === 0 ? (
        <Empty icon="chart" title="No payments yet">Confirmed pledges, subscriptions and promotions will land here.</Empty>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b border-sand text-left text-[0.65rem] font-bold uppercase tracking-wider text-ink-faint">
                <th className="px-4 py-3">Stream</th>
                <th className="px-4 py-3">Detail</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <Stagger as="tbody" className="divide-y divide-sand">
              {recent.map((a, idx) => (
                <StaggerItem as="tr" key={a.id} index={idx} className="hover:bg-paper">
                  <td className="px-4 py-3 text-ink-muted">{a.stream}</td>
                  <td className="px-4 py-3 font-medium text-ink">{a.title}</td>
                  <td className="px-4 py-3 font-semibold text-green">{cedis(a.amountPesewas)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold capitalize ${STATUS_TONE[a.status]}`}>{a.status}</span>
                    {a.simulated && <span className="ml-1.5 text-[0.6rem] font-bold uppercase tracking-wide text-ink-faint">sim</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-faint">{formatDate(a.at)}</td>
                </StaggerItem>
              ))}
            </Stagger>
          </table>
        </Card>
      )}
    </>
  );
}
