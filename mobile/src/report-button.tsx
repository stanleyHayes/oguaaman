import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { T as Text, TI as TextInput } from "@/components/typography";
import { api } from "@/lib/api";
import { type Palette, S, D } from "@/theme";
import { useTheme } from "@/lib/theme-context";

const REASONS: { value: string; label: string }[] = [
  { value: "inaccurate", label: "Not accurate" },
  { value: "inappropriate", label: "Inappropriate" },
  { value: "impersonation", label: "Impersonation" },
  { value: "bereavement", label: "Memorial concern" },
  { value: "other", label: "Something else" },
];

function bereavementFirst(a: { value: string }, b: { value: string }) {
  if (a.value === "bereavement") return -1;
  if (b.value === "bereavement") return 1;
  return 0;
}

/**
 * The member-facing notice-and-takedown affordance (spec §14.3/§14.4/§14.7).
 * `memorial` floats the bereavement reason to the top for In Memoriam screens.
 */
export function ReportButton({ listingId, memorial = false }: Readonly<{ listingId: string; memorial?: boolean }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(memorial ? "bereavement" : "inaccurate");
  const [detail, setDetail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  const reasons = memorial ? [...REASONS].sort(bereavementFirst) : REASONS;

  async function submit() {
    setState("sending");
    try {
      await api.reportListing(listingId, { reason, detail: detail.trim() || undefined });
      setState("done");
    } catch {
      setState("error");
    }
  }

  if (!open) {
    return (
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={s.trigger}>
        <Text style={s.triggerText}>⚑ Report this</Text>
      </Pressable>
    );
  }

  return (
    <View style={s.panel}>
      {state === "done" ? (
        <>
          <Text style={s.thanks}>Thank you.</Text>
          <Text style={s.thanksBody}>A steward will review this. We take memorial and personal concerns seriously.</Text>
          <Pressable accessibilityRole="button" onPress={() => setOpen(false)}><Text style={s.cancel}>Close</Text></Pressable>
        </>
      ) : (
        <>
          <Text style={s.title}>Report this listing</Text>
          <Text style={s.help}>Tell a steward what&apos;s wrong. Contested or sensitive items are held, never auto-removed.</Text>
          <View style={s.reasons}>
            {reasons.map((r) => (
              <Pressable accessibilityRole="button" key={r.value} onPress={() => setReason(r.value)} style={[s.chip, reason === r.value && s.chipOn]}>
                <Text style={[s.chipText, reason === r.value && s.chipTextOn]}>{r.label}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput value={detail} onChangeText={setDetail} placeholder="Add a detail (optional)" placeholderTextColor={C.inkFaint} multiline style={s.input} />
          {state === "error" && <Text style={s.err}>Could not send that. Please try again.</Text>}
          <View style={s.actions}>
            <Pressable accessibilityRole="button" onPress={() => setOpen(false)}><Text style={s.cancel}>Cancel</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={submit} disabled={state === "sending"} style={[s.send, state === "sending" && { opacity: 0.6 }]}>
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
  triggerText: { color: C.inkFaint, fontSize: 13, ...S(600) },
  panel: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 12, padding: 16, marginTop: 8 },
  title: { fontSize: 15, ...D(700), color: C.ink },
  help: { color: C.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  reasons: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  chip: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.cream, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { borderColor: C.clay, backgroundColor: C.clay },
  chipText: { color: C.inkMuted, fontSize: 13, ...S(600) },
  chipTextOn: { color: C.cream },
  input: { marginTop: 12, minHeight: 56, borderWidth: 1, borderColor: C.sand, borderRadius: 8, backgroundColor: C.cream, padding: 12, fontSize: 14, color: C.ink, textAlignVertical: "top" },
  err: { color: C.clayText, fontSize: 13, marginTop: 8 },
  actions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 16, marginTop: 14 },
  cancel: { color: C.inkMuted, fontSize: 14, ...S(600) },
  send: { backgroundColor: C.clay, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 9 },
  sendText: { color: C.cream, fontSize: 13, ...S(700) },
  thanks: { fontSize: 15, ...S(700), color: C.greenText },
  thanksBody: { color: C.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 4, marginBottom: 10 },
});
