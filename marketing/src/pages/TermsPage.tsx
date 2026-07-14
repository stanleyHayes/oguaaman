import { PageHero } from "@/components/page-hero";
import { LighthouseScene } from "@/components/scenes";
import { Section } from "@/components/ui";

export function Component() {
  return (
    <>
      <PageHero
        scene={LighthouseScene}
        kicker="Terms"
        title="How we keep this place worthy of the town."
        lede="Oguaa belongs to all of us. These are the simple understandings that let a shared record of Cape Coast stay honest, respectful, and worth passing on."
      />

      <Section tone="paper" size="prose">
        <p className="text-sm text-ink-muted">Last updated: June 2026</p>

        <h2 className="mt-8 font-display text-2xl font-semibold text-ink sm:text-3xl">
          Using Oguaa
        </h2>
        <p className="mt-4 leading-relaxed text-ink-muted">
          Oguaa is a community platform for the people of Cape Coast, at home and in
          the diaspora. By joining and taking part, you agree to use it for what it
          is meant for — celebrating the town's people, music, heritage, and
          institutions, and remembering those who have gone before us. Please use it
          honestly and only as yourself.
        </p>

        <h2 className="mt-10 font-display text-2xl font-semibold text-ink sm:text-3xl">
          Contributions are reviewed before they appear
        </h2>
        <p className="mt-4 leading-relaxed text-ink-muted">
          Anything you submit goes to a curator first. It becomes publicly visible
          only once it has been approved. Curators may edit lightly for clarity,
          decline something that does not fit, or ask you for more before a piece
          goes up. Review keeps the record trustworthy; it is not a judgement of you.
        </p>

        <h2 className="mt-10 font-display text-2xl font-semibold text-ink sm:text-3xl">
          Acceptable use
        </h2>
        <p className="mt-4 leading-relaxed text-ink-muted">
          Treat Oguaa, and everyone in it, with the courtesy you would show an elder
          in the room. The following has no place here:
        </p>
        <ul className="mt-4 space-y-2 leading-relaxed text-ink-muted">
          <li>Insults, harassment, or content that demeans a person or group.</li>
          <li>Anything unlawful, or content you do not have the right to share.</li>
          <li>
            Knowingly false claims, rumour passed off as fact, or impersonating
            someone else.
          </li>
          <li>Spam, advertising, or attempts to misuse or disrupt the platform.</li>
        </ul>
        <p className="mt-4 leading-relaxed text-ink-muted">
          There is no private messaging on Oguaa, and the youth board carries
          information and outbound links only — it is not a place for unmoderated
          back-and-forth.
        </p>

        <h2 className="mt-10 font-display text-2xl font-semibold text-ink sm:text-3xl">
          Respectful conduct
        </h2>
        <p className="mt-4 leading-relaxed text-ink-muted">
          Disagreement is fine; disrespect is not. We share one town's story across
          many quarters, families, and Asafo, so write in a way that keeps the door
          open to everyone. Curators may remove content or pause an account that
          works against that spirit.
        </p>

        <h2 className="mt-10 font-display text-2xl font-semibold text-ink sm:text-3xl">
          Accuracy
        </h2>
        <p className="mt-4 leading-relaxed text-ink-muted">
          A community archive is only as good as its honesty. Share what you know to
          be true, say when something is family memory rather than settled fact, and
          credit your sources where you can. If you spot a mistake in the record,
          tell the stewards so it can be put right.
        </p>

        <h2 className="mt-10 font-display text-2xl font-semibold text-ink sm:text-3xl">
          Memorial and heritage content
        </h2>
        <p className="mt-4 leading-relaxed text-ink-muted">
          Names of the departed, family histories, and the town's heritage are
          handled with care. When you remember someone or add to our shared history,
          write with dignity and keep the trust of the families involved. Curators
          give this content extra attention before it is published.
        </p>

        <h2 className="mt-10 font-display text-2xl font-semibold text-ink sm:text-3xl">
          Your contributions
        </h2>
        <p className="mt-4 leading-relaxed text-ink-muted">
          What you write remains yours. By submitting it, you give Oguaa permission
          to show it as part of the community record once approved. Only share
          things you have the right to share, especially other people's photographs,
          words, and stories.
        </p>

        <h2 className="mt-10 font-display text-2xl font-semibold text-ink sm:text-3xl">
          Changes and getting in touch
        </h2>
        <p className="mt-4 leading-relaxed text-ink-muted">
          As the platform grows, these terms may be updated, and we will note the
          date when they are. If anything here is unclear, or you need to raise
          something, reach the stewards through the app.
        </p>
      </Section>
    </>
  );
}
