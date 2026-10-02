import { useEffect, useMemo, useRef, useState } from "react";
import { Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { T as Text } from "@/components/typography";
import { ArrowUpRightIcon, CloseIcon, InfoIcon } from "@/components/icons";
import { api, adClickUrl, mediaUrl } from "@/lib/api";
import { markShown, newViewId, pickAd } from "@/lib/ads";
import { cld } from "@/lib/cloudinary";
import { useTheme } from "@/lib/theme-context";
import type { AdCreative, AdPlacement } from "@/lib/types";
import { useViewability } from "@/lib/use-viewability";
import { openInAppBrowser } from "@/lib/webbrowser";
import { ReportButton } from "@/report-button";
import { S, withAlpha, type Palette } from "@/theme";

// A paid ad in the app (spec §8, placement "app-card"). Display only: no
// prices, no buying, no links to the web. It is built to never read as news
// (AAG Code Art. 13) and follows the portal's ad frame: a sand panel inside a
// gold hairline, a top row with the square chip flag, the word
// "Advertisement" and the ⓘ, then the creative, then the sponsor line from the
// API verbatim, so the ad still names itself once its top row scrolls away.
// None of the news card's type scale, radius or motion. While the server sends
// an empty slate (the default until app delivery is switched on) it renders
// nothing at all.

/** Card creatives are cropped to 1200×628 by the server; the frame keeps that ratio. */
const CARD_RATIO = 1200 / 628;
const CARD_TRANSFORM = "c_fill,w_1200,h_628,f_auto,q_auto";
const WHY_TITLE = "Why am I seeing this ad?";

interface Slot {
  ad: AdCreative;
  why: string;
  viewId: string;
}

/** Runs `fn` once the screen has painted and gone idle (setTimeout fallback). */
function afterFirstPaint(fn: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(fn);
    return () => cancelIdleCallback(handle);
  }
  const handle = setTimeout(fn, 1);
  return () => clearTimeout(handle);
}

export function AdCard({
  section,
  political = false,
  placement = "app-card",
  style,
}: Readonly<{ section: string; political?: boolean; placement?: AdPlacement; style?: StyleProp<ViewStyle> }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const frameRef = useRef<View>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [imageReady, setImageReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const beaconSent = useRef<string | null>(null);

  // One slate per mount, fetched after first paint so it never competes with
  // the screen's own content. Any failure simply leaves the slot empty.
  useEffect(() => {
    let alive = true;
    const cancel = afterFirstPaint(() => {
      api.adsSlate(placement, section, political).then((slate) => {
        if (!alive) return;
        const ad = pickAd(slate.ads);
        if (!ad) return;
        markShown(ad.id);
        setSlot({ ad, why: slate.why, viewId: newViewId() });
      }).catch(() => {});
    });
    return () => {
      alive = false;
      cancel();
    };
  }, [placement, section, political]);

  // A view only counts once the creative has actually drawn.
  const viewed = useViewability(frameRef, { threshold: 0.5, ms: 1000, enabled: !!slot && imageReady && !failed });
  useEffect(() => {
    if (!viewed || !slot || beaconSent.current === slot.viewId) return;
    beaconSent.current = slot.viewId;
    api.adBeacon(slot.ad, placement, slot.viewId);
  }, [viewed, slot, placement]);

  if (!slot || failed) return null;
  const { ad, why } = slot;
  const image = cld(mediaUrl(ad.imageUrl), CARD_TRANSFORM);
  if (!image) return null;
  const label = [ad.chip, ad.headline || ad.alt, ad.sponsorLine].filter(Boolean).join(". ");

  return (
    <View ref={frameRef} collapsable={false} style={style}>
      <View style={s.frame}>
        <View style={s.head}>
          <View style={s.labelRow} accessible accessibilityRole="text" accessibilityLabel={ad.political ? "Political advertisement" : "Advertisement"}>
            <View style={s.flag}>
              <Text style={s.flagText}>{ad.chip}</Text>
            </View>
            <Text style={s.adLabel}>Advertisement</Text>
          </View>
          <Pressable
            onPress={() => setWhyOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={WHY_TITLE}
            style={({ pressed }) => [s.info, pressed && s.infoPressed]}
          >
            <InfoIcon size={18} color={C.inkMuted} strokeWidth={2} />
          </Pressable>
        </View>

        <Pressable
          onPress={() => { void openInAppBrowser(adClickUrl(ad, placement)); }}
          accessibilityRole="link"
          accessibilityLabel={label}
          accessibilityHint="Opens the advertiser's page in the in-app browser"
          style={({ pressed }) => [s.creative, pressed && s.creativePressed]}
        >
          <View style={s.media}>
            <Image
              source={{ uri: image }}
              resizeMode="cover"
              fadeDuration={0}
              accessible
              accessibilityLabel={ad.alt}
              onLoad={() => setImageReady(true)}
              onError={() => setFailed(true)}
              style={StyleSheet.absoluteFill}
            />
          </View>
          {ad.headline || ad.body ? (
            <View style={s.copy}>
              {ad.headline ? <Text style={s.headline} numberOfLines={2}>{ad.headline}</Text> : null}
              {ad.body ? <Text style={s.body} numberOfLines={3}>{ad.body}</Text> : null}
            </View>
          ) : null}
          <View style={s.visitRow}>
            <Text style={s.visit}>Visit the advertiser</Text>
            <ArrowUpRightIcon size={14} color={C.greenText} strokeWidth={2.2} />
          </View>
        </Pressable>

        <View style={s.sponsorLines}>
          <Text style={s.sponsor}>{ad.sponsorLine}</Text>
          {ad.syntheticMedia ? <Text style={s.synthetic}>Contains AI-generated or altered media</Text> : null}
        </View>
      </View>

      <WhySheet open={whyOpen} onClose={() => setWhyOpen(false)} ad={ad} why={why} />
    </View>
  );
}

/** The "Why am I seeing this ad?" bottom sheet: the targeting truth, the sponsor, and Report. */
function WhySheet({ open, onClose, ad, why }: Readonly<{ open: boolean; onClose: () => void; ad: AdCreative; why: string }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const where = why || "this part of the Oguaa app";

  return (
    <Modal transparent visible={open} animationType={reduced ? "none" : "fade"} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={[s.sheet, { paddingBottom: 20 + insets.bottom }]} accessibilityViewIsModal>
          <View style={s.grabber} />
          <View style={s.sheetHead}>
            <Text style={s.sheetTitle} accessibilityRole="header">{WHY_TITLE}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={({ pressed }) => [s.close, pressed && s.infoPressed]}>
              <CloseIcon size={18} color={C.inkMuted} strokeWidth={2} />
            </Pressable>
          </View>
          <ScrollView style={s.sheetScroll} contentContainerStyle={s.sheetContent} keyboardShouldPersistTaps="handled">
            <Text style={s.sheetBody}>
              This ad is shown to everyone who views {where}. Oguaa doesn&apos;t use your profile, location, reading history or any tracking to choose ads.
            </Text>
            <View style={s.facts}>
              <View style={s.flagSmall}><Text style={s.flagText}>{ad.chip}</Text></View>
              <Text style={s.fact}>{ad.sponsorLine}</Text>
              {ad.political && ad.electionName ? <Text style={s.fact}>Election: {ad.electionName}</Text> : null}
              {ad.syntheticMedia ? <Text style={s.factMuted}>Contains AI-generated or altered media</Text> : null}
            </View>
            <ReportButton target={{ type: "ad", id: ad.id }} label="Report this ad" onNavigate={onClose} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  // Ad frame (the portal's AdFrame): sand panel, gold hairline, a 6pt radius
  // (3pt on the creative, far tighter than news cards' 18), and a soft
  // gold-tinted shadow rather than the news cards' neutral one.
  frame: {
    backgroundColor: withAlpha(C.sand, 0.55),
    borderWidth: 1,
    borderColor: withAlpha(C.goldBorder, 0.45),
    borderRadius: 6,
    padding: 10,
    shadowColor: C.goldBrand,
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 2, paddingBottom: 8 },
  // Flag + "Advertisement"; wraps onto two lines on the narrowest phones.
  labelRow: { flex: 1, minWidth: 0, flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 4 },
  flag: { backgroundColor: C.ink, borderRadius: 0, paddingHorizontal: 6, paddingVertical: 3 },
  flagSmall: { alignSelf: "flex-start", backgroundColor: C.ink, borderRadius: 0, paddingHorizontal: 6, paddingVertical: 3, marginBottom: 2 },
  flagText: { color: C.paper, fontSize: 10.5, letterSpacing: 1.4, textTransform: "uppercase", ...S(700) },
  adLabel: { color: C.inkMuted, fontSize: 10.5, letterSpacing: 1.6, textTransform: "uppercase", ...S(500) },
  sponsorLines: { paddingTop: 8, paddingHorizontal: 2, gap: 2 },
  sponsor: { color: C.inkMuted, fontSize: 12.5, lineHeight: 17, ...S(500) },
  synthetic: { color: C.inkMuted, fontSize: 12, lineHeight: 16, ...S(400) },
  info: { width: 44, height: 44, marginVertical: -8, marginRight: -6, alignItems: "center", justifyContent: "center", borderRadius: 22 },
  infoPressed: { backgroundColor: withAlpha(C.goldBorder, 0.14), transform: [{ translateY: 1 }] },
  creative: { borderRadius: 3, overflow: "hidden", backgroundColor: C.paper },
  creativePressed: { transform: [{ translateY: 1 }], opacity: 0.94 },
  // Reserves the creative's box before the image arrives, so nothing jumps.
  media: { width: "100%", aspectRatio: CARD_RATIO, backgroundColor: C.sand },
  copy: { paddingHorizontal: 12, paddingTop: 10, gap: 4 },
  headline: { color: C.ink, fontSize: 15, lineHeight: 20, letterSpacing: -0.1, ...S(500) },
  body: { color: C.inkMuted, fontSize: 13.5, lineHeight: 19, ...S(400) },
  visitRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12, minHeight: 44 },
  visit: { color: C.greenText, fontSize: 13, ...S(600) },

  // "Why" sheet.
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: withAlpha(C.green900, 0.5) },
  sheet: { maxHeight: "86%", backgroundColor: C.cream, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderColor: C.sand, paddingTop: 8 },
  grabber: { alignSelf: "center", width: 38, height: 4, borderRadius: 2, backgroundColor: C.sand, marginBottom: 6 },
  sheetHead: { flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 20, paddingRight: 10 },
  sheetTitle: { flex: 1, color: C.ink, fontSize: 20, lineHeight: 25, letterSpacing: -0.3, ...S(700) },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22 },
  sheetScroll: { flexGrow: 0 },
  sheetContent: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 4, gap: 16 },
  sheetBody: { color: C.inkMuted, fontSize: 15, lineHeight: 22, ...S(400) },
  facts: { gap: 6, paddingVertical: 14, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: withAlpha(C.goldBorder, 0.5), backgroundColor: withAlpha(C.sand, 0.55) },
  fact: { color: C.ink, fontSize: 14, lineHeight: 20, ...S(500) },
  factMuted: { color: C.inkMuted, fontSize: 13, lineHeight: 18, ...S(400) },
});
