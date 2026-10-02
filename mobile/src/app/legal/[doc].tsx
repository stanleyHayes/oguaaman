import { useMemo } from "react";
import { Linking, ScrollView, StyleSheet, View } from "react-native";
import { Stack, router, useLocalSearchParams, type Href } from "expo-router";
import { T as Text } from "@/components/typography";
import { D, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { ErrorView } from "@/ui";
import {
  LEGAL_DOCS,
  LEGAL_DOC_KEYS,
  LEGAL_PORTAL_ORIGIN,
  legalBlockLabel,
  legalDocKeyForPath,
  legalKeyed,
  legalPlainText,
  type LegalBlock,
  type LegalDocKey,
  type LegalInline,
} from "@/content/legal.gen";

// The legal texts are generated from docs/legal/*.md (scripts/sync-legal.mjs),
// so the app shows exactly the wording published on the web. App stores
// require the privacy policy (and Google Play the child safety standards) to
// be reachable in the app.

type Styles = ReturnType<typeof makeStyles>;

const legalHref = (key: LegalDocKey): Href => `/legal/${key}` as Href;

// The app never points people to buying ads or to the ad library on the web
// (store rules, spec §8): such links in a legal text show as plain words.
const WEB_ONLY_PATHS = [/^\/advertise(?:[/?#]|$)/, /^\/ads(?:[/?#]|$)/];
const isWebOnly = (href: string) => {
  // Site paths, or full URLs on an Oguaa host; other sites keep their links.
  const path = href.replace(/^https?:\/\/(?:[a-z0-9-]+\.)*oguaaman\.com/i, "");
  return WEB_ONLY_PATHS.some((re) => re.test(path));
};

/** Legal documents open in-app; other site paths open on the web portal. */
function openLink(href: string) {
  const key = href.startsWith("/") ? legalDocKeyForPath(href) : undefined;
  if (key) {
    router.push(legalHref(key));
    return;
  }
  const url = href.startsWith("/") ? `${LEGAL_PORTAL_ORIGIN}${href}` : href;
  Linking.openURL(url).catch(() => {});
}

function Inline({ parts, s }: Readonly<{ parts: readonly LegalInline[]; s: Styles }>) {
  return (
    <>
      {legalKeyed(parts, (p) => `${p.href ?? ""}|${p.bold ? "b" : ""}|${p.text}`).map(([key, p]) => {
        const { href } = p;
        if (href && !isWebOnly(href)) {
          return <Text key={key} style={s.link} accessibilityRole="link" onPress={() => openLink(href)}>{p.text}</Text>;
        }
        return <Text key={key} style={p.bold ? s.bold : undefined}>{p.text}</Text>;
      })}
    </>
  );
}

function Block({ block, s }: Readonly<{ block: LegalBlock; s: Styles }>) {
  if (block.kind === "h3") return <Text style={s.h3} accessibilityRole="header">{block.text}</Text>;
  if (block.kind === "p") return <Text style={s.p}><Inline parts={block.parts} s={s} /></Text>;
  const ordered = block.kind === "ol";
  return (
    <View style={s.list}>
      {legalKeyed(block.items, legalPlainText).map(([key, item], i) => (
        <View key={key} style={s.item}>
          <Text style={s.marker}>{ordered ? `${i + 1}.` : "•"}</Text>
          <Text style={s.itemText}><Inline parts={item} s={s} /></Text>
        </View>
      ))}
    </View>
  );
}

function Blocks({ blocks, s }: Readonly<{ blocks: readonly LegalBlock[]; s: Styles }>) {
  return <>{legalKeyed(blocks, legalBlockLabel).map(([key, b]) => <Block key={key} block={b} s={s} />)}</>;
}

export default function Legal() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const key = legalDocKeyForPath(doc ?? "");
  if (!key) return <ErrorView message="Unknown document" />;
  const d = LEGAL_DOCS[key];

  return (
    <>
      <Stack.Screen options={{ title: d.title }} />
      <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
        <Text style={s.lede}>{d.lede}</Text>
        {d.intro.length > 0 && <View style={{ marginTop: 8 }}><Blocks blocks={d.intro} s={s} /></View>}
        {d.sections.map((sec) => (
          <View key={sec.heading} style={{ marginTop: 22 }}>
            <Text style={s.h} accessibilityRole="header">{sec.heading}</Text>
            <Blocks blocks={sec.blocks} s={s} />
          </View>
        ))}
        <Text style={s.updated}>Version {d.version} · effective {d.effectiveLabel}</Text>
        <View style={s.others}>
          {LEGAL_DOC_KEYS.filter((k) => k !== key).map((k) => (
            <Text key={k} style={s.link} accessibilityRole="link" onPress={() => router.push(legalHref(k))}>
              {LEGAL_DOCS[k].title}
            </Text>
          ))}
        </View>
      </ScrollView>
    </>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  lede: { color: C.inkMuted, fontSize: 15, lineHeight: 22 },
  h: { ...D(700), fontSize: 20, color: C.ink },
  h3: { ...D(700), fontSize: 16, color: C.ink, marginTop: 14 },
  p: { color: C.inkMuted, fontSize: 14, lineHeight: 21, marginTop: 8 },
  bold: { ...D(700), color: C.ink },
  link: { color: C.tealText, textDecorationLine: "underline" },
  list: { marginTop: 8, gap: 6 },
  item: { flexDirection: "row", gap: 8, paddingRight: 4 },
  marker: { color: C.inkMuted, fontSize: 14, lineHeight: 21, minWidth: 14 },
  itemText: { flex: 1, color: C.inkMuted, fontSize: 14, lineHeight: 21 },
  updated: { color: C.inkFaint, fontSize: 12, marginTop: 28, borderTopWidth: 1, borderTopColor: C.sand, paddingTop: 14 },
  others: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 14 },
});
