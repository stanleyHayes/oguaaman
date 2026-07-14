import { useLocation, Link } from "react-router-dom";
import { PageHero } from "@/components/page-hero";
import { Container } from "@/components/ui";

interface Doc {
  kicker: string;
  title: string;
  lede: string;
  sections: { h: string; p: string[] }[];
}

const UPDATED = "Reviewed June 2026 — a community draft, to be finalised with counsel before public launch.";

const DOCS: Record<string, Doc> = {
  "/privacy": {
    kicker: "Privacy",
    title: "Privacy Policy",
    lede: "What we collect, why, and the control you keep over it.",
    sections: [
      { h: "Who we are", p: ["Oguaa is an independent community initiative for Cape Coast (Oguaa), Central Region, Ghana. This policy explains how we handle your information."] },
      { h: "What we collect", p: [
        "A phone number or email, used only to send your one-time sign-in code and to contact you about your contributions.",
        "Your date of birth, used once to confirm you are 18 or older. It is never shown to anyone and never published.",
        "A display name and any profile details you choose to add (quarter, Asafo, schools, bio).",
        "The listings, tributes, and reports you submit.",
      ] },
      { h: "What stays private", p: ["Your phone number and email are never shown on the public site. Your date of birth is never shown. We do not sell your data, and we do not run third-party advertising trackers."] },
      { h: "What is public", p: ["Approved listings, your display name, and the profile details you add are visible to others — that is the point of a community platform. You choose what to add, and you can ask a steward to remove it."] },
      { h: "Your choices", p: ["You can edit your profile, opt out of birthday broadcasts, and report or request removal of content about you. To close your account or request your data, contact a steward."] },
    ],
  },
  "/terms": {
    kicker: "Terms",
    title: "Terms of Use",
    lede: "The simple agreement between you and the Oguaa community.",
    sections: [
      { h: "Who can join", p: ["Oguaa is for people aged 18 and over. By signing in you confirm you meet that age. Accounts found to belong to minors will be removed."] },
      { h: "Your contributions", p: ["You keep ownership of what you contribute, and you grant Oguaa permission to display it on the platform. Only submit things that are real, local, and yours to share."] },
      { h: "Moderation", p: ["Every contribution is reviewed before it appears. Stewards may decline, unpublish, or hold contested content. Reasons are given on rejection, and you can resubmit."] },
      { h: "Memorials", p: ["Memorials honour real people who have passed. They receive heightened care. The family of the deceased may ask a steward to correct or remove a memorial at any time."] },
      { h: "Liability", p: ["Oguaa is a community vehicle offered as-is. We do our best to keep information accurate, but we cannot guarantee it. Use of the platform is at your own discretion."] },
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
              <h2 className="font-display text-2xl font-semibold text-ink">{s.h}</h2>
              {s.p.map((p) => <p key={p} className="mt-3 leading-relaxed text-ink-muted">{p}</p>)}
            </section>
          ))}
        </article>
        <p className="mt-12 border-t border-sand pt-6 text-sm italic text-ink-faint">{UPDATED}</p>
        <nav className="mt-6 flex flex-wrap gap-4 text-sm">
          <Link to="/privacy" className="text-teal-text hover:underline">Privacy</Link>
          <Link to="/terms" className="text-teal-text hover:underline">Terms</Link>
          <Link to="/acceptable-use" className="text-teal-text hover:underline">Acceptable Use</Link>
        </nav>
      </Container>
    </>
  );
}
