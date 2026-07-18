import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpRight,
  Braces,
  CalendarClock,
  CheckCircle2,
  CloudUpload,
  Globe2,
  KeyRound,
  Languages,
  LogOut,
  MessageSquareText,
  MonitorSmartphone,
  Play,
  RadioTower,
  ServerCog,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card, RoleBadge } from "@/components/ui";
import { MfaManage } from "@/components/mfa";
import { BusyLabel } from "@/components/skeleton";

interface SettingItem {
  label: string;
  value: string;
  meta: string;
  icon: LucideIcon;
  tone: string;
  wide?: boolean;
}

const CONFIGURATION: SettingItem[] = [
  {
    label: "Global AI capacity",
    value: "60 requests / UTC day",
    meta: "OGUAA_AI_DAILY_BUDGET · server default, environment can override",
    icon: Sparkles,
    tone: "bg-ai/[0.1] text-ai",
  },
  {
    label: "Per-member AI capacity",
    value: "20 requests / UTC day",
    meta: "OGUAA_AI_PER_MEMBER · server default, environment can override",
    icon: UserRound,
    tone: "bg-ai/[0.1] text-ai",
  },
  {
    label: "Sign-in policy",
    value: "Password + TOTP two-factor → JWT",
    meta: "AUTH_REQUIRED toggles enforcement",
    icon: KeyRound,
    tone: "bg-green/[0.09] text-green-text",
    wide: true,
  },
  {
    label: "Notification delivery",
    value: "WhatsApp Cloud + Resend",
    meta: "WHATSAPP_TOKEN · WHATSAPP_PHONE_ID · RESEND_API_KEY; development log/no-op fallback",
    icon: MessageSquareText,
    tone: "bg-teal/[0.1] text-teal-text",
  },
  {
    label: "Image uploads",
    value: "Cloudinary or first-party /api/uploads",
    meta: "CDN-backed when Cloudinary is configured",
    icon: CloudUpload,
    tone: "bg-gold/[0.14] text-gold-text",
  },
  {
    label: "Languages",
    value: "English (base) · Fante · Twi · Ga · Ewe",
    meta: "Five supported interface languages",
    icon: Languages,
    tone: "bg-clay/[0.1] text-clay-text",
  },
  {
    label: "Roles",
    value: "member · moderator · editor · curator · steward",
    meta: "Contribution, triage, publishing, moderation and full stewardship",
    icon: UsersRound,
    tone: "bg-maroon-900/[0.09] text-maroon-text",
  },
];

const SURFACES: SettingItem[] = [
  {
    label: "Marketing site",
    value: "Public window",
    meta: "History, culture, visit and news",
    icon: Globe2,
    tone: "bg-gold/[0.14] text-gold-text",
  },
  {
    label: "Client portal",
    value: "Member application",
    meta: "The app Cape Coasters sign into",
    icon: MonitorSmartphone,
    tone: "bg-teal/[0.1] text-teal-text",
  },
  {
    label: "REST / GraphQL",
    value: ":8080/api · :8080/graphql",
    meta: "HTTP application and graph interfaces",
    icon: Braces,
    tone: "bg-green/[0.09] text-green-text",
  },
  {
    label: "gRPC",
    value: "oguaa.v1.OguaaService · :50051",
    meta: "Typed service interface",
    icon: RadioTower,
    tone: "bg-clay/[0.1] text-clay-text",
  },
];

const SECTION_LINKS = [
  { href: "#security", label: "Security", icon: ShieldCheck },
  { href: "#operations", label: "Operations", icon: CalendarClock },
  { href: "#configuration", label: "Configuration", icon: ServerCog },
  { href: "#surfaces", label: "Surfaces", icon: Globe2 },
];

function WorkspaceSection({
  id,
  eyebrow,
  title,
  description,
  children,
}: Readonly<{
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}>) {
  return (
    <Card className="overflow-hidden shadow-[var(--shadow-card)]">
      <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-sand bg-paper/60 px-5 py-4 sm:px-6">
          <div className="max-w-3xl">
            <p className="text-[0.62rem] font-bold uppercase tracking-[0.17em] text-gold-text">{eyebrow}</p>
            <h2 id={`${id}-title`} className="mt-1 text-xl font-semibold text-ink sm:text-2xl">{title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">{description}</p>
          </div>
        </header>
        <div className="p-5 sm:p-6">{children}</div>
      </section>
    </Card>
  );
}

type RemembranceResult = { tone: "success" | "error"; message: string };

function validMonthDay(value: string): boolean {
  if (!/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) return false;
  const [month, day] = value.split("-").map(Number);
  // Leap-year reference preserves 02-29 as a valid anniversary while rejecting
  // impossible month/day combinations such as 02-31 and 04-31.
  const reference = new Date(2000, month - 1, day);
  return reference.getMonth() === month - 1 && reference.getDate() === day;
}

function RemembrancePanel({ canRun }: Readonly<{ canRun: boolean }>) {
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RemembranceResult | null>(null);

  async function run() {
    if (busy || !canRun) return;
    const requestedDate = date.trim();
    if (requestedDate && !validMonthDay(requestedDate)) {
      setResult({ tone: "error", message: "Use MM-DD, for example 03-06." });
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const { created } = await api.runRemembrance(requestedDate || undefined);
      const noun = created === 1 ? "notice" : "notices";
      setResult({
        tone: "success",
        message: created === 0
          ? "No anniversaries today — no notices sent."
          : `Sent ${created} remembrance ${noun}.`,
      });
    } catch (error) {
      setResult({ tone: "error", message: error instanceof Error ? error.message : "Could not run remembrance." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <WorkspaceSection
      id="operations"
      eyebrow="Daily rhythm"
      title="Remembrance operations"
      description="The scheduler runs automatically at 06:00 UTC. Use this control for a manual run or a dated back-fill."
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.82fr)] lg:items-end">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gold/[0.14] text-gold-text">
            <CalendarClock size={20} aria-hidden />
          </span>
          <div>
            <p className="font-semibold text-ink">Yearly remembrance</p>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-muted">
              Finds memorial anniversaries and opted-in birthdays, then sends the same notices as the daily scheduler.
            </p>
            <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${canRun ? "bg-green/[0.09] text-green-text" : "bg-maroon-900/[0.09] text-maroon-text"}`}>
              {canRun ? "Steward control enabled" : "Steward access required"}
            </span>
          </div>
        </div>

        <form
          onSubmit={(event) => { event.preventDefault(); void run(); }}
          aria-busy={busy}
          className="rounded-xl border border-sand bg-paper p-4"
        >
          <label htmlFor="remembrance-date" className="text-xs font-bold uppercase tracking-[0.12em] text-ink-faint">
            Back-fill date <span className="font-medium normal-case tracking-normal">(optional)</span>
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id="remembrance-date"
              value={date}
              onChange={(event) => { setDate(event.target.value); setResult(null); }}
              placeholder="MM-DD"
              inputMode="numeric"
              maxLength={5}
              pattern="(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])"
              aria-describedby="remembrance-help"
              disabled={!canRun || busy}
              className="min-w-0 flex-1 rounded-xl border border-sand bg-cream px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-gold-border focus:outline-none focus:ring-2 focus:ring-gold/20 disabled:cursor-not-allowed disabled:opacity-55"
            />
            <button
              type="submit"
              disabled={!canRun || busy}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-green px-4 py-2.5 text-sm font-semibold text-on-green shadow-sm transition-colors hover:bg-green-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <BusyLabel label="Running remembrance task" className="justify-center" /> : <><Play size={16} aria-hidden />Run now</>}
            </button>
          </div>
          <p id="remembrance-help" className="mt-2 text-xs text-ink-faint">
            Leave blank for today, or use MM-DD for a back-fill.
          </p>
        </form>
      </div>

      {result && (
        <div
          role={result.tone === "error" ? "alert" : "status"}
          aria-live="polite"
          className={`mt-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
            result.tone === "error"
              ? "border-clay/30 bg-clay/[0.06] text-clay-text"
              : "border-green/20 bg-green/[0.06] text-green-text"
          }`}
        >
          {result.tone === "error" ? <AlertTriangle size={17} aria-hidden /> : <CheckCircle2 size={17} aria-hidden />}
          <span>{result.message}</span>
        </div>
      )}
    </WorkspaceSection>
  );
}

function ConfigurationGrid() {
  return (
    <div className="grid gap-px overflow-hidden rounded-xl border border-sand bg-sand md:grid-cols-2">
      {CONFIGURATION.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.label} className={`min-w-0 bg-paper p-4 sm:p-5 ${item.wide ? "md:col-span-2" : ""}`}>
            <div className="flex items-start gap-3">
              <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${item.tone}`}>
                <Icon size={18} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-[0.64rem] font-bold uppercase tracking-[0.13em] text-ink-faint">{item.label}</p>
                <p className="mt-1 break-words text-sm font-semibold leading-relaxed text-ink">{item.value}</p>
                <p className="mt-1 break-words font-mono text-[0.68rem] leading-relaxed text-ink-faint">{item.meta}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SurfaceGrid() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {SURFACES.map((surface) => {
        const Icon = surface.icon;
        return (
          <article key={surface.label} className="group relative overflow-hidden rounded-xl border border-sand bg-paper p-4 transition-colors hover:border-gold-border/60">
            <span className={`grid size-10 place-items-center rounded-xl ${surface.tone}`}>
              <Icon size={19} aria-hidden />
            </span>
            <p className="mt-4 text-[0.64rem] font-bold uppercase tracking-[0.13em] text-ink-faint">{surface.label}</p>
            <p className="mt-1 break-all text-sm font-semibold leading-relaxed text-ink">{surface.value}</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">{surface.meta}</p>
          </article>
        );
      })}
    </div>
  );
}

export function Component() {
  const { member, signOut } = useAuth();
  const displayName = member?.displayName ?? "Your account";
  const initials = displayName.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
  const mfaEnabled = Boolean(member?.mfaEnabled);
  const mfaLabel = mfaEnabled ? "Protected" : member?.role === "moderator" ? "Optional" : "Needs setup";
  const canRunRemembrance = member?.role === "steward";

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-[1.35rem] bg-green-900 px-5 py-6 text-on-green shadow-[var(--shadow-card)] sm:px-7 sm:py-7">
        <span aria-hidden className="pointer-events-none absolute -right-8 -top-16 select-none font-display text-[12rem] font-semibold leading-none text-on-green/[0.035]">S</span>
        <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(26rem,0.72fr)] xl:items-end">
          <div className="max-w-2xl">
            <p className="text-[0.62rem] font-bold uppercase tracking-[0.18em] text-gold">Platform control room</p>
            <h1 className="mt-1.5 text-3xl font-semibold text-on-green sm:text-[2rem]">Settings &amp; security</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-on-green/70">
              Protect staff access, run scheduled community operations and see how every Oguaa surface is configured.
            </p>
          </div>

          <dl className="grid grid-cols-2 overflow-hidden rounded-xl border border-on-green/10 bg-on-green/[0.055] sm:grid-cols-4 xl:grid-cols-2">
            <div className="border-b border-r border-on-green/10 px-3.5 py-3 sm:border-b-0 xl:border-b">
              <dt className="text-[0.58rem] font-bold uppercase tracking-[0.13em] text-on-green/60">Your role</dt>
              <dd className="mt-1 text-sm font-semibold capitalize text-on-green">{member?.role ?? "Staff"}</dd>
            </div>
            <div className="border-b border-on-green/10 px-3.5 py-3 sm:border-b-0 sm:border-r xl:border-b xl:border-r-0">
              <dt className="text-[0.58rem] font-bold uppercase tracking-[0.13em] text-on-green/60">Two-factor</dt>
              <dd className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-on-green">
                <span className={`size-1.5 rounded-full ${mfaEnabled ? "bg-teal" : "bg-gold"}`} aria-hidden />
                {mfaLabel}
              </dd>
            </div>
            <div className="border-r border-on-green/10 px-3.5 py-3">
              <dt className="text-[0.58rem] font-bold uppercase tracking-[0.13em] text-on-green/60">Session</dt>
              <dd className="mt-1 text-sm font-semibold text-on-green">30 days</dd>
            </div>
            <div className="px-3.5 py-3">
              <dt className="text-[0.58rem] font-bold uppercase tracking-[0.13em] text-on-green/60">Scheduler</dt>
              <dd className="mt-1 text-sm font-semibold text-on-green">06:00 UTC</dd>
            </div>
          </dl>
        </div>
      </section>

      <nav aria-label="Settings sections" className="flex gap-1.5 overflow-x-auto rounded-xl border border-sand bg-cream p-1.5 shadow-sm">
        {SECTION_LINKS.map((item) => {
          const Icon = item.icon;
          return (
            <a
              key={item.href}
              href={item.href}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold text-ink-muted transition-colors hover:bg-paper hover:text-green-text focus-visible:bg-paper"
            >
              <Icon size={15} aria-hidden />
              {item.label}
            </a>
          );
        })}
      </nav>

      <WorkspaceSection
        id="security"
        eyebrow="Staff access"
        title="Account & security"
        description="Your console identity, active session and authenticator protection in one place."
      >
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-sand bg-paper p-4 sm:p-5">
            <div className="flex min-w-0 items-center gap-3.5">
              <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-green text-sm font-bold text-on-green shadow-sm">{initials}</span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-semibold text-ink">{displayName}</p>
                  {member && <RoleBadge role={member.role} />}
                </div>
                <p className="mt-1 text-sm text-ink-muted">Phone or email + password · JWT session</p>
              </div>
            </div>
            <Link to="/profile" className="inline-flex items-center gap-1.5 rounded-full border border-sand bg-cream px-3.5 py-2 text-sm font-semibold text-ink transition-colors hover:border-gold-border hover:text-gold-text">
              Edit profile <ArrowUpRight size={15} aria-hidden />
            </Link>
          </div>

          <dl className="grid gap-px overflow-hidden rounded-xl border border-sand bg-sand sm:grid-cols-3">
            <div className="bg-paper p-4">
              <dt className="text-[0.62rem] font-bold uppercase tracking-[0.13em] text-ink-faint">Sign-in</dt>
              <dd className="mt-1 text-sm font-semibold text-ink">Phone or email + password</dd>
            </div>
            <div className="bg-paper p-4">
              <dt className="text-[0.62rem] font-bold uppercase tracking-[0.13em] text-ink-faint">Session lifetime</dt>
              <dd className="mt-1 text-sm font-semibold text-ink">30 days</dd>
            </div>
            <div className="bg-paper p-4">
              <dt className="text-[0.62rem] font-bold uppercase tracking-[0.13em] text-ink-faint">Authentication</dt>
              <dd className="mt-1 text-sm font-semibold text-ink">TOTP two-factor → JWT</dd>
            </div>
          </dl>

          <div className="rounded-xl border border-green/15 bg-green/[0.035] p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-green/10 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="grid size-9 place-items-center rounded-xl bg-green/[0.1] text-green-text">
                  <ShieldCheck size={18} aria-hidden />
                </span>
                <div>
                  <h3 className="font-semibold text-ink">Two-factor authentication</h3>
                  <p className="text-xs text-ink-muted">Authenticator app and one-time recovery codes</p>
                </div>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${mfaEnabled ? "bg-green/[0.1] text-green-text" : "bg-gold/[0.15] text-gold-text"}`}>
                {mfaEnabled ? "On" : member?.role === "moderator" ? "Optional" : "Setup required"}
              </span>
            </div>
            <MfaManage />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sand pt-4">
            <div>
              <p className="text-sm font-semibold text-ink">End this session</p>
              <p className="mt-0.5 text-xs text-ink-muted">Sign back in with your staff credentials to return.</p>
            </div>
            <button
              type="button"
              onClick={signOut}
              className="inline-flex items-center gap-2 rounded-full border border-maroon-text/45 px-4 py-2 text-sm font-semibold text-maroon-text transition-colors hover:bg-maroon-900/[0.06]"
            >
              <LogOut size={15} aria-hidden /> Sign out
            </button>
          </div>
        </div>
      </WorkspaceSection>

      <RemembrancePanel canRun={canRunRemembrance} />

      <WorkspaceSection
        id="configuration"
        eyebrow="Server managed"
        title="Platform configuration"
        description="These controls are set on the Go backend. Limit figures shown here are defaults and may be overridden by the environment."
      >
        <ConfigurationGrid />
      </WorkspaceSection>

      <WorkspaceSection
        id="surfaces"
        eyebrow="One engine · many doors"
        title="Platform surfaces"
        description="The public, member and service interfaces powered by the same Oguaa platform."
      >
        <SurfaceGrid />
      </WorkspaceSection>
    </div>
  );
}
