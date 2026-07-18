import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { T as Text, TI as TextInput } from "@/components/typography";
import { DateField } from "@/components/date-field";
import { OutsideDisclaimer, cedis, serviceLabeller } from "@/components/outside";
import { ArrowRightIcon, CheckIcon, MapPinIcon, ShieldIcon, StarFilledIcon, UsersIcon } from "@/components/icons";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { push, replace } from "@/lib/router";
import { ROUTES } from "@/lib/routes";
import { useApi } from "@/lib/use-api";
import { useTheme } from "@/lib/theme-context";
import type { Agent, AgentReview, AgentService } from "@/lib/types";
import { D, ON_GREEN, S, fillFor, initials, onFill, type Palette } from "@/theme";
import { ErrorView, Loading } from "@/ui";

interface AgentDetailData { agent: Agent; reviews: AgentReview[]; services: AgentService[] }

function today(): string { return new Date().toISOString().slice(0, 10); }

export default function OutsideAgentDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data, loading, error } = useApi<AgentDetailData>(async () => {
    const [agent, reviews, services] = await Promise.all([
      api.agent(slug),
      api.agentReviews(slug).catch(() => [] as AgentReview[]),
      api.agentServices().catch(() => [] as AgentService[]),
    ]);
    return { agent, reviews, services };
  }, `outside:agent:${slug}`);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "Agent not found"} />;
  return <AgentDetail data={data} />;
}

function AgentDetail({ data }: Readonly<{ data: AgentDetailData }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { member } = useAuth();
  const { agent, reviews, services } = data;
  const labelFor = serviceLabeller(services);
  const fill = fillFor(agent.slug, C);
  const ownProfile = member?.id === agent.memberId;

  return (
    <>
      <Stack.Screen options={{ title: agent.displayName }} />
      <ScrollView style={s.page} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={s.hero}>
          <View style={s.heroOrb} />
          <View style={[s.avatar, { backgroundColor: fill }]}><Text style={[s.avatarText, { color: onFill(fill) }]}>{initials(agent.displayName)}</Text></View>
          <View style={s.verifiedRow}><View style={s.verifiedIcon}><CheckIcon size={12} color={C.green900} strokeWidth={2.8} /></View><Text style={s.verifiedText}>VETTED OGUAA OUTSIDE {agent.type === "office" ? "OFFICE" : "AGENT"}</Text></View>
          <Text style={s.heroTitle}>{agent.displayName}</Text>
          {agent.headline ? <Text style={s.heroHeadline}>{agent.headline}</Text> : null}
          <View style={s.heroMeta}>
            <View style={s.heroMetaItem}><StarFilledIcon size={15} color={C.gold} /><Text style={s.heroMetaText}>{agent.ratingCount ? `${agent.ratingAvg.toFixed(1)} · ${agent.ratingCount} reviews` : "Newly verified"}</Text></View>
            <View style={s.heroMetaItem}><CheckIcon size={15} color={C.gold} strokeWidth={2.4} /><Text style={s.heroMetaText}>{agent.jobsCompleted} jobs completed</Text></View>
          </View>
        </View>

        <View style={s.main}>
          <OutsideDisclaimer compact />

          <View style={s.profileCard}>
            {agent.bio ? <Text style={s.bio}>{agent.bio}</Text> : null}
            <Text style={s.sectionLabel}>SERVICES</Text>
            <View style={s.tagRow}>{agent.services.map((service) => <View key={service} style={s.tag}><Text style={s.tagText}>{labelFor(service)}</Text></View>)}</View>
            <Text style={s.sectionLabel}>COVERAGE</Text>
            <View style={s.locationRow}><MapPinIcon size={17} color={C.tealText} strokeWidth={2} /><Text style={s.location}>{agent.coverageAreas.join(" · ")}</Text></View>
            {agent.rates ? <><Text style={s.sectionLabel}>FEE GUIDE</Text><Text style={s.rates}>{agent.rates}</Text></> : null}
          </View>

          {ownProfile ? (
            <View style={s.ownerCard}>
              <Text style={s.ownerKicker}>THIS IS YOUR PUBLIC PROFILE</Text>
              <Text style={s.ownerTitle}>Keep your coverage and services current.</Text>
              <Pressable accessibilityRole="button" onPress={() => push(ROUTES.outsideBecomeAgent)} style={s.secondaryButton}><Text style={s.secondaryButtonText}>Manage agent profile</Text><ArrowRightIcon size={16} color={C.greenText} strokeWidth={2.3} /></Pressable>
            </View>
          ) : (
            <RequestCard agent={agent} services={services} />
          )}

          <View style={s.reviewsSection}>
            <View style={s.reviewHead}><View><Text style={s.reviewKicker}>CLIENT EXPERIENCE</Text><Text style={s.reviewTitle}>Reviews</Text></View><Text style={s.reviewCount}>{reviews.length}</Text></View>
            {reviews.length ? reviews.map((review) => <ReviewCard key={review.id} review={review} />) : (
              <View style={s.noReviews}><UsersIcon size={28} color={C.inkFaint} strokeWidth={1.7} /><Text style={s.noReviewsTitle}>No reviews yet</Text><Text style={s.noReviewsBody}>Completed clients can leave the first review.</Text></View>
            )}
          </View>
        </View>
      </ScrollView>
    </>
  );
}

function RequestCard({ agent, services }: Readonly<{ agent: Agent; services: AgentService[] }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { member } = useAuth();
  const labelFor = serviceLabeller(services);
  const [service, setService] = useState(agent.services[0] ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!member) { push(ROUTES.signIn); return; }
    const value = Number.parseFloat(budget);
    if (!service) { setError("Choose the service you need."); return; }
    if (title.trim().length < 3) { setError("Give the request a clear title."); return; }
    if (description.trim().length < 10) { setError("Add enough detail for an accurate quote."); return; }
    if (!Number.isFinite(value) || value < 1 || value > 500_000) { setError("Enter a budget between GH₵1 and GH₵500,000."); return; }
    setBusy(true); setError("");
    try {
      await api.requestAgentJob(agent.slug, {
        service,
        title: title.trim(),
        description: description.trim(),
        budgetPesewas: Math.round(value * 100),
        deadline: deadline || undefined,
      });
      replace(ROUTES.outsideJobs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the request.");
    } finally { setBusy(false); }
  }

  return (
    <View style={s.requestCard}>
      <View style={s.requestIcon}><ShieldIcon size={22} color={C.gold} strokeWidth={2} /></View>
      <Text style={s.requestKicker}>START WITH A CLEAR BRIEF</Text>
      <Text style={s.requestTitle}>Request this agent</Text>
      <Text style={s.requestBody}>Send the task first. The agent replies with a firm quote before any money moves.</Text>
      {!member ? (
        <Pressable accessibilityRole="button" onPress={() => push(ROUTES.signIn)} style={s.primaryButton}><Text style={s.primaryButtonText}>Sign in to send a request</Text><ArrowRightIcon size={16} color={C.green900} strokeWidth={2.4} /></Pressable>
      ) : (
        <>
          <Text style={s.fieldLabel}>SERVICE NEEDED</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.choiceRow}>
            {agent.services.map((item) => (
              <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: service === item }} onPress={() => setService(item)} style={[s.choice, service === item && s.choiceActive]}>
                <Text style={[s.choiceText, service === item && s.choiceTextActive]}>{labelFor(item)}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Text style={s.fieldLabel}>TASK TITLE</Text>
          <TextInput value={title} onChangeText={(value) => { setTitle(value); setError(""); }} placeholder="e.g. Inspect a used car in Accra" placeholderTextColor={C.inkFaint} style={s.input} maxLength={160} />
          <Text style={s.fieldLabel}>WHAT SHOULD BE DONE?</Text>
          <TextInput value={description} onChangeText={(value) => { setDescription(value); setError(""); }} placeholder="What to check, collect or arrange; include the important constraints." placeholderTextColor={C.inkFaint} style={[s.input, s.area]} multiline />
          <Text style={s.fieldLabel}>YOUR WORKING BUDGET (GH₵)</Text>
          <TextInput value={budget} onChangeText={(value) => { setBudget(value); setError(""); }} placeholder="e.g. 450" placeholderTextColor={C.inkFaint} style={s.input} keyboardType="decimal-pad" />
          <View style={s.deadline}><DateField value={deadline} onChange={setDeadline} label="DEADLINE (OPTIONAL)" placeholder="Choose a deadline" minDate={today()} /></View>
          {budget && Number.isFinite(Number(budget)) ? <Text style={s.budgetNote}>Working budget: {cedis(Math.round(Number(budget) * 100))}. The agent will send a separate firm quote.</Text> : null}
          {error ? <Text style={s.error}>{error}</Text> : null}
          <Pressable accessibilityRole="button" disabled={busy} onPress={submit} style={[s.primaryButton, busy && { opacity: 0.55 }]}><Text style={s.primaryButtonText}>{busy ? "Sending…" : "Send request"}</Text><ArrowRightIcon size={16} color={C.green900} strokeWidth={2.4} /></Pressable>
        </>
      )}
    </View>
  );
}

function ReviewCard({ review }: Readonly<{ review: AgentReview }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={s.reviewCard}>
      <View style={s.reviewTop}><Text style={s.reviewAuthor}>{review.clientName || "Oguaa client"}</Text><View style={s.stars}>{Array.from({ length: 5 }, (_, index) => <StarFilledIcon key={index} size={13} color={index < review.rating ? C.goldBrand : C.sand} />)}</View></View>
      {review.body ? <Text style={s.reviewBody}>{review.body}</Text> : null}
      <Text style={s.reviewDate}>{new Date(review.createdAt).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })}</Text>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  page: { flex: 1, backgroundColor: C.paper },
  content: { paddingBottom: 48 },
  hero: { minHeight: 345, overflow: "hidden", alignItems: "center", backgroundColor: C.green900, paddingHorizontal: 22, paddingTop: 38, paddingBottom: 32 },
  heroOrb: { position: "absolute", width: 280, height: 280, borderRadius: 150, top: -145, right: -80, backgroundColor: C.goldTint14, borderWidth: 1, borderColor: C.goldBorder35 },
  avatar: { width: 84, height: 84, borderRadius: 27, borderWidth: 2, borderColor: C.gold, alignItems: "center", justifyContent: "center" },
  avatarText: { ...D(700), fontSize: 29 },
  verifiedRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 16 },
  verifiedIcon: { width: 19, height: 19, borderRadius: 10, backgroundColor: C.gold, alignItems: "center", justifyContent: "center" },
  verifiedText: { color: C.gold, ...S(700), fontSize: 9, letterSpacing: 1.4 },
  heroTitle: { color: ON_GREEN, ...D(700), textAlign: "center", fontSize: 35, marginTop: 8 },
  heroHeadline: { color: C.onDarkText85, fontSize: 14, lineHeight: 20, textAlign: "center", maxWidth: 330, marginTop: 7 },
  heroMeta: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 17 },
  heroMetaItem: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 999, borderWidth: 1, borderColor: C.onDarkText10, backgroundColor: C.onDarkText10, paddingHorizontal: 10, paddingVertical: 6 },
  heroMetaText: { color: C.onDarkText85, ...S(600), fontSize: 10 },
  main: { padding: 16, gap: 16, marginTop: -15 },
  profileCard: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 20, padding: 17 },
  bio: { color: C.inkMuted, fontSize: 15, lineHeight: 23 },
  sectionLabel: { color: C.inkFaint, ...S(700), fontSize: 9, letterSpacing: 1.6, marginTop: 17, marginBottom: 8 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  tag: { backgroundColor: C.paper, borderWidth: 1, borderColor: C.sand, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  tagText: { color: C.greenText, ...S(600), fontSize: 11 },
  locationRow: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  location: { color: C.inkMuted, fontSize: 13, lineHeight: 19, flex: 1 },
  rates: { color: C.ink, ...S(600), fontSize: 14, lineHeight: 20 },
  ownerCard: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 20, padding: 17 },
  ownerKicker: { color: C.goldText, ...S(700), fontSize: 9, letterSpacing: 1.5 },
  ownerTitle: { color: C.ink, ...D(700), fontSize: 21, marginTop: 4 },
  requestCard: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.goldBorder35, borderRadius: 22, padding: 17 },
  requestIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: C.goldTint14, borderWidth: 1, borderColor: C.goldBorder35 },
  requestKicker: { color: C.goldText, ...S(700), fontSize: 9, letterSpacing: 1.5, marginTop: 14 },
  requestTitle: { color: C.ink, ...D(700), fontSize: 26, marginTop: 3 },
  requestBody: { color: C.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  fieldLabel: { color: C.inkFaint, ...S(700), fontSize: 9, letterSpacing: 1.5, marginTop: 17, marginBottom: 7 },
  choiceRow: { gap: 7, paddingRight: 5 },
  choice: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8 },
  choiceActive: { borderColor: C.green, backgroundColor: C.green },
  choiceText: { color: C.inkMuted, ...S(600), fontSize: 11 },
  choiceTextActive: { color: ON_GREEN },
  input: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 11, paddingHorizontal: 13, paddingVertical: 12, color: C.ink, fontSize: 14 },
  area: { minHeight: 110, textAlignVertical: "top" },
  deadline: { marginTop: 17 },
  budgetNote: { color: C.inkFaint, fontSize: 11, lineHeight: 17, marginTop: 8 },
  error: { color: C.clayText, fontSize: 12, lineHeight: 18, marginTop: 10 },
  primaryButton: { minHeight: 47, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: C.goldBrand, borderRadius: 999, paddingHorizontal: 16, marginTop: 17 },
  primaryButtonText: { color: C.green900, ...S(700), fontSize: 13 },
  secondaryButton: { minHeight: 45, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderWidth: 1, borderColor: C.sand, borderRadius: 999, marginTop: 14 },
  secondaryButtonText: { color: C.greenText, ...S(700), fontSize: 13 },
  reviewsSection: { gap: 9 },
  reviewHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 2 },
  reviewKicker: { color: C.tealText, ...S(700), fontSize: 9, letterSpacing: 1.5 },
  reviewTitle: { color: C.ink, ...D(700), fontSize: 27, marginTop: 2 },
  reviewCount: { color: C.inkFaint, ...S(700), fontSize: 13 },
  reviewCard: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 16, padding: 14 },
  reviewTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 9 },
  reviewAuthor: { color: C.ink, ...S(700), fontSize: 13 },
  stars: { flexDirection: "row", gap: 2 },
  reviewBody: { color: C.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 8 },
  reviewDate: { color: C.inkFaint, fontSize: 10, marginTop: 8 },
  noReviews: { alignItems: "center", backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 17, padding: 24 },
  noReviewsTitle: { color: C.ink, ...S(700), fontSize: 14, marginTop: 9 },
  noReviewsBody: { color: C.inkFaint, fontSize: 12, marginTop: 3 },
});
