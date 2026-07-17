import { useState } from "react";
import { useLoaderData, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
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

// Notification links are portal paths; only some resolve inside the admin app.
const ADMIN_ROUTES = ["/reports", "/listings", "/members", "/institutions", "/moderation", "/audit", "/claims", "/newsroom"];
function adminLink(link?: string): string | null {
  if (!link) return null;
  return ADMIN_ROUTES.some((r) => link === r || link.startsWith(r + "/")) ? link : null;
}

export function Component() {
  const initial = useLoaderData() as NotificationItem[];
  const navigate = useNavigate();
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
    const dest = adminLink(n.link);
    if (dest) navigate(dest);
  }

  return (
    <>
      <PageHeader kicker={unread ? `${unread} unread` : "All caught up"} title="Notifications">
        {unread > 0 && <button type="button" onClick={markAll} className="rounded-full border border-sand px-4 py-2 text-sm font-medium text-ai hover:bg-paper">Mark all read</button>}
      </PageHeader>

      {items.length === 0 ? (
        <Empty icon="bell" title="No notifications">Moderation outcomes, claims and remembrance notices will show up here.</Empty>
      ) : (
        <Card className="overflow-hidden">
          <Stagger className="divide-y divide-sand">
            {items.map((n, idx) => {
              const linkable = adminLink(n.link) != null;
              return (
                <StaggerItem key={n.id} index={idx}>
                  <button
                    type="button"
                    onClick={() => open(n)}
                    className={`flex w-full items-start gap-3 px-5 py-4 text-left transition-colors ${n.read ? "" : "bg-paper"} ${linkable ? "hover:bg-sand/40" : ""}`}
                  >
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-sand" : KIND_DOT[n.kind] ?? "bg-ai"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={`text-sm ${n.read ? "text-ink-muted" : "font-semibold text-ink"}`}>{n.title}</span>
                        <span className="shrink-0 text-xs text-ink-faint">{formatDate(n.createdAt)}</span>
                      </div>
                      <p className="mt-0.5 text-sm text-ink-muted">{n.body}</p>
                      {linkable && <span className="mt-1 inline-block text-xs font-medium text-ai">Open →</span>}
                    </div>
                  </button>
                </StaggerItem>
              );
            })}
          </Stagger>
        </Card>
      )}
    </>
  );
}
