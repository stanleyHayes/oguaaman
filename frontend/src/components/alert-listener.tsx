import { useCallback, useEffect, useState } from "react";
import { RingingCall, type RingingAlert } from "@/components/ringing-call";
import { pushPermission, pushSupported, subscribeToPush } from "@/lib/push";

const PROMPT_DISMISSED = "oguaa.alertsPromptDismissed";

// Mounts once (in the root layout). Fires the full-screen RingingCall when a
// CRITICAL safety alert arrives — either from the foreground poller (the
// AlertBanner dispatches `oguaa:alert`) or from a Web Push received while the
// app is open (the service worker relays it as a `message`). Also shows a
// one-time prompt to turn on background push.
export function AlertListener() {
  const [alert, setAlert] = useState<RingingAlert | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const onWindowAlert = (e: Event) => {
      const detail = (e as CustomEvent<RingingAlert & { ring?: boolean }>).detail;
      if (detail?.ring) setAlert(detail);
    };
    const onSWMessage = (e: MessageEvent) => {
      const msg = e.data as { type?: string; payload?: RingingAlert & { ring?: boolean } };
      if (msg?.type === "oguaa-alert" && msg.payload?.ring) setAlert(msg.payload);
    };
    window.addEventListener("oguaa:alert", onWindowAlert as EventListener);
    navigator.serviceWorker?.addEventListener?.("message", onSWMessage as EventListener);

    const dismissed = localStorage.getItem(PROMPT_DISMISSED) === "1";
    if (!dismissed && pushSupported() && pushPermission() === "default") {
      // Nudge after a short delay so it doesn't fight the first paint.
      const t = window.setTimeout(() => setShowPrompt(true), 6000);
      return () => {
        window.clearTimeout(t);
        window.removeEventListener("oguaa:alert", onWindowAlert as EventListener);
        navigator.serviceWorker?.removeEventListener?.("message", onSWMessage as EventListener);
      };
    }
    return () => {
      window.removeEventListener("oguaa:alert", onWindowAlert as EventListener);
      navigator.serviceWorker?.removeEventListener?.("message", onSWMessage as EventListener);
    };
  }, []);

  const enable = useCallback(async () => {
    await subscribeToPush();
    localStorage.setItem(PROMPT_DISMISSED, "1");
    setShowPrompt(false);
  }, []);

  const dismissPrompt = useCallback(() => {
    localStorage.setItem(PROMPT_DISMISSED, "1");
    setShowPrompt(false);
  }, []);

  return (
    <>
      <RingingCall alert={alert} onDismiss={() => setAlert(null)} />
      {showPrompt && (
        <div role="dialog" aria-label="Turn on safety alerts" className="fixed inset-x-3 bottom-3 z-[120] mx-auto max-w-sm rounded-2xl border border-sand bg-paper p-4 text-ink shadow-[var(--shadow-lift)] sm:left-auto sm:right-4">
          <p className="text-sm font-semibold">Get safety alerts that ring like a call</p>
          <p className="mt-1 text-sm text-ink-muted">Be alerted to critical incidents in Oguaa, even when this tab is closed.</p>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={dismissPrompt} className="rounded-full px-3 py-1.5 text-sm font-medium text-ink-muted hover:text-ink">Not now</button>
            <button type="button" onClick={enable} className="rounded-full bg-green px-4 py-1.5 text-sm font-semibold text-on-green hover:bg-green-900">Turn on</button>
          </div>
        </div>
      )}
    </>
  );
}
