import { useMemo, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { T as Text, TI as TextInput } from "@/components/typography";
import { api, type ReportTargetType } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { push } from "@/lib/router";
import { ROUTES } from "@/lib/routes";
import { type Palette, S, D } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { FlagIcon } from "@/components/icons";

interface Reason { value: string; label: string }

// Safety reasons first: child safety and intimate images hide the content at
// once and alert stewards (K11).
const SAFETY_REASONS: Reason[] = [
  { value: "child_safety", label: "Child safety — a child may be at risk" },
  { value: "ncii", label: "Intimate image shared without consent" },
  { value: "harassment", label: "Harassment or bullying" },
  { value: "hate", label: "Hate" },
  { value: "violence", label: "Violence or threats" },
  { value: "private_info", label: "Private information" },
  { value: "scam", label: "Scam or fraud" },
  { value: "impersonation", label: "Impersonation" },
];
const LISTING_REASONS: Reason[] = [
  { value: "inaccurate", label: "Not accurate" },
  { value: "inappropriate", label: "Inappropriate" },
];
const MEMORIAL_REASON: Reason = { value: "bereavement", label: "Memorial concern" };
const OTHER_REASON: Reason = { value: "other", label: "Something else" };

function reasonsFor(targetType: ReportTargetType, memorial: boolean): Reason[] {
  const list = [...SAFETY_REASONS];
  if (targetType === "listing" || targetType === "news" || targetType === "product") list.push(...LISTING_REASONS);
  else list.push(LISTING_REASONS[1]);
  if (memorial) list.unshift(MEMORIAL_REASON);
  list.push(OTHER_REASON);
  return list;
}

const NOUN: Record<ReportTargetType, string> = {
  listing: "post",
  member: "member",
  review: "review",
  tribute: "tribute",
  product: "item",
  news: "article",
  agent: "agent",
  agent_review: "review",
  ai_output: "suggestion",
};

export interface ReportTarget {
  type: ReportTargetType;
  id: string;
  /** The business listing a product belongs to (required for products). */
  listingId?: string;
}

/**
 * The member-facing notice-and-takedown control (spec §14.3/§14.4/§14.7, App
 * Store 1.2, Play UGC). Pass `listingId` for a listing, or `target` for any
 * other content (member, review, tribute, product, news, agent). Listings can
 * be reported signed out; everything else asks the visitor to sign in first.
 * `memorial` adds the bereavement reason for In Memoriam screens; `compact`
 * renders a small inline trigger for rows such as reviews and tributes.
 */
export function ReportButton({ listingId, target, memorial = false, compact = false }: Readonly<{ listingId?: string; target?: ReportTarget; memorial?: boolean; compact?: boolean }>) {
  const { C } = useTheme();
  const { member } = useAuth();
  const s = useMemo(() => makeStyles(C), [C]);
  const resolved: ReportTarget = target ?? { type: "listing", id: listingId ?? "" };
  const reasons = reasonsFor(resolved.type, memorial);
  const [open, setOpen] = useState(false);
  // No default for everyone else: a child-safety or intimate-image report hides
  // the content at once, so the reporter must pick a reason on purpose.
  const [reason, setReason] = useState(memorial ? MEMORIAL_REASON.value : "");
  const [detail, setDetail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const noun = NOUN[resolved.type];
  const needsSignIn = resolved.type !== "listing" && !member;

  async function submit() {
    setState("sending");
    try {
      const details = detail.trim() || undefined;
      if (resolved.type === "listing" && !member) {
        await api.reportListing(resolved.id, { reason, detail: details });
      } else {
        await api.report({ targetType: resolved.type, targetId: resolved.id, reason, details, listingId: resolved.listingId });
      }
      setState("done");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "");
      setState("error");
    }
  }

  if (!resolved.id) return null;

  if (!open) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={`Report this ${noun}`} onPress={() => setOpen(true)} style={compact ? s.triggerCompact : s.trigger} hitSlop={8}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <FlagIcon size={compact ? 12 : 14} color={C.inkFaint} strokeWidth={2} />
          <Text style={compact ? s.triggerTextCompact : s.triggerText}>{compact ? "Report" : "Report this"}</Text>
        </View>
      </Pressable>
    );
  }

  if (needsSignIn) {
    return (
      <View style={s.panel}>
        <Text style={s.title}>Sign in to report this {noun}</Text>
        <Text style={s.help}>Reports come from signed-in members so a steward can follow up. We review reports within 24 hours.</Text>
        <View style={s.actions}>
          <Pressable accessibilityRole="button" onPress={() => setOpen(false)}><Text style={s.cancel}>Cancel</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => push(ROUTES.signIn)} style={s.send}>
            <Text style={s.sendText}>Sign in</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={s.panel}>
      {state === "done" ? (
        <>
          <Text style={s.thanks}>Thank you.</Text>
          <Text style={s.thanksBody}>A steward will review this within 24 hours. You can also block a member from their profile.</Text>
          <Pressable accessibilityRole="button" onPress={() => setOpen(false)}><Text style={s.cancel}>Close</Text></Pressable>
        </>
      ) : (
        <>
          <Text style={s.title}>Report this {noun}</Text>
          <Text style={s.help}>Tell a steward what&apos;s wrong. We review reports within 24 hours and remove content that breaks our rules.</Text>
          <View style={s.reasons}>
            {reasons.map((r) => (
              <Pressable accessibilityRole="button" accessibilityState={{ selected: reason === r.value }} key={r.value} onPress={() => setReason(r.value)} style={[s.chip, reason === r.value && s.chipOn]}>
                <Text style={[s.chipText, reason === r.value && s.chipTextOn]}>{r.label}</Text>
              </Pressable>
            ))}
          </View>
          {reason === "child_safety" ? (
            <View style={s.urgent}>
              <Text style={s.urgentText}>If a child is in immediate danger, call 112 now.</Text>
              <Pressable accessibilityRole="button" onPress={() => { void Linking.openURL("tel:112"); }} style={s.callBtn}>
                <Text style={s.sendText}>Call 112</Text>
              </Pressable>
            </View>
          ) : null}
          <TextInput value={detail} onChangeText={setDetail} placeholder="Add a detail (optional)" placeholderTextColor={C.inkFaint} multiline maxLength={1000} style={s.input} />
          {state === "error" && <Text style={s.err}>{message || "Could not send that. Please try again."}</Text>}
          <View style={s.actions}>
            <Pressable accessibilityRole="button" onPress={() => setOpen(false)}><Text style={s.cancel}>Cancel</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={submit} disabled={state === "sending" || !reason} style={[s.send, (state === "sending" || !reason) && { opacity: 0.6 }]}>
              <Text style={s.sendText}>{state === "sending" ? "Sending…" : "Send report"}</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  trigger: { alignSelf: "center", paddingVertical: 8 },
  triggerCompact: { alignSelf: "flex-start", paddingVertical: 4 },
  triggerText: { color: C.inkFaint, fontSize: 13, ...S(600) },
  triggerTextCompact: { color: C.inkFaint, fontSize: 12, ...S(600) },
  panel: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 12, padding: 16, marginTop: 8 },
  title: { fontSize: 15, ...D(700), color: C.ink },
  help: { color: C.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  reasons: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  chip: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.cream, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { borderColor: C.clay, backgroundColor: C.clay },
  chipText: { color: C.inkMuted, fontSize: 13, ...S(600) },
  chipTextOn: { color: C.cream },
  urgent: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  urgentText: { color: C.clayText, fontSize: 13, ...S(600), flexShrink: 1 },
  callBtn: { backgroundColor: C.clay, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  input: { marginTop: 12, minHeight: 56, borderWidth: 1, borderColor: C.sand, borderRadius: 8, backgroundColor: C.cream, padding: 12, fontSize: 14, color: C.ink, textAlignVertical: "top" },
  err: { color: C.clayText, fontSize: 13, marginTop: 8 },
  actions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 16, marginTop: 14 },
  cancel: { color: C.inkMuted, fontSize: 14, ...S(600) },
  send: { backgroundColor: C.clay, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 9 },
  sendText: { color: C.cream, fontSize: 13, ...S(700) },
  thanks: { fontSize: 15, ...S(700), color: C.greenText },
  thanksBody: { color: C.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 4, marginBottom: 10 },
});
