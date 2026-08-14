import { Section, SectionHeading, CTA as Cta } from "@/components/ui";
import { Stagger, StaggerItem } from "@/components/motion";
import { useListings, type Listing } from "@/lib/listings";
import { PORTAL_APP_URL } from "@/config";
import { mediaUrl } from "@/lib/media";

// "Fund a Cape Coast dream" — a living strip of community fundraising campaigns
// started by verified creators, pulled straight from the app. Each card links
// to the campaign on the portal and can be shared to social media. The section
// is skipped entirely when there are no live campaigns, so it never renders empty.
export function Campaigns() {
  const items = useListings("/api/campaigns", 3);
  if (items.length === 0) return null;

  return (
    <Section id="campaigns" tone="green" size="wide">
      <SectionHeading
        onDark
        kicker="BACK A CAMPAIGN"
        title="Fund a Cape Coast dream."
        lede="Verified creators raise money for the causes and projects they care about — studios, festivals, libraries. Every pledge is checked before it counts. Share one you love."
      />

      <Stagger className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((c, i) => (
          <StaggerItem key={c.id} index={i} className="h-full">
            <CampaignCard campaign={c} />
          </StaggerItem>
        ))}
      </Stagger>

      <div className="mt-12 text-center">
        <Cta href={`${PORTAL_APP_URL}/campaigns`} variant="gold" external>
          See every campaign
        </Cta>
      </div>
    </Section>
  );
}

const cedis = (pesewas: number) =>
  "GH₵ " + (pesewas / 100).toLocaleString("en-GH", { maximumFractionDigits: 0 });

function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

function CampaignCard({ campaign }: Readonly<{ campaign: Listing }>) {
  const d = campaign.details ?? {};
  const raised = num(d.raisedPesewas);
  const goal = num(d.goalPesewas);
  const backers = num(d.backers);
  const pct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;
  const url = `${PORTAL_APP_URL}/projects/${campaign.slug}`;
  const shareText = `Back "${campaign.title}" on Oguaa`;

  function share() {
    const nav = navigator as Navigator & { share?: (data: { title?: string; text?: string; url?: string }) => Promise<void> };
    if (typeof nav.share === "function") {
      void nav.share({ title: campaign.title, text: shareText, url });
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${shareText} ${url}`)}`, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[1.25rem] border border-white/12 bg-white/[0.06] backdrop-blur-sm">
      {campaign.coverImageUrl && (
        <img src={mediaUrl(campaign.coverImageUrl)} alt="" className="aspect-[16/10] w-full object-cover" loading="lazy" />
      )}
      <div className="flex flex-1 flex-col p-5">
        {typeof d.category === "string" && d.category && (
          <span className="w-fit rounded-full bg-gold/20 px-2.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-gold">{d.category}</span>
        )}
        <h3 className="mt-3 text-lg font-semibold leading-tight text-cream">{campaign.title}</h3>
        {typeof d.description === "string" && <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-cream/70">{d.description}</p>}

        <div className="mt-auto pt-4">
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full bg-gold-brand" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-2 flex items-baseline justify-between text-xs">
            <span className="font-semibold text-cream">{cedis(raised)} raised</span>
            <span className="text-cream/60">{goal > 0 ? `${pct}% of ${cedis(goal)}` : "target being finalised"}</span>
          </div>
          <div className="mt-4 flex items-center justify-between gap-2">
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center rounded-full bg-gold-brand px-4 text-xs font-bold text-green-900 transition hover:bg-gold">
              Back this{backers ? ` · ${backers} backers` : ""}
            </a>
            <button type="button" onClick={share} aria-label="Share this campaign" className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/25 px-3 text-xs font-semibold text-cream transition hover:bg-white/10">
              Share <span aria-hidden>↗</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
