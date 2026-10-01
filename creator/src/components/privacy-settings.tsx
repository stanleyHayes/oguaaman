import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { api } from "@/lib/api";
import { AI_DISCLOSURE } from "@/lib/ai";
import { useAuth } from "@/lib/auth";
import { ACCOUNT_URL, PRIVACY_URL, TERMS_URL } from "@/lib/portal";
import type { NotificationPreferences } from "@/lib/types";
import { Toggle } from "./toggle";

type Category = keyof NotificationPreferences["categories"];
type Channel = keyof NotificationPreferences["channels"];

const CATEGORY_ITEMS: { id: Category; label: string; description: string }[] = [
  { id: "safety", label: "Safety alerts", description: "Always on. Safety, account and payment messages are never switched off." },
  { id: "community", label: "Community", description: "Listing reviews, bookings, team invitations and activity on your work." },
  { id: "remembrances", label: "Remembrances", description: "Memorial anniversaries and birthdays you follow." },
  { id: "product", label: "Product news", description: "Occasional tips and new studio features. Off unless you turn it on." },
];

const CHANNEL_ITEMS: { id: Channel; label: string; description: string }[] = [
  { id: "push", label: "Push", description: "Notifications on devices where you've allowed them." },
  { id: "email", label: "Email", description: "Sent to the email address on your account." },
  { id: "whatsapp", label: "WhatsApp", description: "Sent to your verified phone number." },
];

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/** Account-wide notification preferences (GET/PUT /api/me/notification-preferences). */
export function NotificationPrefs() {
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api.notificationPreferences()
      .then((p) => { if (live) setPrefs(p); })
      .catch((e: unknown) => { if (live) setErr(errorText(e, "Couldn't load your notification preferences.")); });
    return () => { live = false; };
  }, []);

  async function save(patch: Parameters<typeof api.setNotificationPreferences>[0], optimistic: NotificationPreferences) {
    const previous = prefs;
    setPrefs(optimistic); setErr(null);
    try {
      setPrefs(await api.setNotificationPreferences(patch));
    } catch (e) {
      setPrefs(previous);
      setErr(errorText(e, "Couldn't save that change."));
    }
  }

  if (!prefs) {
    return err
      ? <p role="alert" className="rounded-lg border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay-text">{err}</p>
      : <p className="text-sm text-ink-faint">Loading your preferences…</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-ink-faint">What you hear about</p>
        <div className="rounded-2xl border border-sand bg-paper px-4 sm:px-5">
          {CATEGORY_ITEMS.map((item) => (
            <Toggle
              key={item.id}
              label={item.label}
              description={item.description}
              checked={item.id === "safety" ? true : prefs.categories[item.id]}
              disabled={item.id === "safety"}
              onChange={(v) => save({ categories: { [item.id]: v } }, { ...prefs, categories: { ...prefs.categories, [item.id]: v } })}
            />
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-ink-faint">How it reaches you</p>
        <div className="rounded-2xl border border-sand bg-paper px-4 sm:px-5">
          {CHANNEL_ITEMS.map((item) => (
            <Toggle
              key={item.id}
              label={item.label}
              description={item.description}
              checked={prefs.channels[item.id]}
              onChange={(v) => save({ channels: { [item.id]: v } }, { ...prefs, channels: { ...prefs.channels, [item.id]: v } })}
            />
          ))}
        </div>
      </div>
      {err && <p role="alert" className="rounded-lg border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay-text">{err}</p>}
      <p className="text-xs leading-relaxed text-ink-faint">These apply to your whole Oguaa account, in every app. Each email also has an unsubscribe link.</p>
    </div>
  );
}

/** Writing-assistant consent: grant or withdraw sending text to Anthropic. */
export function AiConsentSetting() {
  const { member, setMember } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!member) return null;
  const current = member;

  async function change(consent: boolean) {
    setBusy(true); setErr(null);
    try {
      await api.setAiConsent(consent);
      setMember(await api.me());
    } catch (e) {
      setErr(errorText(e, "Couldn't save that change."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="rounded-2xl border border-sand bg-paper px-4 sm:px-5">
        <Toggle label="AI writing assistant" description={AI_DISCLOSURE} checked={current.aiConsent === true} disabled={busy} onChange={change} />
      </div>
      {err && <p role="alert" className="mt-2 rounded-lg border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay-text">{err}</p>}
    </div>
  );
}

const linkRow = "flex min-h-11 items-center justify-between rounded-xl border border-sand bg-paper px-4 text-sm font-semibold text-ink transition-colors hover:border-gold-border/50";

/** Where to download your data, delete your account and read the legal notices (all on the portal). */
export function PrivacyLinks() {
  return (
    <div className="space-y-2">
      <a href={ACCOUNT_URL} target="_blank" rel="noopener noreferrer" className={linkRow}>
        <span>Download your data or delete your account<span className="block text-xs font-normal text-ink-faint">On your account page in the community portal</span></span>
        <ArrowUpRight size={16} aria-hidden />
      </a>
      <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className={linkRow}>
        <span>Privacy notice</span>
        <ArrowUpRight size={16} aria-hidden />
      </a>
      <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" className={linkRow}>
        <span>Terms of Use</span>
        <ArrowUpRight size={16} aria-hidden />
      </a>
    </div>
  );
}
