import { useEffect, useState, type ReactNode, type FormEvent, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Bell, CalendarDays, Check, CircleCheck, Eye, EyeOff, Lock, Mail, Monitor, Moon, Phone, ShieldCheck, SlidersHorizontal, Sun } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { RoleBadge, VerifiedBadge } from "@/components/ui";
import { MfaManage } from "@/components/mfa";
import { BusyLabel } from "@/components/skeleton";
import { formatDate } from "@/lib/format";
import { type Theme, type ThemeMode, getThemeMode, onThemeChange, resolveThemeMode, setThemeMode } from "@/lib/theme";

// The studio's cream input + green primary button idioms (matches auth-gate).
const inputCls =
  "min-h-12 w-full rounded-xl border border-sand bg-cream px-4 py-3 text-ink placeholder:text-ink-faint transition-colors focus:border-gold-border focus:bg-paper focus:outline-none focus:ring-2 focus:ring-gold/20";
const primaryBtn =
  "min-h-11 rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-on-green shadow-sm transition-colors hover:bg-green-900 disabled:opacity-60";

function SectionHeading({ id, number, icon, kicker, title, description }: Readonly<{
  id: string;
  number: string;
  icon: ReactNode;
  kicker: string;
  title: string;
  description: string;
}>) {
  return (
    <div className="flex items-start gap-3 sm:gap-4">
      <span className="mt-0.5 text-[0.65rem] font-semibold tracking-[0.18em] text-gold-text">{number}</span>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-gold-border/35 bg-gold/[0.1] text-gold-text">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-ink-faint">{kicker}</p>
          <h2 id={id} className="mt-1 text-2xl font-semibold text-ink">{title}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">{description}</p>
        </div>
      </div>
    </div>
  );
}

/** A key/value contact row with a leading icon. Renders nothing when empty. */
function ContactRow({ icon, label, value }: Readonly<{ icon: ReactNode; label: string; value?: string }>) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-3 border-b border-sand py-3 last:border-0">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sand/70 text-ink-muted">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{label}</p>
        <p className="truncate text-sm text-ink">{value}</p>
      </div>
    </div>
  );
}

/** A password field reusing the auth-gate show/hide pattern (Eye / EyeOff). */
function PasswordField({ label, value, onChange, autoComplete, placeholder, autoFocus }: Readonly<{
  label: string; value: string; onChange: (v: string) => void;
  autoComplete: string; placeholder?: string; autoFocus?: boolean;
}>) {
  const [show, setShow] = useState(false);
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={`${inputCls} pr-12`}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
          className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-ink-faint transition-colors hover:bg-sand/60 hover:text-ink"
        >
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </label>
  );
}

type PwState = "idle" | "saving" | "saved" | "error";

/** Change-password form — current + new + confirm, calls api.changePassword. */
function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<PwState>("idle");
  const [err, setErr] = useState<string | null>(null);

  const canSubmit = current.length > 0 && next.length > 0 && confirm.length > 0 && state !== "saving";

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    if (next.length < 8) { setState("error"); setErr("Your new password must be at least 8 characters."); return; }
    if (next !== confirm) { setState("error"); setErr("The new passwords don't match."); return; }
    if (next === current) { setState("error"); setErr("Choose a new password that's different from your current one."); return; }
    setState("saving");
    try {
      await api.changePassword(current, next);
      setCurrent(""); setNext(""); setConfirm("");
      setState("saved");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't change your password.");
      setState("error");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <PasswordField label="Current password" value={current} onChange={(v) => { setCurrent(v); setState("idle"); }} autoComplete="current-password" placeholder="Your current password" />
      <div className="grid gap-4 sm:grid-cols-2">
        <PasswordField label="New password" value={next} onChange={(v) => { setNext(v); setState("idle"); }} autoComplete="new-password" placeholder="At least 8 characters" />
        <PasswordField label="Confirm new password" value={confirm} onChange={(v) => { setConfirm(v); setState("idle"); }} autoComplete="new-password" placeholder="Re-enter it" />
      </div>
      {err && <p className="rounded-lg border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay-text" role="alert">{err}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={!canSubmit} aria-busy={state === "saving" || undefined} className={primaryBtn}>
          {state === "saving" ? <BusyLabel label="Updating password" width="w-20" /> : "Update password"}
        </button>
        {state === "saved" && (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-text" role="status">
            <Check size={15} aria-hidden /> Password updated
          </span>
        )}
      </div>
    </form>
  );
}

const THEME_MODES: { value: ThemeMode; label: string; description: string; icon: ReactNode }[] = [
  { value: "system", label: "System", description: "Match this device", icon: <Monitor size={18} aria-hidden /> },
  { value: "light", label: "Light", description: "Bright studio canvas", icon: <Sun size={18} aria-hidden /> },
  { value: "dark", label: "Dark", description: "Low-light workspace", icon: <Moon size={18} aria-hidden /> },
];

/** System / Light / Dark segmented control driving the shared theme system. */
function ThemeSegment() {
  const [mode, setMode] = useState<ThemeMode>(getThemeMode);
  const [resolved, setResolved] = useState<Theme>(() => resolveThemeMode(getThemeMode()));

  // Stay in sync with the header toggle (same-tab event) and, while on
  // "System", with live OS light/dark changes.
  useEffect(() => {
    const sync = () => { const m = getThemeMode(); setMode(m); setResolved(resolveThemeMode(m)); };
    const off = onThemeChange(sync);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onMq = () => { if (getThemeMode() === "system") setThemeMode("system"); };
    mq.addEventListener?.("change", onMq);
    return () => { off(); mq.removeEventListener?.("change", onMq); };
  }, []);

  function pick(event: MouseEvent<HTMLButtonElement>, nextMode: ThemeMode) {
    const nextResolved = resolveThemeMode(nextMode);
    const rect = event.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const apply = () => {
      setThemeMode(nextMode);
      setMode(nextMode);
      setResolved(nextResolved);
    };

    if (nextResolved === resolved || !document.startViewTransition || reduceMotion) {
      apply();
      return;
    }

    const transition = document.startViewTransition(apply);
    void transition.ready
      .then(() => {
        const max = Math.hypot(
          Math.max(x, window.innerWidth - x),
          Math.max(y, window.innerHeight - y),
        );
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${max}px at ${x}px ${y}px)`] },
          { duration: 450, easing: "ease-in-out", pseudoElement: "::view-transition-new(root)" },
        );
      })
      .catch(() => {});
  }

  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label="Theme">
        {THEME_MODES.map((opt) => {
          const selected = opt.value === mode;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={selected}
              onClick={(e) => pick(e, opt.value)}
              className={`group relative min-h-24 overflow-hidden rounded-2xl border p-3 text-left transition-all ${
                selected
                  ? "border-gold-border bg-paper text-ink shadow-[0_10px_28px_-20px_rgba(12,44,31,0.65)]"
                  : "border-sand bg-cream text-ink-muted hover:border-gold-border/45 hover:text-ink"
              }`}
            >
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${selected ? "bg-green text-on-green" : "bg-paper text-ink-muted"}`}>
                {opt.icon}
              </span>
              <span className="mt-3 block text-sm font-semibold">{opt.label}</span>
              <span className="mt-0.5 block text-xs font-normal text-ink-faint">{opt.description}</span>
              {selected && <CircleCheck size={17} aria-hidden className="absolute right-3 top-3 text-gold-text" />}
            </button>
          );
        })}
      </div>
      <p className="mt-3 border-l-2 border-gold-border/50 pl-3 text-xs text-ink-faint">
        {mode === "system"
          ? `Follows your device — currently ${resolved === "dark" ? "dark" : "light"}.`
          : `Always ${mode} on this device.`}
      </p>
    </div>
  );
}

/** A row toggle switch (device-local preference). */
function Toggle({ checked, onChange, label, description }: Readonly<{ checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }>) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-sand px-1 py-4 last:border-0">
      <div className="min-w-0 pr-2">
        <p className="text-sm font-medium text-ink">{label}</p>
        {description && <p className="mt-1 max-w-xl text-xs leading-relaxed text-ink-faint">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className="relative h-11 w-14 shrink-0 rounded-full"
      >
        <span className={`absolute inset-x-0 top-1/2 h-7 -translate-y-1/2 rounded-full transition-colors ${checked ? "bg-green" : "bg-sand"}`} aria-hidden />
        <span className={`absolute left-1 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-paper shadow ring-1 ring-black/5 transition-transform ${checked ? "translate-x-6" : ""}`} aria-hidden />
      </button>
    </div>
  );
}

const NOTIFY_KEY = "oguaa.creator.notifications";
const NOTIFY_ITEMS: { id: string; label: string; description: string }[] = [
  { id: "listings", label: "Listing reviews", description: "When a listing is approved, needs changes, or goes live." },
  { id: "earnings", label: "Supporters & earnings", description: "Ticket sales, subscriptions, promotions, and pledges." },
  { id: "team", label: "Team & institutions", description: "Invitations and changes to institutions you manage." },
  { id: "product", label: "Product news", description: "Occasional tips and new studio features." },
];

/**
 * Notification preferences. The member model carries no server-side delivery
 * preferences yet, so — per the brief's "documented placeholder" — these persist
 * on this device (localStorage) and are clearly labelled as such. When a
 * /api/me/notification-prefs endpoint lands, swap the read/write for the API.
 */
function NotificationPrefs() {
  const [prefs, setPrefs] = useState<Record<string, boolean>>(() => {
    const defaults = Object.fromEntries(NOTIFY_ITEMS.map((i) => [i.id, true]));
    try {
      const saved = JSON.parse(localStorage.getItem(NOTIFY_KEY) ?? "{}") as Record<string, boolean>;
      return { ...defaults, ...saved };
    } catch {
      return defaults;
    }
  });

  function set(id: string, value: boolean) {
    setPrefs((cur) => {
      const nextPrefs = { ...cur, [id]: value };
      try { localStorage.setItem(NOTIFY_KEY, JSON.stringify(nextPrefs)); } catch { /* ignore */ }
      return nextPrefs;
    });
  }

  return (
    <div>
      <div className="rounded-2xl border border-sand bg-paper px-4 sm:px-5">
        {NOTIFY_ITEMS.map((item) => (
          <Toggle key={item.id} label={item.label} description={item.description} checked={prefs[item.id] ?? true} onChange={(v) => set(item.id, v)} />
        ))}
      </div>
      <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-ink-faint">
        <Monitor size={14} className="mt-0.5 shrink-0" aria-hidden />
        Saved on this device for now. Account-wide delivery preferences are on the way.
      </p>
    </div>
  );
}

export function Component() {
  const { member } = useAuth();
  if (!member) return null;

  const contactCount = Number(Boolean(member.email)) + Number(Boolean(member.phone));
  const creatorTypeCount = member.creatorTypes?.length ?? 0;
  const initial = member.displayName.trim().charAt(0).toUpperCase() || "O";

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="relative overflow-hidden rounded-[1.75rem] bg-green-900 px-5 py-7 text-on-green sm:px-8 sm:py-9" aria-labelledby="settings-title">
        <div className="absolute -right-14 -top-20 h-52 w-52 rounded-full border border-gold/20" aria-hidden />
        <div className="absolute -right-2 top-12 h-32 w-32 rounded-full border border-gold/15" aria-hidden />
        <div className="absolute bottom-0 right-0 h-24 w-2/5 bg-gradient-to-l from-gold/[0.08] to-transparent" aria-hidden />

        <div className="relative max-w-3xl">
          <div className="flex items-center gap-2 text-[0.65rem] font-bold uppercase tracking-[0.18em] text-gold">
            <SlidersHorizontal size={14} aria-hidden /> Studio control room
          </div>
          <h1 id="settings-title" className="mt-3 text-3xl font-semibold text-on-green sm:text-4xl">Your studio, set your way.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-on-green/70 sm:text-base">
            Manage your creator identity, workspace preferences, contact signals, and the protection around your account.
          </p>
        </div>

        <div className="relative mt-7 grid gap-px overflow-hidden rounded-2xl border border-on-green/10 bg-on-green/10 sm:grid-cols-3">
          <div className="bg-green-900/80 px-4 py-3.5">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.13em] text-on-green/50">Account standing</p>
            <p className="mt-1 flex items-center gap-2 text-sm font-semibold"><CircleCheck size={15} className="text-gold" aria-hidden /> {member.verified ? "Identity verified" : "Creator profile active"}</p>
          </div>
          <div className="bg-green-900/80 px-4 py-3.5">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.13em] text-on-green/50">Sign-in protection</p>
            <p className="mt-1 flex items-center gap-2 text-sm font-semibold"><ShieldCheck size={15} className="text-gold" aria-hidden /> {member.mfaEnabled ? "Two-factor on" : "Password protected"}</p>
          </div>
          <div className="bg-green-900/80 px-4 py-3.5">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.13em] text-on-green/50">Contact reach</p>
            <p className="mt-1 flex items-center gap-2 text-sm font-semibold"><Mail size={15} className="text-gold" aria-hidden /> {contactCount === 0 ? "No channel on file" : `${contactCount} ${contactCount === 1 ? "channel" : "channels"} on file`}</p>
          </div>
        </div>
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[18rem_minmax(0,1fr)] xl:gap-6">
        <aside className="overflow-hidden rounded-[1.5rem] border border-sand bg-cream xl:sticky xl:top-5" aria-label="Account overview">
          <div className="border-b border-sand bg-paper p-5">
            <div className="flex items-center gap-3.5">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-green text-2xl font-semibold text-on-green shadow-sm" aria-hidden>{initial}</span>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-ink">{member.displayName}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <RoleBadge role={member.role} />
                  {member.verified && <VerifiedBadge label={member.verifiedAs ? `Verified · ${member.verifiedAs}` : "Verified"} />}
                </div>
              </div>
            </div>
            {creatorTypeCount > 0 && (
              <p className="mt-4 border-l-2 border-gold-border/50 pl-3 text-xs text-ink-faint">
                {creatorTypeCount} creator {creatorTypeCount === 1 ? "type" : "types"} connected to this profile.
              </p>
            )}
          </div>

          <div className="p-5">
            <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-ink-faint">Studio status</p>
            <div className="mt-3 space-y-3">
              <div className="flex items-center gap-3 text-sm text-ink">
                <span className="h-2 w-2 rounded-full bg-teal" aria-hidden />
                <span className="flex-1">Profile</span>
                <span className="text-xs font-medium text-teal-text">Active</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-ink">
                <span className={`h-2 w-2 rounded-full ${member.mfaEnabled ? "bg-teal" : "bg-gold"}`} aria-hidden />
                <span className="flex-1">Two-factor</span>
                <span className={`text-xs font-medium ${member.mfaEnabled ? "text-teal-text" : "text-gold-text"}`}>{member.mfaEnabled ? "On" : "Optional"}</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-ink">
                <span className={`h-2 w-2 rounded-full ${contactCount > 0 ? "bg-teal" : "bg-clay"}`} aria-hidden />
                <span className="flex-1">Contact</span>
                <span className={`text-xs font-medium ${contactCount > 0 ? "text-teal-text" : "text-clay-text"}`}>{contactCount > 0 ? "Ready" : "Missing"}</span>
              </div>
            </div>
          </div>

          <div className="border-t border-sand px-5 py-2">
            <ContactRow icon={<Mail size={15} aria-hidden />} label="Email" value={member.email} />
            <ContactRow icon={<Phone size={15} aria-hidden />} label="Phone" value={member.phone} />
            <ContactRow icon={<CalendarDays size={15} aria-hidden />} label="Joined" value={formatDate(member.joinedAt)} />
            {!member.email && !member.phone && <p className="py-3 text-xs text-ink-faint">No contact details on file.</p>}
          </div>

          <div className="border-t border-sand p-3">
            <Link to="/account" className="flex min-h-11 items-center justify-between rounded-xl px-3 text-sm font-semibold text-gold-text transition-colors hover:bg-gold/[0.1]">
              Edit public profile <ArrowUpRight size={16} aria-hidden />
            </Link>
          </div>
        </aside>

        <div className="min-w-0 space-y-5 sm:space-y-6">
          <section className="overflow-hidden rounded-[1.5rem] border border-sand bg-paper" aria-labelledby="appearance-title">
            <div className="border-b border-sand px-5 py-5 sm:px-7 sm:py-6">
              <SectionHeading
                id="appearance-title"
                number="01"
                icon={<Sun size={18} aria-hidden />}
                kicker="Appearance"
                title="Choose your working light"
                description="Set the studio to follow this device, stay bright, or settle into a lower-light canvas."
              />
            </div>
            <div className="bg-cream/55 px-5 py-5 sm:px-7 sm:py-6">
              <ThemeSegment />
            </div>
          </section>

          <section className="relative overflow-hidden rounded-[1.5rem] border border-sand bg-cream px-5 py-5 sm:px-7 sm:py-7" aria-labelledby="notifications-title">
            <div className="absolute bottom-0 right-0 h-32 w-32 rounded-tl-full bg-gold/[0.06]" aria-hidden />
            <div className="relative">
              <SectionHeading
                id="notifications-title"
                number="02"
                icon={<Bell size={18} aria-hidden />}
                kicker="Signals"
                title="Decide what reaches you"
                description="Keep the useful studio moments close and quiet the channels you do not need."
              />
              <div className="mt-6 sm:ml-[4.25rem]">
                <NotificationPrefs />
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-[1.5rem] border border-green/30 bg-paper" aria-labelledby="security-title">
            <div className="bg-green-900 px-5 py-6 text-on-green sm:px-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3 sm:gap-4">
                  <span className="mt-0.5 text-[0.65rem] font-semibold tracking-[0.18em] text-gold">03</span>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-gold/25 bg-gold/[0.12] text-gold">
                    <ShieldCheck size={19} aria-hidden />
                  </span>
                  <div>
                    <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-on-green/55">Security</p>
                    <h2 id="security-title" className="mt-1 text-2xl font-semibold text-on-green">Protect the work behind the work</h2>
                    <p className="mt-1 max-w-2xl text-sm leading-relaxed text-on-green/65">Refresh your password and add a second sign-in step from one protected station.</p>
                  </div>
                </div>
                <span className={`inline-flex min-h-8 items-center gap-2 rounded-full border px-3 text-xs font-semibold ${member.mfaEnabled ? "border-teal/40 bg-teal/15 text-on-green" : "border-gold/30 bg-gold/[0.1] text-gold"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${member.mfaEnabled ? "bg-teal" : "bg-gold"}`} aria-hidden />
                  {member.mfaEnabled ? "Two-factor active" : "Password only"}
                </span>
              </div>
            </div>

            <div className="grid lg:grid-cols-[1.1fr_0.9fr]">
              <div className="px-5 py-6 sm:px-7 sm:py-7">
                <div className="mb-5 flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-clay/[0.1] text-clay-text"><Lock size={17} aria-hidden /></span>
                  <div>
                    <h3 className="text-sm font-semibold text-ink">Change password</h3>
                    <p className="text-xs text-ink-faint">Use at least eight characters.</p>
                  </div>
                </div>
                <ChangePassword />
              </div>
              <div className="border-t border-sand bg-cream px-5 py-6 sm:px-7 sm:py-7 lg:border-l lg:border-t-0">
                <div className="mb-5 flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal/[0.1] text-teal-text"><ShieldCheck size={17} aria-hidden /></span>
                  <div>
                    <h3 className="text-sm font-semibold text-ink">Two-factor sign-in</h3>
                    <p className="text-xs text-ink-faint">Authenticator app · TOTP</p>
                  </div>
                </div>
                <MfaManage />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
