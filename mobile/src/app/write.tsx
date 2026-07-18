import { useMemo, useState } from "react";
import { route, ROUTES } from "@/lib/routes";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { T as Text, TI as TextInput } from "@/components/typography";
import { api, canWriteNews } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ImageField } from "@/components/image-field";
import { HeroBand } from "@/ui";
import { makeFormStyles } from "@/components/form-styles";
import { ON_GREEN, type Palette, S } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import type { NewsArticle } from "@/lib/types";
import { CheckIcon, HandsIcon } from "@/components/icons";

// Cover accent swatches (used when no cover image is chosen). Palette-derived so
// they read well in both themes.
const COVER_SWATCHES = (C: Palette) => [
  { id: "", label: "None", color: C.sand },
  { id: C.green, label: "Green", color: C.green },
  { id: C.clay, label: "Clay", color: C.clay },
  { id: C.teal, label: "Teal", color: C.teal },
  { id: C.goldBrand, label: "Gold", color: C.goldBrand },
];

export default function Write() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { member } = useAuth();
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [coverColor, setCoverColor] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<NewsArticle | null>(null);

  const swatches = useMemo(() => COVER_SWATCHES(C), [C]);

  if (!member) {
    return (
      <View style={s.gate}>
        <Text style={s.gateTitle}>Sign in to write</Text>
        <Text style={s.gateBody}>Stories in the Oguaa Newsroom are credited to their author.</Text>
        <Pressable accessibilityRole="button" onPress={() => router.replace(ROUTES.signIn)} style={s.btn}>
          <Text style={s.btnText}>Sign in / create account</Text>
        </Pressable>
      </View>
    );
  }

  if (!canWriteNews(member)) {
    return (
      <View style={s.gate}>
        <Text style={s.gateTitle}>Writers only</Text>
        <Text style={s.gateBody}>Only writers or verified authority managers can post to the Newsroom. Turn on the writer role from your profile first.</Text>
        <Pressable accessibilityRole="button" onPress={() => router.replace(ROUTES.me)} style={s.btn}>
          <Text style={s.btnText}>Go to my profile</Text>
        </Pressable>
      </View>
    );
  }

  if (done) {
    const published = done.status === "published";
    return (
      <View style={s.gate}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {published ? <CheckIcon size={24} color={C.ink} strokeWidth={2.5} /> : <HandsIcon size={24} color={C.ink} strokeWidth={2} />}
          <Text style={s.gateTitle}>{published ? "Published" : "Sent for review"}</Text>
        </View>
        <Text style={s.gateBody}>
          {published
            ? "Your story is live in the Newsroom."
            : "Your draft is with the newsroom. A reviewer will check it before it appears."}
        </Text>
        {published ? (
          <Pressable accessibilityRole="button" onPress={() => router.replace(route.newsArticle(done.slug))} style={s.btn}>
            <Text style={s.btnText}>Read it</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={s.btn}><Text style={s.btnText}>Done</Text></Pressable>
        )}
        <Pressable accessibilityRole="button"
          onPress={() => { setDone(null); setTitle(""); setSummary(""); setBody(""); setCoverColor(""); setCoverImageUrl(""); setTags(""); }}
          style={s.btnOutline}
        >
          <Text style={s.btnOutlineText}>Write another</Text>
        </Pressable>
      </View>
    );
  }

  async function submit() {
    const t = title.trim();
    if (t.length < 3) { setError("Give it a title (at least 3 characters)."); return; }
    if (body.trim().length < 1) { setError("Write a little something in the body."); return; }
    setBusy(true);
    setError("");
    const tagList = tags.split(",").map((x) => x.trim()).filter(Boolean);
    try {
      const article = await api.submitNews({
        title: t,
        summary: summary.trim() || undefined,
        body: body.trim(),
        coverColor: coverColor || undefined,
        coverImageUrl: coverImageUrl.trim() || undefined,
        tags: tagList.length ? tagList : undefined,
      });
      setDone(article);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't post. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 48 }}>
      <HeroBand tone={C.green} kicker="The Oguaa Newsroom" title="Write a story" lede="Festivals, homecomings, scholarships, notices. Markdown is welcome in the body." />
      <View style={s.formCard}>
        <Text style={s.label}>TITLE</Text>
        <TextInput
          style={s.input}
          value={title}
          onChangeText={(v) => { setTitle(v); setError(""); }}
          placeholder="A clear headline"
          placeholderTextColor={C.inkFaint}
          maxLength={160}
        />

        <Text style={s.label}>SUMMARY (OPTIONAL)</Text>
        <TextInput
          style={s.input}
          value={summary}
          onChangeText={setSummary}
          placeholder="One or two lines that tease the story"
          placeholderTextColor={C.inkFaint}
        />

        <Text style={s.label}>STORY (MARKDOWN)</Text>
        <TextInput
          style={[s.input, s.area]}
          value={body}
          onChangeText={(v) => { setBody(v); setError(""); }}
          placeholder={"Write your story.\n\n## Headings, **bold**, lists and > quotes all work."}
          placeholderTextColor={C.inkFaint}
          multiline
        />

        <Text style={s.label}>COVER ACCENT (OPTIONAL)</Text>
        <View style={s.chips}>
          {swatches.map((sw) => (
            <Pressable accessibilityRole="button" key={sw.label} onPress={() => setCoverColor(sw.id)} style={[s.swatch, coverColor === sw.id && s.swatchOn]}>
              <View style={[s.swatchDot, { backgroundColor: sw.color }]} />
              <Text style={[s.chipText, coverColor === sw.id && s.swatchTextOn]}>{sw.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={s.label}>COVER IMAGE (OPTIONAL)</Text>
        <ImageField value={coverImageUrl} onChange={setCoverImageUrl} />

        <Text style={s.label}>TAGS (OPTIONAL)</Text>
        <TextInput
          style={s.input}
          value={tags}
          onChangeText={setTags}
          placeholder="Comma-separated, e.g. festival, scholarship"
          placeholderTextColor={C.inkFaint}
          autoCapitalize="none"
        />

        {error !== "" && <Text style={s.error}>{error}</Text>}

        <Pressable accessibilityRole="button" onPress={submit} disabled={busy} style={[s.btn, busy && { opacity: 0.6 }]}>
          <Text style={s.btnText}>{busy ? "Posting…" : "Post story"}</Text>
        </Pressable>
        <Text style={s.note}>
          Writers&apos; drafts are reviewed by the newsroom; verified authorities publish straight away.
          {"\n"}Writing as {member.displayName}.
        </Text>
      </View>
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => ({
  ...makeFormStyles(C),
  ...StyleSheet.create({
    btn: { backgroundColor: C.green, borderRadius: 999, paddingVertical: 14, alignItems: "center", marginTop: 22 },
    btnOutline: { borderWidth: 1, borderColor: C.sand, borderRadius: 999, paddingVertical: 13, paddingHorizontal: 26, alignItems: "center", marginTop: 12 },
    btnOutlineText: { color: C.ink, ...S(600) },
    swatch: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
    swatchOn: { borderColor: C.green, backgroundColor: C.green },
    swatchDot: { width: 14, height: 14, borderRadius: 7 },
    swatchTextOn: { color: ON_GREEN },
  }),
});
