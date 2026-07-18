import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, BookOpen, ChevronDown, CircleHelp, Headphones, Lightbulb, ListChecks, Search } from "lucide-react";
import { SpeechControls } from "@/components/contextual-help";
import { useAuth } from "@/lib/auth";
import { canWriteNews } from "@/lib/creator";
import { CREATOR_HELP_TOPICS, creatorHelpSpeech } from "@/lib/help";

export function Component() {
  const { member } = useAuth();
  const [query, setQuery] = useState("");
  const availableTopics = useMemo(
    () => CREATOR_HELP_TOPICS.filter((topic) => topic.id !== "write" || (member ? canWriteNews(member) : false)),
    [member],
  );
  const filteredTopics = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return availableTopics;
    return availableTopics.filter((topic) => (
      [topic.title, topic.kicker, topic.overview, ...topic.steps, ...topic.tips]
        .join(" ")
        .toLowerCase()
        .includes(term)
    ));
  }, [availableTopics, query]);

  return (
    <div className="space-y-7">
      <section className="relative overflow-hidden rounded-3xl bg-green-900 px-6 py-8 text-on-green sm:px-9 sm:py-10" aria-labelledby="help-page-title">
        <span aria-hidden className="pointer-events-none absolute -right-6 -top-20 font-display text-[14rem] leading-none text-white/[0.04]">?</span>
        <div className="relative max-w-3xl">
          <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-gold">
            <BookOpen size={15} aria-hidden />
            Creator user guide
          </div>
          <h1 id="help-page-title" className="mt-4 max-w-2xl text-4xl font-semibold leading-tight !text-on-green sm:text-5xl">
            Make the workspace work for you.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-on-green/72">
            Find short, practical instructions for every part of your creator workspace. You can also select Listen to hear any topic read aloud.
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-xs font-semibold text-on-green/75">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-2"><CircleHelp size={14} aria-hidden />Page-by-page guidance</span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-2"><Headphones size={14} aria-hidden />Browser read-aloud</span>
          </div>
        </div>
      </section>

      <section className="grid gap-4 rounded-2xl border border-sand bg-cream p-5 sm:grid-cols-[1fr_auto] sm:items-center" aria-labelledby="find-help-title">
        <div>
          <p className="eyebrow text-gold-text">Find an answer</p>
          <h2 id="find-help-title" className="mt-1 text-2xl font-semibold text-ink">What would you like help with?</h2>
          <p className="mt-1 text-sm text-ink-muted">Search by a page name or task, such as promotion, password, listing, or payment.</p>
        </div>
        <div className="relative w-full sm:w-80">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search the guide…"
            aria-label="Search the creator user guide"
            className="min-h-11 w-full rounded-full border border-sand bg-paper py-2.5 pl-10 pr-4 text-sm text-ink placeholder:text-ink-faint focus:border-gold-border focus:outline-none focus:ring-2 focus:ring-gold/20"
          />
        </div>
      </section>

      <section aria-labelledby="guide-topics-title">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="eyebrow text-ai">Workspace handbook</p>
            <h2 id="guide-topics-title" className="mt-1 text-3xl font-semibold text-ink">Guide topics</h2>
          </div>
          <p aria-live="polite" className="text-sm text-ink-faint">
            {filteredTopics.length} {filteredTopics.length === 1 ? "topic" : "topics"}
          </p>
        </div>

        {filteredTopics.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-sand bg-cream px-6 py-12 text-center">
            <CircleHelp size={26} className="mx-auto text-gold-text" aria-hidden />
            <h3 className="mt-3 text-lg font-semibold text-ink">No matching guide topic</h3>
            <p className="mt-1 text-sm text-ink-muted">Try a broader word, or clear the search to browse every topic.</p>
            <button type="button" onClick={() => setQuery("")} className="mt-4 rounded-full border border-gold-border/45 px-4 py-2 text-sm font-semibold text-gold-text hover:bg-gold/[0.1]">Clear search</button>
          </div>
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {filteredTopics.map((topic, index) => (
              <article key={topic.id} id={`guide-${topic.id}`} className="overflow-hidden rounded-2xl border border-sand bg-cream shadow-sm">
                <div className="border-b border-sand p-5 sm:p-6">
                  <div className="flex items-start gap-4">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-green text-sm font-bold text-on-green" aria-hidden>{String(index + 1).padStart(2, "0")}</span>
                    <div className="min-w-0">
                      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-gold-text">{topic.kicker}</p>
                      <h2 className="mt-1 text-2xl font-semibold text-ink">{topic.title}</h2>
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-ink-muted">{topic.overview}</p>
                  <SpeechControls text={creatorHelpSpeech(topic)} label={`${topic.title} guide`} className="mt-4" />
                </div>

                <details className="group">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-sm font-semibold text-ink marker:hidden sm:px-6">
                    <span>Show steps and tips</span>
                    <ChevronDown size={17} className="text-ink-faint transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <div className="space-y-5 border-t border-sand bg-paper px-5 py-5 sm:px-6">
                    <div>
                      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.13em] text-green-text"><ListChecks size={15} aria-hidden />What to do</h3>
                      <ol className="mt-3 space-y-2.5">
                        {topic.steps.map((step, stepIndex) => (
                          <li key={step} className="flex gap-3 text-sm leading-6 text-ink-muted">
                            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-green/[0.1] text-xs font-bold text-green-text">{stepIndex + 1}</span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                    <div className="rounded-xl border border-gold-border/30 bg-gold/[0.08] p-4">
                      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.13em] text-gold-text"><Lightbulb size={15} aria-hidden />Useful to know</h3>
                      <ul className="mt-2 space-y-1.5 text-sm leading-6 text-ink-muted">
                        {topic.tips.map((tip) => <li key={tip} className="flex gap-2"><span aria-hidden className="text-gold-text">•</span><span>{tip}</span></li>)}
                      </ul>
                    </div>
                  </div>
                </details>

                {topic.route && topic.routeLabel && (
                  <div className="border-t border-sand px-5 py-3 sm:px-6">
                    <Link to={topic.route} className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-green-text transition-colors hover:text-gold-text">
                      {topic.routeLabel}
                      <ArrowUpRight size={15} aria-hidden />
                    </Link>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <aside className="rounded-2xl border border-ai-line bg-ai-tint p-5 sm:flex sm:items-center sm:justify-between sm:gap-6" aria-label="Contextual help reminder">
        <div>
          <p className="text-sm font-semibold text-ai">Help follows you</p>
          <p className="mt-1 text-sm leading-6 text-ink-muted">On any creator page, select the question-mark icon beside the page title for instructions specific to that screen.</p>
        </div>
        <CircleHelp size={30} className="mt-4 shrink-0 text-ai sm:mt-0" aria-hidden />
      </aside>
    </div>
  );
}
