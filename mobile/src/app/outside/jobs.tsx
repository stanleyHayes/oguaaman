import { useMemo, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { T as Text, TI as TextInput } from "@/components/typography";
import { EmptyState } from "@/components/empty-state";
import { ArrowRightIcon, BriefcaseIcon, ShieldIcon, StarFilledIcon } from "@/components/icons";
import { OutsideDisclaimer, StatusChip, cedis } from "@/components/outside";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { push } from "@/lib/router";
import { ROUTES, route } from "@/lib/routes";
import { useApi } from "@/lib/use-api";
import { useTheme } from "@/lib/theme-context";
import { openInAppBrowser } from "@/lib/webbrowser";
import type { AgentJob, MyAgentJobs } from "@/lib/types";
import { D, ON_GREEN, S, withAlpha, type Palette } from "@/theme";
import { ErrorView, Loading } from "@/ui";

type JobSide = "client" | "agent";
type ClientMode = "fund" | "dispute" | "review" | null;

const EMPTY_JOBS: MyAgentJobs = { asClient: [], asAgent: [] };

function formatDate(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return date.toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" });
}

function isOpen(job: AgentJob): boolean {
  return !["completed", "cancelled", "refunded"].includes(job.status);
}

export default function OutsideJobsScreen() {
  const { member, loading: authLoading } = useAuth();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { data, loading, error, refreshing, reload } = useApi<MyAgentJobs>(
    () => member ? api.myAgentJobs() : Promise.resolve(EMPTY_JOBS),
    `outside:jobs:${member?.id ?? "guest"}`,
  );
  const [side, setSide] = useState<JobSide>("client");

  if (authLoading || loading) return <Loading />;
  if (!member) return <SignInGate />;
  if (error && !data) return <ErrorView message={error} />;

  const clientJobs = data?.asClient ?? [];
  const agentJobs = data?.asAgent ?? [];
  const showAgentSide = agentJobs.length > 0;
  const activeSide = showAgentSide ? side : "client";
  const jobs = activeSide === "client" ? clientJobs : agentJobs;
  const openCount = jobs.filter(isOpen).length;
  const escrowTotal = jobs.reduce((sum, job) => sum + (job.escrow?.heldPesewas ?? 0), 0);
  const completedCount = jobs.filter((job) => job.status === "completed").length;

  return (
    <>
      <Stack.Screen options={{ title: "My Outside requests" }} />
      <ScrollView
        style={s.page}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={C.greenText} />}
      >
        <View style={s.hero}>
          <View style={s.heroOrb} />
          <View style={s.heroIcon}><BriefcaseIcon size={24} color={C.gold} strokeWidth={1.9} /></View>
          <Text style={s.heroKicker}>OGUAA OUTSIDE · YOUR WORK</Text>
          <Text style={s.heroTitle}>Requests you can trust.</Text>
          <Text style={s.heroBody}>Follow every brief from quote to protected payment, delivery and release.</Text>
          <View style={s.heroActions}>
            <Pressable accessibilityRole="button" onPress={() => push(ROUTES.outside)} style={s.heroButton}>
              <Text style={s.heroButtonText}>Find an agent</Text><ArrowRightIcon size={15} color={C.green900} strokeWidth={2.3} />
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => push(ROUTES.outsideBecomeAgent)} style={s.heroLink}>
              <Text style={s.heroLinkText}>Agent profile</Text>
            </Pressable>
          </View>
        </View>

        <View style={s.main}>
          <OutsideDisclaimer compact />

          {showAgentSide ? (
            <View style={s.tabs}>
              <RoleTab label={`As client · ${clientJobs.length}`} selected={activeSide === "client"} onPress={() => setSide("client")} />
              <RoleTab label={`As agent · ${agentJobs.length}`} selected={activeSide === "agent"} onPress={() => setSide("agent")} />
            </View>
          ) : null}

          {jobs.length ? (
            <View style={s.summary}>
              <Summary label="Open" value={String(openCount)} />
              <Summary label="In escrow" value={cedis(escrowTotal)} divided />
              <Summary label="Completed" value={String(completedCount)} divided />
            </View>
          ) : null}

          {error ? <Text style={s.pageError}>{error}</Text> : null}

          {jobs.length ? (
            <View style={s.jobList}>
              {jobs.map((job) => (
                <JobCard key={`${activeSide}:${job.id}`} job={job} side={activeSide} onReload={reload} />
              ))}
            </View>
          ) : (
            <View style={s.emptyWrap}>
              <EmptyState
                icon={<BriefcaseIcon size={52} color={C.inkFaint} strokeWidth={1.5} />}
                title={activeSide === "client" ? "No requests yet" : "No agent jobs yet"}
                body={activeSide === "client" ? "Choose a vetted agent and send a clear brief to get started." : "New requests from clients will appear here."}
                actionLabel={activeSide === "client" ? "Browse agents" : "Open agent profile"}
                onAction={() => push(activeSide === "client" ? ROUTES.outside : ROUTES.outsideBecomeAgent)}
              />
            </View>
          )}
        </View>
      </ScrollView>
    </>
  );
}

function SignInGate() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={s.gate}>
      <View style={s.gateIcon}><ShieldIcon size={30} color={C.goldText} strokeWidth={1.8} /></View>
      <Text style={s.gateKicker}>PRIVATE REQUESTS</Text>
      <Text style={s.gateTitle}>Sign in to track your work</Text>
      <Text style={s.gateBody}>Quotes, escrow records and disputes stay behind your Oguaa account.</Text>
      <Pressable accessibilityRole="button" onPress={() => push(ROUTES.signIn)} style={s.primaryButton}>
        <Text style={s.primaryButtonText}>Sign in or create account</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => push(ROUTES.outside)} style={s.textButton}>
        <Text style={s.textButtonLabel}>Browse vetted agents</Text>
      </Pressable>
    </View>
  );
}

function RoleTab({ label, selected, onPress }: Readonly<{ label: string; selected: boolean; onPress: () => void }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[s.tab, selected && s.tabActive]}>
      <Text style={[s.tabText, selected && s.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Summary({ label, value, divided = false }: Readonly<{ label: string; value: string; divided?: boolean }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={[s.summaryCell, divided && s.summaryDivided]}>
      <Text style={s.summaryLabel}>{label}</Text>
      <Text style={s.summaryValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function JobCard({ job, side, onReload }: Readonly<{ job: AgentJob; side: JobSide; onReload: () => void }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const funded = (job.escrow?.heldPesewas ?? 0) > 0 || ["funded", "delivered", "completed", "disputed", "refunded"].includes(job.status);
  const railColor = job.status === "disputed" ? C.maroon : funded ? C.teal : job.status === "quoted" ? C.goldBrand : C.green;
  const counterparty = side === "client" ? job.agentName : (job.clientName || "Oguaa client");

  return (
    <View style={s.jobCard}>
      <View style={[s.jobRail, { backgroundColor: railColor }]} />
      <View style={s.jobBody}>
        <View style={s.jobHead}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.jobTitle}>{job.title}</Text>
            <Pressable
              accessibilityRole={side === "client" ? "link" : undefined}
              disabled={side !== "client"}
              onPress={() => side === "client" && push(route.outsideAgent(job.agentSlug))}
            >
              <Text style={[s.counterparty, side === "client" && s.counterpartyLink]}>{side === "client" ? "with" : "from"} {counterparty}</Text>
            </Pressable>
          </View>
          <StatusChip status={job.status} />
        </View>

        <Text style={s.description}>{job.description}</Text>
        <View style={s.metaRow}>
          <Text style={s.meta}>SERVICE · {job.service.replaceAll("-", " ").toUpperCase()}</Text>
          {job.deadline ? <Text style={s.meta}>DUE · {formatDate(job.deadline)}</Text> : null}
          <Text style={s.meta}>OPENED · {formatDate(job.createdAt)}</Text>
        </View>

        <View style={s.moneyGrid}>
          <Money label="Budget" amount={job.budgetPesewas} />
          {job.quotePesewas > 0 ? <Money label="Firm quote" amount={job.quotePesewas} strong /> : null}
          {funded ? <Money label="In escrow" amount={job.escrow?.heldPesewas} /> : null}
          {funded && side === "agent" ? <Money label="Your payout" amount={job.escrow?.payoutPesewas} /> : null}
        </View>
        {job.quoteNote ? <Text style={s.quoteNote}>Agent note — {job.quoteNote}</Text> : null}
        {job.status === "disputed" && job.disputeReason ? <Text style={s.disputeNote}>Dispute — {job.disputeReason}</Text> : null}

        <View style={s.actions}>
          {side === "client" ? <ClientActions job={job} onReload={onReload} /> : <AgentActions job={job} onReload={onReload} />}
        </View>
      </View>
    </View>
  );
}

function Money({ label, amount, strong = false }: Readonly<{ label: string; amount?: number; strong?: boolean }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={s.moneyCell}>
      <Text style={s.moneyLabel}>{label}</Text>
      <Text style={[s.moneyValue, strong && s.moneyStrong]} numberOfLines={1}>{cedis(amount)}</Text>
    </View>
  );
}

function ClientActions({ job, onReload }: Readonly<{ job: AgentJob; onReload: () => void }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [mode, setMode] = useState<ClientMode>(null);
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState("");
  const [pendingRef, setPendingRef] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(action: () => Promise<unknown>, after?: () => void) {
    setBusy(true); setError("");
    try {
      await action();
      after?.();
      onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That action could not be completed.");
    } finally { setBusy(false); }
  }

  async function confirmFunding(reference: string) {
    await api.confirmAgentJob(reference);
    setPendingRef(null);
    setMode(null);
    onReload();
  }

  async function fund() {
    const address = email.trim();
    if (!/.+@.+\..+/.test(address)) { setError("Enter a valid email for your payment receipt."); return; }
    setBusy(true); setError("");
    try {
      const result = await api.fundAgentJob(job.id, address);
      setPendingRef(result.reference);
      if (result.simulated) {
        await confirmFunding(result.reference);
        return;
      }
      const opened = await openInAppBrowser(result.authorizationUrl);
      if (!opened) throw new Error("The secure payment page could not be opened.");
      try {
        await confirmFunding(result.reference);
      } catch {
        setError("Payment is not confirmed yet. If you paid, use Check payment below.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the protected payment.");
    } finally { setBusy(false); }
  }

  function confirmComplete() {
    Alert.alert(
      "Release the escrow?",
      `Only continue if ${job.agentName} delivered the agreed work. This releases ${cedis(job.escrow?.payoutPesewas || job.quotePesewas)} to the agent.`,
      [
        { text: "Not yet", style: "cancel" },
        { text: "Release & complete", onPress: () => { void run(() => api.completeAgentJob(job.id)); } },
      ],
    );
  }

  function confirmCancel() {
    Alert.alert("Cancel this request?", "The job will close. No money moves before escrow is funded.", [
      { text: "Keep request", style: "cancel" },
      { text: "Cancel request", style: "destructive", onPress: () => { void run(() => api.cancelAgentJob(job.id)); } },
    ]);
  }

  if (job.status === "requested") {
    return <ActionMessage text={`Waiting for ${job.agentName} to send a firm quote.`} action="Cancel request" busy={busy} onPress={confirmCancel} error={error} />;
  }

  if (job.status === "quoted") {
    if (pendingRef) {
      return (
        <View>
          <Text style={s.actionText}>Finish the Paystack payment, then confirm that the escrow is funded.</Text>
          {error ? <Text style={s.actionError}>{error}</Text> : null}
          <View style={s.actionRow}>
            <ActionButton label={busy ? "Checking…" : "Check payment"} disabled={busy} gold onPress={() => { void run(() => api.confirmAgentJob(pendingRef), () => { setPendingRef(null); setMode(null); }); }} />
            <ActionButton label="Cancel" disabled={busy} onPress={() => { setPendingRef(null); setMode(null); setError(""); }} />
          </View>
        </View>
      );
    }
    if (mode === "fund") {
      return (
        <View>
          <OutsideDisclaimer compact />
          <Text style={s.formLabel}>EMAIL FOR RECEIPT</Text>
          <TextInput value={email} onChangeText={(value) => { setEmail(value); setError(""); }} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" placeholderTextColor={C.inkFaint} style={s.input} />
          <Text style={s.formHint}>You are placing {cedis(job.quotePesewas)} in managed escrow. It is released only when you complete the job.</Text>
          {error ? <Text style={s.actionError}>{error}</Text> : null}
          <View style={s.actionRow}>
            <ActionButton label={busy ? "Opening payment…" : `Fund ${cedis(job.quotePesewas)}`} disabled={busy} gold onPress={() => { void fund(); }} />
            <ActionButton label="Back" disabled={busy} onPress={() => { setMode(null); setError(""); }} />
          </View>
        </View>
      );
    }
    return (
      <View>
        <Text style={s.actionText}>A firm quote of <Text style={s.actionStrong}>{cedis(job.quotePesewas)}</Text> is ready.</Text>
        {error ? <Text style={s.actionError}>{error}</Text> : null}
        <View style={s.actionRow}>
          <ActionButton label="Accept & fund escrow" gold onPress={() => setMode("fund")} />
          <ActionButton label="Decline" disabled={busy} onPress={confirmCancel} />
        </View>
      </View>
    );
  }

  if (job.status === "funded" || job.status === "delivered") {
    if (mode === "dispute") {
      return <DisputeForm reason={reason} setReason={setReason} busy={busy} error={error} onSubmit={() => { void run(() => api.disputeAgentJob(job.id, reason.trim()), () => setMode(null)); }} onCancel={() => { setMode(null); setError(""); }} />;
    }
    return (
      <View>
        <Text style={s.actionText}>{job.status === "delivered" ? "The agent marked this delivered. Check the work before releasing payment." : "Escrow is funded. The agent can now carry out the task."}</Text>
        {error ? <Text style={s.actionError}>{error}</Text> : null}
        <View style={s.actionRow}>
          {job.status === "delivered" ? <ActionButton label={busy ? "Completing…" : "Release & complete"} disabled={busy} gold onPress={confirmComplete} /> : null}
          <ActionButton label="Raise dispute" disabled={busy} danger onPress={() => setMode("dispute")} />
        </View>
      </View>
    );
  }

  if (job.status === "completed") {
    if (job.reviewed) return <Text style={s.successText}>Completed and reviewed. Medaase.</Text>;
    if (mode === "review") {
      return (
        <View>
          <Text style={s.formLabel}>YOUR RATING</Text>
          <View style={s.ratingRow}>
            {[1, 2, 3, 4, 5].map((value) => (
              <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: rating === value }} accessibilityLabel={`${value} stars`} onPress={() => setRating(value)} hitSlop={4}>
                <StarFilledIcon size={28} color={value <= rating ? C.goldBrand : C.sand} />
              </Pressable>
            ))}
          </View>
          <TextInput value={review} onChangeText={setReview} placeholder="How did it go? (optional)" placeholderTextColor={C.inkFaint} style={[s.input, s.textarea]} multiline />
          {error ? <Text style={s.actionError}>{error}</Text> : null}
          <View style={s.actionRow}>
            <ActionButton label={busy ? "Posting…" : "Post review"} disabled={busy} onPress={() => { void run(() => api.reviewAgentJob(job.id, rating, review.trim()), () => setMode(null)); }} />
            <ActionButton label="Later" disabled={busy} onPress={() => setMode(null)} />
          </View>
        </View>
      );
    }
    return <ActionMessage text="Completed. A short review helps others choose well." action="Write a review" busy={busy} onPress={() => setMode("review")} error={error} />;
  }

  if (job.status === "disputed") return <Text style={s.disputedText}>The escrow is frozen while Oguaa reviews this dispute.</Text>;
  if (job.status === "refunded") return <Text style={s.actionText}>The escrow was returned to you.</Text>;
  return <Text style={s.actionText}>This request was cancelled.</Text>;
}

function AgentActions({ job, onReload }: Readonly<{ job: AgentJob; onReload: () => void }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [quoting, setQuoting] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(action: () => Promise<unknown>, after?: () => void) {
    setBusy(true); setError("");
    try { await action(); after?.(); onReload(); }
    catch (err) { setError(err instanceof Error ? err.message : "That action could not be completed."); }
    finally { setBusy(false); }
  }

  async function sendQuote() {
    const value = Number.parseFloat(amount);
    if (!Number.isFinite(value) || value < 1 || value > 500_000) { setError("Enter a quote between GH₵1 and GH₵500,000."); return; }
    await run(
      () => api.quoteAgentJob(job.id, { amountPesewas: Math.round(value * 100), note: note.trim() }),
      () => setQuoting(false),
    );
  }

  function decline() {
    Alert.alert("Decline this request?", "The client will see that the request was cancelled.", [
      { text: "Keep request", style: "cancel" },
      { text: "Decline", style: "destructive", onPress: () => { void run(() => api.cancelAgentJob(job.id)); } },
    ]);
  }

  if (job.status === "requested") {
    if (quoting) {
      return (
        <View>
          <Text style={s.formLabel}>YOUR FIRM QUOTE (GH₵)</Text>
          <TextInput value={amount} onChangeText={(value) => { setAmount(value); setError(""); }} keyboardType="decimal-pad" placeholder={String(Math.max(1, Math.round(job.budgetPesewas / 100)))} placeholderTextColor={C.inkFaint} style={s.input} />
          <TextInput value={note} onChangeText={setNote} placeholder="What is included and expected timing? (optional)" placeholderTextColor={C.inkFaint} style={[s.input, s.noteInput]} multiline />
          <Text style={s.formHint}>The client&apos;s working budget is {cedis(job.budgetPesewas)}. Send the amount you can genuinely deliver for.</Text>
          {error ? <Text style={s.actionError}>{error}</Text> : null}
          <View style={s.actionRow}>
            <ActionButton label={busy ? "Sending…" : "Send firm quote"} disabled={busy} onPress={() => { void sendQuote(); }} />
            <ActionButton label="Back" disabled={busy} onPress={() => { setQuoting(false); setError(""); }} />
          </View>
        </View>
      );
    }
    return (
      <View>
        <Text style={s.actionText}>New request. Review the full brief before quoting.</Text>
        {error ? <Text style={s.actionError}>{error}</Text> : null}
        <View style={s.actionRow}>
          <ActionButton label="Send a quote" onPress={() => setQuoting(true)} />
          <ActionButton label="Decline" disabled={busy} danger onPress={decline} />
        </View>
      </View>
    );
  }

  if (job.status === "quoted") return <ActionMessage text={`Quote sent (${cedis(job.quotePesewas)}). Waiting for the client to fund escrow.`} action="Withdraw" busy={busy} onPress={decline} error={error} />;

  if (job.status === "funded" || job.status === "delivered") {
    if (disputing) {
      return <DisputeForm reason={reason} setReason={setReason} busy={busy} error={error} onSubmit={() => { void run(() => api.disputeAgentJob(job.id, reason.trim()), () => setDisputing(false)); }} onCancel={() => { setDisputing(false); setError(""); }} />;
    }
    return (
      <View>
        <Text style={s.actionText}>{job.status === "funded" ? "Escrow is held. Do the agreed work, then mark it delivered." : "Delivered. Waiting for the client to check the work and release escrow."}</Text>
        {error ? <Text style={s.actionError}>{error}</Text> : null}
        <View style={s.actionRow}>
          {job.status === "funded" ? <ActionButton label={busy ? "Updating…" : "Mark delivered"} disabled={busy} onPress={() => { void run(() => api.deliverAgentJob(job.id)); }} /> : null}
          <ActionButton label="Raise dispute" disabled={busy} danger onPress={() => setDisputing(true)} />
        </View>
      </View>
    );
  }

  if (job.status === "completed") return <Text style={s.successText}>Completed. Your payout is {cedis(job.escrow?.payoutPesewas)}{job.escrow?.simulated ? " (simulated)." : "."}</Text>;
  if (job.status === "disputed") return <Text style={s.disputedText}>Under review. The escrow stays frozen until Oguaa resolves the dispute.</Text>;
  if (job.status === "refunded") return <Text style={s.actionText}>Refunded to the client.</Text>;
  return <Text style={s.actionText}>This request was cancelled.</Text>;
}

function DisputeForm({ reason, setReason, busy, error, onSubmit, onCancel }: Readonly<{ reason: string; setReason: (value: string) => void; busy: boolean; error: string; onSubmit: () => void; onCancel: () => void }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const valid = reason.trim().length >= 5;
  return (
    <View>
      <Text style={s.formLabel}>WHAT WENT WRONG?</Text>
      <TextInput value={reason} onChangeText={setReason} placeholder="Explain the problem clearly. Escrow stays frozen while it is reviewed." placeholderTextColor={C.inkFaint} style={[s.input, s.textarea]} multiline />
      <Text style={s.formHint}>Include the agreed terms, what happened and the outcome you are seeking.</Text>
      {error ? <Text style={s.actionError}>{error}</Text> : null}
      <View style={s.actionRow}>
        <ActionButton label={busy ? "Submitting…" : "Submit dispute"} disabled={busy || !valid} danger onPress={onSubmit} />
        <ActionButton label="Cancel" disabled={busy} onPress={onCancel} />
      </View>
    </View>
  );
}

function ActionMessage({ text, action, busy, onPress, error }: Readonly<{ text: string; action: string; busy: boolean; onPress: () => void; error: string }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View>
      <Text style={s.actionText}>{text}</Text>
      {error ? <Text style={s.actionError}>{error}</Text> : null}
      <View style={s.actionRow}><ActionButton label={action} disabled={busy} onPress={onPress} /></View>
    </View>
  );
}

function ActionButton({ label, onPress, disabled = false, gold = false, danger = false }: Readonly<{ label: string; onPress: () => void; disabled?: boolean; gold?: boolean; danger?: boolean }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[s.actionButton, gold && s.actionButtonGold, danger && s.actionButtonDanger, disabled && { opacity: 0.5 }]}
    >
      <Text style={[s.actionButtonText, gold && s.actionButtonGoldText, danger && s.actionButtonDangerText]}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  page: { flex: 1, backgroundColor: C.paper },
  content: { paddingBottom: 52 },
  hero: { minHeight: 330, overflow: "hidden", backgroundColor: C.green900, paddingHorizontal: 22, paddingTop: 38, paddingBottom: 30 },
  heroOrb: { position: "absolute", width: 260, height: 260, borderRadius: 140, right: -100, top: -105, backgroundColor: C.goldTint14, borderWidth: 1, borderColor: C.goldBorder35 },
  heroIcon: { width: 49, height: 49, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.goldBorder35, backgroundColor: C.goldTint14 },
  heroKicker: { color: C.gold, ...S(700), fontSize: 9, letterSpacing: 1.8, marginTop: 17 },
  heroTitle: { color: ON_GREEN, ...D(700), fontSize: 38, lineHeight: 42, maxWidth: 330, marginTop: 7 },
  heroBody: { color: C.onDarkText85, fontSize: 14, lineHeight: 21, maxWidth: 340, marginTop: 10 },
  heroActions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 13, marginTop: 20 },
  heroButton: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: C.goldBrand, borderRadius: 999, paddingHorizontal: 16 },
  heroButtonText: { color: C.green900, ...S(700), fontSize: 12 },
  heroLink: { minHeight: 44, justifyContent: "center", paddingHorizontal: 6 },
  heroLinkText: { color: ON_GREEN, ...S(700), fontSize: 12, textDecorationLine: "underline" },
  main: { paddingHorizontal: 16, gap: 16, marginTop: -16 },
  tabs: { flexDirection: "row", gap: 5, borderWidth: 1, borderColor: C.sand, borderRadius: 999, backgroundColor: C.cream, padding: 4 },
  tab: { flex: 1, minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: 999, paddingHorizontal: 10 },
  tabActive: { backgroundColor: C.green },
  tabText: { color: C.inkMuted, ...S(700), fontSize: 11 },
  tabTextActive: { color: ON_GREEN },
  summary: { flexDirection: "row", overflow: "hidden", borderWidth: 1, borderColor: C.sand, borderRadius: 18, backgroundColor: C.cream },
  summaryCell: { flex: 1, minWidth: 0, paddingHorizontal: 7, paddingVertical: 14, alignItems: "center" },
  summaryDivided: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: C.sand },
  summaryLabel: { color: C.inkFaint, ...S(700), fontSize: 8, letterSpacing: 1, textTransform: "uppercase" },
  summaryValue: { color: C.ink, ...S(700), fontSize: 16, marginTop: 3, maxWidth: "100%" },
  pageError: { color: C.clayText, fontSize: 12, lineHeight: 18, borderWidth: 1, borderColor: withAlpha(C.clay, 0.25), backgroundColor: withAlpha(C.clay, 0.06), borderRadius: 13, padding: 11 },
  jobList: { gap: 14 },
  jobCard: { position: "relative", overflow: "hidden", borderWidth: 1, borderColor: C.sand, borderRadius: 20, backgroundColor: C.cream },
  jobRail: { position: "absolute", top: 0, bottom: 0, left: 0, width: 4 },
  jobBody: { padding: 16, paddingLeft: 19 },
  jobHead: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  jobTitle: { color: C.ink, ...D(700), fontSize: 20, lineHeight: 24 },
  counterparty: { color: C.inkMuted, fontSize: 12, marginTop: 3 },
  counterpartyLink: { color: C.greenText, ...S(600), textDecorationLine: "underline" },
  description: { color: C.inkMuted, fontSize: 13, lineHeight: 20, marginTop: 13 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  meta: { color: C.inkFaint, ...S(600), fontSize: 8.5, letterSpacing: 0.55 },
  moneyGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7, borderWidth: 1, borderColor: C.sand, borderRadius: 14, backgroundColor: C.paper, padding: 9, marginTop: 14 },
  moneyCell: { minWidth: "45%", flexGrow: 1, padding: 3 },
  moneyLabel: { color: C.inkFaint, ...S(700), fontSize: 8, letterSpacing: 0.9, textTransform: "uppercase" },
  moneyValue: { color: C.inkMuted, ...S(600), fontSize: 13, marginTop: 2 },
  moneyStrong: { color: C.ink, ...S(700), fontSize: 15 },
  quoteNote: { color: C.inkMuted, fontSize: 11, lineHeight: 17, fontStyle: "italic", marginTop: 10 },
  disputeNote: { color: C.maroonText, fontSize: 11, lineHeight: 17, borderWidth: 1, borderColor: withAlpha(C.maroon, 0.25), backgroundColor: withAlpha(C.maroon, 0.06), borderRadius: 10, padding: 9, marginTop: 10 },
  actions: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.sand, paddingTop: 14, marginTop: 14 },
  actionText: { color: C.inkMuted, fontSize: 12, lineHeight: 18 },
  actionStrong: { color: C.ink, ...S(700) },
  actionError: { color: C.clayText, fontSize: 11, lineHeight: 17, marginTop: 8 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 11 },
  actionButton: { minHeight: 40, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.sand, borderRadius: 999, paddingHorizontal: 14, backgroundColor: C.paper },
  actionButtonText: { color: C.greenText, ...S(700), fontSize: 11 },
  actionButtonGold: { borderColor: C.goldBrand, backgroundColor: C.goldBrand },
  actionButtonGoldText: { color: C.green900 },
  actionButtonDanger: { borderColor: withAlpha(C.maroon, 0.35), backgroundColor: withAlpha(C.maroon, 0.04) },
  actionButtonDangerText: { color: C.maroonText },
  formLabel: { color: C.inkFaint, ...S(700), fontSize: 8.5, letterSpacing: 1.3, marginTop: 12, marginBottom: 6 },
  input: { minHeight: 46, borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 10, color: C.ink, fontSize: 13 },
  textarea: { minHeight: 90, textAlignVertical: "top", marginTop: 9 },
  noteInput: { minHeight: 70, textAlignVertical: "top", marginTop: 9 },
  formHint: { color: C.inkFaint, fontSize: 10.5, lineHeight: 16, marginTop: 7 },
  ratingRow: { flexDirection: "row", gap: 6 },
  successText: { color: C.greenText, ...S(600), fontSize: 12, lineHeight: 18 },
  disputedText: { color: C.maroonText, ...S(600), fontSize: 12, lineHeight: 18 },
  emptyWrap: { overflow: "hidden", borderWidth: 1, borderColor: C.sand, borderRadius: 20, backgroundColor: C.cream },
  gate: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.paper, padding: 28 },
  gateIcon: { width: 62, height: 62, alignItems: "center", justifyContent: "center", borderRadius: 21, backgroundColor: C.goldTint14, borderWidth: 1, borderColor: C.goldBorder35 },
  gateKicker: { color: C.goldText, ...S(700), fontSize: 9, letterSpacing: 1.8, marginTop: 18 },
  gateTitle: { color: C.ink, ...D(700), fontSize: 29, textAlign: "center", marginTop: 5 },
  gateBody: { color: C.inkMuted, fontSize: 13, lineHeight: 20, textAlign: "center", maxWidth: 310, marginTop: 8 },
  primaryButton: { minHeight: 48, alignItems: "center", justifyContent: "center", backgroundColor: C.green, borderRadius: 999, paddingHorizontal: 22, marginTop: 20 },
  primaryButtonText: { color: ON_GREEN, ...S(700), fontSize: 13 },
  textButton: { minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, marginTop: 6 },
  textButtonLabel: { color: C.greenText, ...S(700), fontSize: 12, textDecorationLine: "underline" },
});
