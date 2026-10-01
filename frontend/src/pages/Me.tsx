import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { usePageTitle } from "@/lib/use-page-title";
import type { MemberView, Listing, ListingStatus, Ticket, Subscription, Promotion } from "@/lib/types";
import { api } from "@/lib/api";
import { paymentErrorMessage } from "@/lib/payments";
import { usePaymentConfirm } from "@/lib/use-payment-confirm";
import { PaymentNotice } from "@/components/payment-notice";
import { useAuth } from "@/lib/auth";
import { Container, CTA as Cta, Avatar } from "@/components/ui";
import { ImageUpload } from "@/components/image-upload";
import { SchoolingEditor, PeopleYouMayKnow } from "@/components/connections";
import { formatDate, initials } from "@/lib/format";
import { CREATOR_URL } from "@/lib/app-urls";
import { Thumb } from "@/components/cards";
import { StaggerItem } from "@/components/motion";
import { EmptyState, EmptyGlyph, type EmptyIconName } from "@/components/empty-state";
import { SecuritySettings, ChangePasswordSettings, DataRightsSettings } from "@/components/security-panels";
import { AIConsentSettings, NotificationSettings } from "@/components/notification-settings";
import { LEGAL } from "@/lib/legal";
import { ProfileSkeleton } from "@/components/skeleton";
import { OtpInput } from "@/components/otp-input";

const TYPE_LABELS: Record<string, string> = {
  business: "Business", property: "Property", artist: "Artist", person: "Person", memory: "Memory", event: "Event", opportunity: "Opportunity", memorial: "Memorial", project: "Project",
};


// The editor covers the member-submittable types (incidents/lost-found have
// their own flows; projects belong to institutions).
const EDITABLE = new Set(["artist", "business", "property", "event", "memory", "opportunity", "person", "memorial"]);
const STATUS_STYLE: Record<ListingStatus, string> = {
  approved: "bg-green/[0.08] text-green-text",
  pending: "bg-gold/[0.14] text-gold-text",
  rejected: "bg-maroon-900/[0.08] text-maroon-text",
  draft: "bg-sand text-ink-muted",
  unpublished: "bg-sand text-ink-muted",
};

type SaveState = "idle" | "saving" | "saved" | "error";

// The account page is split into sections so it never dumps everything at once.
// The active section is held in component state and mirrored to the URL hash.
const TABS = [
  { id: "profile", label: "Profile", icon: "image", title: "Your profile", desc: "How you show up across Oguaa — your photo, the town and Asafo you rep, and your birthday." },
  { id: "activity", label: "Activity", icon: "chart", title: "Listings, tickets & support", desc: "Everything you've contributed, the event tickets you hold, and the businesses you back." },
  { id: "connections", label: "Connections", icon: "users", title: "Your connections", desc: "Record your schooling to find classmates, neighbours and Asafo members you may know." },
  { id: "notifications", label: "Notifications", icon: "bell", title: "Notifications", desc: "Choose what Oguaa tells you about, and how — on the web, in the app and by email." },
  { id: "security", label: "Security", icon: "shield", title: "Sign-in & security", desc: "Verify your contact and turn on two-factor to keep your account safe." },
  { id: "privacy", label: "Privacy & data", icon: "inbox", title: "Privacy & data", desc: "Take everything Oguaa holds about you with you — or close your account for good." },
] as const;
type TabId = (typeof TABS)[number]["id"];

function isTabId(v: string): v is TabId {
  return TABS.some((t) => t.id === v);
}

function linkFor(l: Listing): string | null {
  if (l.status !== "approved") return null;
  if (l.type === "artist") return `/music/${l.slug}`;
  if (l.type === "business") return `/business/${l.slug}`;
  if (l.type === "property") return `/rent-stay/${l.slug}`;
  if (l.type === "memorial") return `/memoriam/${l.slug}`;
  if (l.type === "project") return `/projects/${l.slug}`;
  return null;
}

function roleLabel(role: string): string {
  if (role === "curator") return "Curator";
  if (role === "steward") return "Steward";
  return "Member";
}

function subStatusStyle(status: string): string {
  if (status === "success") return "bg-green/[0.08] text-green-text";
  if (status === "pending") return "bg-gold/[0.14] text-gold-text";
  return "bg-maroon-900/[0.08] text-maroon-text";
}

type Affiliations = { townId: string; asafoId: string };

const BIRTHDAY_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// Days per month in a leap year, so 29 February is a valid birthday.
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Month and day ("MM", "DD") of a stored birthday: "MM-DD", legacy "YYYY-MM-DD", or a half-filled "MM-". */
function birthdayParts(value: string): [string, string] {
  const parts = value.split("-");
  if (parts.length < 2) return ["", ""];
  const [month, day] = parts.slice(-2);
  return [month.slice(0, 2), day.slice(0, 2)];
}

/** "MM-DD" to save, "" to clear, or null when only half of it is chosen. */
function birthdayMonthDay(value: string): string | null {
  const [month, day] = birthdayParts(value);
  if (!month && !day) return "";
  if (!month || !day) return null;
  return `${month}-${day}`;
}

/** Month + day picker: birthdays are stored without a year. */
function BirthdayPicker({ value, onChange }: Readonly<{ value: string; onChange: (value: string) => void }>) {
  const [month, day] = birthdayParts(value);
  const maxDay = month ? DAYS_IN_MONTH[Number(month) - 1] ?? 31 : 31;
  const emit = (m: string, d: string) => onChange(m || d ? `${m}-${d}` : "");
  const selectCls = "min-h-11 rounded-lg border border-sand bg-paper px-3 py-2 text-sm text-ink focus:border-green focus:outline-none";
  return (
    <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-2">
      <select aria-label="Birthday month" value={month} onChange={(e) => emit(e.target.value, day && Number(day) <= (DAYS_IN_MONTH[Number(e.target.value) - 1] ?? 31) ? day : "")} className={selectCls}>
        <option value="">Month</option>
        {BIRTHDAY_MONTHS.map((name, i) => <option key={name} value={String(i + 1).padStart(2, "0")}>{name}</option>)}
      </select>
      <select aria-label="Birthday day" value={day} onChange={(e) => emit(month, e.target.value)} className={selectCls}>
        <option value="">Day</option>
        {Array.from({ length: maxDay }, (_, i) => String(i + 1).padStart(2, "0")).map((d) => <option key={d} value={d}>{Number(d)}</option>)}
      </select>
    </div>
  );
}

/** One row of "My subscriptions": a business Supporter plan, or a creator plan (no listing). */
function SubscriptionRow({ sub }: Readonly<{ sub: Subscription }>) {
  const creator = sub.scope === "creator" || !sub.listingSlug;
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink">{creator ? `Creator plan · ${sub.plan}` : sub.listingTitle}</p>
        <p className="text-xs text-ink-faint">
          GH₵ {(sub.amountPesewas / 100).toLocaleString("en-GH", { maximumFractionDigits: 2 })}
          {sub.periodEnd ? ` · until ${formatDate(sub.periodEnd)}` : ""}
        </p>
      </div>
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${subStatusStyle(sub.status)}`}>{sub.status}</span>
    </>
  );
  const cls = "flex items-center gap-3 py-3.5 transition-colors hover:bg-paper";
  if (creator) return <a href={`${CREATOR_URL}/grow`} className={cls}>{body}</a>;
  return <Link to={`/business/${sub.listingSlug}`} className={cls}>{body}</Link>;
}

/** A compact account module that keeps its height driven by content. */
function Panel({ title, lede, action, children, className = "" }: Readonly<{ title: string; lede?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }>) {
  return (
    <section className={`relative rounded-2xl border border-sand bg-paper p-4 sm:p-5 ${className}`}>
      <span className="absolute inset-y-4 left-0 w-1 rounded-r-full bg-gradient-to-b from-gold-brand via-teal to-green" aria-hidden />
      <div className="flex flex-wrap items-start justify-between gap-3 pl-1">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold text-ink">{title}</h2>
          {lede && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">{lede}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="mt-4 pl-1">{children}</div>
    </section>
  );
}

const QUICK_ACTIONS = [
  { to: "/submit", label: "Add a listing", desc: "Business, artist, event…", icon: "pen" },
  { to: "/safety/report", label: "Report an incident", desc: "Keep the town safe", icon: "megaphone" },
  { to: "/lost-found/new", label: "Post lost & found", desc: "Help a neighbour", icon: "search" },
  { to: "/events", label: "What's on", desc: "The town calendar", icon: "calendar" },
] as const;

function QuickAction({ to, label, desc, icon }: Readonly<{ to: string; label: string; desc: string; icon: EmptyIconName }>) {
  return (
    <Link
      to={to}
      className="group flex h-full items-center gap-3 px-4 py-3.5 text-cream transition-colors hover:bg-cream/10 focus-visible:bg-cream/10 sm:px-5"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-gold/10 text-gold transition-colors group-hover:bg-gold group-hover:text-green-900">
        <EmptyGlyph name={icon} size={17} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-tight text-cream">{label}</span>
        <span className="mt-0.5 block truncate text-[11px] text-cream/55">{desc}</span>
      </span>
    </Link>
  );
}

function Metric({ value, label }: Readonly<{ value: ReactNode; label: string }>) {
  // Counts are short and want the display size; word values like "Verified"
  // do not fit at 2xl in a quarter-width column, and truncating clipped them
  // to "Verifi…". Size the word down instead of cutting it off.
  const isWord = typeof value === "string";
  return (
    <div className="min-w-0 px-4 py-3 sm:px-5">
      <p className={`font-semibold leading-none text-cream ${isWord ? "text-base sm:text-lg" : "text-xl sm:text-2xl"}`}>{value}</p>
      <p className="mt-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-cream/50">{label}</p>
    </div>
  );
}

function ToggleField({ checked, onChange, label, detail, tone = "green" }: Readonly<{ checked: boolean; onChange: (checked: boolean) => void; label: string; detail?: string; tone?: "green" | "teal" }>) {
  const active = tone === "teal" ? "peer-checked:bg-teal" : "peer-checked:bg-green";
  const thumb = tone === "teal" ? "me-teal-switch-thumb" : "";
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-sand bg-cream px-3.5 py-3 transition-colors hover:border-green/30">
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
        <span className={`h-6 w-11 rounded-full bg-sand transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-teal peer-focus-visible:ring-offset-2 ${active}`} aria-hidden />
        <span className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-on-green shadow-sm transition-transform peer-checked:translate-x-5 ${thumb}`} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{label}</span>
        {detail && <span className="mt-0.5 block text-xs leading-relaxed text-ink-faint">{detail}</span>}
      </span>
    </label>
  );
}

export function Component() {
  const { member, loading, setMember } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  usePageTitle("My Account");
  const [view, setView] = useState<MemberView | null>(null);
  // Profile photo (seeded from the loaded profile).
  const [photo, setPhoto] = useState("");
  const [photoState, setPhotoState] = useState<SaveState>("idle");
  // Editable affiliations + birthday (seeded from the loaded profile).
  const [townId, setTownId] = useState("");
  const [asafoId, setAsafoId] = useState("");
  const [birthday, setBirthday] = useState("");
  const [broadcast, setBroadcast] = useState(false);
  const [bdayState, setBdayState] = useState<SaveState>("idle");
  const [bdayError, setBdayError] = useState("");
  const [affError, setAffError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  // The last requested quarter/Asafo pair and the queue that saves them in order.
  const affiliations = useRef<Affiliations>({ townId: "", asafoId: "" });
  const affQueue = useRef<Promise<void>>(Promise.resolve());
  // Diaspora opt-in (Phase 2 foundation).
  const [abroad, setAbroad] = useState(false);
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [diaState, setDiaState] = useState<SaveState>("idle");
  // Bumped after saving schooling so "people you may know" refetches.
  const [connKey, setConnKey] = useState(0);
  // Event tickets (Phase 6).
  const [tickets, setTickets] = useState<Ticket[]>([]);
  // Business subscriptions (Phase 7).
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  // Paid promotions (Phase 8): ?promo_ref= confirm + inline day picker.
  const [params] = useSearchParams();
  const [promoFor, setPromoFor] = useState<string | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);
  // Confirms in place after the inline modal, or once on a ?promo_ref= return
  // (the redirect fallback); a still-processing payment keeps a re-check.
  const promoPayment = usePaymentConfirm<Promotion>(api.confirmPromotion, {
    returnParam: "promo_ref",
    onConfirmed: () => {
      setPromoFor(null);
      setRefreshKey((k) => k + 1);
    },
  });
  const promoConfirmed = promoPayment.confirmed;
  // Phone/contact verification gate for submissions.
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyState, setVerifyState] = useState<SaveState>("idle");
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifySentCode, setVerifySentCode] = useState<string | null>(null);
  const [verifyExpiresAt, setVerifyExpiresAt] = useState<string | null>(null);
  // Bumped after a promotion confirms so the owned listings refetch.
  const [refreshKey, setRefreshKey] = useState(0);
  // Active account section. Seed from the URL hash, or land on Activity when
  // returning from a promotion payment so the confirmation is visible.
  const [defaultTab] = useState<TabId>(() => {
    const h = typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : "";
    if (isTabId(h)) return h;
    if (params.get("promo_ref")) return "activity";
    return "profile";
  });
  const hashTab = location.hash.replace(/^#/, "");
  const tab = isTabId(hashTab) ? hashTab : defaultTab;

  useEffect(() => {
    if (!member) return;
    api.myTickets().then(setTickets).catch(() => setTickets([]));
    api.mySubscriptions().then(setSubscriptions).catch(() => setSubscriptions([]));
  }, [member]);

  useEffect(() => {
    if (!member) return;
    let alive = true;
    api.member(member.slug)
      .then((v) => {
        if (!alive) return;
        setView(v);
        setLoadError(false);
        setPhoto(v.member.photoUrl ?? "");
        affiliations.current = { townId: v.member.townId ?? "", asafoId: v.member.asafoId ?? "" };
        setTownId(v.member.townId ?? "");
        setAsafoId(v.member.asafoId ?? "");
        // Self-only fields: the owner's own profile read carries them, and the
        // signed-in session (/api/auth/me) is the fallback.
        setBirthday(v.member.birthday || member.birthday || "");
        setBroadcast(!!(v.member.broadcastBirthday ?? member.broadcastBirthday));
        setAbroad(!!v.member.diaspora?.abroad);
        setCity(v.member.diaspora?.city ?? "");
        setCountry(v.member.diaspora?.country ?? "");
      })
      .catch(() => {
        if (alive) setLoadError(true);
      });
    return () => { alive = false; };
  }, [member, refreshKey]);

  if (loading) return <Container className="py-16"><ProfileSkeleton /></Container>;
  if (!member) return <Navigate to="/signin" state={{ from: "/me" }} replace />;
  if (!view && loadError) {
    return (
      <Container className="py-16">
        <div role="alert" className="mx-auto max-w-md rounded-[var(--radius-card)] border border-clay/30 bg-clay/[0.06] p-6 text-center">
          <p className="font-semibold text-ink">We couldn't load your account</p>
          <p className="mt-1 text-sm text-ink-muted">Check your connection and try again.</p>
          <button type="button" onClick={() => { setLoadError(false); setRefreshKey((k) => k + 1); }} className="mt-4 rounded-full bg-green px-5 py-2 text-sm font-semibold text-on-green hover:bg-green-900">Try again</button>
        </div>
      </Container>
    );
  }
  if (!view) return <Container className="py-16"><ProfileSkeleton /></Container>;

  const { member: me, listings, places, schools } = view;
  const quarters = places.filter((p) => p.kind !== "asafo");
  const asafos = places.filter((p) => p.kind === "asafo");
  const town = quarters.find((p) => p.id === townId);
  const asafo = asafos.find((p) => p.id === asafoId);
  const current = TABS.find((t) => t.id === tab) ?? TABS[0];
  const approvedListings = listings.filter((l) => l.status === "approved").length;

  // Change section through React Router so links such as /me#activity update an
  // already-mounted account page as well as a fresh visit.
  function selectTab(id: TabId) {
    navigate({ pathname: location.pathname, search: location.search, hash: `#${id}` }, { replace: true });
  }

  // Each save replaces both fields, so saves run one after another in click
  // order; a failed save puts the choice back and says so.
  function saveAffiliations(next: Affiliations) {
    const previous = affiliations.current;
    affiliations.current = next;
    setTownId(next.townId);
    setAsafoId(next.asafoId);
    setAffError(null);
    affQueue.current = affQueue.current.then(async () => {
      try {
        await api.setAffiliations(next);
      } catch (e) {
        if (affiliations.current === next) {
          affiliations.current = previous;
          setTownId(previous.townId);
          setAsafoId(previous.asafoId);
        }
        setAffError(e instanceof Error && e.message ? e.message : "We couldn't save that choice. Please try again.");
      }
    });
  }
  function chooseQuarter(id: string) {
    const cur = affiliations.current;
    saveAffiliations({ ...cur, townId: cur.townId === id ? "" : id });
  }
  function chooseAsafo(id: string) {
    const cur = affiliations.current;
    saveAffiliations({ ...cur, asafoId: cur.asafoId === id ? "" : id });
  }
  async function savePhoto(url: string) {
    setPhoto(url);
    setPhotoState("saving");
    try {
      await api.setPhoto(url);
      setPhotoState("saved");
    } catch {
      setPhotoState("error");
    }
  }
  async function saveBirthday() {
    const monthDay = birthdayMonthDay(birthday);
    if (monthDay === null) {
      setBdayError("Choose both the month and the day.");
      setBdayState("error");
      return;
    }
    setBdayState("saving");
    try {
      const res = await api.setBirthday({ birthday: monthDay, broadcast });
      setBirthday(res?.birthday ?? monthDay);
      setBdayState("saved");
    } catch (e) {
      setBdayError(e instanceof Error && e.message ? e.message : "We couldn't save your birthday. Try again.");
      setBdayState("error");
    }
  }
  async function saveDiaspora() {
    setDiaState("saving");
    try {
      await api.setDiaspora({ abroad, city: city.trim(), country: country.trim() });
      setDiaState("saved");
    } catch {
      setDiaState("error");
    }
  }
  async function startVerification() {
    setVerifyError(null);
    setVerifyState("saving");
    try {
      const res = await api.startPhoneVerification();
      setVerifySentCode(res.code ?? null);
      setVerifyExpiresAt(res.expiresAt ?? null);
      setVerifyCode("");
      setVerifyState("saved");
      setMember(res.member);
      setView((cur) => (cur ? { ...cur, member: res.member } : cur));
    } catch (e) {
      setVerifyError(e instanceof Error ? e.message : "Could not send a verification code.");
      setVerifyState("error");
    }
  }
  // OtpInput hands over the full code on completion; state set in the same
  // event has not re-rendered yet, so it must not be read from verifyCode.
  async function confirmVerification(code: string = verifyCode) {
    setVerifyError(null);
    setVerifyState("saving");
    try {
      const res = await api.confirmPhoneVerification(code.trim());
      setMember(res.member);
      setVerifySentCode(null);
      setVerifyExpiresAt(null);
      setVerifyCode("");
      setVerifyState("saved");
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setVerifyError(e instanceof Error ? e.message : "Could not confirm the verification code.");
      setVerifyState("error");
    }
  }
  async function promote(l: Listing, days: number) {
    setPromoError(null);
    setPromoBusy(true);
    try {
      const r = await api.promoteListing(l.id, days);
      // Complete in the in-app Paystack modal and confirm in place. If the
      // modal can't run, completePayment redirects to authorizationUrl and the
      // ?promo_ref= return confirms on the way back.
      await promoPayment.complete(r);
    } catch (e) {
      setPromoError(paymentErrorMessage(e, "Could not start the payment."));
    } finally {
      // Modal path (success/cancel) clears busy here; on the redirect fallback
      // the page unloads before this runs, which is fine.
      setPromoBusy(false);
    }
  }

  return (
    <>
      <section className="on-dark on-dark-pin relative overflow-hidden bg-green text-cream">
        <div className="absolute inset-0" style={{ background: "radial-gradient(80% 140% at 92% 5%, #1D6547 0%, #123F2D 48%, #0C2C1F 100%)" }} aria-hidden />
        <div className="bg-dotgrid absolute inset-0 opacity-40" aria-hidden />
        <div className="absolute -right-28 top-6 h-72 w-72 rounded-full border border-gold/15" aria-hidden />
        <div className="absolute -right-14 top-20 h-48 w-48 rounded-full border border-gold/10" aria-hidden />
        <Container size="wide" className="relative py-7 sm:py-9">
          <div className="grid items-end gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(30rem,0.72fr)]">
            <div className="flex min-w-0 items-start gap-4 sm:items-center sm:gap-5">
              <Avatar initials={me.initials} photoUrl={photo} size={84} className="border-2 border-gold/55 shadow-xl" />
              <div className="min-w-0">
                <p className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-gold">Your Oguaa account</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-3xl font-semibold text-cream sm:text-4xl">{me.displayName}</h1>
                  <span className="rounded-full border border-gold/30 bg-gold/15 px-2.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-gold">{roleLabel(me.role)}</span>
                </div>
                {me.bio && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-cream/70">{me.bio}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-cream/65">
                  <span>Joined {formatDate(me.joinedAt)}</span>
                  {town && <span className="rounded-full border border-cream/20 bg-cream/[0.08] px-2.5 py-1 text-cream/85">{town.name}</span>}
                  {asafo && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-cream/20 bg-cream/[0.08] px-2.5 py-1 text-cream/85">
                      {asafo.colors?.[0] && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: asafo.colors[0] }} aria-hidden />}
                      {asafo.name}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-cream/15 bg-green-900/[0.45] shadow-2xl backdrop-blur-sm">
              <div className="flex items-center justify-between border-b border-cream/10 px-4 py-3 sm:px-5">
                <div>
                  <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-cream/45">Account snapshot</p>
                  <p className="mt-0.5 text-sm font-semibold text-cream">Your community footprint</p>
                </div>
                <Cta to={`/members/${me.slug}`} variant="outline-dark" className="px-4 py-2 text-xs">Public profile</Cta>
              </div>
              <div className="grid grid-cols-2 [&>*:nth-child(odd)]:border-r [&>*:nth-child(-n+2)]:border-b [&>*]:border-cream/10 sm:grid-cols-4 sm:[&>*:nth-child(-n+2)]:border-b-0 sm:[&>*:nth-child(2)]:border-r">
                <Metric value={listings.length} label="Contributions" />
                <Metric value={approvedListings} label="Live" />
                <Metric value={tickets.length} label="Tickets" />
                <Metric value={me.phoneVerified ? "Verified" : "Pending"} label="Contact" />
              </div>
            </div>
          </div>

          <div className="mt-6 grid overflow-hidden rounded-2xl border border-cream/15 bg-green-900/35 shadow-xl sm:grid-cols-2 xl:grid-cols-4">
            {QUICK_ACTIONS.map((a, i) => (
              <StaggerItem key={a.to} index={i} className="border-b border-cream/10 last:border-b-0 sm:[&:nth-child(odd)]:border-r sm:[&:nth-last-child(-n+2)]:border-b-0 xl:border-b-0 xl:border-r xl:last:border-r-0">
                <QuickAction {...a} />
              </StaggerItem>
            ))}
          </div>
        </Container>
      </section>

      <Container size="wide" className="me-account py-6 sm:py-8">
        {!me.phoneVerified && (
          <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-gold-border/35 bg-gold/[0.09] px-4 py-3.5 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold/[0.18] text-gold-text"><EmptyGlyph name="shield" size={17} /></span>
              <div>
                <p className="text-sm font-semibold text-ink">One step left: verify your contact</p>
                <p className="mt-0.5 text-sm text-ink-muted">Verification unlocks listing and incident submissions.</p>
              </div>
            </div>
            <button type="button" onClick={() => selectTab("security")} className="shrink-0 rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-on-green transition-colors hover:bg-green-900">
              Verify now
            </button>
          </div>
        )}

        <div className="grid items-start gap-5 lg:grid-cols-[15.5rem_minmax(0,1fr)]">
          <aside className="sticky top-24 hidden overflow-hidden rounded-2xl border border-sand bg-cream shadow-[var(--shadow-card)] lg:block">
            <div className="border-b border-sand bg-paper px-4 py-4">
              <p className="text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-gold-text">Account menu</p>
              <p className="mt-1 text-sm text-ink-muted">Manage your Oguaa presence.</p>
            </div>
            <nav aria-label="Account sections" className="p-2">
              {TABS.map((t) => {
                const active = tab === t.id;
                const flag = t.id === "security" && !me.phoneVerified;
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => selectTab(t.id)}
                    className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${active ? "bg-green text-on-green shadow-sm" : "text-ink-muted hover:bg-paper hover:text-ink"}`}
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active ? "bg-cream/[0.12] text-gold" : "bg-green/[0.07] text-green-text"}`}><EmptyGlyph name={t.icon} size={16} /></span>
                    <span className="min-w-0 flex-1 text-sm font-semibold">{t.label}</span>
                    {flag && <><span className="h-2 w-2 rounded-full bg-gold" aria-hidden /><span className="sr-only">Action needed</span></>}
                  </button>
                );
              })}
            </nav>
            <div className="border-t border-sand px-4 py-3.5 text-xs leading-relaxed text-ink-faint">
              {me.phoneVerified ? "Your contact is verified." : "Security needs your attention."}
            </div>
          </aside>

          <div className="min-w-0">
            <div className="-mx-1 mb-4 overflow-x-auto px-1 pb-1 lg:hidden">
              <nav aria-label="Account sections" className="flex min-w-max gap-2">
                {TABS.map((t) => {
                  const active = tab === t.id;
                  const flag = t.id === "security" && !me.phoneVerified;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => selectTab(t.id)}
                      className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition-colors ${active ? "border-green bg-green text-on-green" : "border-sand bg-cream text-ink-muted hover:border-green/40 hover:text-ink"}`}
                    >
                      <EmptyGlyph name={t.icon} size={15} />
                      {t.label}
                      {flag && <><span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-gold" : "bg-gold-brand"}`} aria-hidden /><span className="sr-only">Action needed</span></>}
                    </button>
                  );
                })}
              </nav>
            </div>

            <section className="rounded-[1.4rem] border border-sand bg-cream shadow-[var(--shadow-card)]">
              <header className="rounded-t-[1.35rem] border-b border-sand bg-paper px-4 py-4 sm:px-6 sm:py-5">
                <p className="text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-gold-text">Account workspace</p>
                <h2 className="mt-1 text-2xl font-semibold text-ink sm:text-[1.75rem]">{current.title}</h2>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">{current.desc}</p>
              </header>
              <div className="p-3 sm:p-5">

        {tab === "profile" && (
          <div className="grid items-start gap-4 xl:grid-cols-12">
            <Panel title="Your photo" lede="Put a face to your name. It shows on your profile and across the community." className="xl:col-span-5">
              <ImageUpload
                value={photo}
                onChange={savePhoto}
                label="Profile photo"
                hint="A clear headshot works best. Square images look best in the circle."
              />
              {photoState === "saving" && <p className="mt-2 text-sm text-ink-faint">Saving…</p>}
              {photoState === "saved" && <p className="mt-2 text-sm text-teal-text">Saved ✓</p>}
              {photoState === "error" && <p className="mt-2 text-sm text-clay-text">Could not save your photo. Try again.</p>}
            </Panel>

            <Panel title="Rep your town" lede="Wear your community pride — your quarter and your Asafo company." className="xl:col-span-7">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Quarter{town && <> · you rep <b className="text-ink-muted">{town.name}</b></>}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {quarters.map((p) => (
                  <button key={p.id} type="button" onClick={() => chooseQuarter(p.id)} className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${p.id === townId ? "border-green bg-green text-on-green" : "border-sand bg-paper text-ink-muted hover:border-green/40"}`}>{p.name}</button>
                ))}
              </div>
              <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-ink-faint">Asafo company</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {asafos.map((p) => (
                  <button key={p.id} type="button" onClick={() => chooseAsafo(p.id)} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${p.id === asafoId ? "border-clay bg-clay text-on-green" : "border-sand bg-paper text-ink-muted hover:border-clay/40"}`}>
                    {p.colors?.[0] && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.colors[0] }} aria-hidden />}
                    {p.name}
                  </button>
                ))}
              </div>
              {affError && <p role="alert" className="mt-3 text-sm text-clay-text">{affError}</p>}
            </Panel>

            <Panel title="Your birthday" lede="Optional. If you turn this on, your followers get a gentle note on your day and your profile shows the day and month — never the year. Off by default." className="xl:col-span-6">
              <div className="space-y-3">
                <BirthdayPicker value={birthday} onChange={(v) => { setBirthday(v); setBdayState("idle"); }} />
                <ToggleField
                  checked={broadcast}
                  onChange={(checked) => { setBroadcast(checked); setBdayState("idle"); }}
                  label="Let my followers know"
                  detail="A gentle birthday note will appear for your followers."
                />
                <div className="flex items-center gap-3">
                  <button type="button" onClick={saveBirthday} disabled={bdayState === "saving"} className="rounded-full bg-green px-5 py-2 text-sm font-semibold text-on-green hover:bg-green-900 disabled:opacity-60">
                    {bdayState === "saving" ? "Saving…" : "Save"}
                  </button>
                  {bdayState === "saved" && <span className="text-sm text-teal-text">Saved ✓</span>}
                  {bdayState === "error" && <span role="alert" className="text-sm text-clay-text">{bdayError}</span>}
                </div>
              </div>
            </Panel>

            <Panel title="Oguaa abroad" lede="Optional. Living away from home? Add yourself to the diaspora — the bridge for homecomings, projects, and giving back. Your name, city and country appear on the public diaspora register until you turn this off. Off by default." className="xl:col-span-6">
              <div className="space-y-3">
                <ToggleField
                  checked={abroad}
                  onChange={(checked) => { setAbroad(checked); setDiaState("idle"); }}
                  label="I live abroad / outside Cape Coast"
                  detail="Opt in to the public diaspora register and keep your home connection visible."
                  tone="teal"
                />
                {abroad && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input value={city} onChange={(e) => { setCity(e.target.value); setDiaState("idle"); }} placeholder="City (e.g. London)" aria-label="City" className="min-w-0 rounded-xl border border-sand bg-cream px-3.5 py-2.5 text-sm text-ink focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/15" />
                    <input value={country} onChange={(e) => { setCountry(e.target.value); setDiaState("idle"); }} placeholder="Country (e.g. United Kingdom)" aria-label="Country" className="min-w-0 rounded-xl border border-sand bg-cream px-3.5 py-2.5 text-sm text-ink focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/15" />
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <button type="button" onClick={saveDiaspora} disabled={diaState === "saving"} className="rounded-full bg-teal px-5 py-2 text-sm font-semibold text-on-green hover:bg-teal-text disabled:opacity-60">
                    {diaState === "saving" ? "Saving…" : "Save"}
                  </button>
                  {diaState === "saved" && <span className="text-sm text-teal-text">Saved ✓</span>}
                  {diaState === "error" && <span className="text-sm text-clay-text">Could not save. Try again.</span>}
                </div>
              </div>
            </Panel>
          </div>
        )}

        {tab === "activity" && (
          <div className="space-y-4">
            {/* Creator upgrade entry — shown only when the member hasn't registered as a creator */}
            {(!me.creatorTypes || me.creatorTypes.length === 0) && (
              <section className="relative overflow-hidden rounded-2xl border border-teal/25 bg-teal/[0.06] p-4 sm:p-5">
                <span className="absolute inset-y-0 left-0 w-1 bg-teal" aria-hidden />
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="max-w-2xl">
                    <p className="eyebrow text-teal-text">Oguaa Creator Studio</p>
                    <h2 className="mt-1 text-xl font-semibold text-ink">Promote your business, art or project</h2>
                    <p className="mt-1 text-sm text-ink-muted">
                      Creators get a dedicated dashboard to manage listings, track views, handle subscriptions and payments, and grow their presence in Cape Coast.
                    </p>
                  </div>
                  <a
                    href={`${CREATOR_URL}/account`}
                    className="shrink-0 rounded-full bg-teal px-5 py-2.5 text-sm font-semibold text-on-green transition-colors hover:bg-teal/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2"
                  >
                    Become a creator →
                  </a>
                </div>
              </section>
            )}

            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.18fr)_minmax(19rem,0.82fr)]">
              <Panel
                title="Your listings"
                lede="Everything you've contributed, with its review status. Promote an approved listing to feature it on the front pages — GH₵ 10 per day."
                action={<Cta to="/submit" variant="outline" className="px-4 py-2 text-xs">+ Add</Cta>}
              >
                {promoConfirmed && (
                  <p className="mb-4 rounded-lg bg-green/[0.08] px-4 py-3 text-sm font-medium text-green-text">
                    Payment confirmed — &ldquo;{promoConfirmed.listingTitle}&rdquo; is now featured for {promoConfirmed.days} days. ✓
                  </p>
                )}
                {promoError && (
                  <p className="mb-4 rounded-lg bg-maroon-900/[0.08] px-4 py-3 text-sm font-medium text-maroon-text">{promoError}</p>
                )}
                <PaymentNotice notice={promoPayment.notice} confirming={promoPayment.confirming} onRecheck={promoPayment.recheck} className="mb-4" />
                <ul className="divide-y divide-sand">
                  {listings.map((l) => {
                    const href = linkFor(l);
                    const featuredUntil = l.featuredUntil && l.featuredUntil > new Date().toISOString() ? l.featuredUntil : null;
                    return (
                      <li key={l.id} className="py-3">
                        {/* Identity row */}
                        <div className="flex items-center gap-3">
                          <Thumb seed={l.slug} label={initials(l.title)} src={l.coverImageUrl} rounded="rounded-lg" className="h-11 w-11 shrink-0" coverWidth={96} />
                          <div className="min-w-0 flex-1">
                            {href
                              ? <Link to={href} className="block truncate font-medium text-ink hover:text-green-text hover:underline">{l.title}</Link>
                              : <p className="truncate font-medium text-ink">{l.title}</p>}
                            <p className="text-xs text-ink-faint">{TYPE_LABELS[l.type]}</p>
                          </div>
                          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${STATUS_STYLE[l.status]}`}>{l.status}</span>
                        </div>
                        {/* Actions row — wraps naturally on narrow screens */}
                        <div className="mt-2 flex flex-wrap items-center gap-2 pl-14">
                          {l.status === "approved" && featuredUntil && (
                            <span className="rounded-full bg-gold/[0.14] px-2.5 py-1 text-xs font-semibold text-gold-text">★ Featured until {formatDate(featuredUntil)}</span>
                          )}
                          {EDITABLE.has(l.type) && (
                            <a href={`${CREATOR_URL}/work/${l.id}/edit`}
                              className="rounded-full border border-sand px-3 py-1 text-xs font-semibold text-ink-muted transition-colors hover:border-gold-border/60 hover:text-gold-text">Edit</a>
                          )}
                          {l.status === "approved" && (promoFor === l.id ? (
                            <>
                              {[7, 14, 30].map((d) => (
                                <button key={d} type="button" onClick={() => promote(l, d)} disabled={promoBusy}
                                  className="rounded-full border border-green px-2.5 py-1 text-xs font-semibold text-green-text transition-colors hover:bg-green hover:text-on-green disabled:opacity-60">
                                  {d}d · GH₵{d * 10}
                                </button>
                              ))}
                              <button type="button" onClick={() => setPromoFor(null)} className="text-xs text-ink-faint hover:text-ink">Cancel</button>
                            </>
                          ) : (
                            <button type="button" onClick={() => { setPromoFor(l.id); setPromoError(null); }}
                              className="rounded-full border border-gold-brand px-3 py-1 text-xs font-semibold text-gold-text transition-colors hover:bg-gold-brand hover:text-green-900">Promote</button>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                  {listings.length === 0 && <li><EmptyState compact icon={<EmptyGlyph name="pen" size={18} />} title="Nothing yet" actions={<Link to="/submit" className="text-sm font-semibold text-green-text">Add your first →</Link>} /></li>}
                </ul>
              </Panel>

              <div className="space-y-4">
                <Panel title="My tickets" lede="Your event tickets and gate codes. Show the code at the entrance.">
                  <ul className="divide-y divide-sand">
                    {tickets.map((t) => (
                      <li key={t.id}>
                        <Link to={`/events/${t.eventSlug}`} className="flex flex-col gap-1 py-3 transition-colors hover:bg-paper sm:flex-row sm:items-center sm:gap-3 sm:py-3.5">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-ink">{t.eventTitle}</p>
                            <p className="text-xs text-ink-faint">{t.qty} × {t.tier} · {formatDate(t.createdAt)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {t.status === "success" && t.code ? (
                              <span className="rounded-md bg-green/[0.08] px-2.5 py-1 font-mono text-sm font-bold tracking-widest text-green-text">{t.code}</span>
                            ) : (
                              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${t.status === "pending" ? "bg-gold/[0.14] text-gold-text" : "bg-maroon-900/[0.08] text-maroon-text"}`}>{t.status}</span>
                            )}
                            {t.checkedInAt && <span className="text-[0.6rem] font-bold uppercase tracking-wide text-ink-faint">admitted</span>}
                          </div>
                        </Link>
                      </li>
                    ))}
                    {tickets.length === 0 && <li><EmptyState compact icon={<EmptyGlyph name="ticket" size={18} />} title="No tickets yet" actions={<Link to="/events" className="text-sm font-semibold text-green-text">See what&rsquo;s on →</Link>} /></li>}
                  </ul>
                </Panel>

                <Panel title="My subscriptions" lede="Your Supporter subscriptions — each payment adds a month to the business.">
                  <ul className="divide-y divide-sand">
                    {subscriptions.map((sub) => (
                      <li key={sub.id}>
                        <SubscriptionRow sub={sub} />
                      </li>
                    ))}
                    {subscriptions.length === 0 && <li><EmptyState compact icon={<EmptyGlyph name="money" size={18} />} title="No subscriptions yet" /></li>}
                  </ul>
                </Panel>
              </div>
            </div>
          </div>
        )}

        {tab === "connections" && (
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(19rem,0.9fr)]">
            <Panel title="Your schooling" lede="Add the schools you attended and the years you were there. Classmates who overlapped with you will show up beside this — the powerhouse of Oguaa's networks.">
              <SchoolingEditor
                schools={schools}
                initial={me.schooling ?? []}
                onSaved={() => setConnKey((k) => k + 1)}
              />
            </Panel>

            <Panel title="People you may know" lede="Classmates, neighbours from your quarter, and members of your Asafo.">
              <PeopleYouMayKnow key={connKey} />
            </Panel>
          </div>
        )}

        {tab === "security" && (
          <div className="grid items-start gap-4 xl:grid-cols-2">
            <Panel title="Contact verification" lede="Submissions stay blocked until your account is verified. Send yourself a code, then enter it here to unlock the submit form." className="xl:col-span-2">
              {me.phoneVerified ? (
                <div className="inline-flex items-center gap-2 rounded-xl border border-green/15 bg-green/[0.06] px-4 py-3 text-sm font-medium text-green-text">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M5 13l4 4L19 7" /></svg>
                  Your contact is verified — you can submit listings and reports.
                </div>
              ) : (
                <div className="space-y-4">
                  <button type="button" onClick={startVerification} disabled={verifyState === "saving"} className="rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-on-green hover:bg-green-900 disabled:opacity-60">
                    {verifyState === "saving" ? "Sending…" : "Send code"}
                  </button>
                  {/* Gate on "a code was sent", not on holding the code. Once
                      the code is delivered by email the response no longer
                      carries it, and gating on the code hid the input entirely. */}
                  {verifyExpiresAt && (
                    <div className="rounded-2xl border border-green/15 bg-paper p-4">
                      <p className="text-sm font-medium text-ink">Enter the 6-digit code</p>
                      {/* The member payload deliberately omits email (it is never
                          exposed publicly), so address the channel, not the value. */}
                      <p className="mt-1 text-sm text-ink-muted">
                        We've sent a code to your email address. It expires in 10 minutes — check your spam folder if it hasn't arrived.
                      </p>
                      <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center">
                        <OtpInput
                          value={verifyCode}
                          onChange={setVerifyCode}
                          onComplete={(value) => { if (verifyState !== "saving") void confirmVerification(value); }}
                          ariaLabel="Verification code"
                          autoFocus
                        />
                        <button type="button" onClick={() => void confirmVerification()} disabled={verifyState === "saving" || verifyCode.trim().length < 6} className="rounded-full bg-clay px-5 py-3 text-sm font-semibold text-on-green hover:bg-clay/90 disabled:opacity-60">
                          {verifyState === "saving" ? "Checking…" : "Confirm code"}
                        </button>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-ink-faint">
                        <button type="button" onClick={startVerification} disabled={verifyState === "saving"} className="font-medium text-green-text underline underline-offset-4 hover:text-green disabled:opacity-60">
                          Didn't get it? Send again
                        </button>
                      </div>
                      {/* Only reachable when no delivery channel is configured —
                          the server says so loudly in its logs. Never expected
                          in production, so it is labelled as a fault, not a feature. */}
                      {verifySentCode && (
                        <p className="mt-3 rounded-lg border border-dashed border-clay/40 bg-clay/[0.05] px-3 py-2 text-sm text-ink">
                          <span className="font-semibold text-clay-text">Email delivery is not configured</span> — showing the code here so local testing still works:{" "}
                          <span className="font-mono font-semibold tracking-[0.18em] text-clay-text">{verifySentCode}</span>
                        </p>
                      )}
                      {verifyError && <p className="mt-3 text-sm text-clay-text">{verifyError}</p>}
                    </div>
                  )}
                </div>
              )}
            </Panel>

            <Panel title="Password" lede="Change your password. You'll need your current one to confirm it's you.">
              <ChangePasswordSettings />
            </Panel>

            <Panel title="Two-factor authentication" lede="Two-factor sign-in with an authenticator app — recommended, and required for curators & stewards.">
              <SecuritySettings />
            </Panel>
          </div>
        )}

        {tab === "notifications" && (
          <div>
            <Panel title="Notification preferences" lede="Product news is off unless you turn it on. Safety, account and payment messages always reach you.">
              <NotificationSettings />
            </Panel>
          </div>
        )}

        {tab === "privacy" && (
          <div className="grid items-start gap-4">
            <Panel title="Your data" lede="Yours to take with you, or to erase — under Ghana's Data Protection Act (Act 843). Account deletion is the danger zone at the foot of this panel.">
              <DataRightsSettings />
            </Panel>
            <Panel title="Writing assistant" lede="Your choice about sending text to an AI provider.">
              <AIConsentSettings />
            </Panel>
            <Panel title="Other requests" lede="Ask us to correct or remove something about you, or object to how your data is used.">
              <ul className="space-y-2 text-sm">
                <li><Link to={LEGAL.privacyRequest} className="font-semibold text-green-text underline">Make a privacy request</Link> <span className="text-ink-muted">— access, correction, deletion or objection.</span></li>
                <li><Link to={LEGAL.deleteAccount} className="font-semibold text-green-text underline">Account deletion page</Link> <span className="text-ink-muted">— what we delete and keep, and deleting with a code.</span></li>
                <li><Link to={LEGAL.privacy} className="font-semibold text-green-text underline">Privacy Policy</Link></li>
              </ul>
            </Panel>
          </div>
        )}
              </div>
            </section>
          </div>
        </div>
      </Container>
    </>
  );
}
