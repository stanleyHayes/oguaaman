import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet } from "react-native";
import { T as Text } from "@/components/typography";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme-context";
import { ON_GREEN, S, type Palette } from "@/theme";

/**
 * Block / unblock a member — App Store Review Guideline 1.2. Confirms first
 * because it is destructive (it also drops any follow between the two members),
 * with a native Alert so the destructive styling is the platform's own. Only the
 * viewer's own block can be lifted, so "Unblock" follows `blockedByMe` (K5).
 * `onDark` is the profile-header pill; `inline` is a small link for rows
 * (reviews, tributes, agent and organiser lines). Renders nothing signed out or
 * for the member's own content.
 */
export function BlockButton({ slug, name, onBlocked, variant = "inline" }: Readonly<{ slug?: string; name: string; onBlocked?: () => void; variant?: "onDark" | "inline" }>) {
  const { member } = useAuth();
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const inline = variant === "inline";

  useEffect(() => {
    // Rows only need the state once the member acts; the header shows it up front.
    if (!member || !slug || inline) return;
    let alive = true;
    api.memberBlockState(slug).then((r) => { if (alive) setBlocked(r.blockedByMe ?? r.blocked); }).catch(() => {});
    return () => { alive = false; };
  }, [member, slug, inline]);

  if (!member || !slug || member.slug === slug) return null;
  const who = slug;

  async function apply(next: boolean) {
    setBusy(true);
    try {
      const r = next ? await api.blockMember(who) : await api.unblockMember(who);
      const mine = r.blockedByMe ?? (next && r.blocked);
      setBlocked(mine);
      if (mine) onBlocked?.();
    } catch {
      /* leave the control as it was */
    } finally {
      setBusy(false);
    }
  }

  function press() {
    if (busy) return;
    if (blocked) {
      void apply(false);
      return;
    }
    Alert.alert(
      `Block ${name}?`,
      "You will not see each other's posts, reviews or profile, and any follow between you is removed. You can undo this in Settings.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Block", style: "destructive", onPress: () => void apply(true) },
      ],
    );
  }

  const label = blocked ? "Unblock" : "Block";
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label} ${name}`} onPress={press} disabled={busy} style={inline ? s.inline : s.pill} hitSlop={inline ? 8 : undefined}>
      <Text style={inline ? s.inlineText : s.pillText}>{inline ? `${label} ${name.split(" ")[0]}` : label}</Text>
    </Pressable>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  pill: { minHeight: 44, justifyContent: "center", paddingHorizontal: 18, borderRadius: 999, borderWidth: 1, borderColor: C.onDarkText50 },
  pillText: { color: ON_GREEN, ...S(600), fontSize: 14 },
  inline: { alignSelf: "flex-start", paddingVertical: 4 },
  inlineText: { color: C.inkFaint, fontSize: 12, ...S(600) },
});
