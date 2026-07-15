import { useState } from "react";
import { ActivityIndicator, Image, StyleSheet, View, type ImageStyle, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import { T as Text } from "@/components/typography";
import { HeroParallax } from "@/components/anim";
import { C, D, S, SI, fillFor } from "@/theme";
import { cldCover } from "@/lib/cloudinary";
import { mediaUrl } from "@/lib/api";

export function Loading() {
  return (
    <View style={s.center}>
      <ActivityIndicator color={C.green} size="large" />
    </View>
  );
}

export function ErrorView({ message }: Readonly<{ message: string }>) {
  return (
    <View style={s.center}>
      <Text style={s.errTitle}>Couldn&apos;t load</Text>
      <Text style={s.errMsg}>{message}</Text>
      <Text style={s.errHint}>Is the Go API running on :8080?</Text>
    </View>
  );
}

/** The Oguaa crab mark — Kotokuraba, the crab market behind the town's name. */
export function Mark({ size = 28, color }: Readonly<{ size?: number; color?: string }>) {
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: size * 0.92, color }}>🦀</Text>
    </View>
  );
}

export function Pill({ label, color = C.inkMuted, bg = C.cream, border = C.sand }: Readonly<{ label: string; color?: string; bg?: string; border?: string }>) {
  return (
    <View style={[s.pill, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[s.pillText, { color }]}>{label}</Text>
    </View>
  );
}

/** Toned page-top hero band shared by the contribution forms (rounded base, gold kicker). */
export function HeroBand({ tone, kicker, title, lede }: Readonly<{ tone: string; kicker: string; title: string; lede: string }>) {
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
  tone = C.green900,
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
    <View style={[s.heroBand, { backgroundColor: tone }]}>
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
  const [failed, setFailed] = useState(false);
  const bg = fillFor(seed);
  if (src && !failed) {
    return <Image source={{ uri: cldCover(mediaUrl(src), 400) }} onError={() => setFailed(true)} resizeMode="cover" style={[style as StyleProp<ImageStyle>, { backgroundColor: bg }]} />;
  }
  return (
    <View style={[style, { backgroundColor: bg, alignItems: "center", justifyContent: "center" }]}>
      {label ? <Text style={labelStyle}>{label}</Text> : null}
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
          ? <Text key={`${p}-${i}`} style={{ fontWeight: "700" }}>{p.slice(2, -2)}</Text>
          : <Text key={`${p}-${i}`}>{p}</Text>,
      )}
    </Text>
  );
}

export function Markdown({ children }: Readonly<{ children: string }>) {
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

const md = StyleSheet.create({
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
  th: { ...S(700), color: C.green },
});

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, backgroundColor: C.paper, gap: 6 },
  errTitle: { fontSize: 20, fontWeight: "700", color: C.ink },
  errMsg: { color: C.clayText, textAlign: "center" },
  errHint: { color: C.inkFaint, fontSize: 12, marginTop: 4 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  pillText: { fontSize: 12, fontWeight: "600" },
  heroBand: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 26, borderBottomLeftRadius: 22, borderBottomRightRadius: 22, overflow: "hidden" },
  heroKicker: { color: C.gold, fontSize: 10, letterSpacing: 2, fontWeight: "700", textTransform: "uppercase" },
  heroTitle: { color: C.cream, ...D(700), fontSize: 28, marginTop: 6 },
  heroFante: { color: C.gold, ...SI(), fontSize: 24 },
  heroLede: { color: "rgba(246,241,231,0.85)", fontSize: 14, lineHeight: 20, marginTop: 6 },
  heroCount: { color: "rgba(246,241,231,0.6)", fontSize: 12, marginTop: 10, textTransform: "uppercase", letterSpacing: 1 },
  heroScrim: { backgroundColor: "rgba(12,44,31,0.62)" },
  heroScrimLow: { backgroundColor: "rgba(12,44,31,0.25)", top: "55%" },
});
