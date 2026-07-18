import { useEffect, useMemo, useState } from "react";
import { Image, StyleSheet, View, type ImageStyle, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming, type SharedValue } from "react-native-reanimated";
import Svg, { Circle, G, Path } from "react-native-svg";
import { T as Text } from "@/components/typography";
import { HeroParallax } from "@/components/anim";
import { D, S, SI, ON_GREEN, fillFor, onFill, withAlpha, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { cldCover } from "@/lib/cloudinary";
import { mediaUrl } from "@/lib/api";
import { SPLASH_LINES, randomSplashIndex, type SplashLine } from "@/lib/splash-lines";

/**
 * Branded splash-style loader — the Oguaa crab (Kotokuraba) breathing over a
 * soft expanding ripple, with the wordmark. Replaces the bare spinner across the
 * app so every load feels like a moment of the brand, not a stall.
 */
/** Category accent + glyph for a splash line. */
function splashCategory(C: Palette, kind: string): { color: string; glyph: "quote" | "sparkle" | "leaf" } {
  if (kind === "Did you know") return { color: C.clayText, glyph: "sparkle" };
  if (kind === "The town’s code") return { color: C.greenText, glyph: "leaf" };
  return { color: C.gold, glyph: "quote" };
}

function CatGlyph({ glyph, size, color }: Readonly<{ glyph: "quote" | "sparkle" | "leaf"; size: number; color: string }>) {
  if (glyph === "sparkle") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d="M12 1.8l1.9 6.5 6.5 1.9-6.5 1.9L12 18.6l-1.9-6.5L3.6 10.2l6.5-1.9z" fill={color} />
      </Svg>
    );
  }
  if (glyph === "leaf") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d="M5 20s-1-8 6-12 9-4 9-4 1 8-6 12-9 4-9 4z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <Path d="M5 20 18 7" stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6.5 6.5h5v6a4 4 0 0 1-4 4v-2.2a1.8 1.8 0 0 0 1.8-1.8H6.5zM14 6.5h5v6a4 4 0 0 1-4 4v-2.2a1.8 1.8 0 0 0 1.8-1.8H14z" fill={color} />
    </Svg>
  );
}

/** One word of the splash line, revealed in sequence off a shared progress. */
function SplashWord({ text, index, total, progress, style }: Readonly<{ text: string; index: number; total: number; progress: SharedValue<number>; style: StyleProp<TextStyle> }>) {
  const st = useAnimatedStyle(() => {
    const start = (index / (total + 3)) * 0.8;
    const p = Math.min(1, Math.max(0, (progress.value - start) / 0.22));
    return { opacity: p, transform: [{ translateY: (1 - p) * 9 }] };
  });
  return <Animated.Text style={[style, st]}>{text + " "}</Animated.Text>;
}

/** The eye-catching splash line — category badge + icon, word-by-word reveal,
 *  and a drawing underline. Re-animates whenever `cycle` changes. */
function SplashQuote({ line, cycle }: Readonly<{ line: SplashLine; cycle: number }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const cat = splashCategory(C, line.kind);
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, { duration: 720, easing: Easing.out(Easing.quad) });
  }, [cycle, progress]);
  const chipStyle = useAnimatedStyle(() => {
    const p = Math.min(1, progress.value * 4);
    return { opacity: p, transform: [{ scale: 0.88 + p * 0.12 }] };
  });
  const underlineStyle = useAnimatedStyle(() => ({ opacity: progress.value * 0.6, transform: [{ scaleX: progress.value }] }));
  const words = line.text.split(" ");
  return (
    <View style={s.splashLine}>
      <Animated.View style={[s.splashChip, { borderColor: withAlpha(cat.color, 0.35), backgroundColor: withAlpha(cat.color, 0.12) }, chipStyle]}>
        <CatGlyph glyph={cat.glyph} size={11} color={cat.color} />
        <Text style={[s.splashChipText, { color: cat.color }]}>{line.kind}</Text>
      </Animated.View>
      <View style={s.splashWords}>
        {words.map((w, idx) => (
          <SplashWord key={`${cycle}-${idx}`} text={w} index={idx} total={words.length} progress={progress} style={s.splashLineText} />
        ))}
      </View>
      <Animated.View style={[s.splashUnderline, { backgroundColor: cat.color }, underlineStyle]} />
    </View>
  );
}

export function Loading() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const breath = useSharedValue(0);
  const ripple = useSharedValue(0);
  // A different proverb/fact each load, gently rotating while you wait.
  const [i, setI] = useState(randomSplashIndex);
  useEffect(() => {
    breath.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }), -1, true);
    ripple.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1, false);
  }, [breath, ripple]);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % SPLASH_LINES.length), 4600);
    return () => clearInterval(t);
  }, []);
  const markStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + breath.value * 0.12 }] }));
  const rippleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.4 + ripple.value * 1.3 }],
    opacity: (1 - ripple.value) * 0.4,
  }));
  return (
    <View style={s.splash}>
      <View style={s.splashMarkWrap}>
        <Animated.View style={[s.splashRipple, rippleStyle]} />
        <Animated.View style={markStyle}><Mark size={58} /></Animated.View>
      </View>
      <Text style={s.splashWord}>Oguaa</Text>
      <Text style={s.splashTag}>Cape Coast · Ghana</Text>
      <SplashQuote line={SPLASH_LINES[i]} cycle={i} />
    </View>
  );
}

export function ErrorView({ message }: Readonly<{ message: string }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={s.center}>
      <Text style={s.errTitle}>Couldn&apos;t load</Text>
      <Text style={s.errMsg}>{message}</Text>
      <Text style={s.errHint}>Is the Go API running on :8080?</Text>
    </View>
  );
}

/**
 * The Oguaa crab mark — Kotokuraba, the crab market behind the town's name.
 * The same SVG the web wordmark uses (frontend CrabMark), so the logo reads
 * identically on both — no emoji. Honours `color` (default: the theme gold).
 */
export function Mark({ size = 28, color }: Readonly<{ size?: number; color?: string }>) {
  const { C } = useTheme();
  const c = color ?? C.gold;
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <G stroke={c} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" fill="none" transform="translate(0,-1)">
        {/* right claw + legs */}
        <Path d="M43 32.5C47 31 50 30.5 52 28" />
        <Path d="M52 28C56 27 59.2 23.4 55.6 20.4 54 19.1 52.4 20.2 52.9 22" />
        <Path d="M52 28C54.6 28.9 57 27.6 57.2 25.2" />
        <Path d="M43.5 40.5C47.5 41.5 50.6 43.4 52.6 46.4" />
        <Path d="M42.5 43C45.6 44.4 48 46.4 49.5 49.4" />
        <Path d="M40.6 45C42.6 47 43.8 49 44.8 51.7" />
        {/* left claw + legs (mirror) */}
        <Path d="M21 32.5C17 31 14 30.5 12 28" />
        <Path d="M12 28C8 27 4.8 23.4 8.4 20.4 10 19.1 11.6 20.2 11.1 22" />
        <Path d="M12 28C9.4 28.9 7 27.6 6.8 25.2" />
        <Path d="M20.5 40.5C16.5 41.5 13.4 43.4 11.4 46.4" />
        <Path d="M21.5 43C18.4 44.4 16 46.4 14.5 49.4" />
        <Path d="M23.4 45C21.4 47 20.2 49 19.2 51.7" />
        {/* carapace + eyes on stalks */}
        <Path d="M20 39C20 32 25.5 28.5 32 28.5 38.5 28.5 44 32 44 39 44 44 39 46.5 32 46.5 25 46.5 20 44 20 39Z" />
        <Path d="M28 29L28 24" />
        <Path d="M36 29L36 24" />
        <Circle cx={28} cy={22.4} r={1.9} fill={c} stroke="none" />
        <Circle cx={36} cy={22.4} r={1.9} fill={c} stroke="none" />
      </G>
    </Svg>
  );
}

export function Pill({ label, color, bg, border }: Readonly<{ label: string; color?: string; bg?: string; border?: string }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={[s.pill, { backgroundColor: bg ?? C.cream, borderColor: border ?? C.sand }]}>
      <Text style={[s.pillText, { color: color ?? C.inkMuted }]}>{label}</Text>
    </View>
  );
}

/**
 * The verified seal — a gold check-in-circle shown next to a verified member's
 * or author's name (curators, stewards, approved authority managers). Mirrors
 * the web `VerifiedBadge`. Pass `onDark` on green headers/heroes; omit `label`
 * for a compact inline seal, or pass `verifiedAs` for a labelled chip.
 */
export function VerifiedBadge({ label, onDark = false, size = 16 }: Readonly<{ label?: string; onDark?: boolean; size?: number }>) {
  const { C } = useTheme();
  const sealBg = onDark ? C.gold : C.goldBrand;
  const checkColor = onDark ? C.green900 : C.cream;
  const labelColor = onDark ? C.gold : C.goldText;
  return (
    <View
      accessibilityLabel={label ? `Verified — ${label}` : "Verified"}
      style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
    >
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: sealBg, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: checkColor, fontSize: size * 0.6, lineHeight: size, ...S(700), marginTop: -1 }}>✓</Text>
      </View>
      {label ? (
        <Text style={{ color: labelColor, fontSize: 11, ...S(700), letterSpacing: 0.4 }} numberOfLines={1}>{label}</Text>
      ) : null}
    </View>
  );
}

/** Toned page-top hero band shared by the contribution forms (rounded base, gold kicker). */
export function HeroBand({ tone, kicker, title, lede }: Readonly<{ tone: string; kicker: string; title: string; lede: string }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={[s.heroBand, { backgroundColor: tone }]}>
      <Text style={s.heroKicker}>{kicker}</Text>
      <Text style={s.heroTitle}>{title}</Text>
      <Text style={s.heroLede}>{lede}</Text>
    </View>
  );
}

/**
 * Media-first section hero — the portal PageHero photo variant mirrored: a
 * seed photo full-bleed under a green-900 scrim, gold kicker, cream Fraunces
 * title. Without `image` it renders the flat tonal band. Pass `scrollY` to
 * keep the gentle parallax the browse/explore heroes already had.
 */
export function PhotoHero({
  image,
  tone,
  kicker,
  title,
  fante,
  lede,
  count,
  scrollY,
}: Readonly<{
  /** Seed photo path ("/uploads/seed/...") — resolved via mediaUrl. */
  image?: string;
  tone?: string;
  kicker: string;
  title?: string;
  /** Fante name in gold italics after the title (portal fanteName). */
  fante?: string;
  lede?: string;
  count?: string;
  scrollY?: SharedValue<number>;
}>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const content = (
    <>
      <Text style={s.heroKicker}>{kicker}</Text>
      {title ? (
        <Text style={s.heroTitle}>
          {title}
          {fante ? <Text style={s.heroFante}> {fante}</Text> : null}
        </Text>
      ) : null}
      {lede ? <Text style={s.heroLede}>{lede}</Text> : null}
      {count ? <Text style={s.heroCount}>{count}</Text> : null}
    </>
  );
  return (
    <View style={[s.heroBand, { backgroundColor: tone ?? C.green900 }]}>
      {image ? (
        <>
          <Image source={{ uri: mediaUrl(image) }} resizeMode="cover" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, s.heroScrim]} />
          <View style={[StyleSheet.absoluteFill, s.heroScrimLow]} />
        </>
      ) : null}
      {scrollY ? <HeroParallax scrollY={scrollY}>{content}</HeroParallax> : content}
    </View>
  );
}

/**
 * A cover thumbnail: shows the contributor's image when present, otherwise a
 * warm deterministic tint with initials. Falls back to the tint if the image
 * fails to load. `style` controls size/radius; pass the same block style you'd
 * give the placeholder.
 */
export function Thumb({
  seed,
  label,
  src,
  style,
  labelStyle,
}: Readonly<{
  seed: string;
  label?: string;
  src?: string;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
}>) {
  const { C } = useTheme();
  const [failed, setFailed] = useState(false);
  const bg = fillFor(seed, C);
  if (src && !failed) {
    return <Image source={{ uri: cldCover(mediaUrl(src), 400) }} onError={() => setFailed(true)} resizeMode="cover" style={[style as StyleProp<ImageStyle>, { backgroundColor: bg }]} />;
  }
  return (
    <View style={[style, { backgroundColor: bg, alignItems: "center", justifyContent: "center" }]}>
      {/* Force a contrast-aware colour over the fill (labelStyle's own colour,
          often C.cream, goes dark-on-dark on dark fills in dark mode). */}
      {label ? <Text style={[labelStyle, { color: onFill(bg) }]}>{label}</Text> : null}
    </View>
  );
}

// ── A tiny Markdown renderer for news bodies (headings, lists, quotes, bold) ──
function Inline({ text, style }: Readonly<{ text: string; style?: StyleProp<TextStyle> }>) {
  // Split on **bold** spans.
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <Text style={style}>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**")
          ? <Text key={`${p}-${i}`} style={{ ...S(700) }}>{p.slice(2, -2)}</Text>
          : <Text key={`${p}-${i}`}>{p}</Text>,
      )}
    </Text>
  );
}

export function Markdown({ children }: Readonly<{ children: string }>) {
  const { C } = useTheme();
  const md = useMemo(() => makeMdStyles(C), [C]);
  const blocks = children.replaceAll("\r\n", "\n").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <View style={{ gap: 12 }}>
      {blocks.map((block, i) => {
        if (block.startsWith("### ")) return <Text key={`${block.slice(0, 24)}-${i}`} style={md.h3}>{block.slice(4)}</Text>;
        if (block.startsWith("## ")) return <Text key={`${block.slice(0, 24)}-${i}`} style={md.h2}>{block.slice(3)}</Text>;
        if (block.startsWith("# ")) return <Text key={`${block.slice(0, 24)}-${i}`} style={md.h1}>{block.slice(2)}</Text>;
        if (block.startsWith("> ")) return <Inline key={`${block.slice(0, 24)}-${i}`} text={block.replace(/^> ?/gm, "")} style={md.quote} />;
        // GFM table: a header row with pipes + a separator row whose every cell is
        // a dash-run (optionally colon-aligned) and whose column count matches the
        // header. Outer pipes are optional (matches the web react-markdown+gfm
        // renderer); a validated separator avoids treating a "| x |" line followed
        // by a `---` thematic break as a table.
        const cells = (l: string) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
        const lines = block.split("\n");
        const isTable =
          lines.length >= 2 &&
          lines[0].includes("|") &&
          lines[1].includes("|") &&
          cells(lines[1]).length === cells(lines[0]).length &&
          cells(lines[1]).every((c) => /^:?-+:?$/.test(c));
        if (isTable) {
          const header = cells(lines[0]);
          const rows = lines.slice(2).filter((l) => l.trim()).map(cells);
          return (
            <View key={`${block.slice(0, 24)}-${i}`} style={md.table}>
              <View style={[md.trow, md.thead]}>
                {header.map((c, j) => <Inline key={`${c}-${j}`} text={c} style={[md.cell, md.th]} />)}
              </View>
              {rows.map((r, ri) => (
                <View key={`${r.join("|")}-${ri}`} style={[md.trow, ri < rows.length - 1 && md.trowBorder]}>
                  {header.map((_, j) => <Inline key={`${r[j] ?? ""}-${j}`} text={r[j] ?? ""} style={md.cell} />)}
                </View>
              ))}
            </View>
          );
        }
        if (/^[-*] /.test(block)) {
          const items = block.split("\n").map((l) => l.replace(/^[-*] /, ""));
          return (
            <View key={`${block.slice(0, 24)}-${i}`} style={{ gap: 6 }}>
              {items.map((it, j) => (
                <View key={`${it}-${j}`} style={{ flexDirection: "row", gap: 8 }}>
                  <Text style={md.bullet}>•</Text>
                  <Inline text={it} style={md.body} />
                </View>
              ))}
            </View>
          );
        }
        return <Inline key={`${block.slice(0, 24)}-${i}`} text={block} style={md.body} />;
      })}
    </View>
  );
}

const makeMdStyles = (C: Palette) => StyleSheet.create({
  h1: { ...D(700), fontSize: 26, color: C.ink },
  h2: { ...D(700), fontSize: 22, color: C.ink },
  h3: { ...D(700), fontSize: 18, color: C.ink },
  body: { color: C.ink, ...S(400), fontSize: 17, lineHeight: 26, flexShrink: 1 },
  quote: { color: C.inkMuted, ...SI(), fontSize: 17, lineHeight: 26, borderLeftWidth: 3, borderLeftColor: C.gold, paddingLeft: 12 },
  bullet: { color: C.goldText, fontSize: 17, lineHeight: 26 },
  table: { borderWidth: 1, borderColor: C.sand, borderRadius: 8, overflow: "hidden" },
  trow: { flexDirection: "row" },
  trowBorder: { borderBottomWidth: 1, borderBottomColor: C.sand },
  thead: { backgroundColor: C.cream, borderBottomWidth: 1, borderBottomColor: C.sand },
  cell: { flex: 1, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, lineHeight: 20, color: C.ink, ...S(400) },
  th: { ...S(700), color: C.greenText },
});

const makeStyles = (C: Palette) => StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, backgroundColor: C.paper, gap: 6 },
  splash: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.paper, gap: 14 },
  splashMarkWrap: { width: 128, height: 128, alignItems: "center", justifyContent: "center" },
  splashRipple: { position: "absolute", width: 128, height: 128, borderRadius: 64, backgroundColor: withAlpha(C.greenText, 0.16) },
  splashWord: { ...D(700), fontSize: 30, color: C.goldText, letterSpacing: 0.5 },
  splashTag: { color: C.inkFaint, fontSize: 11, letterSpacing: 3, textTransform: "uppercase", ...S(600) },
  splashLine: { marginTop: 12, maxWidth: 312, paddingHorizontal: 24, alignItems: "center" },
  splashChip: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  splashChipText: { fontSize: 9.5, letterSpacing: 1.6, textTransform: "uppercase", ...D(700) },
  splashWords: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", marginTop: 12 },
  splashLineText: { color: withAlpha(C.ink, 0.85), fontSize: 14, lineHeight: 21, textAlign: "center", ...S(500) },
  splashUnderline: { marginTop: 14, height: 1.5, width: 60, borderRadius: 1 },
  errTitle: { fontSize: 20, ...D(700), color: C.ink },
  errMsg: { color: C.clayText, textAlign: "center" },
  errHint: { color: C.inkFaint, fontSize: 12, marginTop: 4 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  pillText: { fontSize: 12, ...S(600) },
  heroBand: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 26, borderBottomLeftRadius: 22, borderBottomRightRadius: 22, overflow: "hidden" },
  heroKicker: { color: C.gold, fontSize: 10, letterSpacing: 2, ...D(700), textTransform: "uppercase" },
  heroTitle: { color: ON_GREEN, ...D(700), fontSize: 28, marginTop: 6 },
  heroFante: { color: C.gold, ...SI(), fontSize: 24 },
  heroLede: { color: C.onDarkText85, fontSize: 14, lineHeight: 20, marginTop: 6 },
  heroCount: { color: C.onDarkText60, fontSize: 12, marginTop: 10, textTransform: "uppercase", letterSpacing: 1 },
  // These two scrims use bespoke alphas (0.62/0.25) with no semantic token, so
  // they derive from green900 directly — light values are unchanged.
  heroScrim: { backgroundColor: withAlpha(C.green900, 0.62) },
  heroScrimLow: { backgroundColor: withAlpha(C.green900, 0.25), top: "55%" },
});
