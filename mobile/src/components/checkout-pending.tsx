import { useMemo } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { T as Text } from "@/components/typography";
import type { HostedCheckout } from "@/lib/use-hosted-checkout";
import { useTheme } from "@/lib/theme-context";
import { ON_GREEN, S, type Palette } from "@/theme";

const DEFAULT_BODY = "Complete the payment on the Paystack page. We check it when you come back; you can also check now.";

/**
 * The controls for a Paystack checkout waiting on the hosted page: check the
 * payment, reopen the same page, or cancel it locally. Shows the server's
 * "still processing" message while the payment settles.
 */
export function CheckoutPending<T>({ checkout, body = DEFAULT_BODY, reference, style }: Readonly<{
  checkout: HostedCheckout<T>;
  body?: string;
  /** Show the Paystack reference (useful for orders the payer may ask about). */
  reference?: boolean;
  style?: StyleProp<ViewStyle>;
}>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { busy, message, pending } = checkout;
  return (
    <View style={[s.box, style]}>
      <Text style={s.label}>FINISH ON THE PAYSTACK PAGE</Text>
      <Text style={s.body}>{body}{reference && pending ? ` Reference ${pending.reference}.` : ""}</Text>
      {message === "" ? null : <Text style={s.message}>{message}</Text>}
      <Pressable accessibilityRole="button" onPress={() => { void checkout.verify(); }} disabled={busy} style={[s.primary, busy && s.dim]}>
        <Text style={s.primaryText}>{busy ? "Checking…" : "I've paid — check payment"}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => { void checkout.reopen(); }} disabled={busy} style={s.secondary}>
        <Text style={s.secondaryText}>Open payment page</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={checkout.cancel} disabled={busy} style={s.secondary}>
        <Text style={s.secondaryText}>I didn&apos;t pay — cancel</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  box: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.green, borderRadius: 14, padding: 16, gap: 8 },
  label: { color: C.inkFaint, fontSize: 11, letterSpacing: 2, ...S(700) },
  body: { color: C.inkMuted, fontSize: 13, lineHeight: 19, ...S(400) },
  message: { color: C.clayText, fontSize: 13, lineHeight: 18, ...S(400) },
  primary: { backgroundColor: C.green, borderRadius: 999, paddingVertical: 13, alignItems: "center", marginTop: 6 },
  primaryText: { color: ON_GREEN, fontSize: 15, ...S(700) },
  dim: { opacity: 0.6 },
  secondary: { alignItems: "center", justifyContent: "center", minHeight: 44 },
  secondaryText: { color: C.tealText, fontSize: 13, ...S(700) },
});
