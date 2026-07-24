import { Link, useLoaderData } from "react-router-dom";
import { Thumb } from "@/components/cards";
import { EmptyGlyph, EmptyState } from "@/components/empty-state";
import { Reveal, StaggerItem } from "@/components/motion";
import { Container, Pill } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate, initials, tagLabel } from "@/lib/format";
import type { Listing } from "@/lib/types";
import { usePageTitle } from "@/lib/use-page-title";
import { ProgressBar, cedis } from "./Projects";

export async function loader() {
  return api.campaigns();
}

export function Component() {
  const campaigns = useLoaderData() as Listing[];
  usePageTitle("Fundraising Campaigns");

  const raised = campaigns.reduce((sum, c) => sum + (c.details.raisedPesewas ?? 0), 0);
  const backers = campaigns.reduce((sum, c) => sum + (c.details.backers ?? 0), 0);

  return (
    <>
      <section className="on-dark on-dark-pin relative isolate overflow-hidden bg-green-900 text-cream">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_5%,rgba(176,125,50,0.2),transparent_34%),linear-gradient(135deg,#0C2C1F_0%,#123F2D_58%,#081C14_100%)]" aria-hidden />
        <div className="bg-dotgrid absolute inset-0 opacity-30" aria-hidden />
        <Container size="wide" className="relative py-14 sm:py-18">
          <p className="eyebrow text-gold">Fundraising · By the community</p>
          <Reveal as="h1" className="mt-5 max-w-3xl text-5xl font-semibold leading-[0.96] text-cream sm:text-6xl">
            Campaigns started by Oguaa creators.
          </Reveal>
          <Reveal as="p" delay={0.08} className="mt-6 max-w-xl text-base leading-relaxed text-cream/74 sm:text-lg">
            Verified creators raise money for the causes and projects they care about. Every pledge is checked server-side before it counts.
          </Reveal>
          <dl className="mt-9 flex flex-wrap gap-x-10 gap-y-4">
            <Stat value={String(campaigns.length)} label="live campaigns" />
            <Stat value={cedis(raised)} label="raised together" />
            <Stat value={String(backers)} label="backers" />
          </dl>
        </Container>
      </section>

      <section className="bg-paper py-16 sm:py-20">
        <Container size="wide">
          {campaigns.length === 0 ? (
            <EmptyState icon={<EmptyGlyph name="heart" />} title="No campaigns yet" description="Subscribed creators can start a fundraising campaign from their studio." />
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {campaigns.map((campaign, index) => (
                <StaggerItem key={campaign.id} index={index}>
                  <CampaignCard campaign={campaign} />
                </StaggerItem>
              ))}
            </div>
          )}
        </Container>
      </section>
    </>
  );
}

function Stat({ value, label }: Readonly<{ value: string; label: string }>) {
  return (
    <div>
      <dt className="text-[0.63rem] uppercase tracking-[0.15em] text-cream/50">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold text-cream">{value}</dd>
    </div>
  );
}

function CampaignCard({ campaign }: Readonly<{ campaign: Listing }>) {
  const d = campaign.details;
  return (
    <Link to={`/projects/${campaign.slug}`} className="group flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]">
      <Thumb seed={campaign.slug} label={initials(campaign.title)} src={campaign.coverImageUrl} rounded="rounded-none" className="aspect-[16/10] w-full" coverWidth={700} />
      <div className="flex flex-1 flex-col p-5">
        {d.category && <Pill tone="clay">{tagLabel(d.category)}</Pill>}
        <h2 className="mt-3 text-xl font-semibold leading-tight text-ink transition-colors group-hover:text-green-text">{campaign.title}</h2>
        {d.description && <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-muted">{d.description}</p>}
        <div className="mt-auto pt-5">
          <ProgressBar raised={d.raisedPesewas} goal={d.goalPesewas} compact />
          <p className="mt-3 flex items-center justify-between gap-3 text-xs text-ink-faint">
            <span>{d.backers ?? 0} backers{d.deadline ? ` · closes ${formatDate(d.deadline)}` : ""}</span>
            <span className="shrink-0 font-semibold text-green-text">Support <span aria-hidden>→</span></span>
          </p>
        </div>
      </div>
    </Link>
  );
}
