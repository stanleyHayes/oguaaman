import { useLocation, Link } from "react-router-dom";
import { PageHero } from "@/components/page-hero";
import { Container } from "@/components/ui";

interface Doc {
  kicker: string;
  title: string;
  lede: string;
  sections: { h: string; p: string[] }[];
}

const UPDATED = "Reviewed July 2026 — community policy draft pending final counsel sign-off.";

const DOCS: Record<string, Doc> = {
  "/privacy": {
    kicker: "Privacy",
    title: "Privacy Policy",
    lede: "What we collect, why, and the control you keep over it.",
    sections: [
      { h: "Who we are", p: ["Oguaa is an independent community initiative for Cape Coast (Oguaa), Central Region, Ghana. This policy explains how we handle your information."] },
      { h: "What we collect", p: [
        "A phone number or email, used to sign you in and to contact you about your contributions. Your password is stored only as a salted hash.",
        "Your date of birth, used once to confirm you are 18 or older. It is never shown to anyone and never published.",
        "A display name and any profile details you choose to add (quarter, Asafo, schools, bio).",
        "The listings, tributes, and reports you submit.",
      ] },
      { h: "What stays private", p: ["Your phone number and email are never shown on the public site. Your date of birth is never shown. We do not sell your data, and we do not run third-party advertising trackers."] },
      { h: "What is public", p: ["Approved listings, your display name, and the profile details you add are visible to others — that is the point of a community platform. You choose what to add, and you can ask a steward to remove it."] },
      { h: "Your choices", p: ["You can edit your profile, opt out of birthday broadcasts, and report or request removal of content about you.", "You can export your account data and request account erasure from your profile controls (Act 843 rights flow). If you cannot access your account, contact a steward for manual support."] },
      { h: "Retention and deletion", p: ["We retain account and moderation records only as long as needed to operate the service safely, comply with legal duties, and preserve auditability.", "When an account is erased, personal identifiers are anonymised in place and private identifiers are removed from unique indexes."] },
      { h: "Payments and processors", p: ["Paid features (tickets, subscriptions, promotions, project pledges) are processed by Paystack. Oguaa stores only transaction references and status metadata needed for receipts, support and reconciliation."] },
    ],
  },
  "/terms": {
    kicker: "Terms",
    title: "Terms of Use",
    lede: "The simple agreement between you and the Oguaa community.",
    sections: [
      { h: "Who can join", p: ["Oguaa is for people aged 18 and over. By signing in you confirm you meet that age. Accounts found to belong to minors will be removed."] },
      { h: "Your contributions", p: ["You keep ownership of what you contribute, and you grant Oguaa permission to display it on the platform. Only submit things that are real, local, and yours to share."] },
      { h: "Moderation", p: ["Most contributions are reviewed before they appear. Time-critical safety and lost-and-found notices are published immediately, then reviewed after publication.", "Stewards may decline, unpublish, or hold contested content. Reasons are given on rejection, and you can resubmit."] },
      { h: "Memorials", p: ["Memorials honour real people who have passed. They receive heightened care. The family of the deceased may ask a steward to correct or remove a memorial at any time."] },
      { h: "Liability", p: ["Oguaa is a community vehicle offered as-is. We do our best to keep information accurate, but we cannot guarantee it. Use of the platform is at your own discretion."] },
      { h: "Financial and opportunity notices", p: ["Investment and opportunity listings are informational notices unless explicitly stated by the issuer. Oguaa is not a broker, custodian, lender, or investment adviser.", "Users are responsible for due diligence and independent verification before any financial commitment."] },
    ],
  },
  "/acceptable-use": {
    kicker: "Community standards",
    title: "Acceptable Use",
    lede: "How we keep Oguaa a place of pride and reverence.",
    sections: [
      { h: "Be real and be local", p: ["Contribute genuine people, places, and stories of Cape Coast. Do not invent businesses, impersonate people or institutions, or claim figures who are not of Oguaa."] },
      { h: "Be respectful", p: ["No harassment, hate, or content that demeans a person or group. Treat memorials and the bereaved with care. Honour the dignity the town is known for."] },
      { h: "No adjudicating disputes", p: ["Oguaa does not settle contested chieftaincy, titles, or leadership claims. Such claims are held and referred to the recognised traditional and civic authorities."] },
      { h: "Reporting", p: ["If you see something wrong, use the Report link on any listing. Reports go to a steward. Contested or sensitive content is held for review — never auto-removed."] },
      { h: "Youth protection", p: ["No private adult-to-minor contact is brokered through Oguaa. Mentorship features are programme-based notices only, with safeguards and visible policy links."] },
    ],
  },
  "/safeguarding": {
    kicker: "Safeguarding",
    title: "Youth & Guardian Consent Policy",
    lede: "How mentorship and youth-facing opportunities are kept safe.",
    sections: [
      { h: "Scope", p: ["This policy applies to mentorship, training and youth-facing opportunity listings on Oguaa. It governs listings, moderation and the minimum information required before publication."] },
      { h: "No direct matching chats on-platform", p: ["Oguaa does not run private mentor-student messaging, anonymous DMs, or one-click direct pairing. Listings are public programme notices that route users to the issuer's official channel."] },
      { h: "Programme-level safeguards", p: ["Every mentorship listing must include a publicly accessible safeguarding policy URL. Listings without one are rejected at submission.", "Programmes involving under-18 participants must explicitly require guardian consent before participation."] },
      { h: "Guardian consent", p: ["Where a mentorship programme includes minors, the listing must mark guardian consent as required and clearly communicate the issuer's consent process.", "Issuers are responsible for collecting and retaining consent records; Oguaa does not store child identity documents."] },
      { h: "Moderation and enforcement", p: ["Curators may hold, reject or unpublish mentorship listings that omit safeguarding controls, present unsafe contact patterns, or appear to circumvent guardian consent requirements.", "Repeated or high-risk violations can lead to account suspension and referral to relevant authorities where required."] },
    ],
  },
};

export function Component() {
  const { pathname } = useLocation();
  const doc = DOCS[pathname] ?? DOCS["/privacy"];
  return (
    <>
      <PageHero tone="green" kicker={doc.kicker} title={doc.title} symbol="gye-nyame" lede={doc.lede} />
      <Container size="prose" className="py-12">
        <article className="space-y-8">
          {doc.sections.map((s) => (
            <section key={s.h}>
              <h2 className="text-2xl font-semibold text-ink">{s.h}</h2>
              {s.p.map((p) => <p key={p} className="mt-3 leading-relaxed text-ink-muted">{p}</p>)}
            </section>
          ))}
        </article>
        <p className="mt-12 border-t border-sand pt-6 text-sm italic text-ink-faint">{UPDATED}</p>
        <nav className="mt-6 flex flex-wrap gap-4 text-sm">
          <Link to="/privacy" className="text-teal-text hover:underline">Privacy Policy</Link>
          <Link to="/terms" className="text-teal-text hover:underline">Terms of Use</Link>
          <Link to="/acceptable-use" className="text-teal-text hover:underline">Acceptable Use</Link>
          <Link to="/safeguarding" className="text-teal-text hover:underline">Safeguarding Policy</Link>
        </nav>
      </Container>
    </>
  );
}
