import { useLoaderData, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PORTAL } from "@/lib/portal";
import type { CreatorOverview } from "@/lib/types";
import { MetricCard } from "@/components/metric-card";
import { Card } from "@/components/ui";
import { Stagger, StaggerItem } from "@/components/motion";
import { cedis } from "@/lib/format";
import {
  ListChecks, Hourglass, Megaphone, BadgeCheck, Ticket, HandCoins, Eye,
  PlusCircle, TrendingUp, Landmark, type LucideIcon,
} from "lucide-react";

export async function loader(): Promise<CreatorOverview> {
  return api.creatorOverview();
}

interface QuickLink { to: string; label: string; desc: string; icon: LucideIcon; external?: boolean }

const QUICK: QuickLink[] = [
  { to: `${PORTAL}/submit`, label: "Add a listing", desc: "Business, event, project…", icon: PlusCircle, external: true },
  { to: "/work", label: "Promote your work", desc: "Feature it across the portal", icon: Megaphone },
  { to: "/grow", label: "Grow your reach", desc: "Plans and promotions", icon: TrendingUp },
  { to: "/institutions", label: "Manage institutions", desc: "Pages you run", icon: Landmark },
];

export function Component() {
  const ov = useLoaderData() as CreatorOverview;
  const { member } = useAuth();
  const firstName = member?.displayName.split(" ")[0] ?? "";
  const isCreator = (member?.creatorTypes?.length ?? 0) > 0;

  return (
    <>
      <div className="mb-6">
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-gold-text">Creator studio · at a glance</p>
        <h1 className="mt-1 text-3xl font-semibold text-ink">Welcome{firstName ? `, ${firstName}` : ""}.</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {ov.pending > 0
            ? <>You have <Link to="/work" className="font-semibold text-gold-text hover:underline">{ov.pending} listing{ov.pending === 1 ? "" : "s"}</Link> waiting for review.</>
            : ov.live > 0
              ? "Everything you've published is live. Keep the town talking."
              : "Nothing live yet — your first listing is one form away."}
        </p>
      </div>

      {!isCreator && (
        <Card className="mb-6 border-gold-border/40 bg-gold/[0.08] p-5">
          <h2 className="text-lg font-semibold text-ink">You're signed in as a citizen</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Tell us what you create — business, art, events — and this studio lights up around your work.
            It takes ten seconds on the <Link to="/account" className="font-semibold text-gold-text hover:underline">Account page</Link>.
          </p>
        </Card>
      )}

      <Stagger className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StaggerItem index={0}>
          <MetricCard label="Live listings" value={ov.live} icon={<ListChecks size={18} />} tone="teal" sub={ov.pending ? `${ov.pending} in review` : undefined} to="/work" />
        </StaggerItem>
        <StaggerItem index={1}>
          <MetricCard label="In review" value={ov.pending} icon={<Hourglass size={18} />} tone="gold" sub="Moderation queue" to="/work" />
        </StaggerItem>
        <StaggerItem index={2}>
          <MetricCard label="Active promotions" value={ov.activePromotions} icon={<Megaphone size={18} />} tone="green" sub={ov.promotionDaysLeft ? `${ov.promotionDaysLeft} days left` : "GH₵10 per day"} to="/grow" />
        </StaggerItem>
        <StaggerItem index={3}>
          <MetricCard label="Plan" value={ov.activeSubscription ? "Supporter" : "Starter"} icon={<BadgeCheck size={18} />} tone="ink" sub={ov.activeSubscription ? "★ badge + priority" : "Free"} to="/grow" />
        </StaggerItem>
        <StaggerItem index={4}>
          <MetricCard label="Tickets sold" value={ov.ticketsSold} icon={<Ticket size={18} />} tone="teal" sub={cedis(ov.ticketsGrossPesewas)} to="/money" />
        </StaggerItem>
        <StaggerItem index={5}>
          <MetricCard label="Pledges raised" value={cedis(ov.pledgesRaisedPesewas)} icon={<HandCoins size={18} />} tone="gold" sub="Net to your projects" to="/money" />
        </StaggerItem>
        <StaggerItem index={6}>
          <MetricCard label="Views this month" value={ov.viewsThisMonth ?? 0} icon={<Eye size={18} />} tone="teal" sub="Unique daily views on your listings" />
        </StaggerItem>
      </Stagger>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {QUICK.map((q) => {
          const inner = (
            <Card className="group flex h-full items-start gap-3 p-4 transition-colors hover:border-gold-border/50">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-green/[0.08] text-green transition-transform group-hover:scale-105">
                <q.icon size={17} aria-hidden />
              </span>
              <span>
                <span className="block text-sm font-semibold text-ink">{q.label}</span>
                <span className="mt-0.5 block text-xs text-ink-faint">{q.desc}</span>
              </span>
            </Card>
          );
          return q.external
            ? <a key={q.label} href={q.to} className="block h-full">{inner}</a>
            : <Link key={q.label} to={q.to} className="block h-full">{inner}</Link>;
        })}
      </div>
    </>
  );
}
