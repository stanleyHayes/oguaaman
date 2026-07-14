import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import type { Notification } from "@/lib/types";

/** Small relative-time formatter for notification timestamps (ISO → "3d ago"). */
function ago(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(then).toISOString().slice(0, 10);
}

const KIND_DOT: Record<Notification["kind"], string> = {
  approved: "bg-teal",
  rejected: "bg-clay",
  changes: "bg-gold-brand",
  remembrance: "bg-gold",
  birthday: "bg-gold",
  welcome: "bg-green",
  report: "bg-maroon-900",
};

/**
 * The notifications bell for signed-in members (spec §8.2 moderation outcomes,
 * §8.11 remembrance). Shows an unread badge and a dropdown inbox; marks items
 * read on open/click and follows a notification's link.
 */
export function NotificationsBell() {
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);

  // Initial unread count (async — no synchronous setState in the effect body).
  useEffect(() => {
    let alive = true;
    api.unreadCount()
      .then((r) => { if (alive) setCount(r.count); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Close the dropdown on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      try {
        setItems(await api.notifications());
      } catch {
        /* keep whatever we have */
      } finally {
        setLoading(false);
      }
    }
  }

  async function markAll() {
    setItems((cur) => cur.map((n) => ({ ...n, read: true })));
    setCount(0);
    try { await api.markAllNotificationsRead(); } catch { /* optimistic */ }
  }

  async function openItem(n: Notification) {
    if (!n.read) {
      setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setCount((c) => Math.max(0, c - 1));
      try { await api.markNotificationRead(n.id); } catch { /* optimistic */ }
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  }

  const inbox = items.length === 0 ? (
    <p className="px-4 py-10 text-center text-sm italic text-ink-faint">No notifications yet.</p>
  ) : (
    <ul className="divide-y divide-sand">
      {items.map((n) => (
        <li key={n.id}>
          <button
            type="button"
            onClick={() => openItem(n)}
            className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-cream ${n.read ? "" : "bg-cream/60"}`}
          >
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-sand" : KIND_DOT[n.kind]}`} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className={`truncate text-sm ${n.read ? "text-ink-muted" : "font-semibold text-ink"}`}>{n.title}</span>
                <span className="shrink-0 text-[0.7rem] text-ink-faint">{ago(n.createdAt)}</span>
              </span>
              <span className="mt-0.5 block text-xs leading-snug text-ink-muted">{n.body}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
        aria-expanded={open}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-cream/85 transition-colors hover:bg-cream/10"
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-brand px-1 text-[0.6rem] font-bold text-green-900">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-[var(--radius-card)] border border-sand bg-paper text-ink shadow-[var(--shadow-lift)]">
          <div className="flex items-center justify-between border-b border-sand px-4 py-3">
            <span className="font-display text-base font-semibold text-ink">Notifications</span>
            <button type="button" onClick={markAll} className="text-xs font-medium text-teal-text hover:underline">
              Mark all read
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <output aria-label="Loading notifications" className="block space-y-3 px-4 py-5">
                <span className="sr-only">Loading…</span>
                {["n1", "n2", "n3"].map((k) => (
                  <div key={k} aria-hidden className="space-y-2">
                    <div className="skeleton h-3.5 w-3/4 rounded-md" />
                    <div className="skeleton h-3 w-1/2 rounded-md" />
                  </div>
                ))}
              </output>
            ) : inbox}
          </div>
        </div>
      )}
    </div>
  );
}
