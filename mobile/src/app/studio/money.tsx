import { useMemo, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { T as Text } from "@/components/typography";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth";
import type { CreatorEarnings, CreatorOverview, Pledge, Subscription, Ticket } from "@/lib/types";
import { D, S, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { Loading, ErrorView, HeroBand } from "@/ui";
import { EmptyState } from "@/components/empty-state";
import { MetricCard, PayPill, cedis, fmtDate } from "@/components/studio-kit";

/*
 * Money — ports creator/src/pages/Money.tsx. What the member's work earns:
 * ticket sales from their events and pledges toward their projects, plus their
 * own plan payments and tickets bought. Reuses the same backend reads the web
 * creator app calls: creatorOverview + mySubscriptions + myTickets +
 * creatorEarnings.
 */

interface MoneyData {
  overview: CreatorOverview;
  subscriptions: Subscription[];
  tickets: Ticket[];
  earnings: CreatorEarnings | null;
}

export default function StudioMoney() {
  const { member, loading: authLoading } = useAuth();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { data, loading, error } = useApi<MoneyData>(async () => {
    const [overview, subscriptions, tickets, earnings] = await Promise.all([
      api.creatorOverview(),
      api.mySubscriptions().catch(() => [] as Subscription[]),
      api.myTickets().catch(() => [] as Ticket[]),
      api.creatorEarnings().catch(() => null),
    ]);
    return { overview, subscriptions, tickets, earnings };
  }, `studio:money:${member?.id ?? "anon"}`);

  if (authLoading || (loading && member)) return <Loading />;
  if (!member) {
    return (
      <View style={s.gate}>
        <Text style={s.gateTitle}>Money</Text>
        <Text style={s.gateBody}>Sign in to see what your events and projects have earned.</Text>
        <Pressable onPress={() => router.replace("/signin")} style={s.primaryBtn}>
          <Text style={s.primaryBtnText}>Sign in / create account</Text>
        </Pressable>
      </View>
    );
  }
  if (error || !data) return <ErrorView message={error ?? "Couldn't load your earnings"} />;

  const { overview, subscriptions, tickets, earnings } = data;
  const successSubs = subscriptions.filter((sub) => sub.status === "success");
  const subSpend = successSubs.reduce((sum, sub) => sum + sub.amountPesewas, 0);
  const noSales = overview.ticketsSold === 0 && overview.pledgesRaisedPesewas === 0;
  const hasEarnings = !!earnings && (earnings.ticketSales.length > 0 || earnings.pledges.length > 0);

  return (
    <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 48 }}>
      <HeroBand
        tone={C.green}
        kicker="Money"
        title="What your work earns"
        lede="Ticket sales from your events and pledges toward your projects, plus your own plan payments and tickets."
      />

      <View style={s.body}>
        <View style={s.grid}>
          <MetricCard label="Ticket sales (gross)" value={cedis(overview.ticketsGrossPesewas)} glyph="₵" tone="teal" sub={`${overview.ticketsSold} sold`} />
          <MetricCard label="Pledges raised (net)" value={cedis(overview.pledgesRaisedPesewas)} glyph="♦" tone="gold" sub="Across your projects" />
          <MetricCard label="Plan payments" value={successSubs.length} glyph="⟳" tone="green" sub={cedis(subSpend)} />
          <MetricCard label="Tickets bought" value={tickets.length} glyph="▧" tone="ink" sub="Your own gate codes" />
        </View>

        <ListCard title="Plan payments" subtitle="Your Supporter subscriptions, newest first.">
          {subscriptions.length === 0 ? (
            <EmptyState compact glyph="₵" title="No plan payments yet" />
          ) : (
            subscriptions.map((sub) => (
              <MoneyRow
                key={sub.id}
                title={sub.listingTitle}
                meta={`${fmtDate(sub.createdAt)}${sub.periodEnd ? ` · until ${fmtDate(sub.periodEnd)}` : ""}`}
                amount={cedis(sub.amountPesewas)}
                status={sub.status}
              />
            ))
          )}
        </ListCard>

        <ListCard title="Tickets you've bought" subtitle="Gate codes are shown on the event page.">
          {tickets.length === 0 ? (
            <EmptyState compact glyph="▧" title="No tickets yet" />
          ) : (
            tickets.map((t) => (
              <MoneyRow
                key={t.id}
                title={t.eventTitle}
                meta={`${t.qty} × ${t.tier} · ${fmtDate(t.createdAt)}`}
                amount={cedis(t.amountPesewas)}
                status={t.status}
              />
            ))
          )}
        </ListCard>

        {noSales && (
          <View style={s.emptyWrap}>
            <EmptyState
              glyph="₵"
              title="No sales yet"
              body="Earnings appear here when attendees buy tickets to your events or supporters pledge toward your projects."
            />
          </View>
        )}

        {hasEarnings && earnings && (
          <>
            <ListCard title="Ticket sales by event" subtitle="Confirmed ticket revenue from your events.">
              {earnings.ticketSales.length === 0 ? (
                <EmptyState compact glyph="▧" title="No ticket sales yet" />
              ) : (
                earnings.ticketSales.map((t: Ticket) => (
                  <MoneyRow
                    key={t.id}
                    title={t.eventTitle}
                    meta={`${t.qty} × ${t.tier} · ${fmtDate(t.createdAt)}`}
                    amount={cedis(t.amountPesewas)}
                    status={t.status}
                  />
                ))
              )}
            </ListCard>

            <ListCard title="Pledges by project" subtitle="Net amount credited to your projects.">
              {earnings.pledges.length === 0 ? (
                <EmptyState compact glyph="₵" title="No pledges received yet" />
              ) : (
                earnings.pledges.map((p: Pledge) => (
                  <MoneyRow
                    key={p.id}
                    title={p.projectTitle}
                    meta={`${fmtDate(p.createdAt)}${p.netPesewas != null ? ` · net ${cedis(p.netPesewas)}` : ""}`}
                    amount={cedis(p.amountPesewas)}
                    status={p.status}
                  />
                ))
              )}
            </ListCard>
          </>
        )}
      </View>
    </ScrollView>
  );
}

function ListCard({ title, subtitle, children }: Readonly<{ title: string; subtitle: string; children: ReactNode }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={s.card}>
      <View style={s.cardHead}>
        <Text style={s.cardTitle}>{title}</Text>
        <Text style={s.cardSub}>{subtitle}</Text>
      </View>
      <View style={s.cardBody}>{children}</View>
    </View>
  );
}

function MoneyRow({ title, meta, amount, status }: Readonly<{ title: string; meta: string; amount: string; status: string }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={s.row}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.rowTitle} numberOfLines={1}>{title}</Text>
        <Text style={s.rowMeta} numberOfLines={1}>{meta}</Text>
      </View>
      <Text style={s.rowAmount}>{amount}</Text>
      <PayPill status={status} />
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  gate: { flex: 1, backgroundColor: C.paper, padding: 28, justifyContent: "center", alignItems: "center" },
  gateTitle: { ...D(600), fontSize: 26, color: C.ink, textAlign: "center" },
  gateBody: { color: C.inkMuted, fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 10, maxWidth: 320 },
  primaryBtn: { backgroundColor: C.green, borderRadius: 999, paddingVertical: 13, paddingHorizontal: 24, marginTop: 18 },
  primaryBtnText: { color: C.cream, fontWeight: "700", fontSize: 15 },

  body: { padding: 16, gap: 16 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },

  card: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 16, overflow: "hidden" },
  cardHead: { paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.sand },
  cardTitle: { ...S(700), fontSize: 16, color: C.ink },
  cardSub: { color: C.inkFaint, fontSize: 12, marginTop: 2 },
  cardBody: { paddingHorizontal: 16 },

  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.sand },
  rowTitle: { color: C.ink, fontSize: 14, fontWeight: "600" },
  rowMeta: { color: C.inkFaint, fontSize: 12, marginTop: 2 },
  rowAmount: { color: C.ink, fontSize: 14, fontWeight: "700" },

  emptyWrap: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 16 },
});
