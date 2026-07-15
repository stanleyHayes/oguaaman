import { useLoaderData } from "react-router-dom";
import { api } from "@/lib/api";
import type { CreatorOverview, Subscription, Ticket } from "@/lib/types";
import { Card, Empty, Pill } from "@/components/ui";
import { MetricCard } from "@/components/metric-card";
import { Stagger, StaggerItem } from "@/components/motion";
import { cedis, formatDate } from "@/lib/format";
import { Banknote, Ticket as TicketIcon, HandCoins, Repeat } from "lucide-react";

interface Data {
  overview: CreatorOverview;
  subscriptions: Subscription[];
  tickets: Ticket[];
}

export async function loader(): Promise<Data> {
  const [overview, subscriptions, tickets] = await Promise.all([
    api.creatorOverview(),
    api.mySubscriptions().catch(() => [] as Subscription[]),
    api.myTickets().catch(() => [] as Ticket[]),
  ]);
  return { overview, subscriptions, tickets };
}

const PAY_TONE: Record<string, "green" | "gold" | "clay"> = { success: "green", pending: "gold", failed: "clay" };

export function Component() {
  const { overview, subscriptions, tickets } = useLoaderData() as Data;
  const successSubs = subscriptions.filter((s) => s.status === "success");
  const subSpend = successSubs.reduce((sum, s) => sum + s.amountPesewas, 0);

  return (
    <>
      <div className="mb-6">
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-gold-text">Money</p>
        <h1 className="mt-1 text-3xl font-semibold text-ink">What your work earns</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Ticket sales from your events and pledges toward your projects, plus your own plan payments and tickets.
        </p>
      </div>

      <Stagger className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StaggerItem index={0}>
          <MetricCard label="Ticket sales (gross)" value={cedis(overview.ticketsGrossPesewas)} icon={<Banknote size={18} />} tone="teal" sub={`${overview.ticketsSold} sold`} />
        </StaggerItem>
        <StaggerItem index={1}>
          <MetricCard label="Pledges raised (net)" value={cedis(overview.pledgesRaisedPesewas)} icon={<HandCoins size={18} />} tone="gold" sub="Across your projects" />
        </StaggerItem>
        <StaggerItem index={2}>
          <MetricCard label="Plan payments" value={successSubs.length} icon={<Repeat size={18} />} tone="green" sub={cedis(subSpend)} />
        </StaggerItem>
        <StaggerItem index={3}>
          <MetricCard label="Tickets bought" value={tickets.length} icon={<TicketIcon size={18} />} tone="ink" sub="Your own gate codes" />
        </StaggerItem>
      </Stagger>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="border-b border-sand px-5 py-4">
            <h2 className="text-lg font-semibold text-ink">Plan payments</h2>
            <p className="text-xs text-ink-faint">Your Supporter subscriptions, newest first.</p>
          </div>
          {subscriptions.length === 0 ? (
            <p className="px-5 py-8 text-sm text-ink-faint">No plan payments yet.</p>
          ) : (
            <ul className="divide-y divide-sand">
              {subscriptions.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{s.listingTitle}</p>
                    <p className="text-xs text-ink-faint">{formatDate(s.createdAt)}{s.periodEnd ? ` · until ${formatDate(s.periodEnd)}` : ""}</p>
                  </div>
                  <span className="text-sm font-semibold text-ink">{cedis(s.amountPesewas)}</span>
                  <Pill tone={PAY_TONE[s.status] ?? "neutral"}>{s.status}</Pill>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-sand px-5 py-4">
            <h2 className="text-lg font-semibold text-ink">Tickets you've bought</h2>
            <p className="text-xs text-ink-faint">Gate codes are shown on the portal.</p>
          </div>
          {tickets.length === 0 ? (
            <p className="px-5 py-8 text-sm text-ink-faint">No tickets yet.</p>
          ) : (
            <ul className="divide-y divide-sand">
              {tickets.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{t.eventTitle}</p>
                    <p className="text-xs text-ink-faint">{t.qty} × {t.tier} · {formatDate(t.createdAt)}</p>
                  </div>
                  <span className="text-sm font-semibold text-ink">{cedis(t.amountPesewas)}</span>
                  <Pill tone={PAY_TONE[t.status] ?? "neutral"}>{t.status}</Pill>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {overview.ticketsSold === 0 && overview.pledgesRaisedPesewas === 0 && (
        <div className="mt-6">
          <Empty title="No sales yet">
            Earnings appear here when attendees buy tickets to your events or supporters pledge toward your projects on the portal.
          </Empty>
        </div>
      )}
    </>
  );
}
