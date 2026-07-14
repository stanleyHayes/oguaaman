import { useLoaderData } from "react-router-dom";
import type { Listing } from "@/lib/types";
import { api } from "@/lib/api";
import { PageHero } from "@/components/page-hero";
import { Container, CTA, SampleNote } from "@/components/ui";
import { BusinessCard } from "@/components/cards";
import { SAMPLE_NOTICE } from "@/lib/content";

export async function loader() {
  return api.businesses();
}

export function Component() {
  const businesses = useLoaderData() as Listing[];
  return (
    <>
      <PageHero tone="teal" kicker="The working city" title="Business & trade" symbol="crab" lede="From the Kotokuraba market to the fishing harbour and the guesthouses by the Castle — the directory of the working city. Born of the market, still trading.">
        <CTA to="/submit?type=business" variant="primary">List your business</CTA>
      </PageHero>
      <Container size="wide" className="py-12">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{businesses.map((b) => <BusinessCard key={b.id} business={b} />)}</div>
        <SampleNote>{SAMPLE_NOTICE}</SampleNote>
      </Container>
    </>
  );
}
