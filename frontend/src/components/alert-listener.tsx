import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RingingCall, type RingingAlert } from "@/components/ringing-call";
import { pushPermission, pushSupported, subscribeToPush } from "@/lib/push";
import { useAuth } from "@/lib/auth";

const PROMPT_DISMISSED = "oguaa.alertsPromptDismissed";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(PROMPT_DISMISSED) === "1";
  } catch {
    return false;
  }
}

function writeDismissed() {
  try {
    localStorage.setItem(PROMPT_DISMISSED, "1");
  } catch {
    // Storage unavailable (private mode): the prompt may return next visit.
  }
}

// Mounts once (in the root layout). Fires the full-screen RingingCall when a
// CRITICAL safety alert arrives — either from the foreground poller (the
// AlertBanner dispatches `oguaa:alert`) or from a Web Push received while the
// app is open (the service worker relays it as a `message`). Also shows a
// one-time prompt to turn on background push.
export function AlertListener() {
  const { member } = useAuth();
  const navigate = useNavigate();
  const memberId = member?.id;
  const [alert, setAlert] = useState<RingingAlert | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);
  // The member this browser's push subscription was last registered for, so a
  // signed-in visit re-registers once (the server only stores subscriptions
  // for signed-in members) without repeating on every render.
  const registeredFor = useRef<string | null>(null);

  useEffect(() => {
    const onWindowAlert = (e: Event) => {
      const detail = (e as CustomEvent<RingingAlert & { ring?: boolean }>).detail;
      if (detail?.ring) setAlert(detail);
    };
    const onSWMessage = (e: MessageEvent) => {
      const msg = e.data as { type?: string; url?: unknown; payload?: RingingAlert & { ring?: boolean } };
      if (msg?.type === "oguaa-alert" && msg.payload?.ring) setAlert(msg.payload);
      // A tapped alert notification while this tab is open: go to the alert.
      if (msg?.type === "oguaa-alert-open" && typeof msg.url === "string" && msg.url.startsWith("/") && !msg.url.startsWith("//")) {
        navigate(msg.url);
      }
    };
    window.addEventListener("oguaa:alert", onWindowAlert as EventListener);
    navigator.serviceWorker?.addEventListener?.("message", onSWMessage as EventListener);
    return () => {
      window.removeEventListener("oguaa:alert", onWindowAlert as EventListener);
      navigator.serviceWorker?.removeEventListener?.("message", onSWMessage as EventListener);
    };
  }, [navigate]);

  // Push subscriptions are stored per member, so only signed-in visitors are
  // prompted. When permission was already granted (earlier visit, or granted
  // while signed out) the browser is registered for the member silently.
  useEffect(() => {
    if (!memberId || !pushSupported()) return;
    const permission = pushPermission();
    if (permission === "granted") {
      if (registeredFor.current !== memberId) {
        registeredFor.current = memberId;
        void subscribeToPush().then((ok) => {
          if (!ok) registeredFor.current = null;
        });
      }
      return;
    }
    if (permission !== "default" || readDismissed()) return;
    // Nudge after a short delay so it doesn't fight the first paint.
    const t = window.setTimeout(() => setShowPrompt(true), 6000);
    return () => window.clearTimeout(t);
  }, [memberId]);

  const enable = useCallback(async () => {
    setEnabling(true);
    setPromptError(null);
    const ok = await subscribeToPush();
    setEnabling(false);
    if (ok) {
      registeredFor.current = memberId ?? null;
      writeDismissed();
      setShowPrompt(false);
      return;
    }
    setPromptError(
      pushPermission() === "denied"
        ? "Notifications are blocked for this site. Allow them in your browser settings to get safety alerts."
        : "We couldn't turn on safety alerts just now. Please try again in a moment.",
    );
  }, [memberId]);

  const dismissPrompt = useCallback(() => {
    writeDismissed();
    setShowPrompt(false);
  }, []);

  return (
    <>
      <RingingCall alert={alert} onDismiss={() => setAlert(null)} />
      {showPrompt && memberId && (
        <div role="dialog" aria-label="Turn on safety alerts" className="fixed inset-x-3 bottom-3 z-[120] mx-auto max-w-sm rounded-2xl border border-sand bg-paper p-4 text-ink shadow-[var(--shadow-lift)] sm:left-auto sm:right-4">
          <p className="text-sm font-semibold">Get safety alerts that ring like a call</p>
          <p className="mt-1 text-sm text-ink-muted">Be alerted to critical incidents in Oguaa, even when this tab is closed.</p>
          {promptError && <p role="alert" className="mt-2 text-sm text-clay-text">{promptError}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={dismissPrompt} className="rounded-full px-3 py-1.5 text-sm font-medium text-ink-muted hover:text-ink">Not now</button>
            <button type="button" onClick={enable} disabled={enabling} className="rounded-full bg-green px-4 py-1.5 text-sm font-semibold text-on-green hover:bg-green-900 disabled:opacity-60">{enabling ? "Turning on…" : "Turn on"}</button>
          </div>
        </div>
      )}
    </>
  );
}
