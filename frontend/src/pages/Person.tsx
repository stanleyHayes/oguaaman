import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router-dom";
import type { Listing } from "@/lib/types";
import { api } from "@/lib/api";
import { Container, Pill, SampleNote } from "@/components/ui";
import { Thumb } from "@/components/cards";
import { ReportButton } from "@/components/report-button";
import { initials } from "@/lib/format";
import { SAMPLE_NOTICE } from "@/lib/content";

export async function loader({ params }: LoaderFunctionArgs): Promise<Listing> {
  return api.person(params.slug!);
}

export function Component() {
  const person = useLoaderData() as Listing;
  const d = person.details;
  const story = (d.bio ?? d.whyNotable ?? "").split("\n\n").filter(Boolean);

  return (
    <>
      <section className="on-dark relative overflow-hidden bg-green text-cream">
        <div className="absolute inset-0" style={{ background: "linear-gradient(135deg,#1B5A3F,#0C2C1F)" }} aria-hidden />
        <Container size="wide" className="relative py-12 sm:py-16">
          <Link to="/people" className="text-sm text-cream/70 hover:text-gold">← Sons &amp; daughters</Link>
          <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-end">
            <Thumb seed={person.slug} label={initials(person.title)} src={person.coverImageUrl} className="h-32 w-32 shrink-0 border border-cream/15" />
            <div>
              <span className="rounded-full bg-gold/20 px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-gold">
                {d.living ? "Living icon" : "In legacy"}
              </span>
              <h1 className="mt-2 text-4xl font-semibold sm:text-6xl">{person.title}</h1>
              {d.era && <p className="mt-3 text-sm uppercase tracking-[0.18em] text-cream/70">{d.era}</p>}
            </div>
          </div>
        </Container>
      </section>

      <Container size="wide" className="grid gap-10 py-12 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <h2 className="eyebrow mb-3 text-gold-text">Why Oguaa is proud</h2>
          {d.whyNotable && <p className="text-xl italic leading-relaxed text-ink">{d.whyNotable}</p>}
          <div className="mt-6 space-y-4 font-serif text-lg leading-relaxed text-ink">
            {story.map((p) => <p key={p}>{p}</p>)}
          </div>
          {person.tags.length > 0 && (
            <div className="mt-8 flex flex-wrap gap-2">{person.tags.map((t) => <Pill key={t} tone="gold">#{t}</Pill>)}</div>
          )}
        </div>

        <aside className="space-y-6">
          <div className="rounded-[var(--radius-card)] border border-sand bg-cream p-5">
            <p className="eyebrow text-gold-text">At a glance</p>
            <dl className="mt-3 space-y-2 text-sm">
              {d.era && (<div className="flex justify-between gap-4"><dt className="text-ink-faint">Era</dt><dd className="text-right text-ink">{d.era}</dd></div>)}
              <div className="flex justify-between gap-4"><dt className="text-ink-faint">Status</dt><dd className="text-right text-ink">{d.living ? "Living" : "Remembered"}</dd></div>
            </dl>
            <Link to="/submit?type=person" className="mt-4 inline-block text-sm font-semibold text-green hover:underline">Know more about them? Contribute →</Link>
          </div>
        </aside>
      </Container>

      <Container className="flex items-center justify-between gap-4">
        <SampleNote>{SAMPLE_NOTICE}</SampleNote>
        <ReportButton listingId={person.id} />
      </Container>
    </>
  );
}
