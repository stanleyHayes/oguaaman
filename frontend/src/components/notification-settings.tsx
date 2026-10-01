import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { NotificationPreferences } from "@/lib/types";

type Category = keyof NotificationPreferences["categories"];
type Channel = keyof NotificationPreferences["channels"];

const CATEGORIES: { id: Category; label: string; hint: string; locked?: boolean }[] = [
  { id: "safety", label: "Safety alerts", hint: "Incidents and official alerts near you. Always on — safety, account and payment messages can't be switched off.", locked: true },
  { id: "community", label: "Community", hint: "Follows, replies and news about listings you take part in." },
  { id: "remembrances", label: "Remembrances", hint: "Anniversaries of memorials you follow, and birthdays of people you follow." },
  { id: "product", label: "Product news", hint: "Yes, send me occasional news about new Oguaa features. Off unless you turn it on." },
];

const CHANNELS: { id: Channel; label: string; hint: string }[] = [
  { id: "push", label: "Push notifications", hint: "On this browser or the app, where you've allowed them." },
  { id: "email", label: "Email", hint: "To the email address on your account." },
  { id: "whatsapp", label: "WhatsApp", hint: "To your verified phone number." },
];

function Toggle({ checked, disabled, onChange, label }: Readonly<{ checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }>) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${checked ? "bg-green" : "bg-sand"}`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-paper shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

function Row({ label, hint, children }: Readonly<{ label: string; hint: string; children: ReactNode }>) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div>
        <p className="text-sm font-medium text-ink">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-faint">{hint}</p>
      </div>
      {children}
    </div>
  );
}

/**
 * Server-side notification preferences (K14 / D8). Every send path checks
 * these, so a change here applies on the web, in the app and to email.
 */
export function NotificationSettings() {
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let current = true;
    api.notificationPreferences()
      .then((p) => { if (current) setPrefs(p); })
      .catch(() => { if (current) setErr("We couldn't load your notification settings. Refresh to try again."); });
    return () => { current = false; };
  }, []);

  const save = async (patch: Parameters<typeof api.setNotificationPreferences>[0]) => {
    setSaving(true); setErr(null);
    try {
      setPrefs(await api.setNotificationPreferences(patch));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "We couldn't save that change.");
    } finally { setSaving(false); }
  };

  if (!prefs) {
    return err ? <p className="text-sm text-clay-text">{err}</p> : <p className="text-sm text-ink-faint">Loading…</p>;
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="eyebrow text-ink-faint">What we tell you about</p>
        <div className="mt-1 divide-y divide-sand">
          {CATEGORIES.map((c) => (
            <Row key={c.id} label={c.label} hint={c.hint}>
              <Toggle
                label={c.label}
                checked={c.locked ? true : prefs.categories[c.id]}
                disabled={c.locked || saving}
                onChange={(v) => void save({ categories: { [c.id]: v } })}
              />
            </Row>
          ))}
        </div>
      </div>
      <div>
        <p className="eyebrow text-ink-faint">How we reach you</p>
        <div className="mt-1 divide-y divide-sand">
          {CHANNELS.map((c) => (
            <Row key={c.id} label={c.label} hint={c.hint}>
              <Toggle label={c.label} checked={prefs.channels[c.id]} disabled={saving} onChange={(v) => void save({ channels: { [c.id]: v } })} />
            </Row>
          ))}
        </div>
      </div>
      <p className="text-xs text-ink-faint">Every email also has a one-click unsubscribe link. Changes apply everywhere you use Oguaa.</p>
      {err && <p role="alert" className="text-sm text-clay-text">{err}</p>}
    </div>
  );
}

/** Withdraw (or give) consent for the writing assistant's data use (K15). */
export function AIConsentSettings() {
  const { member, setMember } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!member) return null;
  const on = Boolean(member.aiConsent);

  const set = async (consent: boolean) => {
    setBusy(true); setErr(null);
    try {
      const res = await api.setAIConsent(consent);
      setMember({ ...member, aiConsent: res.aiConsent });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "We couldn't save that change.");
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-2">
      <Row
        label="Writing assistant"
        hint="The writing assistant sends the text you select to Anthropic (Claude), a US company, to write a suggestion. Turn this off to stop it; nothing is sent unless you ask for a suggestion."
      >
        <Toggle label="Writing assistant" checked={on} disabled={busy} onChange={(v) => void set(v)} />
      </Row>
      {err && <p role="alert" className="text-sm text-clay-text">{err}</p>}
    </div>
  );
}
