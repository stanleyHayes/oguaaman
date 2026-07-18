import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  CircleHelp,
  Compass,
  Landmark,
  Lightbulb,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { ReadAloudControls } from "@/components/read-aloud";
import { Card } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import {
  HELP_CATEGORIES,
  adminHelpTopicsForRole,
  helpGuideToSpeech,
  type HelpCategory,
  type HelpTopic,
} from "@/lib/help-content";

const CATEGORY_META: Record<HelpCategory, { icon: LucideIcon; tone: string }> = {
  "Start here": { icon: Compass, tone: "bg-green/[0.09] text-green-text" },
  Moderation: { icon: ShieldCheck, tone: "bg-clay/[0.1] text-clay-text" },
  "Town operations": { icon: Landmark, tone: "bg-gold/[0.14] text-gold-text" },
  Community: { icon: UserRound, tone: "bg-teal/[0.1] text-teal-text" },
  Money: { icon: WalletCards, tone: "bg-green/[0.09] text-green-text" },
  Publishing: { icon: Sparkles, tone: "bg-ai/[0.09] text-ai" },
  Account: { icon: CircleHelp, tone: "bg-sand text-ink-muted" },
};

function topicMatches(topic: HelpTopic, query: string): boolean {
  if (!query) return true;
  return [topic.title, topic.kicker, topic.category, topic.summary, ...topic.keywords]
    .join(" ")
    .toLocaleLowerCase()
    .includes(query);
}

function TopicCard({ topic }: Readonly<{ topic: HelpTopic }>) {
  const meta = CATEGORY_META[topic.category];
  const Icon = meta.icon;
  return (
    <a
      href={`#guide-${topic.id}`}
      className="group flex min-h-40 flex-col rounded-2xl border border-sand bg-cream p-4 shadow-[var(--shadow-card)] transition-[border-color,transform,box-shadow] hover:-translate-y-0.5 hover:border-gold-border hover:shadow-[var(--shadow-lift)]"
    >
      <div className="flex items-start justify-between gap-3">
        <span className={`grid size-9 place-items-center rounded-xl ${meta.tone}`}>
          <Icon size={17} aria-hidden />
        </span>
        <ArrowRight size={15} className="mt-2 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-gold-text" aria-hidden />
      </div>
      <p className="mt-4 text-[0.6rem] font-bold uppercase tracking-[0.16em] text-gold-text">{topic.category}</p>
      <h3 className="mt-1 text-base font-semibold text-ink">{topic.title}</h3>
      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-muted">{topic.summary}</p>
    </a>
  );
}

function GuideSection({ topic }: Readonly<{ topic: HelpTopic }>) {
  const meta = CATEGORY_META[topic.category];
  const Icon = meta.icon;
  return (
    <Card className="scroll-mt-24 overflow-hidden shadow-[var(--shadow-card)]" >
      <article id={`guide-${topic.id}`} aria-labelledby={`guide-${topic.id}-title`} className="scroll-mt-24">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-sand bg-paper/65 px-5 py-5 sm:px-6">
          <div className="flex min-w-0 items-start gap-3.5">
            <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${meta.tone}`}>
              <Icon size={19} aria-hidden />
            </span>
            <div>
              <p className="text-[0.6rem] font-bold uppercase tracking-[0.16em] text-gold-text">{topic.kicker}</p>
              <h3 id={`guide-${topic.id}-title`} className="mt-1 text-xl font-semibold text-ink">{topic.title}</h3>
            </div>
          </div>
          {topic.path !== "/help" && (
            <Link
              to={topic.path}
              className="inline-flex items-center gap-1.5 rounded-full border border-sand bg-paper px-3.5 py-2 text-xs font-semibold text-ink-muted transition-colors hover:border-gold-border hover:text-ink"
            >
              Open page <ArrowRight size={13} aria-hidden />
            </Link>
          )}
        </header>
        <div className="p-5 sm:p-6">
          <p className="max-w-3xl text-sm leading-relaxed text-ink-muted">{topic.summary}</p>
          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(17rem,0.8fr)]">
            <section aria-label={`Steps for ${topic.title}`}>
              <h4 className="text-sm font-bold text-ink">How to use this page</h4>
              <ol className="mt-3 space-y-2.5">
                {topic.steps.map((step, index) => (
                  <li key={step} className="flex gap-3 text-sm leading-relaxed text-ink-muted">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-green text-[0.68rem] font-bold text-on-green">{index + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </section>
            <section aria-label={`Tips for ${topic.title}`} className="rounded-xl border border-gold-border/35 bg-gold/[0.08] p-4">
              <div className="flex items-center gap-2 text-gold-text">
                <Lightbulb size={16} aria-hidden />
                <h4 className="text-sm font-bold">Good to know</h4>
              </div>
              <ul className="mt-3 space-y-2.5">
                {topic.tips.map((tip) => (
                  <li key={tip} className="flex gap-2 text-xs leading-relaxed text-ink-muted">
                    <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-gold-text" aria-hidden />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </article>
    </Card>
  );
}

function GuideCategory({ category, children }: Readonly<{ category: HelpCategory; children: ReactNode }>) {
  const meta = CATEGORY_META[category];
  const Icon = meta.icon;
  return (
    <section aria-labelledby={`help-category-${category.replaceAll(" ", "-").toLocaleLowerCase()}`}>
      <div className="mb-4 flex items-center gap-3">
        <span className={`grid size-9 place-items-center rounded-xl ${meta.tone}`}>
          <Icon size={17} aria-hidden />
        </span>
        <div>
          <p className="text-[0.6rem] font-bold uppercase tracking-[0.16em] text-gold-text">Guide chapter</p>
          <h2 id={`help-category-${category.replaceAll(" ", "-").toLocaleLowerCase()}`} className="text-xl font-semibold text-ink">{category}</h2>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function Component() {
  const { member } = useAuth();
  const [term, setTerm] = useState("");
  const query = term.trim().toLocaleLowerCase();
  const allowedTopics = adminHelpTopicsForRole(member?.role);
  const visibleTopics = allowedTopics.filter((topic) => topicMatches(topic, query));
  const guideText = helpGuideToSpeech(visibleTopics);

  return (
    <div className="space-y-9">
      <section className="relative overflow-hidden rounded-3xl bg-green px-6 py-8 text-on-green shadow-[var(--shadow-lift)] sm:px-9 sm:py-10">
        <span aria-hidden className="absolute -right-6 -top-16 font-display text-[15rem] leading-none text-white/[0.04]">?</span>
        <div className="relative grid gap-7 lg:grid-cols-[minmax(0,1.2fr)_minmax(19rem,0.7fr)] lg:items-end">
          <div>
            <div className="flex items-center gap-2 text-gold">
              <BookOpen size={17} aria-hidden />
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em]">Oguaa admin handbook</p>
            </div>
            <h1 className="mt-3 max-w-2xl text-3xl font-semibold text-on-green sm:text-4xl">Help is part of every page.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-on-green/78 sm:text-base">
              Find a task, follow the short steps, or listen to the guide. The question-mark beside each page title opens the right topic wherever you are.
            </p>
          </div>
          <ReadAloudControls
            text={guideText}
            label={query ? "filtered admin guide" : "complete admin guide"}
            resetKey={`admin-guide-${query}`}
            className="rounded-2xl border border-white/15 bg-white/[0.08] p-4 [&_p]:text-on-green/65 [&_button+button]:border-white/20 [&_button+button]:bg-transparent [&_button+button]:text-on-green"
          />
        </div>
      </section>

      <section aria-labelledby="find-help-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow text-ai">Find your task</p>
            <h2 id="find-help-title" className="mt-1 text-2xl font-semibold text-ink">What do you need help with?</h2>
          </div>
          <label className="relative w-full sm:w-80">
            <span className="sr-only">Search the admin guide</span>
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden />
            <input
              type="search"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Try roles, tickets or publishing…"
              className="w-full rounded-full border border-sand bg-cream py-2.5 pl-10 pr-4 text-sm text-ink placeholder:text-ink-faint focus:border-gold-border focus:outline-none focus:ring-2 focus:ring-gold/20"
            />
          </label>
        </div>

        {visibleTopics.length > 0 ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleTopics.map((topic) => <TopicCard key={topic.id} topic={topic} />)}
          </div>
        ) : (
          <Card className="mt-5 flex flex-col items-center px-6 py-12 text-center">
            <CircleHelp size={28} className="text-gold-text" aria-hidden />
            <h3 className="mt-3 text-lg font-semibold text-ink">No guide topic matches that search</h3>
            <p className="mt-1 text-sm text-ink-muted">Try a page name or a task such as approve, role, payment or publish.</p>
            <button type="button" onClick={() => setTerm("")} className="mt-4 rounded-full bg-green px-4 py-2 text-sm font-semibold text-on-green">Clear search</button>
          </Card>
        )}
      </section>

      {HELP_CATEGORIES.map((category) => {
        const topics = visibleTopics.filter((topic) => topic.category === category);
        if (topics.length === 0) return null;
        return (
          <GuideCategory key={category} category={category}>
            {topics.map((topic) => <GuideSection key={topic.id} topic={topic} />)}
          </GuideCategory>
        );
      })}
    </div>
  );
}
