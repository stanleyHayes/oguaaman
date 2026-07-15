import { useLoaderData } from "react-router-dom";
import { api } from "@/lib/api";
import { PORTAL } from "@/lib/portal";
import type { Organization } from "@/lib/types";
import { Card, Empty, Pill } from "@/components/ui";
import { Stagger, StaggerItem } from "@/components/motion";
import { BadgeCheck, Landmark } from "lucide-react";

export async function loader(): Promise<Organization[]> {
  return api.myInstitutions();
}

export function Component() {
  const orgs = useLoaderData() as Organization[];

  return (
    <>
      <div className="mb-6">
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-gold-text">My work</p>
        <h1 className="mt-1 text-3xl font-semibold text-ink">Institutions you manage</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Schools, traditional councils, churches and associations whose official pages you're an approved manager of.
          Claim a page on the portal; a steward verifies the claim.
        </p>
      </div>

      {orgs.length === 0 ? (
        <Empty title="No institutions yet" actions={
          <a href={`${PORTAL}/education`} className="rounded-full bg-green px-4 py-2 text-sm font-semibold text-cream">Browse institutions on the portal</a>
        }>
          Find your school, council or association on the portal and tap “Claim this page” — once a steward approves, it shows up here.
        </Empty>
      ) : (
        <Card className="overflow-hidden px-4">
          <Stagger as="ul" className="divide-y divide-sand">
            {orgs.map((o, idx) => (
              <StaggerItem as="li" key={o.id} index={idx} className="py-3.5">
                <div className="flex items-center gap-3">
                  {o.crestUrl ? (
                    <img src={o.crestUrl} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" loading="lazy" />
                  ) : (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-green/[0.08] text-green"><Landmark size={18} aria-hidden /></span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{o.name}</p>
                    <p className="text-xs capitalize text-ink-faint">{o.kind}{o.classification ? ` · ${o.classification}` : ""}</p>
                  </div>
                  {o.verified && <Pill tone="green"><BadgeCheck size={12} className="mr-1" aria-hidden />Verified</Pill>}
                  <a href={`${PORTAL}/education/${o.slug}/manage`}
                    className="shrink-0 rounded-full border border-gold-brand px-3.5 py-1.5 text-xs font-semibold text-gold-text transition-colors hover:bg-gold-brand hover:text-green-900">
                    Manage page
                  </a>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </Card>
      )}

      <p className="mt-4 text-xs text-ink-faint">
        Editing an institution's profile, offices, gallery and events happens in the portal's page editor — it opens in the same account.
      </p>
    </>
  );
}
