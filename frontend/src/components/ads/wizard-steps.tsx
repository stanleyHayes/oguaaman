import { useId, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { DatePicker } from "@/components/date-picker";
import { ImageUpload } from "@/components/image-upload";
import { PrivateDocumentUpload } from "@/components/private-document-upload";
import { AdFrame } from "@/components/ad-slot";
import {
  addDays, AD_LIMITS, BLOCKED_CATEGORY_NAMES, CATEGORY_REGULATORS, daysInclusive, FALLBACK_CATEGORIES, formatCount, formatGhs,
  FORMAT_SIZES, needsFda, needsLicence, PLACEMENT_FORMAT, PLACEMENT_WHERE, REGULATOR_LABEL, shortDate, todayAccra,
} from "@/lib/ads";
import { latestPoliticalEnd, previewAd, type AdDraft, type DraftErrors } from "@/lib/ad-draft";
import { LEGAL } from "@/lib/legal";
import type { AdRateCard, AdRateCardPlacement, AdSponsor, Election } from "@/lib/types";
import { CheckRow, ChoiceCard, Field } from "./fields";
import { inputClass } from "./styles";
import { SlotDiagram } from "./slot-diagram";

// The wizard's steps, one component each. They are controlled: the wizard owns
// the draft and passes `set` for changes and `errors` for inline messages.

export type SetDraft = <K extends keyof AdDraft>(key: K, value: AdDraft[K]) => void;

type StepProps = Readonly<{
  draft: AdDraft;
  set: SetDraft;
  errors: DraftErrors;
  card: AdRateCard;
}>;

/** A section heading inside a step. */
export function StepHeading({ title, lede }: Readonly<{ title: string; lede?: ReactNode }>) {
  return (
    <div className="mb-6">
      <h2 className="text-2xl font-semibold tracking-[-0.015em] text-ink sm:text-[1.7rem]">{title}</h2>
      {lede && <p className="mt-2 max-w-[60ch] text-pretty leading-relaxed text-ink-muted">{lede}</p>}
    </div>
  );
}

function FormError({ message }: Readonly<{ message?: string }>) {
  if (!message) return null;
  return <p role="alert" className="mt-4 rounded-lg border border-clay/30 bg-clay/[0.06] px-3.5 py-2.5 text-sm text-clay-text">{message}</p>;
}

// ── 1. Placement ─────────────────────────────────────────────────────────────

export function PlacementStep({ draft, set, errors, card }: StepProps) {
  return (
    <div>
      <StepHeading title="Where should your ad run?" lede="Each placement has one published price per 1,000 viewable impressions. You only pay for views where at least half the ad was on screen for a second." />
      <div role="radiogroup" aria-label="Placement" className="grid gap-4 sm:grid-cols-2">
        {card.placements.map((p) => (
          <ChoiceCard
            key={p.slug}
            name="placement"
            checked={draft.placement === p.slug}
            onChange={() => set("placement", p.slug)}
            disabled={!p.active}
            title={p.name}
            meta={
              <span className="tabular-nums">
                {p.active ? <>{formatGhs(draft.political ? p.politicalCpmPesewas : p.cpmPesewas)} per 1,000 views</> : "Not available yet"}
              </span>
            }
          >
            <span className="mt-4 block overflow-hidden rounded-lg">
              <SlotDiagram placement={p.slug} />
            </span>
            <span className="mt-3 block text-pretty text-xs leading-relaxed text-ink-muted">{PLACEMENT_WHERE[p.slug] ?? p.description}</span>
            <span className="mt-1 block text-xs text-ink-faint">Image: {FORMAT_SIZES[p.format]}</span>
          </ChoiceCard>
        ))}
      </div>
      <FormError message={errors.placement} />
    </div>
  );
}

// ── 2. Commercial or political ───────────────────────────────────────────────

export function TypeStep({ draft, set, errors, elections, electionsError }: StepProps & Readonly<{ elections: Election[]; electionsError: boolean }>) {
  const uid = useId();
  return (
    <div>
      <StepHeading title="What kind of ad is it?" lede="Political and election ads follow stricter rules. They are checked by two reviewers and published in the Ad library with the amount paid." />
      <div role="radiogroup" aria-label="Ad type" className="grid gap-4 sm:grid-cols-2">
        <ChoiceCard name="kind" checked={!draft.political} onChange={() => set("political", false)} title="A business or community ad" meta="Shops, services, events, schools, jobs, property and causes." />
        <ChoiceCard name="kind" checked={draft.political} onChange={() => set("political", true)} title="A political or election ad" meta="Parties, candidates, campaigns and political issues." />
      </div>

      {draft.political && (
        <div className="mt-6 space-y-5 rounded-[var(--radius-card)] border border-gold-border/40 bg-gold/[0.05] p-4 sm:p-5">
          <fieldset>
            <legend className="text-sm font-semibold text-ink">Is it about an election?</legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {(["election", "issue"] as const).map((t) => (
                <label key={t} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-teal/50 ${draft.politicalType === t ? "border-green bg-green/[0.06] font-semibold text-ink" : "border-sand bg-paper text-ink-muted hover:border-green/40"}`}>
                  <input type="radio" name="political-type" className="sr-only" checked={draft.politicalType === t} onChange={() => set("politicalType", t)} />
                  {t === "election" ? "Yes, a coming election" : "No, a political issue"}
                </label>
              ))}
            </div>
          </fieldset>
          {draft.politicalType === "election" ? (
            <Field id={`${uid}-election`} label="Election" required error={errors.electionId ?? (electionsError ? "We couldn't load the election calendar. Refresh to try again." : null)}
              hint="Ads must end before the blackout, which starts at 00:00 the day before the poll.">
              <select id={`${uid}-election`} value={draft.electionId} onChange={(e) => set("electionId", e.target.value)} className={inputClass(Boolean(errors.electionId))}>
                <option value="">{elections.length ? "Choose an election" : "No upcoming elections are listed"}</option>
                {elections.map((el) => (
                  <option key={el.id} value={el.id}>{el.name} · poll {shortDate(el.pollDate)}</option>
                ))}
              </select>
            </Field>
          ) : (
            <p className="text-sm leading-relaxed text-ink-muted">Issue ads can run at any time except during an election blackout.</p>
          )}
          <ul className="space-y-1.5 text-sm text-ink-muted">
            <li>The ad shows &ldquo;Paid for by&rdquo; and the sponsor&rsquo;s verified legal name.</li>
            <li>The same political rate applies to every party and candidate.</li>
            <li>No claims about results before the Electoral Commission declares them, and no false statements about candidates.</li>
          </ul>
        </div>
      )}
      <FormError message={errors.form} />
    </div>
  );
}

// ── 4. Category and compliance ───────────────────────────────────────────────

export function CategoryStep({ draft, set, errors, card, sponsor }: StepProps & Readonly<{ sponsor?: AdSponsor }>) {
  const uid = useId();
  const categories = (card.categories?.length ? card.categories : FALLBACK_CATEGORIES).filter(
    (c) => c.slug !== "political" && !card.blockedCategories.includes(c.slug),
  );
  const cat = categories.find((c) => c.slug === draft.category);
  const fda = draft.category ? needsFda(draft.category, cat) : false;
  const licence = draft.category ? needsLicence(draft.category, cat) : false;
  const regulators = CATEGORY_REGULATORS[draft.category] ?? ["SEC", "BoG", "NIC"];
  const blocked = card.blockedCategories.map((b) => BLOCKED_CATEGORY_NAMES[b] ?? b);

  const text = (k: "fdaRegistrationNo" | "fdaApprovalRef" | "licenceNumber", label: string, placeholder?: string) => (
    <Field id={`${uid}-${k}`} label={label} required error={errors[k]}>
      <input id={`${uid}-${k}`} value={draft[k]} onChange={(e) => set(k, e.target.value)} placeholder={placeholder} aria-invalid={Boolean(errors[k])} className={inputClass(Boolean(errors[k]))} />
    </Field>
  );

  return (
    <div>
      <StepHeading title="What is the ad for?" lede="Some products need a licence or an approval before they can be advertised in Ghana. We ask for those here so the review is quick." />
      <Field id={`${uid}-category`} label="Category" required error={errors.category}>
        <select id={`${uid}-category`} value={draft.category} onChange={(e) => set("category", e.target.value)} className={inputClass(Boolean(errors.category))}>
          <option value="">Choose a category</option>
          {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
      </Field>
      {draft.category === "government_public_service" && sponsor?.entityType !== "government" && !errors.category && (
        <p className="mt-2 text-xs text-gold-text">Public-service ads need a government sponsor.</p>
      )}

      {fda && (
        <fieldset className="mt-6 rounded-[var(--radius-card)] border border-sand bg-cream/50 p-4 sm:p-5">
          <legend className="px-1 text-sm font-semibold text-ink">Food and Drugs Authority approval</legend>
          <p className="mb-4 max-w-[60ch] text-sm text-ink-muted">Food, drinks, medicines, herbal products and cosmetics need FDA registration and an approved advertisement. Ads may not claim to cure or treat illness.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {text("fdaRegistrationNo", "FDA registration number", "FDA/FD.12-3456")}
            {text("fdaApprovalRef", "Advertisement approval reference")}
            <Field id={`${uid}-fdaexp`} label="Approval expires on" required error={errors.fdaApprovalExpiresOn} hint="Your campaign must end on or before this date.">
              <DatePicker id={`${uid}-fdaexp`} value={draft.fdaApprovalExpiresOn} onChange={(v) => set("fdaApprovalExpiresOn", v)} min={todayAccra()} className="w-full" placeholder="Pick the expiry date" />
            </Field>
            <div className="sm:col-span-2">
              <PrivateDocumentUpload value={draft.approvalUploadId} onChange={(ref) => set("approvalUploadId", ref)} purpose="document" label="FDA approval letter" hint="Stored encrypted for the reviewer." required />
              {errors.approvalUploadId && <p role="alert" className="mt-1 text-xs text-clay-text">{errors.approvalUploadId}</p>}
            </div>
          </div>
        </fieldset>
      )}

      {licence && (
        <fieldset className="mt-6 rounded-[var(--radius-card)] border border-sand bg-cream/50 p-4 sm:p-5">
          <legend className="px-1 text-sm font-semibold text-ink">Licence</legend>
          <p className="mb-4 max-w-[60ch] text-sm text-ink-muted">The reviewer checks your licence on the regulator&rsquo;s public register. Ads may not promise guaranteed returns.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id={`${uid}-reg`} label="Regulator" required error={errors.regulator}>
              <select id={`${uid}-reg`} value={draft.regulator} onChange={(e) => set("regulator", e.target.value)} className={inputClass(Boolean(errors.regulator))}>
                <option value="">Choose the regulator</option>
                {regulators.map((r) => <option key={r} value={r}>{REGULATOR_LABEL[r] ?? r}</option>)}
              </select>
            </Field>
            {text("licenceNumber", "Licence number")}
          </div>
        </fieldset>
      )}

      {blocked.length > 0 && (
        <p className="mt-6 max-w-[62ch] text-pretty text-xs leading-relaxed text-ink-faint">
          Oguaa does not accept ads for: {blocked.join(", ")}. <Link to={LEGAL.advertising} className="font-semibold text-teal-text hover:underline">Read the Advertising Policy</Link>.
        </p>
      )}
      <FormError message={errors.form} />
    </div>
  );
}

// ── 5. Creative ──────────────────────────────────────────────────────────────

/** Rejects images smaller than the slot (uploads should be at least the listed size). */
function minSize(w: number, h: number) {
  return async (file: File): Promise<string | null> => {
    try {
      const bmp = await createImageBitmap(file);
      const ok = bmp.width >= w && bmp.height >= h;
      bmp.close();
      return ok ? null : `This image is ${bmp.width} × ${bmp.height}. Use one at least ${w} × ${h}.`;
    } catch {
      return null; // The server checks again; never block on a browser quirk.
    }
  };
}

const TWO_MB = 2 * 1024 * 1024;

/** The exact slot, drawn with the draft creative. */
export function SlotPreview({ draft, sponsor, placement }: Readonly<{ draft: AdDraft; sponsor?: AdSponsor; placement?: AdRateCardPlacement }>) {
  const ad = previewAd(draft, sponsor);
  const why = placement?.description ?? "this page";
  if (ad.format === "banner") {
    return (
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-xs font-medium text-ink-faint">On a computer</p>
          <AdFrame ad={ad} why={why} preview bannerVariant="desktop" />
        </div>
        <div className="max-w-[22rem]">
          <p className="mb-2 text-xs font-medium text-ink-faint">On a phone</p>
          <AdFrame ad={ad} why={why} preview bannerVariant="mobile" />
        </div>
      </div>
    );
  }
  return <AdFrame ad={ad} why={why} preview className={ad.format === "rect" ? "max-w-[20rem]" : ""} />;
}

export function CreativeStep({ draft, set, errors, placement, sponsor }: StepProps & Readonly<{ placement?: AdRateCardPlacement; sponsor?: AdSponsor }>) {
  const uid = useId();
  const format = draft.placement ? PLACEMENT_FORMAT[draft.placement] : "card";
  return (
    <div>
      <StepHeading
        title="Your ad"
        lede="Upload your own artwork. Keep it honest and clear: no news-style words such as “Breaking”, and prices in cedis only. Oguaa labels every ad so it is never mistaken for news."
      />
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <div className="space-y-5">
          {format === "banner" ? (
            <>
              <ImageUpload value={draft.imageUrlDesktop} onChange={(u) => set("imageUrlDesktop", u)} label="Desktop banner (728 × 90)" hint="At least 728 × 90 pixels, up to 2 MB." allowUrl={false} maxBytes={TWO_MB} validate={minSize(728, 90)} error={errors.imageUrlDesktop} />
              <ImageUpload value={draft.imageUrlMobile} onChange={(u) => set("imageUrlMobile", u)} label="Phone banner (320 × 100)" hint="At least 320 × 100 pixels, up to 2 MB." allowUrl={false} maxBytes={TWO_MB} validate={minSize(320, 100)} error={errors.imageUrlMobile} />
            </>
          ) : (
            <ImageUpload
              value={draft.imageUrl}
              onChange={(u) => set("imageUrl", u)}
              label={format === "card" ? "Image (1200 × 628)" : "Image (300 × 250)"}
              hint={format === "card" ? "At least 1200 × 628 pixels, up to 2 MB." : "At least 300 × 250 pixels, up to 2 MB."}
              allowUrl={false}
              maxBytes={TWO_MB}
              validate={format === "card" ? minSize(1200, 628) : minSize(300, 250)}
              error={errors.imageUrl}
            />
          )}

          {format === "card" && (
            <>
              <Field id={`${uid}-headline`} label="Headline" required error={errors.headline} count={draft.headline.length} max={AD_LIMITS.headline}>
                <input id={`${uid}-headline`} value={draft.headline} onChange={(e) => set("headline", e.target.value)} placeholder="Fresh kenkey and fried fish, every evening" aria-invalid={Boolean(errors.headline)} className={inputClass(Boolean(errors.headline))} />
              </Field>
              <Field id={`${uid}-body`} label="Supporting text" error={errors.body} count={draft.body.length} max={AD_LIMITS.body} hint="Optional.">
                <textarea id={`${uid}-body`} rows={2} value={draft.body} onChange={(e) => set("body", e.target.value)} placeholder="Open 5pm to 10pm at Kotokuraba Market, stall 14." aria-invalid={Boolean(errors.body)} className={`${inputClass(Boolean(errors.body))} resize-none`} />
              </Field>
            </>
          )}

          <Field id={`${uid}-alt`} label="Image description" required error={errors.alt} count={draft.alt.length} max={AD_LIMITS.alt} hint="Read aloud to people who can't see the image. Describe what it shows.">
            <input id={`${uid}-alt`} value={draft.alt} onChange={(e) => set("alt", e.target.value)} placeholder="A plate of kenkey with fried fish and pepper sauce" aria-invalid={Boolean(errors.alt)} className={inputClass(Boolean(errors.alt))} />
          </Field>

          <Field id={`${uid}-landing`} label="Landing page" required error={errors.landingUrl} hint="Where the ad leads. It must match what the ad offers.">
            <input id={`${uid}-landing`} type="url" inputMode="url" value={draft.landingUrl} onChange={(e) => set("landingUrl", e.target.value)} placeholder="https://kotokurabatraders.com" aria-invalid={Boolean(errors.landingUrl)} className={inputClass(Boolean(errors.landingUrl))} />
          </Field>

          <CheckRow checked={draft.containsSyntheticMedia} onChange={(v) => set("containsSyntheticMedia", v)}>
            The ad contains AI-generated or digitally altered images of people, places or events. Oguaa adds the line &ldquo;Contains AI-generated or altered media&rdquo; under it.
          </CheckRow>
          <FormError message={errors.form} />
        </div>

        <aside aria-label="Preview" className="xl:sticky xl:top-32 xl:self-start">
          <p className="eyebrow mb-3">Exactly as it runs</p>
          <div className="rounded-[var(--radius-card)] border border-dashed border-sand bg-paper p-3 sm:p-4">
            <SlotPreview draft={draft} sponsor={sponsor} placement={placement} />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-faint">The &ldquo;{draft.political ? "Political ad" : "Ad"}&rdquo; flag, the &ldquo;Advertisement&rdquo; label, the sponsor line and the &ldquo;Why am I seeing this ad?&rdquo; button are added by Oguaa and can&rsquo;t be removed.</p>
        </aside>
      </div>
    </div>
  );
}

// ── 6. Dates and impressions ─────────────────────────────────────────────────

function presets(card: AdRateCard): number[] {
  const wanted = [5_000, 10_000, 25_000, 50_000, 100_000];
  return wanted.filter((n) => n >= card.minImpressions && n <= card.maxImpressionsPerOrder && n % card.impressionStep === 0);
}

export function ScheduleStep({ draft, set, errors, card, election, quote }: StepProps & Readonly<{ election?: Election; quote: ReactNode }>) {
  const uid = useId();
  const earliest = addDays(todayAccra(), card.minLeadDays);
  const politicalStart = draft.political && draft.politicalType === "election" && election?.politicalAdsFrom && election.politicalAdsFrom > earliest ? election.politicalAdsFrom : earliest;
  const latestByLength = draft.startDate ? addDays(draft.startDate, card.maxCampaignDays - 1) : undefined;
  const latestPolitical = draft.political && draft.politicalType === "election" ? latestPoliticalEnd(election) : "";
  const latest = latestPolitical && latestByLength && latestPolitical < latestByLength ? latestPolitical : latestByLength;
  const days = daysInclusive(draft.startDate, draft.endDate);
  const step = card.impressionStep;
  const bump = (dir: 1 | -1) => {
    const next = Math.min(card.maxImpressionsPerOrder, Math.max(card.minImpressions, (Math.round(draft.impressions / step) + dir) * step));
    set("impressions", next);
  };

  return (
    <div>
      <StepHeading title="When, and how many views?" lede={`Start at least ${card.minLeadDays} days from today so a reviewer can check the ad. Views are spread evenly across your dates.`} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${uid}-start`} label="Start date" required error={errors.startDate}>
          <DatePicker id={`${uid}-start`} value={draft.startDate} onChange={(v) => set("startDate", v)} min={politicalStart} className="w-full" />
        </Field>
        <Field id={`${uid}-end`} label="End date" required error={errors.endDate} hint={latestPolitical ? `Political ads for this election must end by ${shortDate(latestPolitical)}.` : `Up to ${card.maxCampaignDays} days in all.`}>
          <DatePicker id={`${uid}-end`} value={draft.endDate} onChange={(v) => set("endDate", v)} min={draft.startDate || politicalStart} max={latest} className="w-full" />
        </Field>
      </div>

      <div className="mt-6">
        <Field id={`${uid}-impr`} label="Viewable impressions" required error={errors.impressions} hint={days > 0 ? `About ${formatCount(Math.ceil(draft.impressions / days))} a day over ${days} ${days === 1 ? "day" : "days"}.` : undefined}>
          <div className="flex items-stretch gap-2">
            <button type="button" onClick={() => bump(-1)} aria-label={`${formatCount(step)} fewer`} className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-sand bg-paper text-lg text-ink transition-[border-color,transform] hover:border-green/40 active:scale-[0.97]">−</button>
            <input
              id={`${uid}-impr`}
              type="number"
              inputMode="numeric"
              min={card.minImpressions}
              max={card.maxImpressionsPerOrder}
              step={step}
              value={Number.isFinite(draft.impressions) ? draft.impressions : ""}
              onChange={(e) => set("impressions", Number(e.target.value))}
              aria-invalid={Boolean(errors.impressions)}
              className={`${inputClass(Boolean(errors.impressions))} h-12 text-center text-lg font-semibold tabular-nums`}
            />
            <button type="button" onClick={() => bump(1)} aria-label={`${formatCount(step)} more`} className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-sand bg-paper text-lg text-ink transition-[border-color,transform] hover:border-green/40 active:scale-[0.97]">+</button>
          </div>
        </Field>
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Common sizes">
          {presets(card).map((n) => (
            <button key={n} type="button" onClick={() => set("impressions", n)} aria-pressed={draft.impressions === n}
              className={`inline-flex min-h-11 items-center rounded-full border px-3.5 text-xs font-semibold tabular-nums transition-[border-color,background-color,transform] active:scale-[0.97] ${draft.impressions === n ? "border-green bg-green/[0.07] text-green-text" : "border-sand bg-paper text-ink-muted hover:border-green/40"}`}>
              {formatCount(n)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 lg:hidden">{quote}</div>
    </div>
  );
}

// ── 7. Review and send ───────────────────────────────────────────────────────

function SummaryRow({ label, children, onEdit }: Readonly<{ label: string; children: ReactNode; onEdit?: () => void }>) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)_auto] items-baseline gap-3 py-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto]">
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className="min-w-0 text-sm text-ink">{children}</dd>
      {onEdit ? <button type="button" onClick={onEdit} className="-my-2 inline-flex min-h-11 items-center text-xs font-semibold text-teal-text underline-offset-2 hover:underline">Change</button> : <span />}
    </div>
  );
}

export function ReviewStep({
  draft, set, errors, card, placement, sponsor, election, categoryName, onEdit, totalLabel,
}: StepProps & Readonly<{
  placement?: AdRateCardPlacement;
  sponsor?: AdSponsor;
  election?: Election;
  categoryName: string;
  onEdit: (step: "placement" | "type" | "sponsor" | "category" | "creative" | "schedule") => void;
  totalLabel: string;
}>) {
  const uid = useId();
  return (
    <div>
      <StepHeading title="Check and send for review" lede="Nothing is charged now. A reviewer checks the ad, usually within two working days. Once it's approved you have 72 hours to pay, and the dates are booked when you do." />
      <div className="grid gap-8 2xl:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
        <aside aria-label="Preview" className="max-w-lg 2xl:order-last 2xl:max-w-none 2xl:self-start">
          <p className="eyebrow mb-3">Your ad</p>
          <SlotPreview draft={draft} sponsor={sponsor} placement={placement} />
        </aside>
        <div>
          <dl className="divide-y divide-sand border-y border-sand">
            <SummaryRow label="Placement" onEdit={() => onEdit("placement")}>{placement?.name ?? "Not chosen"}</SummaryRow>
            <SummaryRow label="Type" onEdit={card.politicalEnabled ? () => onEdit("type") : undefined}>
              {draft.political ? `Political${draft.politicalType === "election" && election ? `, ${election.name}` : ", issue ad"}` : "Business or community"}
            </SummaryRow>
            <SummaryRow label="Sponsor" onEdit={() => onEdit("sponsor")}>{sponsor ? `${sponsor.displayName} (${sponsor.legalName})` : "Not chosen"}</SummaryRow>
            {!draft.political && <SummaryRow label="Category" onEdit={() => onEdit("category")}>{categoryName}</SummaryRow>}
            <SummaryRow label="Landing page" onEdit={() => onEdit("creative")}><span className="break-all">{draft.landingUrl}</span></SummaryRow>
            <SummaryRow label="Dates" onEdit={() => onEdit("schedule")}>
              <span className="tabular-nums">{shortDate(draft.startDate)} – {shortDate(draft.endDate)}</span>
            </SummaryRow>
            <SummaryRow label="Impressions" onEdit={() => onEdit("schedule")}><span className="tabular-nums">{formatCount(draft.impressions)}</span></SummaryRow>
            <SummaryRow label="Total"><span className="font-semibold tabular-nums">{totalLabel}</span></SummaryRow>
          </dl>

          <div className="mt-6 space-y-4">
            <Field id={`${uid}-email`} label="Email for the receipt" required error={errors.email} hint="Paystack sends the payment receipt here.">
              <input id={`${uid}-email`} type="email" inputMode="email" autoComplete="email" value={draft.email} onChange={(e) => set("email", e.target.value)} aria-invalid={Boolean(errors.email)} className={inputClass(Boolean(errors.email))} />
            </Field>
            <CheckRow checked={draft.acceptTerms} onChange={(v) => set("acceptTerms", v)} error={errors.acceptTerms}>
              I accept the <Link to={LEGAL.advertising} target="_blank" className="font-semibold text-teal-text underline-offset-2 hover:underline">Advertising Policy</Link> and the{" "}
              <Link to={LEGAL.termsOfSale} target="_blank" className="font-semibold text-teal-text underline-offset-2 hover:underline">Terms of Sale</Link>, and confirm the ad is truthful and the sponsor details are correct.
            </CheckRow>
            <CheckRow checked={draft.startConsent} onChange={(v) => set("startConsent", v)} error={errors.startConsent}>
              I ask for the campaign to start on {shortDate(draft.startDate)}. Before it starts I can cancel for a full refund; after it starts, refunds cover only undelivered impressions.
            </CheckRow>
          </div>
          <FormError message={errors.form} />
        </div>
      </div>
    </div>
  );
}
