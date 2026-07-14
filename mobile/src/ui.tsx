import { useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View, type ImageStyle, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { C, serif, fillFor } from "@/theme";
import { cldCover } from "@/lib/cloudinary";

export function Loading() {
  return (
    <View style={s.center}>
      <ActivityIndicator color={C.green} size="large" />
    </View>
  );
}

export function ErrorView({ message }: { message: string }) {
  return (
    <View style={s.center}>
      <Text style={s.errTitle}>Couldn&apos;t load</Text>
      <Text style={s.errMsg}>{message}</Text>
      <Text style={s.errHint}>Is the Go API running on :8080?</Text>
    </View>
  );
}

/** The Oguaa crab mark — Kotokuraba, the crab market behind the town's name. */
export function Mark({ size = 28 }: { size?: number; color?: string }) {
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: size * 0.92 }}>🦀</Text>
    </View>
  );
}

export function Pill({ label, color = C.inkMuted, bg = C.cream, border = C.sand }: { label: string; color?: string; bg?: string; border?: string }) {
  return (
    <View style={[s.pill, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[s.pillText, { color }]}>{label}</Text>
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
}: {
  seed: string;
  label?: string;
  src?: string;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
}) {
  const [failed, setFailed] = useState(false);
  const bg = fillFor(seed);
  if (src && !failed) {
    return <Image source={{ uri: cldCover(src, 400) }} onError={() => setFailed(true)} resizeMode="cover" style={[style as StyleProp<ImageStyle>, { backgroundColor: bg }]} />;
  }
  return (
    <View style={[style, { backgroundColor: bg, alignItems: "center", justifyContent: "center" }]}>
      {label ? <Text style={labelStyle}>{label}</Text> : null}
    </View>
  );
}

// ── A tiny Markdown renderer for news bodies (headings, lists, quotes, bold) ──
function Inline({ text, style }: { text: string; style?: StyleProp<TextStyle> }) {
  // Split on **bold** spans.
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <Text style={style}>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**")
          ? <Text key={i} style={{ fontWeight: "700" }}>{p.slice(2, -2)}</Text>
          : <Text key={i}>{p}</Text>,
      )}
    </Text>
  );
}

export function Markdown({ children }: { children: string }) {
  const blocks = children.replace(/\r\n/g, "\n").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <View style={{ gap: 12 }}>
      {blocks.map((block, i) => {
        if (block.startsWith("### ")) return <Text key={i} style={md.h3}>{block.slice(4)}</Text>;
        if (block.startsWith("## ")) return <Text key={i} style={md.h2}>{block.slice(3)}</Text>;
        if (block.startsWith("# ")) return <Text key={i} style={md.h1}>{block.slice(2)}</Text>;
        if (block.startsWith("> ")) return <Inline key={i} text={block.replace(/^> ?/gm, "")} style={md.quote} />;
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
            <View key={i} style={md.table}>
              <View style={[md.trow, md.thead]}>
                {header.map((c, j) => <Inline key={j} text={c} style={[md.cell, md.th]} />)}
              </View>
              {rows.map((r, ri) => (
                <View key={ri} style={[md.trow, ri < rows.length - 1 && md.trowBorder]}>
                  {header.map((_, j) => <Inline key={j} text={r[j] ?? ""} style={md.cell} />)}
                </View>
              ))}
            </View>
          );
        }
        if (/^[-*] /.test(block)) {
          const items = block.split("\n").map((l) => l.replace(/^[-*] /, ""));
          return (
            <View key={i} style={{ gap: 6 }}>
              {items.map((it, j) => (
                <View key={j} style={{ flexDirection: "row", gap: 8 }}>
                  <Text style={md.bullet}>•</Text>
                  <Inline text={it} style={md.body} />
                </View>
              ))}
            </View>
          );
        }
        return <Inline key={i} text={block} style={md.body} />;
      })}
    </View>
  );
}

const md = StyleSheet.create({
  h1: { fontFamily: serif, fontSize: 26, fontWeight: "700", color: C.ink },
  h2: { fontFamily: serif, fontSize: 22, fontWeight: "700", color: C.ink },
  h3: { fontFamily: serif, fontSize: 18, fontWeight: "700", color: C.ink },
  body: { color: C.ink, fontFamily: serif, fontSize: 17, lineHeight: 26, flexShrink: 1 },
  quote: { color: C.inkMuted, fontFamily: serif, fontStyle: "italic", fontSize: 17, lineHeight: 26, borderLeftWidth: 3, borderLeftColor: C.gold, paddingLeft: 12 },
  bullet: { color: C.goldText, fontSize: 17, lineHeight: 26 },
  table: { borderWidth: 1, borderColor: C.sand, borderRadius: 8, overflow: "hidden" },
  trow: { flexDirection: "row" },
  trowBorder: { borderBottomWidth: 1, borderBottomColor: C.sand },
  thead: { backgroundColor: C.cream, borderBottomWidth: 1, borderBottomColor: C.sand },
  cell: { flex: 1, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, lineHeight: 20, color: C.ink, fontFamily: serif },
  th: { fontWeight: "700", color: C.green },
});

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, backgroundColor: C.paper, gap: 6 },
  errTitle: { fontSize: 20, fontWeight: "700", color: C.ink },
  errMsg: { color: C.clayText, textAlign: "center" },
  errHint: { color: C.inkFaint, fontSize: 12, marginTop: 4 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  pillText: { fontSize: 12, fontWeight: "600" },
});
