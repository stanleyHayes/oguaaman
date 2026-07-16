import { useMemo } from "react";
import { useLoaderData } from "react-router-dom";
import { api } from "@/lib/api";
import type { Plan, Subscription } from "@/lib/types";
import { PageHeader, Card, Empty } from "@/components/ui";
import { MetricCard } from "@/components/metric-card";
import { Stagger, StaggerItem } from "@/components/motion";
import { Banknote, BadgeCheck } from "lucide-react";
import { formatDate } from "@/lib/format";

export async function loader() {
  const [subs, plans] = await Promise.all([api.subscriptions(), api.plans()]);
  return { subs, plans };
}

const cedis = (pesewas?: number) =>
  `GH₵ ${((pesewas ?? 0) / 100).toLocaleString("en-GH", { maximumFractionDigits: 2 })}`;

const STATUS_TONE: Record<Subscription["status"], string> = {
  success: "bg-green/[0.1] text-green-text",
  pending: "bg-gold/[0.16] text-gold-text",
  failed: "bg-maroon-900/[0.1] text-maroon-text",
};

// Labels for plan slugs no longer in the catalog (deleted/renamed plans).
const LEGACY_PLAN_LABEL: Record<string, string> = {
  "business-supporter": "Supporter",
};

export function Component() {
  const { subs, plans } = useLoaderData() as { subs: Subscription[]; plans: Plan[] };
  const planLabel = useMemo(() => {
    const bySlug = new Map(plans.map((p) => [p.slug, p.name]));
    return (slug: string) => bySlug.get(slug) ?? LEGACY_PLAN_LABEL[slug] ?? slug;
  }, [plans]);
  const totals = useMemo(() => {
    const success = subs.filter((s) => s.status === "success");
    const now = new Date().toISOString();
    return {
      revenue: success.reduce((sum, s) => sum + s.amountPesewas, 0),
      active: success.filter((s) => (s.periodEnd ?? "") > now).length,
    };
  }, [subs]);

  return (
    <>
      <PageHeader kicker="Business directory" title="Subscriptions" />

      <Stagger className="mb-6 grid grid-cols-2 gap-4">
        <StaggerItem index={0}><MetricCard label="Revenue (confirmed)" value={cedis(totals.revenue)} tone="green" icon={<Banknote size={18} />} /></StaggerItem>
        <StaggerItem index={1}><MetricCard label="Active supporters" value={totals.active} tone="gold" icon={<BadgeCheck size={18} />} /></StaggerItem>
      </Stagger>

      {subs.length === 0 ? (
        <Empty icon="money" title="No subscriptions yet">When business owners subscribe to the Supporter plan, every payment lands here.</Empty>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-b border-sand text-left text-[0.65rem] font-bold uppercase tracking-wider text-ink-faint">
                <th className="px-4 py-3">Subscriber</th>
                <th className="px-4 py-3">Business</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Period end</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <Stagger as="tbody" className="divide-y divide-sand">
              {subs.map((s, idx) => (
                <StaggerItem as="tr" key={s.id} index={idx} className="hover:bg-paper">
                  <td className="px-4 py-3 text-ink-muted">{s.memberId || <span className="text-ink-faint">—</span>}</td>
                  <td className="px-4 py-3 font-medium text-ink">{s.listingTitle}</td>
                  <td className="px-4 py-3 text-ink-muted">{planLabel(s.plan)}</td>
                  <td className="px-4 py-3 font-semibold text-green-text">{cedis(s.amountPesewas)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-faint">{s.periodEnd ? formatDate(s.periodEnd) : "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold capitalize ${STATUS_TONE[s.status]}`}>{s.status}</span>
                    {s.simulated && <span className="ml-1.5 text-[0.6rem] font-bold uppercase tracking-wide text-ink-faint">sim</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-faint">{formatDate(s.confirmedAt ?? s.createdAt)}</td>
                </StaggerItem>
              ))}
            </Stagger>
          </table>
        </Card>
      )}
    </>
  );
}
