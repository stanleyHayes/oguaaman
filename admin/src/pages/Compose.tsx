import { PageHeader } from "@/components/ui";
import { AiWritingBar } from "@/components/ai-writing-bar";

export function Component() {
  return (
    <>
      <PageHeader kicker="Spec §8.12 · admin-only" title="Compose with AI" />
      <p className="mb-5 max-w-2xl text-sm text-ink-muted">
        Draft and improve announcements, emails and editorial faster — you stay in full control of the final words. Each action maps to a server-side prompt template in the Go API; calls are metered and degrade gracefully.
      </p>
      <AiWritingBar
        initialTitle="speech and prize giving day"
        initialBody={"hi all, we r having our speech and prize giving day on 22nd nov 2025 at the school park. pls all parents old students and well wishers should come. doors open 8am, kids should be there by 730 in uniform. come celebrate the children with us"}
      />
    </>
  );
}
