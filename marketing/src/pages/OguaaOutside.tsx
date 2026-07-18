import type { ReactNode } from "react";
import { PageHero } from "@/components/page-hero";
import { MarketScene } from "@/components/scenes";
import { Section, SectionHeading, Eyebrow, CTA, Pill } from "@/components/ui";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { useAgents, type Agent } from "@/lib/agents";
import { PORTAL_APP_URL } from "@/config";

// Where the app's directory + hiring lives — the marketing site only explains it.
const FIND_URL = `${PORTAL_APP_URL}/outside`;
const BECOME_URL = `${PORTAL_APP_URL}/outside/become-an-agent`;

/**
 * "Oguaa Outside" — a network of vetted, background-checked agents (people or
 * offices) who run business and errands for Cape Coasters beyond the town:
 * procurement, shipping, inspection-before-you-buy, travel companions and
 * official errands, held together by managed escrow. This page EXPLAINS the
 * idea; the directory and hiring live in the app. Verified agents are read LIVE
 * from /api/agents for a real featured teaser (the section hides when empty).
 */
export function Component() {
  const agents = useAgents();
  const featured = agents.slice(0, 3);

  return (
    <>
      <PageHero
        scene={MarketScene}
        kicker="Oguaa Outside"
        title="Trusted hands for your business, beyond the town."
        lede="Hire a vetted person or office to handle procurement, inspections, travel help and official errands beyond Cape Coast. Agree the work in the app; your payment stays in managed escrow until the job is delivered."
      >
        <div className="flex flex-wrap items-center gap-3">
          <CTA href={FIND_URL} variant="gold" external className="min-h-11">Find an agent <ArrowIcon /></CTA>
          <CTA href={BECOME_URL} variant="outline-dark" external className="min-h-11">Become an agent</CTA>
          {agents.length > 0 && (
            <Pill tone="on-dark" className="ml-1">
              <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden />
              <span aria-live="polite">
                {agents.length} verified {agents.length === 1 ? "agent" : "agents"} ready
              </span>
            </Pill>
          )}
        </div>
      </PageHero>

      {/* The idea. */}
      <Section tone="cream" size="wide">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:gap-16">
          <Reveal>
            <Eyebrow className="text-gold-text">The idea</Eyebrow>
            <h2 className="mt-3 max-w-xl text-3xl font-semibold sm:text-4xl">
              A person you can trust, where you cannot be.
            </h2>
            <div className="mt-4 h-[3px] w-14 rounded-full bg-gold-brand" />
          </Reveal>
          <Reveal className="border-t border-green/15 pt-7 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-0">
            <div className="space-y-4 leading-relaxed text-ink-muted">
              <p className="text-lg sm:text-xl">
                Every Cape Coaster knows the problem. The goods are in a Guangzhou
                market, the form must be filed in Accra, the car is parked in Kumasi
                — but the trip costs more than the errand. Too often, the only option
                is sending money to a stranger and hoping for the best.
              </p>
              <p>
                Oguaa Outside replaces that hope with a visible, accountable system:
                choose a vetted agent, agree the terms, and keep payment in <span className="font-semibold text-green-text">managed
                escrow</span> until they deliver.
              </p>
            </div>
            <dl className="mt-7 grid divide-y divide-green/10 overflow-hidden rounded-[var(--radius-card)] border border-green/15 bg-green/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {TRUST_SIGNALS.map((signal) => (
                <div key={signal.label} className="bg-paper px-4 py-4">
                  <dt className="text-[0.67rem] font-bold uppercase tracking-[0.14em] text-green-text">{signal.label}</dt>
                  <dd className="mt-1.5 text-sm leading-snug text-ink-muted">{signal.detail}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </Section>

      {/* Example services. */}
      <Section tone="paper">
        <SectionHeading
          kicker="What an agent can do"
          title="The errands that need a person on the ground."
          lede="These are the jobs Cape Coasters already pay for — now with a vetted agent and escrow behind every one."
        />
        <Stagger className="mt-10 grid gap-4 sm:mt-12 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          {SERVICES.map((s, i) => (
            <StaggerItem key={s.title} index={i} as="article" className="h-full">
              <ServiceCard service={s} />
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      {/* How it works — the escrow flow. */}
      <Section tone="deep">
        <SectionHeading
          onDark
          kicker="How it works"
          title="Your money moves only when the job is done."
          lede="Five steps, and escrow sits in the middle of all of them — so no one is paid on a promise."
        />
        <Stagger className="mt-10 grid gap-4 sm:mt-12 md:grid-cols-6 lg:grid-cols-10">
          {STEPS.map((step, i) => (
            <StaggerItem key={step.title} index={i} className={`h-full ${balancedFiveItemPlacement(i)}`}>
              <StepCard step={step} index={i} />
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      {/* The trust layer. */}
      <Section tone="sand">
        <SectionHeading
          kicker="The trust layer"
          title="Five checks stand behind every agent."
          lede="An agent cannot take a single job until they clear all of this — and one broken promise can end their standing in the network."
        />
        <Stagger className="mt-10 grid gap-4 sm:mt-12 sm:gap-5 md:grid-cols-6 lg:grid-cols-10">
          {TRUST.map((t, i) => (
            <StaggerItem key={t.title} index={i} as="article" className={`h-full ${balancedFiveItemPlacement(i)}`}>
              <TrustCard item={t} />
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      {/* Live featured agents — only when the backend has verified agents. */}
      {featured.length > 0 && (
        <Section tone="paper">
          <SectionHeading
            kicker="On the network now"
            title="A few of the agents already vetted and ready."
            lede="Live from the directory. Open the app to see everyone, filter by service and coverage, and hire."
          />
          <Stagger className={`mx-auto mt-10 grid gap-5 sm:mt-12 ${featuredGrid(featured.length)}`}>
            {featured.map((agent, i) => (
              <StaggerItem key={`${agent.displayName}-${i}`} index={i} as="article" className="h-full">
                <AgentCard agent={agent} />
              </StaggerItem>
            ))}
          </Stagger>
          <Reveal className="mt-10 flex justify-center">
            <CTA href={FIND_URL} variant="primary" external>See every agent</CTA>
          </Reveal>
        </Section>
      )}

      {/* The risk disclaimer — deliberately prominent. */}
      <Section tone="cream" size="narrow">
        <Reveal className="og-card og-card-accent-clay relative overflow-hidden p-6 sm:p-8 lg:grid lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:gap-12 lg:p-10">
          <div>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-clay/10 text-clay-text">
                <WarnIcon />
              </span>
              <p className="text-[0.72rem] font-bold uppercase tracking-[0.2em] text-clay-text">
                Engage at your own risk
              </p>
            </div>
            <h2 className="mt-5 text-2xl font-semibold sm:text-3xl">
              We reduce the risk. We cannot remove it.
            </h2>
          </div>
          <div className="mt-6 space-y-4 border-t border-clay/15 pt-6 leading-relaxed text-ink-muted lg:mt-0 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
            <p>
              Agents on Oguaa Outside are independent people and businesses — they
              are <span className="font-semibold text-ink">not employees or partners of Oguaa</span>. We
              vet them, hold your money in escrow and give you a public record to
              judge them by, but the relationship, and the risk, is yours.
            </p>
            <p>
              Protect yourself on every job: agree the fee and the terms in writing,
              keep your receipts and proof, and <span className="font-semibold text-green-text">always
              use escrow</span>. Never pay an agent directly or take the deal
              off-platform — money moved outside escrow is money we cannot help you
              recover. If something goes wrong, raise a dispute in the app and the
              funds freeze for review.
            </p>
          </div>
        </Reveal>
      </Section>

      {/* Closing CTA. */}
      <Section tone="green" className="!py-16 sm:!py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold sm:text-4xl">
            Get it done from wherever you are.
          </h2>
          <p className="mt-4 text-cream/85">
            Find a vetted agent for the job — or, if you are the trusted one who
            gets things done, put your name on the network.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <CTA href={FIND_URL} variant="gold" external>Find an agent</CTA>
            <CTA href={BECOME_URL} variant="outline-dark" external>Become an agent</CTA>
          </div>
        </div>
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------ content */

const TRUST_SIGNALS = [
  { label: "Vetted", detail: "Identity and a Cape Coast guarantor checked." },
  { label: "Protected", detail: "Payment held until delivery is confirmed." },
  { label: "Visible", detail: "Ratings and completed jobs stay on record." },
] as const;

interface Service {
  title: string;
  body: string;
  icon: ReactNode;
}

const SERVICES: Service[] = [
  {
    title: "Import from China",
    body: "Source and buy from Guangzhou, Yiwu or the online markets, then consolidate and ship it home — with an agent who has done it before.",
    icon: <ShipIcon />,
  },
  {
    title: "Buy from Accra & Kumasi",
    body: "Skip the trip. An agent buys from Makola, Kantamanto or Kejetia and forwards the goods down to Cape Coast.",
    icon: <BagIcon />,
  },
  {
    title: "Inspect before you pay",
    body: "Send someone to see the goods, the land or the car in person — and send you photos — before a single cedi moves.",
    icon: <EyeIcon />,
  },
  {
    title: "Travel together",
    body: "A vetted companion for an elder, a student or a first-time traveller — to the airport, up to Accra, or further abroad.",
    icon: <CompanionIcon />,
  },
  {
    title: "Official errands",
    body: "Documents filed, forms collected, certificates picked up, an office visited — the queue stood in on your behalf.",
    icon: <DocIcon />,
  },
  {
    title: "Name your own errand",
    body: "If it needs a trustworthy person on the ground somewhere you are not, an agent can quote you for it.",
    icon: <SparkIcon />,
  },
];

interface Step {
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    title: "Browse vetted agents",
    body: "Open the directory in the app and pick an agent by service, coverage area and rating.",
  },
  {
    title: "Send your request",
    body: "Describe the job and agree a fee up front. No surprises, and everything in writing.",
  },
  {
    title: "Escrow holds your money",
    body: "Your payment is held safely by Oguaa. The agent starts knowing the money is real — but cannot touch it yet.",
  },
  {
    title: "They deliver",
    body: "The agent does the work and shows proof — receipts, photos, tracking numbers — inside the app.",
  },
  {
    title: "You release the funds",
    body: "Happy with the job? Release the escrow and rate the agent. A dispute instead freezes the money for review.",
  },
];

interface Trust {
  title: string;
  body: string;
  icon: ReactNode;
}

const TRUST: Trust[] = [
  {
    title: "Verified ID",
    body: "Every agent is identity-checked and background-vetted before they can take a single job.",
    icon: <IdIcon />,
  },
  {
    title: "A Cape Coast guarantor",
    body: "Each agent names a known guarantor in town who vouches for them and shares the responsibility.",
    icon: <HandshakeIcon />,
  },
  {
    title: "A refundable bond",
    body: "Agents post a bond that can be drawn on to make you whole if a job goes wrong on their side.",
    icon: <ShieldIcon />,
  },
  {
    title: "Ratings & job history",
    body: "Every completed job, star rating and review is public — an agent's whole record travels with them.",
    icon: <StarIcon />,
  },
  {
    title: "A vetting officer",
    body: "A named officer approves each agent onto the network and can suspend anyone who breaks trust.",
    icon: <BadgeIcon />,
  },
];

/* --------------------------------------------------------------- components */

/** Keep five-item groups balanced at tablet widths (3 + 2) and in one even
 * row on wide screens. Literal classes keep Tailwind's static scanner happy. */
function balancedFiveItemPlacement(index: number) {
  return index < 3
    ? "md:col-span-2 lg:col-span-2"
    : "md:col-span-3 lg:col-span-2";
}

/** Do not leave a conspicuous empty third column when only one or two live
 * agents have cleared vetting. */
function featuredGrid(count: number) {
  if (count === 1) return "max-w-xl grid-cols-1";
  if (count === 2) return "max-w-4xl md:grid-cols-2";
  return "max-w-5xl md:grid-cols-2 lg:grid-cols-3";
}

function humanizeLabel(value: string) {
  const label = value.trim().replaceAll("-", " ");
  return label ? label[0].toUpperCase() + label.slice(1) : "";
}

function agentTypeLabel(type: string) {
  if (type === "individual") return "Independent";
  if (type === "office") return "Office";
  return humanizeLabel(type);
}

function ServiceCard({ service }: Readonly<{ service: Service }>) {
  return (
    <div className="og-card og-card-accent-teal og-card-interactive flex h-full flex-col p-5 sm:p-6">
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-teal/[0.1] text-teal-text">
        {service.icon}
      </span>
      <h3 className="mt-4 text-lg font-semibold leading-snug text-ink">{service.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">{service.body}</p>
    </div>
  );
}

function StepCard({ step, index }: Readonly<{ step: Step; index: number }>) {
  return (
    <div className="og-card og-card-dark og-card-accent-gold flex h-full flex-col p-5 sm:p-6">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gold/15 text-base font-bold tabular-nums text-gold">
        {index + 1}
      </span>
      <h3 className="mt-4 text-lg font-semibold leading-snug text-cream">{step.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-cream/75">{step.body}</p>
    </div>
  );
}

function TrustCard({ item }: Readonly<{ item: Trust }>) {
  return (
    <div className="og-card og-card-accent-green flex h-full flex-col p-5 sm:p-6">
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-green/[0.08] text-green-text">
        {item.icon}
      </span>
      <h3 className="mt-4 text-lg font-semibold leading-snug text-ink">{item.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">{item.body}</p>
    </div>
  );
}

function AgentCard({ agent }: Readonly<{ agent: Agent }>) {
  const rated = agent.ratingCount > 0;
  const services = agent.services.slice(0, 3);
  const coverage = agent.coverageAreas.slice(0, 3);
  return (
    <div className="og-card og-card-accent-gold og-card-interactive flex h-full flex-col p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold text-ink" title={agent.displayName}>{agent.displayName}</h3>
          {agent.headline && (
            <p className="mt-1 line-clamp-2 text-sm leading-snug text-ink-muted">{agent.headline}</p>
          )}
        </div>
        {agent.type && (
          <span className="shrink-0 rounded-full border border-gold-border/40 bg-gold/[0.12] px-2.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.12em] text-gold-text">
            {agentTypeLabel(agent.type)}
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {rated ? (
          <span className="inline-flex items-center gap-1 font-semibold text-gold-text">
            <StarIcon className="h-4 w-4" />
            {agent.ratingAvg.toFixed(1)}
            <span className="font-normal text-ink-faint">({agent.ratingCount})</span>
          </span>
        ) : (
          <span className="text-ink-faint">New agent</span>
        )}
        <span className="text-ink-muted">
          <span className="font-semibold tabular-nums text-green-text">{agent.jobsCompleted}</span>{" "}
          {agent.jobsCompleted === 1 ? "job done" : "jobs done"}
        </span>
      </div>

      {services.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {services.map((s) => (
            <span key={s} className="rounded-full border border-teal/30 bg-teal/[0.09] px-2.5 py-0.5 text-xs font-medium text-teal-text">
              {humanizeLabel(s)}
            </span>
          ))}
        </div>
      )}

      {coverage.length > 0 && (
        <p className="mt-4 border-t border-sand pt-3 text-xs leading-relaxed text-ink-faint">
          <span className="font-semibold text-ink-muted">Covers — </span>
          {coverage.map(humanizeLabel).join(" · ")}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- icons */
/* House style: 24×24 grid, 1.7 stroke, currentColor (mirrors SectionIcon). */

function Glyph({ children, className = "h-6 w-6" }: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {children}
    </svg>
  );
}

function ShipIcon() {
  return <Glyph><path d="M3 13h18l-1.6 5.2a2 2 0 0 1-1.9 1.4H6.5a2 2 0 0 1-1.9-1.4Z" /><path d="M5 13V8h9l3 5" /><path d="M9 8V5h4v3" /></Glyph>;
}
function BagIcon() {
  return <Glyph><path d="M6 8h12l-1 12H7Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></Glyph>;
}
function EyeIcon() {
  return <Glyph><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" /><circle cx="12" cy="12" r="2.6" /></Glyph>;
}
function CompanionIcon() {
  return <Glyph><circle cx="8" cy="8" r="2.6" /><path d="M3.5 19a4.5 4.5 0 0 1 9 0" /><circle cx="16.5" cy="9" r="2.2" /><path d="M14.5 19a4 4 0 0 1 6.5-3.1" /></Glyph>;
}
function DocIcon() {
  return <Glyph><path d="M6 3h8l4 4v14H6Z" /><path d="M14 3v4h4" /><path d="M9 12h6M9 16h4" /></Glyph>;
}
function SparkIcon() {
  return <Glyph><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z" /><path d="M18 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7Z" /></Glyph>;
}
function IdIcon() {
  return <Glyph><rect x="3" y="5" width="18" height="14" rx="2.5" /><circle cx="8.5" cy="11" r="2" /><path d="M5.5 16a3.2 3.2 0 0 1 6 0" /><path d="M14 10h4M14 13.5h4" /></Glyph>;
}
function HandshakeIcon() {
  return <Glyph><path d="m11 17-2 2-4-4 3-3h4l3 2" /><path d="m13 15 2 2 4-4-3-3h-3l-3 2" /><path d="M3 8h3M18 8h3" /></Glyph>;
}
function ShieldIcon() {
  return <Glyph><path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6Z" /><path d="m9 12 2 2 4-4" /></Glyph>;
}
function StarIcon({ className = "h-6 w-6" }: Readonly<{ className?: string }>) {
  return <Glyph className={className}><path d="M12 3.5l2.5 5.3 5.5.7-4 3.9 1 5.6-5-2.8-5 2.8 1-5.6-4-3.9 5.5-.7Z" /></Glyph>;
}
function BadgeIcon() {
  return <Glyph><path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6Z" /><circle cx="12" cy="10" r="2.4" /><path d="M9 14.5a4 4 0 0 1 6 0" /></Glyph>;
}
function WarnIcon() {
  return <Glyph><path d="M12 3.5 22 20H2Z" /><path d="M12 10v4.5" /><path d="M12 17.5v.5" /></Glyph>;
}
function ArrowIcon() {
  return <Glyph className="h-4 w-4"><path d="M5 12h14" /><path d="m14 7 5 5-5 5" /></Glyph>;
}
