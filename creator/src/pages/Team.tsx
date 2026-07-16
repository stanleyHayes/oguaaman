// Team — the institution workspace (Creator plan §4.1.3). A manager picks one
// of their approved institutions and edits its official page in place:
// profile, custom sections, gallery, office-holders and official events.
// Ported from the portal's manage page so managers never have to leave the app.
import { Link, useLoaderData, useRevalidator, type LoaderFunctionArgs } from "react-router-dom";
import { api } from "@/lib/api";
import { PORTAL } from "@/lib/portal";
import type { InstitutionView, Invitation, Member, Organization, TeamView } from "@/lib/types";
import { Empty, Pill } from "@/components/ui";
import { BadgeCheck, Landmark } from "lucide-react";
import { EventForm, GalleryForm, ProfileForm, RosterForm, SectionBuilderForm } from "@/components/institution-panels";
import { InvitationsPanel, TeamPanel } from "@/components/team-panel";

interface Data {
  orgs: Organization[];
  view: InstitutionView | null;
  slug: string | null;
  manages: boolean;
  team: TeamView | null;
  invitations: Invitation[];
  me: Member | null;
}

export async function loader({ params }: LoaderFunctionArgs): Promise<Data> {
  const orgs = await api.myInstitutions().catch(() => [] as Organization[]);
  const slug = params.slug ?? orgs[0]?.slug ?? null;
  const invitations = await api.myInvitations().catch(() => [] as Invitation[]);
  const me = await api.me().catch(() => null);
  if (!slug) return { orgs, view: null, slug: null, manages: false, team: null, invitations, me };
  const manages = orgs.some((o) => o.slug === slug);
  if (!manages) return { orgs, view: null, slug, manages, team: null, invitations, me };
  const [view, team] = await Promise.all([
    api.institution(slug),
    api.orgTeam(slug).catch(() => null),
  ]);
  return { orgs, view, slug, manages, team, invitations, me };
}

export function Component() {
  const { orgs, view, slug, manages, team, invitations, me } = useLoaderData() as Data;
  const { revalidate } = useRevalidator();

  if (orgs.length === 0) {
    return (
      <>
        <div className="mb-6">
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-gold-text">My work</p>
          <h1 className="mt-1 text-3xl font-semibold text-ink">Team workspace</h1>
        </div>
        <div className="space-y-6">
          <InvitationsPanel items={invitations} onChanged={revalidate} />
          <Empty icon="building" title="No institutions yet" actions={
            <Link to="/institutions" className="rounded-full bg-green px-4 py-2 text-sm font-semibold text-cream">About institutions</Link>
          }>
            Claim your school, council or association on the portal — once a steward approves, its workspace opens here.
          </Empty>
        </div>
      </>
    );
  }

  if (!manages || !view || !slug) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-3xl font-semibold text-ink">Not your institution to manage</h1>
        <p className="mx-auto mt-3 max-w-md text-ink-muted">
          You don’t manage this institution yet. Open its page on the portal to request management — a steward reviews each claim.
        </p>
        <Link to="/team" className="mt-6 inline-block rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-cream">
          Back to your workspace
        </Link>
      </div>
    );
  }

  const org = view.institution;

  return (
    <>
      <div className="mb-6">
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-gold-text">
          Team workspace · {org.verified ? "Verified institution" : "Pending verification"}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold text-ink">{org.name}</h1>
          {org.verified && <Pill tone="green"><BadgeCheck size={12} className="mr-1" aria-hidden />Verified</Pill>}
        </div>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Keep the official profile current, manage your offices, and post events.{" "}
          <a href={`${PORTAL}/education/${slug}`} className="font-medium text-green underline">View public page →</a>
        </p>
      </div>

      {orgs.length > 1 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {orgs.map((o) => (
            <Link
              key={o.id}
              to={`/team/${o.slug}`}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                o.slug === slug
                  ? "border-green bg-green/[0.08] text-green"
                  : "border-sand bg-paper text-ink-muted hover:border-green/40 hover:text-green"
              }`}
            >
              <Landmark size={12} aria-hidden />
              {o.name}
            </Link>
          ))}
        </div>
      )}

      <div className="space-y-6">
        <InvitationsPanel items={invitations} onChanged={revalidate} />
        {team && me && <TeamPanel slug={slug} view={team} meId={me.id} onChanged={revalidate} />}
        <ProfileForm slug={slug} org={org} />
        <SectionBuilderForm slug={slug} initial={org.sections} />
        <GalleryForm slug={slug} initial={org.gallery} />
        <RosterForm slug={slug} initial={org.offices} />
        <EventForm slug={slug} verified={org.verified} />
      </div>
    </>
  );
}
