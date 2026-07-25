import { useSearchParams } from "react-router-dom";
import type { ListingType } from "@/lib/types";
import { BackLink } from "@/components/ui";
import { SubmitForm } from "@/components/submit-form";

const VALID = new Set<ListingType>(["artist", "business", "property", "event", "memory", "opportunity", "person", "memorial"]);

export function Component() {
  const [params] = useSearchParams();
  const t = params.get("type");
  const initialType = t && VALID.has(t as ListingType) ? (t as ListingType) : undefined;

  return (
    <div>
      <BackLink to="/work">My work</BackLink>
      <div className="mb-8 border-b border-sand pb-6">
        <p className="eyebrow text-green-text">New contribution</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <h1 className="text-3xl font-semibold text-ink">Build your listing</h1>
          <p className="max-w-sm text-sm leading-relaxed text-ink-muted">Choose a listing type, add what you know, then send it to the curator queue.</p>
        </div>
      </div>
      <SubmitForm initialType={initialType} />
    </div>
  );
}
