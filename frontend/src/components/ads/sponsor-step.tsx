import { useId, useState, type ReactNode, type SubmitEvent } from "react";
import { api } from "@/lib/api";
import { adErrorMessage, apiErrorField } from "@/lib/ads";
import { PrivateDocumentUpload } from "@/components/private-document-upload";
import type { AdSponsor, AdSponsorEntityType, AdSponsorInput, AdSponsorKind, AdSponsorOffice } from "@/lib/types";
import { CheckRow, ChoiceCard, Field } from "./fields";
import { buttonClass, inputClass } from "./styles";

// Step 3 of the wizard: who pays for and stands behind the ad. Commercial ads
// carry "Sponsored · {display name}"; political ads "Paid for by {legal name}".
// Identity documents go through the encrypted private upload, never a URL.

const ENTITY_LABEL: Record<AdSponsorEntityType, string> = {
  individual: "An individual",
  business: "A business",
  ngo: "An NGO or charity",
  government: "A government body",
  party: "A political party",
  candidate: "A candidate",
  campaign_committee: "A campaign committee",
};

const ENTITIES: Record<AdSponsorKind, AdSponsorEntityType[]> = {
  commercial: ["business", "individual", "ngo", "government"],
  political: ["party", "candidate", "campaign_committee", "individual"],
};

const OFFICES: { value: AdSponsorOffice; label: string }[] = [
  { value: "parliamentary", label: "Parliamentary" },
  { value: "presidential", label: "Presidential" },
  { value: "district_assembly", label: "District Assembly" },
  { value: "party_internal", label: "Party internal election" },
  { value: "issue", label: "An issue, not a candidate" },
];

const SPONSOR_STATUS: Record<AdSponsor["status"], { label: string; cls: string }> = {
  verified: { label: "Verified", cls: "border-green/30 bg-green/[0.07] text-green-text" },
  pending: { label: "Being checked", cls: "border-gold-border/40 bg-gold/[0.12] text-gold-text" },
  rejected: { label: "Needs changes", cls: "border-clay/30 bg-clay/[0.08] text-clay-text" },
  suspended: { label: "Suspended", cls: "border-clay/30 bg-clay/[0.08] text-clay-text" },
};

const DENIED_NAMES = ["concerned citizens", "friends of", "well-wishers", "well wishers", "committee of friends", "anonymous"];

const PERSON_TYPES = new Set<AdSponsorEntityType>(["individual", "candidate"]);

// The server's political rules (ads_sponsors.go checkPoliticalOffice), mirrored
// so the form asks for what the office needs whatever the sponsor's type.
const CANDIDATE_OFFICES = new Set<AdSponsorOffice>(["presidential", "parliamentary", "district_assembly"]);
const CONSTITUENCY_OFFICES = new Set<AdSponsorOffice>(["parliamentary", "district_assembly"]);

function needsCandidate(v: AdSponsorInput): boolean {
  return v.kind === "political" && CANDIDATE_OFFICES.has(v.office);
}

function needsConstituency(v: AdSponsorInput): boolean {
  return v.kind === "political" && CONSTITUENCY_OFFICES.has(v.office);
}

function needsParty(v: AdSponsorInput): boolean {
  return v.kind === "political" && (v.entityType === "party" || v.office === "party_internal");
}

/** The Candidate field shows when the office needs one, and always for a candidate. */
function showsCandidate(v: AdSponsorInput): boolean {
  return needsCandidate(v) || (v.kind === "political" && v.entityType === "candidate");
}

/** Which stored documents the sponsor being edited already has. */
type OnFile = { id: boolean; ec: boolean };

function blankInput(kind: AdSponsorKind): AdSponsorInput {
  return {
    kind,
    entityType: ENTITIES[kind][0],
    displayName: "",
    legalName: "",
    registrationNumber: "",
    idNumberLast4: "",
    idDocumentUploadId: "",
    tin: "",
    address: "",
    phone: "",
    email: "",
    contactPerson: "",
    partyName: "",
    candidateName: "",
    office: kind === "political" ? "parliamentary" : "",
    constituency: "",
    ecAuthorisationUploadId: "",
    citizenshipDeclaration: false,
  };
}

/**
 * The edit form for a saved sponsor. Document ids stay empty: the server keeps
 * the stored copies unless a new file is uploaded, so only new uploads are sent.
 */
function fromSponsor(s: AdSponsor): AdSponsorInput {
  return {
    ...blankInput(s.kind),
    entityType: s.entityType,
    displayName: s.displayName,
    legalName: s.legalName,
    registrationNumber: s.registrationNumber ?? "",
    idNumberLast4: s.idNumberLast4 ?? "",
    tin: s.tin ?? "",
    address: s.address,
    phone: s.phone ?? "",
    email: s.email ?? "",
    contactPerson: s.contactPerson ?? "",
    partyName: s.partyName ?? "",
    candidateName: s.candidateName ?? "",
    office: s.office ?? "",
    constituency: s.constituency ?? "",
    citizenshipDeclaration: Boolean(s.citizenshipDeclaredAt),
  };
}

type Errors = Partial<Record<keyof AdSponsorInput | "form", string>>;

function nameDenied(name: string): boolean {
  const n = name.toLowerCase();
  return DENIED_NAMES.some((d) => n.includes(d));
}

function checkRequired(v: AdSponsorInput, onFile: OnFile): Errors {
  const e: Errors = {};
  if (v.displayName.trim().length < 2 || v.displayName.length > 60) e.displayName = "Use 2 to 60 characters.";
  if (v.legalName.trim().length < 2 || v.legalName.length > 120) e.legalName = "Use the full legal name (2 to 120 characters).";
  if (!e.displayName && nameDenied(v.displayName)) e.displayName = "Use the sponsor's real name. Names such as “Concerned Citizens” are not accepted.";
  if (!e.legalName && nameDenied(v.legalName)) e.legalName = "Use the sponsor's real legal name.";
  if (!v.address.trim()) e.address = "Add a physical or Ghana Post GPS address.";
  if (!/^\+?[\d\s-]{9,16}$/.test(v.phone.trim())) e.phone = "Add a phone number, such as +233 24 123 4567.";
  if (!/^\S+@\S+\.\S+$/.test(v.email.trim())) e.email = "Add an email address.";
  if (PERSON_TYPES.has(v.entityType)) {
    if (!/^\d{4}$/.test(v.idNumberLast4)) e.idNumberLast4 = "Enter the last 4 digits of the Ghana Card number.";
    if (!v.idDocumentUploadId && !onFile.id) e.idDocumentUploadId = "Upload a photo or scan of the Ghana Card.";
  } else if (!v.registrationNumber.trim()) {
    e.registrationNumber = "Add the registration number.";
  }
  return e;
}

function checkPolitical(v: AdSponsorInput, onFile: OnFile): Errors {
  const e: Errors = {};
  if (v.kind !== "political") return e;
  if (!v.office) e.office = "Choose the office or issue.";
  if (needsCandidate(v) && !v.candidateName.trim()) e.candidateName = "Add the candidate's name.";
  if (needsConstituency(v) && !v.constituency.trim()) e.constituency = "Add the constituency or electoral area.";
  if (needsParty(v) && !v.partyName.trim()) e.partyName = "Add the party's name.";
  if (v.office === "district_assembly" && !v.ecAuthorisationUploadId && !onFile.ec) e.ecAuthorisationUploadId = "Upload the Electoral Commission authorisation.";
  if (!v.citizenshipDeclaration) e.citizenshipDeclaration = "Political sponsors must make this declaration.";
  return e;
}

function validate(v: AdSponsorInput, onFile: OnFile): Errors {
  return { ...checkRequired(v, onFile), ...checkPolitical(v, onFile) };
}

/** The fields that show an error of their own on the form as it stands now. */
function errorSlots(v: AdSponsorInput): Set<keyof AdSponsorInput> {
  const slots = new Set<keyof AdSponsorInput>(["entityType", "displayName", "legalName", "tin", "address", "phone", "email"]);
  const person: (keyof AdSponsorInput)[] = ["idNumberLast4", "idDocumentUploadId"];
  const organisation: (keyof AdSponsorInput)[] = ["registrationNumber", "contactPerson"];
  for (const k of PERSON_TYPES.has(v.entityType) ? person : organisation) slots.add(k);
  if (v.kind === "political") {
    for (const k of ["partyName", "office", "constituency", "citizenshipDeclaration"] as const) slots.add(k);
    if (showsCandidate(v)) slots.add("candidateName");
    if (v.office === "district_assembly") slots.add("ecAuthorisationUploadId");
  }
  return slots;
}

function SponsorForm({
  kind,
  editing,
  onSaved,
  onCancel,
}: Readonly<{
  kind: AdSponsorKind;
  editing: AdSponsor | null;
  onSaved: (s: AdSponsor) => void;
  onCancel: () => void;
}>) {
  const uid = useId();
  const [v, setV] = useState<AdSponsorInput>(() => (editing ? fromSponsor(editing) : blankInput(kind)));
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof AdSponsorInput>(k: K, val: AdSponsorInput[K]) => setV((cur) => ({ ...cur, [k]: val }));
  const person = PERSON_TYPES.has(v.entityType);
  const political = kind === "political";
  const onFile: OnFile = { id: Boolean(editing?.hasIdDocument), ec: Boolean(editing?.hasEcAuthorisation) };

  async function save(e: SubmitEvent) {
    e.preventDefault();
    const found = validate(v, onFile);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    try {
      const body = { ...v, displayName: v.displayName.trim(), legalName: v.legalName.trim() };
      const saved = editing ? await api.updateAdSponsor(editing.id, body) : await api.createAdSponsor(body);
      onSaved(saved);
    } catch (err) {
      // A field the form isn't showing (the sponsor limit comes back as
      // "kind") goes to the form-level message, so no error is ever invisible.
      const field = apiErrorField(err) as keyof AdSponsorInput | undefined;
      const message = adErrorMessage(err, "We couldn't save the sponsor. Try again.");
      setErrors(field && errorSlots(v).has(field) ? { [field]: message } : { form: message });
    } finally {
      setSaving(false);
    }
  }

  const text = (k: keyof AdSponsorInput, label: string, opts: { hint?: ReactNode; required?: boolean; type?: string; max?: number; placeholder?: string; className?: string; inputMode?: "numeric" | "tel" | "email" } = {}) => (
    <Field id={`${uid}-${k}`} label={label} hint={opts.hint} error={errors[k]} required={opts.required} className={opts.className}>
      <input
        id={`${uid}-${k}`}
        type={opts.type ?? "text"}
        inputMode={opts.inputMode}
        maxLength={opts.max}
        placeholder={opts.placeholder}
        value={String(v[k] ?? "")}
        onChange={(e) => set(k, e.target.value as never)}
        aria-invalid={Boolean(errors[k])}
        className={inputClass(Boolean(errors[k]))}
      />
    </Field>
  );

  return (
    <form onSubmit={save} noValidate className="rounded-[var(--radius-card)] border border-sand bg-cream/60 p-4 sm:p-6">
      <h3 className="text-lg font-semibold text-ink">{editing ? "Update the sponsor" : political ? "Add a political sponsor" : "Add a sponsor"}</h3>
      <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-muted">
        {political
          ? "Political sponsors are verified before any ad runs. Their legal name appears on the ad and in the public Ad library."
          : "The sponsor is the business or person behind the ad. Oguaa checks new sponsors before approving their first ad."}
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field id={`${uid}-entity`} label="The sponsor is" required error={errors.entityType} className="sm:col-span-2">
          <select id={`${uid}-entity`} value={v.entityType} onChange={(e) => set("entityType", e.target.value as AdSponsorEntityType)} className={inputClass(Boolean(errors.entityType))}>
            {ENTITIES[kind].map((t) => <option key={t} value={t}>{ENTITY_LABEL[t]}</option>)}
          </select>
        </Field>
        {text("displayName", "Name on the ad", { required: true, max: 60, hint: political ? "How people know the sponsor." : "Shown as “Sponsored · name”.", placeholder: "Kotokuraba Traders" })}
        {text("legalName", "Full legal name", { required: true, max: 120, hint: political ? "Shown as “Paid for by legal name”, exactly as registered." : "As registered, for invoices.", placeholder: "Kotokuraba Traders Limited" })}
        {person
          ? text("idNumberLast4", "Ghana Card: last 4 digits", { required: true, max: 4, inputMode: "numeric", placeholder: "4821", hint: "The full number stays in the uploaded card only." })
          : text("registrationNumber", "Registration number", { required: true, placeholder: "CS123456789", hint: political ? "Party or committee registration." : "From the Office of the Registrar of Companies, or your NGO registration." })}
        {text("tin", "Taxpayer number (TIN)", { hint: "Optional. Used on invoices." })}
        {person && (
          <div className="sm:col-span-2">
            <PrivateDocumentUpload
              value={v.idDocumentUploadId}
              onChange={(ref) => set("idDocumentUploadId", ref)}
              purpose="document"
              label="Ghana Card (photo or scan)"
              hint={onFile.id ? "Stored encrypted. Upload a new copy only if it has changed." : "Stored encrypted. Only Oguaa's reviewers can open it."}
              required={!onFile.id}
              onRecord={onFile.id}
            />
            {errors.idDocumentUploadId && <p role="alert" className="mt-1 text-xs text-clay-text">{errors.idDocumentUploadId}</p>}
          </div>
        )}
        {text("address", "Address", { required: true, placeholder: "CC-123-4567, Commercial Street, Cape Coast", className: "sm:col-span-2" })}
        {text("phone", "Phone", { required: true, type: "tel", inputMode: "tel", placeholder: "+233 24 123 4567" })}
        {text("email", "Email", { required: true, type: "email", inputMode: "email", placeholder: "accounts@example.com" })}
        {!person && text("contactPerson", "Contact person", { hint: "Who we speak to about this sponsor.", className: "sm:col-span-2" })}
      </div>

      {political && (
        <fieldset className="mt-6 border-t border-sand pt-5">
          <legend className="text-sm font-semibold text-ink">Political details</legend>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {text("partyName", "Party", { required: needsParty(v), hint: needsParty(v) ? undefined : "Leave empty for independents and issue groups." })}
            {showsCandidate(v) && text("candidateName", "Candidate", { required: needsCandidate(v), hint: needsCandidate(v) ? "The person the ad supports." : undefined })}
            <Field id={`${uid}-office`} label="Office or purpose" required error={errors.office}>
              <select id={`${uid}-office`} value={v.office} onChange={(e) => set("office", e.target.value as AdSponsorOffice)} className={inputClass(Boolean(errors.office))}>
                {OFFICES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            {text("constituency", "Constituency", { required: needsConstituency(v), placeholder: "Cape Coast North" })}
            {v.office === "district_assembly" && (
              <div className="sm:col-span-2">
                <PrivateDocumentUpload
                  value={v.ecAuthorisationUploadId}
                  onChange={(ref) => set("ecAuthorisationUploadId", ref)}
                  purpose="document"
                  label="Electoral Commission authorisation"
                  hint="District Assembly elections are non-partisan (Article 248). Oguaa does not take District Assembly candidate ads at present."
                  required={!onFile.ec}
                  onRecord={onFile.ec}
                />
                {errors.ecAuthorisationUploadId && <p role="alert" className="mt-1 text-xs text-clay-text">{errors.ecAuthorisationUploadId}</p>}
              </div>
            )}
          </div>
          <div className="mt-5">
            <CheckRow checked={v.citizenshipDeclaration} onChange={(c) => set("citizenshipDeclaration", c)} error={errors.citizenshipDeclaration}>
              I declare that the sponsor is a citizen of Ghana, or an organisation at least 75% owned by citizens of Ghana, and that no money for this ad
              comes from outside Ghana (Political Parties Act, 2000, s.24).
            </CheckRow>
          </div>
        </fieldset>
      )}

      {errors.form && <p role="alert" className="mt-4 rounded-lg border border-clay/30 bg-clay/[0.06] px-3 py-2 text-sm text-clay-text">{errors.form}</p>}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving} className={buttonClass("primary")}>
          {saving ? "Saving…" : editing ? "Save changes" : "Save sponsor"}
        </button>
        <button type="button" onClick={onCancel} className={buttonClass("quiet")}>Cancel</button>
      </div>
    </form>
  );
}

/** Pick one of the member's sponsors of the right kind, or add one. */
export function SponsorStep({
  kind,
  sponsors,
  loading,
  loadError,
  selectedId,
  onSelect,
  onSaved,
  error,
}: Readonly<{
  kind: AdSponsorKind;
  sponsors: AdSponsor[];
  loading: boolean;
  loadError: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
  onSaved: (s: AdSponsor) => void;
  error?: string;
}>) {
  const mine = sponsors.filter((s) => s.kind === kind);
  const [mode, setMode] = useState<"pick" | "new" | AdSponsor>(mine.length === 0 && !loading ? "new" : "pick");

  if (loading) {
    return (
      <div className="space-y-3" aria-hidden>
        <div className="skeleton h-20 rounded-xl" />
        <div className="skeleton h-20 rounded-xl" />
      </div>
    );
  }

  if (mode !== "pick") {
    return (
      <SponsorForm
        key={mode === "new" ? "new" : mode.id}
        kind={kind}
        editing={mode === "new" ? null : mode}
        onCancel={() => setMode("pick")}
        onSaved={(s) => {
          onSaved(s);
          onSelect(s.id);
          setMode("pick");
        }}
      />
    );
  }

  return (
    <div>
      {loadError && <p role="alert" className="mb-4 text-sm text-clay-text">We couldn't load your sponsors. Refresh the page to try again.</p>}
      {mine.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gold-border/50 bg-gold/[0.05] px-5 py-6">
          <p className="font-semibold text-ink">No {kind} sponsor yet</p>
          <p className="mt-1 text-sm text-ink-muted">Add the business, person or group behind the ad. It takes about two minutes.</p>
        </div>
      ) : (
        <div role="radiogroup" aria-label="Sponsor" className="grid gap-3">
          {mine.map((s) => {
            const st = SPONSOR_STATUS[s.status];
            const editable = s.status === "pending" || s.status === "rejected";
            return (
              <div key={s.id}>
                <ChoiceCard
                  name="sponsor"
                  checked={selectedId === s.id}
                  onChange={() => onSelect(s.id)}
                  disabled={s.status === "suspended"}
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      {s.displayName}
                      <span className={`rounded-md border px-1.5 py-px text-[0.66rem] font-semibold ${st.cls}`}>{st.label}</span>
                    </span>
                  }
                  meta={<>{s.legalName} · {ENTITY_LABEL[s.entityType]}</>}
                >
                  {s.status === "rejected" && s.reviewNote && <span className="mt-2 block text-xs text-clay-text">Reviewer: {s.reviewNote}</span>}
                </ChoiceCard>
                {editable && (
                  <button type="button" onClick={() => setMode(s)} className="ml-4 mt-1.5 min-h-9 text-xs font-semibold text-teal-text underline-offset-2 hover:underline">
                    Edit {s.displayName}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-clay-text">{error}</p>}
      <button type="button" onClick={() => setMode("new")} className={`mt-4 ${buttonClass("quiet")}`}>
        <span aria-hidden>+</span> Add a {kind} sponsor
      </button>
      <p className="mt-3 max-w-prose text-xs leading-relaxed text-ink-faint">
        A sponsor that is still being checked can send ads for review. Oguaa approves the ad only once the sponsor is verified.
      </p>
    </div>
  );
}
