import { Link, useLoaderData } from "react-router-dom";
import type { Listing, Member, Stats } from "@/lib/types";
import { api } from "@/lib/api";
import { Container, CTA as Cta } from "@/components/ui";
import { EmptyState, EmptyGlyph } from "@/components/empty-state";
import { ModerationQueue, type QueueItem } from "@/components/moderation-queue";
import { formatDate } from "@/lib/format";

interface Data {
  queue: Listing[];
  members: Member[];
  stats: Stats;
  /** Set when the back office refused us — render the access notice, not the queue. */
  denied?: "signed-out" | "not-a-curator";
}

/**
 * The dashboard is linked from the public footer, so anyone can land here.
 * /api/admin/queue answers 401 to a signed-out visitor and 403 to a signed-in
 * member without the role — both are expected outcomes, not failures, so we
 * resolve with a `denied` marker. Letting them throw put every ordinary visitor
 * on the generic "We hit a snag" error page.
 */
export async function loader(): Promise<Data> {
  const empty = { queue: [], members: [], stats: {} as Stats };
  try {
    const [queue, members, stats] = await Promise.all([api.queue(), api.members(), api.stats()]);
    return { queue, members, stats };
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401) return { ...empty, denied: "signed-out" };
    if (status === 403) return { ...empty, denied: "not-a-curator" };
    throw e;
  }
}

function AccessNotice({ reason }: Readonly<{ reason: NonNullable<Data["denied"]> }>) {
  const signedOut = reason === "signed-out";
  return (
    <Container className="py-20">
      <EmptyState
        icon={<EmptyGlyph name="shield" />}
        title={signedOut ? "Sign in to reach the back office" : "Curators and stewards only"}
        description={
          signedOut
            ? "The curator dashboard holds the moderation queue and member records, so it needs a signed-in account with back-office access."
            : "Your account does not carry curator or steward access. If you moderate for Oguaa and this looks wrong, contact the stewards and we will put it right."
        }
        actions={
          signedOut
            ? <Cta to="/signin?next=/admin" variant="gold">Sign in</Cta>
            : <Cta to="/" variant="outline">Back to Oguaa</Cta>
        }
      />
    </Container>
  );
}

function snippetOf(l: Listing): string {
  const d = l.details;
  return (d.bio ?? d.description ?? d.text ?? d.whyNotable ?? d.epitaph ?? d.lifeStory ?? "") as string;
}

export function Component() {
  const { queue, members, stats, denied } = useLoaderData() as Data;
  if (denied) return <AccessNotice reason={denied} />;
  const nameOf = (id: string) => members.find((m) => m.id === id)?.displayName ?? "A member";
  const items: QueueItem[] = queue.map((l) => ({
    id: l.id,
    type: l.type,
    title: l.title,
    owner: nameOf(l.ownerId),
    submittedAt: l.submittedAt ? formatDate(l.submittedAt) : "—",
    snippet: snippetOf(l),
  }));

  return (
    <>
      <section className="on-dark on-dark-pin bg-green-slate text-cream">
        <Container className="flex flex-col gap-4 py-10 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-gold/90">Back office · curators &amp; stewards</p>
            <h1 className="mt-1 text-4xl font-semibold">Curator dashboard</h1>
          </div>
          <Link to="/admin/compose" className="inline-flex items-center gap-2 self-start rounded-full bg-ai px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 sm:self-auto">✦ Compose with AI</Link>
        </Container>
      </section>

      <div className="border-b border-sand bg-cream">
        <Container>
          <dl className="grid grid-cols-2 divide-sand sm:grid-cols-4 sm:divide-x">
            {([["Pending", stats.pending], ["Live listings", stats.listings], ["Members", stats.members], ["Institutions", stats.institutions]] as const).map(([k, v]) => (
              <div key={k} className="px-3 py-5 text-center"><dd className="text-3xl font-semibold text-green-text">{v}</dd><dt className="mt-1 text-xs uppercase tracking-wide text-ink-faint">{k}</dt></div>
            ))}
          </dl>
        </Container>
      </div>

      <Container className="py-10"><ModerationQueue initial={items} /></Container>
    </>
  );
}
