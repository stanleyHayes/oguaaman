import { useEffect, useState, type ReactNode } from "react";
import {
  Bell, CalendarDays, Check, Eye, EyeOff, Lock, Mail, Monitor, Moon, Phone,
  ShieldCheck, SlidersHorizontal, Sun, UserRound,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card, RoleBadge, VerifiedBadge } from "@/components/ui";
import { MfaManage } from "@/components/mfa";
import { formatDate } from "@/lib/format";
import {
  type Theme, type ThemeMode,
  getThemeMode, onThemeChange, resolveThemeMode, setThemeMode,
} from "@/lib/theme";

// The studio's cream input + green primary button idioms (matches auth-gate).
const inputCls =
  "w-full rounded-xl border border-sand bg-cream px-4 py-3 text-ink placeholder:text-ink-faint transition-colors focus:border-gold-border focus:bg-paper focus:outline-none focus:ring-2 focus:ring-gold/20";
const primaryBtn =
  "rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-on-green shadow-sm transition-colors hover:bg-green-900 disabled:opacity-60";

/**
 * A titled section card — the aura settings "section-card" feel (icon-led
 * header) carrying the admin console's gold accent bar (admin/src/pages/
 * Settings.tsx). Every settings group lives in one.
 */
function Section({ icon, title, description, children }: Readonly<{ icon: ReactNode; title: string; description?: string; children: ReactNode }>) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center gap-3 border-l-2 border-gold-border/60 pl-3.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gold-border/40 bg-gold/[0.1] text-gold-text">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </Card>
  );
}

/** A key/value contact row with a leading icon. Renders nothing when empty. */
function ContactRow({ icon, label, value }: Readonly<{ icon: ReactNode; label: string; value?: string }>) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sand/60 text-ink-muted">{icon}</span>
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
          className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint transition-colors hover:text-ink"
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

  async function submit(e: React.FormEvent<HTMLFormElement>) {
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
      {err && <p className="rounded-lg border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay-text">{err}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={!canSubmit} className={primaryBtn}>
          {state === "saving" ? "Saving…" : "Update password"}
        </button>
        {state === "saved" && (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-text">
            <Check size={15} aria-hidden /> Password updated
          </span>
        )}
      </div>
    </form>
  );
}

const THEME_MODES: { value: ThemeMode; label: string; icon: ReactNode }[] = [
  { value: "system", label: "System", icon: <Monitor size={15} aria-hidden /> },
  { value: "light", label: "Light", icon: <Sun size={15} aria-hidden /> },
  { value: "dark", label: "Dark", icon: <Moon size={15} aria-hidden /> },
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

  function pick(nextMode: ThemeMode) {
    setThemeMode(nextMode);
    setMode(nextMode);
    setResolved(resolveThemeMode(nextMode));
  }

  return (
    <div>
      <div className="flex rounded-xl border border-sand bg-cream p-1" role="group" aria-label="Theme">
        {THEME_MODES.map((opt) => {
          const selected = opt.value === mode;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={selected}
              onClick={() => pick(opt.value)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition-colors ${
                selected ? "bg-paper text-ink shadow-sm ring-1 ring-gold-border/30" : "text-ink-muted hover:text-ink"
              }`}
            >
              {opt.icon}
              {opt.label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-ink-faint">
        {mode === "system"
          ? `Follows your device — currently ${resolved === "dark" ? "dark" : "light"}.`
          : `Always ${mode}, on every device you sign in on here.`}
      </p>
    </div>
  );
}

/** A row toggle switch (device-local preference). */
function Toggle({ checked, onChange, label, description }: Readonly<{ checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }>) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-sand py-3.5 last:border-0">
      <div className="min-w-0 pr-2">
        <p className="text-sm font-medium text-ink">{label}</p>
        {description && <p className="mt-0.5 text-xs text-ink-faint">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-green" : "bg-sand"}`}
      >
        <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-paper shadow ring-1 ring-black/5 transition-transform ${checked ? "translate-x-5" : ""}`} aria-hidden />
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
      <div>
        {NOTIFY_ITEMS.map((item) => (
          <Toggle key={item.id} label={item.label} description={item.description} checked={prefs[item.id] ?? true} onChange={(v) => set(item.id, v)} />
        ))}
      </div>
      <p className="mt-3 rounded-lg border border-sand bg-paper px-3 py-2 text-xs text-ink-faint">
        Saved on this device for now. Account-wide delivery preferences are on the way.
      </p>
    </div>
  );
}

export function Component() {
  const { member } = useAuth();
  if (!member) return null;

  return (
    <>
      <div className="mb-6">
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-gold-text">Account</p>
        <h1 className="mt-1 text-3xl font-semibold text-ink">Settings</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Your account, how you sign in, and how the studio looks and reaches you.
        </p>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {/* Account */}
        <Section icon={<UserRound size={17} aria-hidden />} title="Account" description="Who you are in the studio.">
          <div className="rounded-xl border border-sand bg-paper p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold text-ink">{member.displayName}</span>
              {member.verified && <VerifiedBadge label={member.verifiedAs ? `Verified · ${member.verifiedAs}` : "Verified"} />}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <RoleBadge role={member.role} />
              {member.creatorTypes && member.creatorTypes.length > 0 && (
                <span className="text-xs text-ink-faint">{member.creatorTypes.length} creator {member.creatorTypes.length === 1 ? "type" : "types"}</span>
              )}
            </div>

            <div className="mt-3 border-t border-sand pt-1">
              <ContactRow icon={<Mail size={15} aria-hidden />} label="Email" value={member.email} />
              <ContactRow icon={<Phone size={15} aria-hidden />} label="Phone" value={member.phone} />
              <ContactRow icon={<CalendarDays size={15} aria-hidden />} label="Joined" value={formatDate(member.joinedAt)} />
            </div>
            {!member.email && !member.phone && (
              <p className="mt-2 text-xs text-ink-faint">No contact details on file.</p>
            )}
          </div>
          <p className="mt-3 text-sm text-ink-muted">
            To change your name, photo, bio, or links, use your{" "}
            <a href="/account" className="font-semibold text-gold-text hover:underline">Profile</a>.
          </p>
        </Section>

        {/* Preferences */}
        <Section icon={<SlidersHorizontal size={17} aria-hidden />} title="Preferences" description="How the studio looks and what it tells you about.">
          <div className="space-y-6">
            <div>
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                <Sun size={13} aria-hidden /> Theme
              </p>
              <ThemeSegment />
            </div>
            <div>
              <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                <Bell size={13} aria-hidden /> Notifications
              </p>
              <NotificationPrefs />
            </div>
          </div>
        </Section>

        {/* Security — spans both columns */}
        <div className="lg:col-span-2">
          <Section icon={<ShieldCheck size={17} aria-hidden />} title="Security" description="Your password and two-factor sign-in.">
            <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
              <div>
                <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  <Lock size={13} aria-hidden /> Change password
                </p>
                <ChangePassword />
              </div>
              <div className="border-t border-sand pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
                <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  <ShieldCheck size={13} aria-hidden /> Two-factor sign-in (TOTP)
                </p>
                <MfaManage />
              </div>
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}
