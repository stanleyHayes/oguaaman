import { useEffect, useState, type ReactNode } from "react";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router-dom";
import { usePageTitle } from "@/lib/use-page-title";
import type { MemberView, Listing } from "@/lib/types";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Container, Avatar, Pill, VerifiedBadge } from "@/components/ui";
import { EmptyState, EmptyGlyph } from "@/components/empty-state";
import { BlockButton } from "@/components/block-button";
import { ReportButton } from "@/components/report-button";
import { formatDate } from "@/lib/format";

export async function loader({ params }: LoaderFunctionArgs) {
  return api.member(params.slug!);
}

function DarkChip({ children }: Readonly<{ children: ReactNode }>) {
  return <span className="rounded-full border border-cream/25 bg-cream/10 px-3 py-1 text-xs text-cream/90">{children}</span>;
}

function linkFor(l: Listing): string | null {
  if (l.status !== "approved") return null;
  if (l.type === "artist") return `/music/${l.slug}`;
  if (l.type === "business") return `/business/${l.slug}`;
  if (l.type === "property") return `/rent-stay/${l.slug}`;
  if (l.type === "memorial") return `/memoriam/${l.slug}`;
  return null;
}

/** Follow toggle — enrols the viewer as a follower (the audience for this
 *  member's remembrances and birthday, spec §8.11). */
function FollowButton({ slug }: Readonly<{ slug: string }>) {
  const { member } = useAuth();
  const [following, setFollowing] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!member) return;
    let alive = true;
    api.memberFollowState(slug).then((r) => { if (alive) setFollowing(r.following); }).catch(() => {});
    return () => { alive = false; };
  }, [member, slug]);

  // Don't show a follow button on your own profile.
  if (member?.slug === slug) {
    return <Pill tone="gold">This is you</Pill>;
  }

  async function toggle() {
    if (!member) { window.location.href = "/signin"; return; }
    if (busy) return;
    setBusy(true);
    const next = !following;
    setFollowing(next);
    try {
      const r = next ? await api.followMember(slug) : await api.unfollowMember(slug);
      setFollowing(r.following);
      setCount(r.followers);
    } catch {
      setFollowing(!next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={following}
      className={`inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-70 ${
        following ? "border-gold bg-gold/15 text-gold" : "border-cream/30 text-cream hover:border-gold"
      }`}
    >
      {following ? "Following" : "Follow"}{count != null && count > 0 && <span className="opacity-80">· {count}</span>}
    </button>
  );
}

/**
 * Shown instead of the profile when a block exists in either direction (K5).
 * Only the viewer's own block can be lifted, so the "You blocked" copy and the
 * Unblock button appear only when `blockedByMe` (F214).
 */
function BlockedNotice({ name, slug, blockedByMe }: Readonly<{ name: string; slug: string; blockedByMe: boolean }>) {
  const [busy, setBusy] = useState(false);
  if (!blockedByMe) {
    return (
      <Container className="py-20">
        <EmptyState icon={<EmptyGlyph name="shield" />} title="This profile isn't available" description="You can't view this member's profile or posts." />
      </Container>
    );
  }
  return (
    <Container className="py-20">
      <EmptyState
        icon={<EmptyGlyph name="shield" />}
        title={`You blocked ${name}`}
        description="Neither of you can see the other's profile, posts or reviews. Unblocking restores both."
        actions={
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api.unblockMember(slug);
                window.location.reload();
              } catch {
                setBusy(false);
              }
            }}
            className="rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-on-green disabled:opacity-60"
          >
            Unblock
          </button>
        }
      />
    </Container>
  );
}

export function Component() {
  const { member: me, listings, places, schools, blocked, blockedByMe } = useLoaderData() as MemberView;
  usePageTitle(blocked && !blockedByMe ? "Profile unavailable" : me.displayName);
  if (blocked) return <BlockedNotice name={me.displayName} slug={me.slug} blockedByMe={Boolean(blockedByMe)} />;
  const quarter = places.find((p) => p.id === me.townId && p.kind !== "asafo");
  const asafo = places.find((p) => p.id === me.asafoId);
  const published = listings.filter((l) => l.status === "approved");
  // Prefer schooling-with-years (the connection signal) over bare school chips.
  const schoolName = (id: string) => schools.find((s) => s.id === id)?.name ?? id;
  const schoolChips = (me.schooling?.length
    ? me.schooling.map((st) => ({
        id: st.schoolId,
        label: st.fromYear || st.toYear
          ? `${schoolName(st.schoolId)} · ${st.fromYear ?? "?"}–${st.toYear ?? "?"}`
          : schoolName(st.schoolId),
      }))
    : schools.filter((s) => me.schoolIds.includes(s.id)).map((s) => ({ id: s.id, label: s.name })));
  let roleLabel = "Member";
  if (me.role === "curator") roleLabel = "Curator";
  else if (me.role === "steward") roleLabel = "Steward";

  return (
    <>
      <section className="on-dark on-dark-pin bg-green text-cream">
        <Container className="flex flex-col gap-5 py-12 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <Avatar initials={me.initials} photoUrl={me.photoUrl} size={72} className="border-2 border-gold/40" />
            <div>
              <p className="text-xs uppercase tracking-wide text-gold/90">
                {roleLabel} · joined {formatDate(me.joinedAt)}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
                <h1 className="text-4xl font-semibold text-cream">{me.displayName}</h1>
                {me.verified && <VerifiedBadge onDark verifiedAs={me.verifiedAs} label={me.verifiedAs ?? "Verified"} />}
              </div>
              {me.bio && <p className="mt-2 max-w-xl text-cream/80">{me.bio}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {quarter && <DarkChip>{quarter.name}</DarkChip>}
                {asafo && <DarkChip>{asafo.name}</DarkChip>}
                {schoolChips.map((s) => <DarkChip key={s.id}>{s.label}</DarkChip>)}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <FollowButton slug={me.slug} />
            <BlockButton slug={me.slug} name={me.displayName} />
            <span className="rounded-full bg-cream px-3 py-2"><ReportButton target={{ type: "member", id: me.id || me.slug }} /></span>
          </div>
        </Container>
      </section>

      <Container className="space-y-8 py-12">
        <section>
          <h2 className="mb-4 flex items-center gap-3 text-xl font-semibold text-ink">
            Contributions<span className="h-px flex-1 bg-sand" />
          </h2>
          {published.length === 0 ? (
            <EmptyState compact icon={<EmptyGlyph name="pen" size={18} />} title="No public contributions yet" />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {published.map((l) => {
                const href = linkFor(l);
                const body = (
                  <>
                    <span className="text-[0.66rem] font-bold uppercase tracking-wider text-gold-text">{l.type}</span>
                    <span className="mt-1 block text-lg text-ink">{l.title}</span>
                  </>
                );
                return (
                  <li key={l.id} className="rounded-[var(--radius-card)] border border-sand bg-cream p-4">
                    {href ? <Link to={href} className="block hover:opacity-80">{body}</Link> : body}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </Container>
    </>
  );
}
