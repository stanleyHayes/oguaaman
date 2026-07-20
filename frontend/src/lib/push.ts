// Web Push subscription for safety alerts. Subscribes the browser to the Go
// backend's VAPID push so severe alerts ring even when the app isn't open. A
// no-op / false when the browser lacks support or the server has no VAPID key.
import { api } from "@/lib/api";

export function pushSupported(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Current permission: "default" (ask), "granted", or "denied". */
export function pushPermission(): NotificationPermission {
  return typeof Notification !== "undefined" ? Notification.permission : "denied";
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/** Ask for permission and register a Web Push subscription. Returns true on success. */
export async function subscribeToPush(): Promise<boolean> {
  if (!pushSupported()) return false;
  let key: string;
  try {
    key = (await api.pushKey()).publicKey;
  } catch {
    return false;
  }
  if (!key) return false; // server has no VAPID key configured
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key) as unknown as BufferSource,
    }));
  const json = sub.toJSON();
  try {
    await api.pushSubscribe({
      platform: "web",
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
    });
    return true;
  } catch {
    return false;
  }
}

/** Remove this browser's push subscription. */
export async function unsubscribeFromPush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await api.pushUnsubscribe({ id: sub.endpoint }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}
