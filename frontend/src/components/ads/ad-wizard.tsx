import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { adErrorMessage, formatGhs, PLACEMENT_FORMAT } from "@/lib/ads";
import {
  campaignInput, clearDraft, errorTarget, loadDraft, quoteRequest, saveDraft, STEP_LABEL, stepErrors, stepsFor,
  type AdDraft, type DraftErrors, type StepContext, type StepId,
} from "@/lib/ad-draft";
import { useAdQuote } from "@/lib/use-ad-quote";
import { scrollBehavior } from "@/lib/use-media-query";
import type { AdRateCard, AdSponsor, Election } from "@/lib/types";
import { QuotePanel, QuoteSummary } from "./quote-panel";
import { SponsorStep } from "./sponsor-step";
import { CategoryStep, CreativeStep, PlacementStep, ReviewStep, ScheduleStep, StepHeading, TypeStep, type SetDraft } from "./wizard-steps";
import { buttonClass } from "./styles";

// The advertiser wizard (spec §3.7): a calm stepper with a live quote beside
// it. It saves a working copy in this browser, checks each step before moving
// on, and sends the campaign for review — payment comes only after approval.

function Stepper({ steps, current, onJump }: Readonly<{ steps: StepId[]; current: number; onJump: (i: number) => void }>) {
  const pct = Math.round(((current + 1) / steps.length) * 100);
  return (
    <nav aria-label="Booking steps" className="mb-8">
      <div className="flex items-baseline justify-between gap-3 sm:hidden">
        <p className="text-sm font-semibold text-ink">{STEP_LABEL[steps[current]]}</p>
        <p className="text-xs tabular-nums text-ink-faint">Step {current + 1} of {steps.length}</p>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-sand sm:hidden" aria-hidden>
        <div className="h-full w-full origin-left bg-gold-brand transition-transform duration-300 motion-reduce:transition-none" style={{ transform: `scaleX(${pct / 100})` }} />
      </div>
      <ol className="hidden flex-wrap gap-x-1 gap-y-2 sm:flex">
        {steps.map((s, i) => {
          const done = i < current;
          const here = i === current;
          const label = (
            <>
              <span
                aria-hidden
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-[0.7rem] font-bold tabular-nums transition-colors ${
                  here ? "bg-green text-on-green" : done ? "bg-green/[0.1] text-green-text" : "border border-sand text-ink-faint"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              <span className={here ? "font-semibold text-ink" : done ? "text-ink-muted" : "text-ink-faint"}>{STEP_LABEL[s]}</span>
            </>
          );
          return (
            <li key={s} className="flex items-center">
              {done ? (
                <button type="button" onClick={() => onJump(i)} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm transition-colors hover:bg-sand/60 active:translate-y-px">
                  {label}
                </button>
              ) : (
                <span aria-current={here ? "step" : undefined} className="flex min-h-11 items-center gap-2 px-2 text-sm">{label}</span>
              )}
              {i < steps.length - 1 && <span aria-hidden className="mx-0.5 h-px w-4 bg-sand" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function AdWizard({ card }: Readonly<{ card: AdRateCard }>) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<AdDraft>(() => loadDraft(card));
  const [index, setIndex] = useState(0);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [sending, setSending] = useState(false);
  const [sponsors, setSponsors] = useState<AdSponsor[]>([]);
  const [sponsorsState, setSponsorsState] = useState<"loading" | "ready" | "error">("loading");
  const [elections, setElections] = useState<Election[]>([]);
  const [electionsError, setElectionsError] = useState(false);
  const stepRef = useRef<HTMLElement>(null);

  // A political draft left over from when political ads were on starts again as commercial.
  const effective = card.politicalEnabled ? draft : { ...draft, political: false };
  const steps = stepsFor(effective, card);
  const at = Math.min(index, steps.length - 1);
  const step = steps[at];

  useEffect(() => {
    let alive = true;
    api.myAdSponsors()
      .then((list) => { if (alive) { setSponsors(list); setSponsorsState("ready"); } })
      .catch(() => { if (alive) setSponsorsState("error"); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!card.politicalEnabled) return;
    let alive = true;
    api.elections()
      .then((list) => { if (alive) setElections(list); })
      .catch(() => { if (alive) setElectionsError(true); });
    return () => { alive = false; };
  }, [card.politicalEnabled]);

  useEffect(() => { saveDraft(draft); }, [draft]);

  const placement = card.placements.find((p) => p.slug === effective.placement);
  const sponsor = sponsors.find((s) => s.id === effective.sponsorId);
  const election = elections.find((e) => e.id === effective.electionId);
  const categories = card.categories ?? [];
  const category = categories.find((c) => c.slug === effective.category);
  const ctx: StepContext = { card, sponsor, category, election };
  const quoteState = useAdQuote(quoteRequest(effective));

  const set: SetDraft = (key, value) => {
    setDraft((cur) => {
      const next = { ...cur, [key]: value };
      // Switching between commercial and political clears choices that no longer fit.
      if (key === "political" && value !== cur.political) {
        next.sponsorId = "";
        next.category = "";
      }
      return next;
    });
    setErrors((cur) => (cur[key] || cur.form ? { ...cur, [key]: undefined, form: undefined } : cur));
  };

  function focusStep() {
    // Move focus to the new step's heading region so keyboard and screen-reader users land there.
    requestAnimationFrame(() => {
      stepRef.current?.focus({ preventScroll: true });
      stepRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    });
  }

  function goTo(i: number) {
    setIndex(i);
    setErrors({});
    focusStep();
  }

  function next() {
    const found = stepErrors(step, effective, ctx);
    if (step === "schedule" && quoteState.error && !found.impressions) found.impressions = adErrorMessage(quoteState.error);
    if (Object.values(found).some(Boolean)) {
      setErrors(found);
      focusStep();
      return;
    }
    goTo(at + 1);
  }

  async function send() {
    for (const [i, s] of steps.entries()) {
      const found = stepErrors(s, effective, ctx);
      if (Object.values(found).some(Boolean)) {
        setIndex(i);
        setErrors(found);
        focusStep();
        return;
      }
    }
    setSending(true);
    try {
      const campaign = await api.createAd(campaignInput(effective));
      clearDraft();
      navigate(`/advertise/${campaign.id}`, { state: { submitted: true } });
    } catch (err) {
      const target = errorTarget(err, effective.placement ? PLACEMENT_FORMAT[effective.placement] : "card");
      const message = adErrorMessage(err, "We couldn't send the ad for review. Try again.");
      const i = steps.indexOf(target.step);
      if (i >= 0 && i !== at) setIndex(i);
      setErrors({ [i >= 0 ? target.field : "form"]: message });
      focusStep();
    } finally {
      setSending(false);
    }
  }

  const quoteProps = {
    card,
    draft: effective,
    placement,
    state: quoteState,
    onUseMax: (n: number) => set("impressions", Math.floor(n / card.impressionStep) * card.impressionStep),
  };
  const totalLabel = quoteState.quote && !quoteState.error ? formatGhs(quoteState.quote.price.totalPesewas) : "Priced when you send it";

  function body() {
    switch (step) {
      case "placement":
        return <PlacementStep draft={effective} set={set} errors={errors} card={card} />;
      case "type":
        return <TypeStep draft={effective} set={set} errors={errors} card={card} elections={elections} electionsError={electionsError} />;
      case "sponsor":
        return (
          <div>
            <StepHeading
              title={effective.political ? "Who is paying for this ad?" : "Who is the ad from?"}
              lede={effective.political ? "The verified legal name appears on the ad as “Paid for by”, and in the public Ad library." : "The sponsor's name appears on the ad as “Sponsored · name”."}
            />
            <SponsorStep
              kind={effective.political ? "political" : "commercial"}
              sponsors={sponsors}
              loading={sponsorsState === "loading"}
              loadError={sponsorsState === "error"}
              selectedId={effective.sponsorId}
              onSelect={(id) => {
                set("sponsorId", id);
                const chosen = sponsors.find((s) => s.id === id);
                if (chosen?.email && !draft.email) set("email", chosen.email);
              }}
              onSaved={(s) => {
                setSponsors((cur) => [s, ...cur.filter((x) => x.id !== s.id)]);
                if (s.email && !draft.email) set("email", s.email);
              }}
              error={errors.sponsorId}
            />
          </div>
        );
      case "category":
        return <CategoryStep draft={effective} set={set} errors={errors} card={card} sponsor={sponsor} />;
      case "creative":
        return <CreativeStep draft={effective} set={set} errors={errors} card={card} placement={placement} sponsor={sponsor} />;
      case "schedule":
        return <ScheduleStep draft={effective} set={set} errors={errors} card={card} election={election} quote={<QuotePanel {...quoteProps} />} />;
      case "submit":
        return (
          <ReviewStep
            draft={effective}
            set={set}
            errors={errors}
            card={card}
            placement={placement}
            sponsor={sponsor}
            election={election}
            categoryName={category?.name ?? effective.category}
            onEdit={(s) => goTo(Math.max(0, steps.indexOf(s)))}
            totalLabel={totalLabel}
          />
        );
    }
  }

  const last = at === steps.length - 1;
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-12">
      <div className="min-w-0">
        <Stepper steps={steps} current={at} onJump={goTo} />
        {step !== "schedule" && (
          <div className="mb-6 lg:hidden">
            <QuoteSummary {...quoteProps} />
          </div>
        )}
        <section ref={stepRef} tabIndex={-1} aria-label={STEP_LABEL[step]} className="scroll-mt-28 outline-none">
          {body()}
        </section>
        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-sand pt-6">
          {at > 0 ? (
            <button type="button" onClick={() => goTo(at - 1)} className={buttonClass("quiet")}>
              <span aria-hidden>←</span> Back
            </button>
          ) : <span />}
          {last ? (
            <button type="button" onClick={send} disabled={sending} className={buttonClass("primary")}>
              {sending ? "Sending…" : "Send for review"}
            </button>
          ) : (
            <button type="button" onClick={next} className={buttonClass("primary")}>
              Continue <span aria-hidden>→</span>
            </button>
          )}
        </div>
      </div>
      <aside aria-label="Price" className="hidden lg:block">
        <div className="sticky top-32 space-y-4">
          <QuotePanel {...quoteProps} />
          <p className="px-1 text-xs leading-relaxed text-ink-faint">
            Questions about an ad? Email hello@oguaaman.com or call +233 55 518 0048.
          </p>
        </div>
      </aside>
    </div>
  );
}
