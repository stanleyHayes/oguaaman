import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { ROUTES } from "@/lib/routes";
import { push } from "@/lib/router";
import { useDirectives } from "@/lib/directives";

// A critical safety directive that rings like a call: a full-screen takeover
// (with the looping vibration started in DirectivesProvider) until the person
// views it or dismisses. Foreground only — background/locked-screen delivery is
// the expo-notifications push path (see docs/mobile-push.md).
export function MobileRingingAlert() {
  const { ringing, clearRing } = useDirectives();

  function answer() {
    clearRing();
    push(ROUTES.alerts);
  }

  return (
    <Modal visible={ringing !== null} animationType="fade" onRequestClose={clearRing} statusBarTranslucent>
      <View style={styles.screen}>
        <View style={styles.top}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>!</Text>
          </View>
          <Text style={styles.eyebrow}>CRITICAL ALERT</Text>
          <Text style={styles.title}>{ringing?.title ?? ""}</Text>
          {ringing?.action ? <Text style={styles.body}>{ringing.action}</Text> : null}
          {ringing?.area ? <Text style={styles.meta}>Area: {ringing.area}</Text> : null}
          {ringing?.issuedByName ? <Text style={styles.meta}>{ringing.issuedByName}</Text> : null}
        </View>
        <View style={styles.actions}>
          <Pressable onPress={clearRing} style={[styles.btn, styles.dismiss]} accessibilityLabel="Dismiss alert">
            <Text style={styles.dismissText}>Dismiss</Text>
          </Pressable>
          <Pressable onPress={answer} style={[styles.btn, styles.answer]} accessibilityLabel="View alert">
            <Text style={styles.answerText}>View</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0c2c1f", paddingHorizontal: 24, paddingTop: 96, paddingBottom: 56, justifyContent: "space-between" },
  top: { alignItems: "center" },
  badge: { width: 88, height: 88, borderRadius: 44, backgroundColor: "rgba(176,80,60,0.25)", borderWidth: 3, borderColor: "rgba(176,80,60,0.55)", alignItems: "center", justifyContent: "center", marginBottom: 24 },
  badgeText: { color: "#e8c877", fontSize: 44, fontWeight: "800" },
  eyebrow: { color: "rgba(232,200,119,0.9)", letterSpacing: 3, fontSize: 12, fontWeight: "700" },
  title: { color: "#f4efe4", fontSize: 28, fontWeight: "700", textAlign: "center", marginTop: 12 },
  body: { color: "rgba(244,239,228,0.82)", fontSize: 16, textAlign: "center", marginTop: 14, lineHeight: 22 },
  meta: { color: "rgba(244,239,228,0.6)", fontSize: 13, textAlign: "center", marginTop: 8 },
  actions: { flexDirection: "row", justifyContent: "center", gap: 40 },
  btn: { minWidth: 120, paddingVertical: 16, borderRadius: 999, alignItems: "center" },
  dismiss: { backgroundColor: "#b0503c" },
  dismissText: { color: "#f4efe4", fontSize: 16, fontWeight: "700" },
  answer: { backgroundColor: "#3fbf7f" },
  answerText: { color: "#062016", fontSize: 16, fontWeight: "800" },
});
