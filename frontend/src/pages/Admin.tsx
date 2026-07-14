import { Link, useLoaderData } from "react-router-dom";
import type { Listing, Member, Stats } from "@/lib/types";
import { api } from "@/lib/api";
import { Container } from "@/components/ui";
import { ModerationQueue, type QueueItem } from "@/components/moderation-queue";
import { formatDate } from "@/lib/format";

interface Data {
  queue: Listing[];
  members: Member[];
  stats: Stats;
}

export async function loader(): Promise<Data> {
  const [queue, members, stats] = await Promise.all([api.queue(), api.members(), api.stats()]);
  return { queue, members, stats };
}

function snippetOf(l: Listing): string {
  const d = l.details;
  return (d.bio ?? d.description ?? d.text ?? d.whyNotable ?? d.epitaph ?? d.lifeStory ?? "") as string;
}

export function Component() {
  const { queue, members, stats } = useLoaderData() as Data;
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
      <section className="on-dark bg-green-slate text-cream">
        <Container className="flex flex-col gap-4 py-10 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-gold/90">Back office · curators &amp; stewards</p>
            <h1 className="mt-1 font-display text-4xl font-semibold">Curator dashboard</h1>
          </div>
          <Link to="/admin/compose" className="inline-flex items-center gap-2 self-start rounded-full bg-ai px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 sm:self-auto">✦ Compose with AI</Link>
        </Container>
      </section>

      <div className="border-b border-sand bg-cream">
        <Container>
          <dl className="grid grid-cols-2 divide-sand sm:grid-cols-4 sm:divide-x">
            {([["Pending", stats.pending], ["Live listings", stats.listings], ["Members", stats.members], ["Institutions", stats.institutions]] as const).map(([k, v]) => (
              <div key={k} className="px-3 py-5 text-center"><dd className="font-display text-3xl font-semibold text-green">{v}</dd><dt className="mt-1 text-xs uppercase tracking-wide text-ink-faint">{k}</dt></div>
            ))}
          </dl>
        </Container>
      </div>

      <Container className="py-10"><ModerationQueue initial={items} /></Container>
    </>
  );
}
