import { useState } from "react";
import { Link, useLoaderData } from "react-router-dom";
import type { LostFound, LostFoundKind } from "@/lib/types";
import { api } from "@/lib/api";
import { PageHero } from "@/components/page-hero";
import { Container, CTA, SampleNote } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { SAMPLE_NOTICE } from "@/lib/content";
import { LOST_FOUND_KINDS, KIND_LABEL, LF_STATUS_CLASS, LF_STATUS_LABEL } from "@/lib/lostfound";

export async function loader() {
  return api.lostFoundList();
}

export function Component() {
  const all = useLoaderData() as LostFound[];
  const [kind, setKind] = useState<LostFoundKind>("lost_item");
  const shown = all.filter((i) => i.details.kind === kind);
  const counts = (k: LostFoundKind) => all.filter((i) => i.details.kind === k).length;

  return (
    <>
      <PageHero tone="teal" kicker="Lost & found" title="Lost & Found" symbol="crab" lede="Lost a phone, found a bunch of keys, searching for someone? Post here — notices go live immediately, and the town helps. When it works out, mark it reunited and share the good news.">
        <CTA to="/lost-found/new" variant="primary">Post a notice</CTA>
      </PageHero>
      <Container size="wide" className="py-12">
        <div className="mb-8 flex flex-wrap gap-2">
          {LOST_FOUND_KINDS.map((k) => (
            <button
              key={k.value}
              onClick={() => setKind(k.value)}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${kind === k.value ? "border-green bg-green text-cream" : "border-sand bg-cream text-ink-muted hover:border-green/40"}`}
            >
              {k.label}s <span className="opacity-60">({counts(k.value)})</span>
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <p className="rounded-[var(--radius-card)] border border-dashed border-sand p-10 text-center text-sm text-ink-faint">
            Nothing here yet — and may it stay that way.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">{shown.map((i) => <NoticeCard key={i.id} notice={i} />)}</div>
        )}
        <SampleNote>{SAMPLE_NOTICE}</SampleNote>
      </Container>
    </>
  );
}

function NoticeCard({ notice: i }: { notice: LostFound }) {
  const d = i.details;
  const missing = d.kind === "missing_person";
  return (
    <Link
      to={`/lost-found/${i.slug}`}
      className={`block rounded-[var(--radius-card)] border bg-cream p-5 shadow-[var(--shadow-card)] transition-colors hover:border-gold-border ${missing ? "border-l-4 border-l-maroon-900 border-sand" : "border-sand"}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${missing ? "border-maroon-900/40 bg-maroon-900/[0.08] text-maroon-900" : "border-teal/30 bg-teal/[0.09] text-teal-text"}`}>
          {KIND_LABEL[d.kind] ?? d.kind}
        </span>
        <span className={`ml-auto rounded-full border px-3 py-1 text-xs font-semibold ${LF_STATUS_CLASS[d.lfStatus]}`}>
          {LF_STATUS_LABEL[d.lfStatus] ?? d.lfStatus}
        </span>
      </div>
      <h3 className="mt-3 font-display text-xl font-semibold text-ink">{i.title}</h3>
      {d.lastSeenLocation && (
        <p className="mt-1.5 text-sm text-ink-muted">
          {missing ? "Last seen" : d.kind === "lost_item" ? "Lost" : "Found"} at {d.lastSeenLocation}{d.lastSeenDate ? ` · ${formatDate(d.lastSeenDate)}` : ""}
        </p>
      )}
      {d.description && <p className="mt-2 line-clamp-2 text-sm text-ink-faint">{d.description}</p>}
      <p className="mt-3 text-xs text-ink-faint">Posted {formatDate(i.createdAt)}</p>
    </Link>
  );
}
