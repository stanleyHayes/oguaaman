import { Link, useLoaderData } from "react-router-dom";
import type { FestivalSummary } from "@/lib/types";
import { api } from "@/lib/api";
import { PageHero } from "@/components/page-hero";
import { Container, SampleNote } from "@/components/ui";
import { Thumb } from "@/components/cards";
import { formatDate } from "@/lib/format";
import { SAMPLE_NOTICE } from "@/lib/content";

export async function loader() {
  return api.festivals();
}

export function Component() {
  const festivals = useLoaderData() as FestivalSummary[];

  return (
    <>
      <PageHero tone="gold" kicker="The living archive" title="Festivals of the coast" symbol="sankofa" lede="Every edition of every festival — Fetu Afahye, Edina Bakatue, PANAFEST and the rest — kept year by year: recaps of the ones behind us, programmes for the ones ahead.">
      </PageHero>
      <Container size="wide" className="py-12">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {festivals.map((f) => (
            <Link
              key={f.slug}
              to={`/festivals/${f.slug}`}
              className="group flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]"
            >
              <Thumb seed={f.slug} label={f.name} src={f.nextEdition?.coverImageUrl} rounded="rounded-none" className="aspect-[16/9] w-full" />
              <div className="flex flex-1 flex-col p-5">
                <h3 className="text-2xl font-semibold text-ink group-hover:text-gold-text">{f.name}</h3>
                {f.tagline && <p className="mt-2 text-sm text-ink-muted">{f.tagline}</p>}
                <p className="mt-auto pt-4 text-xs text-ink-faint">
                  {f.nextEdition?.details.startsAt && (
                    <>Next: <span className="font-medium text-gold-text">{formatDate(f.nextEdition.details.startsAt)}</span> · </>
                  )}
                  {f.editions} edition{f.editions === 1 ? "" : "s"} archived
                </p>
              </div>
            </Link>
          ))}
        </div>
        <SampleNote>{SAMPLE_NOTICE}</SampleNote>
      </Container>
    </>
  );
}
