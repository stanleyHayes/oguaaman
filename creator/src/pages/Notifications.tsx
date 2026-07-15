import { useState } from "react";
import { useLoaderData } from "react-router-dom";
import { api } from "@/lib/api";
import { PORTAL } from "@/lib/portal";
import type { NotificationItem } from "@/lib/types";
import { PageHeader, Card, Empty } from "@/components/ui";
import { Stagger, StaggerItem } from "@/components/motion";
import { formatDate } from "@/lib/format";

export async function loader() {
  return api.notifications();
}

const KIND_DOT: Record<string, string> = {
  approved: "bg-green", rejected: "bg-maroon-900", changes: "bg-gold-brand",
  remembrance: "bg-gold", birthday: "bg-clay", "org-claim": "bg-ai", report: "bg-maroon-900", welcome: "bg-teal",
};

export function Component() {
  const initial = useLoaderData() as NotificationItem[];
  const [items, setItems] = useState(initial);
  const unread = items.filter((n) => !n.read).length;

  async function markAll() {
    setItems((cur) => cur.map((n) => ({ ...n, read: true })));
    try { await api.markAllNotificationsRead(); } catch { /* optimistic */ }
  }

  async function open(n: NotificationItem) {
    if (!n.read) {
      setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      try { await api.markNotificationRead(n.id); } catch { /* optimistic */ }
    }
    // Notification links are portal paths — open them there.
    if (n.link) window.open(`${PORTAL}${n.link}`, "_blank", "noopener");
  }

  return (
    <>
      <PageHeader kicker={unread ? `${unread} unread` : "All caught up"} title="Notifications">
        {unread > 0 && <button onClick={markAll} className="rounded-full border border-sand px-4 py-2 text-sm font-medium text-ai hover:bg-paper">Mark all read</button>}
      </PageHeader>

      {items.length === 0 ? (
        <Empty title="No notifications">Moderation outcomes, claims and remembrance notices will show up here.</Empty>
      ) : (
        <Card className="overflow-hidden">
          <Stagger className="divide-y divide-sand">
            {items.map((n, idx) => (
              <StaggerItem key={n.id} index={idx}>
                <button
                  onClick={() => open(n)}
                  className={`flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-paper ${n.read ? "opacity-70" : ""}`}
                >
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${KIND_DOT[n.kind] ?? "bg-sand"}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">{n.title}</span>
                    <span className="mt-0.5 block text-sm text-ink-muted">{n.body}</span>
                    <span className="mt-1 block text-xs text-ink-faint">{formatDate(n.createdAt)}</span>
                  </span>
                  {!n.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-gold-brand" aria-label="Unread" />}
                </button>
              </StaggerItem>
            ))}
          </Stagger>
        </Card>
      )}
    </>
  );
}
