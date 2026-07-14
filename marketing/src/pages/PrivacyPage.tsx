import { PageHero } from "@/components/page-hero";
import { LagoonScene } from "@/components/scenes";
import { Section } from "@/components/ui";

export function Component() {
  return (
    <>
      <PageHero
        scene={LagoonScene}
        kicker="Privacy"
        title="What we keep, and what we never share."
        lede="Oguaa is a community keeper of Cape Coast's story. We handle your details with the same care we ask you to show our heritage — quietly, honestly, and only as much as we need."
      />

      <Section tone="paper" size="prose">
        <p className="text-sm text-ink-muted">Last updated: June 2026</p>

        <h2 className="mt-8 text-2xl font-semibold text-ink sm:text-3xl">
          The short version
        </h2>
        <p className="mt-4 leading-relaxed text-ink-muted">
          Your contact details stay private. We do not store passwords. There is
          no private messaging on the platform. Anything you submit becomes public
          only after a curator has reviewed and approved it. That is the whole
          spirit of how we treat your information — the rest of this page simply
          spells it out.
        </p>

        <h2 className="mt-10 text-2xl font-semibold text-ink sm:text-3xl">
          What we collect
        </h2>
        <p className="mt-4 leading-relaxed text-ink-muted">
          When you join, we ask for a little about you — your name, a way to reach
          you, and whatever you choose to share about your connection to Cape Coast.
          When you contribute history, photographs, news, or remembrances, we keep
          what you send us so the community can read it.
        </p>

        <h3 className="mt-6 text-xl font-semibold text-ink">
          Your phone number and email are private
        </h3>
        <p className="mt-4 leading-relaxed text-ink-muted">
          We use your phone number and email to sign you in and, occasionally, to
          let you know about something on the platform. They are never shown
          publicly, never listed on a profile, and never sold. Other members cannot
          see them.
        </p>

        <h3 className="mt-6 text-xl font-semibold text-ink">
          We do not store passwords
        </h3>
        <p className="mt-4 leading-relaxed text-ink-muted">
          Signing in is passwordless. When you want to enter, we send a one-time
          code to your phone or email and you type it in. There is no password for
          anyone to lose, leak, or guess — including us.
        </p>

        <h2 className="mt-10 text-2xl font-semibold text-ink sm:text-3xl">
          What is public and what is not
        </h2>
        <p className="mt-4 leading-relaxed text-ink-muted">
          Content you submit — a story, a name to remember, a photograph, a piece of
          news — is publicly visible once a curator approves it. Until then it sits
          in review and is not shown to the community. Your private contact details
          are never part of what becomes public.
        </p>
        <p className="mt-4 leading-relaxed text-ink-muted">
          There is no private messaging on Oguaa, and the youth board is for
          information and outbound links only. We are a noticeboard for the town's
          story, not a place for back-channel chatter, so there are no private
          conversations for us to read or hold.
        </p>

        <h2 className="mt-10 text-2xl font-semibold text-ink sm:text-3xl">
          Curation and moderation
        </h2>
        <p className="mt-4 leading-relaxed text-ink-muted">
          Curators read submissions before they are published, both to keep the
          record accurate and to make sure heritage and memorial content is handled
          with respect. This means the stewards of a section can see what you have
          submitted, including drafts awaiting review.
        </p>

        <h2 className="mt-10 text-2xl font-semibold text-ink sm:text-3xl">
          How long we keep things
        </h2>
        <p className="mt-4 leading-relaxed text-ink-muted">
          Cape Coast's story is meant to last, so published contributions are kept
          as part of the community record. If you would like your account closed or
          a contribution removed, you can ask, and we will do our best to honour it
          while preserving the integrity of the wider archive.
        </p>

        <h2 className="mt-10 text-2xl font-semibold text-ink sm:text-3xl">
          Reaching us
        </h2>
        <p className="mt-4 leading-relaxed text-ink-muted">
          If you have a question about your information or want something changed,
          reach the stewards through the app. We would rather hear from you than
          have you wonder.
        </p>
      </Section>
    </>
  );
}
