import { Link, useLoaderData } from "react-router-dom";
import { Thumb } from "@/components/cards";
import { EmptyGlyph, EmptyState } from "@/components/empty-state";
import { StaggerItem } from "@/components/motion";
import { PageHero } from "@/components/page-hero";
import { Pagination } from "@/components/pagination";
import { Container } from "@/components/ui";
import { api } from "@/lib/api";
import { initials, tagLabel } from "@/lib/format";
import type { Listing } from "@/lib/types";
import { usePageTitle } from "@/lib/use-page-title";
import { useClientPagination } from "@/lib/use-pagination";
import { ProgressBar, cedis } from "./Projects";

const PER_PAGE = 12;

export async function loader() {
  return api.campaigns();
}

export function Component() {
  const campaigns = useLoaderData() as Listing[];
  usePageTitle("Fundraising Campaigns");

  const raised = campaigns.reduce((sum, c) => sum + (c.details.raisedPesewas ?? 0), 0);
  const backers = campaigns.reduce((sum, c) => sum + (c.details.backers ?? 0), 0);
  const { pageItems, page, totalPages, goToPage, listRef } = useClientPagination(campaigns, PER_PAGE);

  return (
    <>
      <PageHero
        tone="green"
        sectionId="community"
        kicker="Fundraising · By the community"
        title="Campaigns started by Oguaa creators"
        symbol="funtunfunefu"
        image="/uploads/seed/fishermen.jpg"
        lede="Verified creators raise money for the work, ideas and causes they care about. Every pledge is checked server-side before it moves the public total."
      >
        <dl className="grid max-w-2xl grid-cols-3 gap-px overflow-hidden rounded-[var(--radius-card)] border border-cream/15 bg-cream/15">
          <Stat value={String(campaigns.length)} label="live campaigns" />
          <Stat value={cedis(raised)} label="raised together" />
          <Stat value={String(backers)} label="backers" />
        </dl>
      </PageHero>

      <section className="bg-paper py-16 sm:py-20">
        <Container size="wide">
          {campaigns.length === 0 ? (
            <EmptyState icon={<EmptyGlyph name="heart" />} title="No campaigns yet" description="Subscribed creators can start a fundraising campaign from their studio." />
          ) : (
            <div ref={listRef} className="scroll-mt-24">
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {pageItems.map((campaign, index) => (
                  <StaggerItem key={campaign.id} index={index}>
                    <CampaignCard campaign={campaign} />
                  </StaggerItem>
                ))}
              </div>
              <Pagination page={page} totalPages={totalPages} onPageChange={goToPage} />
            </div>
          )}
        </Container>
      </section>
    </>
  );
}

function Stat({ value, label }: Readonly<{ value: string; label: string }>) {
  return (
    <div className="bg-green-900/70 px-3 py-4 backdrop-blur-sm sm:px-5">
      <dt className="text-[0.63rem] uppercase tracking-[0.15em] text-cream/50">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-cream sm:text-2xl">{value}</dd>
    </div>
  );
}

function CampaignCard({ campaign }: Readonly<{ campaign: Listing }>) {
  const d = campaign.details;
  return (
    <Link to={`/projects/${campaign.slug}`} className="group flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)] transition duration-300 hover:-translate-y-1 hover:border-gold-border/45 hover:shadow-[var(--shadow-lift)]">
      <div className="relative overflow-hidden">
        <Thumb seed={campaign.slug} label={initials(campaign.title)} src={campaign.coverImageUrl} rounded="rounded-none" className="aspect-[16/10] w-full transition-transform duration-700 group-hover:scale-[1.035]" coverWidth={700} />
        <div className="absolute inset-0 bg-gradient-to-t from-green-900/55 via-transparent to-transparent" aria-hidden />
        {d.category && <span className="absolute bottom-4 left-4 rounded-full border border-cream/25 bg-green-900/80 px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-cream backdrop-blur-sm">{tagLabel(d.category)}</span>}
      </div>
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <h2 className="text-2xl font-semibold leading-tight text-ink transition-colors group-hover:text-green-text">{campaign.title}</h2>
        <div className="mt-auto pt-6">
          <ProgressBar raised={d.raisedPesewas} goal={d.goalPesewas} compact />
          <span className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-green px-5 text-base font-bold text-on-green transition-colors group-hover:bg-gold-brand group-hover:text-green-900">
            Support this campaign <span className="text-xl" aria-hidden>→</span>
          </span>
        </div>
      </div>
    </Link>
  );
}
