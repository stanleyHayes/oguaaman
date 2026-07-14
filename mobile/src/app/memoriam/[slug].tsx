import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View, Pressable } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth";
import type { Listing, Tribute } from "@/lib/types";
import { C, serif, initials } from "@/theme";
import { Loading, ErrorView, Thumb } from "@/ui";
import { ReportButton } from "@/report-button";
import { cldCover } from "@/lib/cloudinary";

function dayMonth(date?: string): string {
  if (!date) return "";
  const d = new Date(date.length === 5 ? `2000-${date}` : date);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long" });
}

// Remember/stop-remembering — the yearly-remembrance follow (spec §8.11).
function RememberButton({ slug, initialCount }: Readonly<{ slug: string; initialCount: number }>) {
  const { member } = useAuth();
  const [following, setFollowing] = useState(false);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!member) return;
    let alive = true;
    api.memorialFollowState(slug).then((r) => { if (alive) setFollowing(r.following); }).catch(() => {});
    return () => { alive = false; };
  }, [slug, member]);

  async function toggle() {
    if (busy) return;
    if (!member) { router.push("/signin"); return; }
    setBusy(true);
    const next = !following;
    setFollowing(next);
    setCount((c) => Math.max(0, c + (next ? 1 : -1)));
    try {
      const r = next ? await api.followMemorial(slug) : await api.unfollowMemorial(slug);
      setFollowing(r.following);
      setCount(r.remembering);
    } catch {
      setFollowing(!next);
      setCount((c) => Math.max(0, c + (next ? -1 : 1)));
    } finally { setBusy(false); }
  }

  return (
    <Pressable onPress={toggle} disabled={busy} style={[s.remember, following && s.rememberOn]}>
      <Text style={[s.rememberText, following && s.rememberTextOn]}>
        {following ? "♥ Remembering" : "♡ Remember"} · {count}
      </Text>
    </Pressable>
  );
}

function lifeDates(bornYear?: number, diedDate?: string) {
  return [bornYear ? String(bornYear) : "", diedDate ? diedDate.slice(0, 4) : ""].filter(Boolean).join(" — ");
}

export default function Memorial() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data, error, loading } = useApi<Listing>(() => api.memorial(slug), `memorial:${slug}`);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "Not found"} />;
  return <Detail m={data} slug={slug} />;
}

function Detail({ m, slug }: Readonly<{ m: Listing; slug: string }>) {
  const d = m.details;
  const [candles, setCandles] = useState(d.candles ?? 0);
  const [lit, setLit] = useState(false);
  const story = (d.lifeStory ?? "").split("\n\n");
  const [tributes, setTributes] = useState<Tribute[]>(m.tributes ?? []);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitTribute() {
    const msg = message.trim();
    if (!msg || busy) return;
    setBusy(true);
    try {
      const t = await api.addTribute(slug, { authorName: name.trim(), message: msg });
      setTributes((cur) => [t, ...cur]);
    } catch {
      setTributes((cur) => [
        { id: `local-${cur.length}`, authorName: name.trim() || "A member of the community", message: msg, createdAt: "just now" },
        ...cur,
      ]);
    }
    setName("");
    setMessage("");
    setBusy(false);
  }

  async function light() {
    if (lit) return;
    setLit(true);
    try {
      const { candles: c } = await api.lightCandle(slug);
      setCandles(c);
    } catch {
      setCandles((c) => c + 1);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: C.cream }} contentContainerStyle={{ padding: 24, paddingBottom: 48 }}>
      <View style={{ alignItems: "center" }}>
        {m.coverImageUrl ? (
          <Thumb seed={m.slug} src={m.coverImageUrl} label={initials(m.title)} style={s.portrait} labelStyle={s.portraitInit} />
        ) : (
          <View style={s.portrait}><Text style={s.portraitInit}>{initials(m.title)}</Text></View>
        )}
        <Text style={s.name}>{d.honorific ? d.honorific + " " : ""}{m.title}</Text>
        <Text style={s.dates}>{lifeDates(d.bornYear, d.diedDate)}</Text>
        {d.epitaph && <Text style={s.epitaph}>“{d.epitaph}”</Text>}

        <Pressable onPress={light} style={[s.candle, lit && { backgroundColor: C.green900 }]}>
          <Text style={s.candleText}>{lit ? "🕯  Candle lit" : "🕯  Light a candle"} · {candles}</Text>
        </Pressable>
        <RememberButton slug={slug} initialCount={d.rememberedByCount ?? 0} />
        <Text style={s.rememberHint}>Those who remember are quietly told on the anniversary each year.</Text>
      </View>

      <View style={s.divider} />

      <Text style={s.sectionLabel}>CELEBRATION OF A LIFE</Text>
      {story.map((p, i) => (
        <Text key={`${p.slice(0, 20)}-${i}`} style={[s.story, i > 0 && { marginTop: 14 }]}>{p}</Text>
      ))}

      {(d.gallery ?? []).some((g) => g.url) && (
        <>
          <View style={s.divider} />
          <Text style={s.sectionLabel}>MOMENTS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {(d.gallery ?? []).filter((g) => g.url).map((g, i) => (
              <View key={g.url} style={s.moment}>
                <Thumb seed={`${m.slug}-g${i}`} src={cldCover(g.url, 220)} style={s.momentImg} />
                {g.caption ? <Text style={s.momentCaption} numberOfLines={2}>{g.caption}</Text> : null}
              </View>
            ))}
          </ScrollView>
        </>
      )}

      {(d.diedDate || (d.observeBirthday && d.birthday)) && (
        <View style={s.datesNote}>
          <Text style={s.datesTitle}>Days of remembrance</Text>
          {d.diedDate ? <Text style={s.datesLine}>Anniversary · {dayMonth(d.diedDate)} each year</Text> : null}
          {d.observeBirthday && d.birthday ? <Text style={s.datesLine}>Birthday · {dayMonth(d.birthday)}, kept by the family</Text> : null}
        </View>
      )}

      <View style={s.divider} />
      <Text style={s.sectionLabel}>TRIBUTES</Text>
      {tributes.length === 0 && (
        <Text style={s.tributeEmpty}>Be the first to leave a word.</Text>
      )}
      {tributes.map((t) => (
        <View key={t.id} style={s.tribute}>
          <Text style={s.tributeMsg}>“{t.message}”</Text>
          <Text style={s.tributeWho}>{t.authorName}{t.relation ? ` · ${t.relation}` : ""}</Text>
        </View>
      ))}

      <View style={s.form}>
        <TextInput
          style={s.input}
          value={message}
          onChangeText={setMessage}
          placeholder="Share a memory or leave a word of comfort…"
          placeholderTextColor={C.inkFaint}
          multiline
        />
        <TextInput
          style={s.inputSm}
          value={name}
          onChangeText={setName}
          placeholder="Your name (optional)"
          placeholderTextColor={C.inkFaint}
        />
        <Pressable onPress={submitTribute} disabled={busy} style={[s.submit, busy && { opacity: 0.6 }]}>
          <Text style={s.submitText}>{busy ? "Leaving…" : "Leave a tribute"}</Text>
        </Pressable>
        <Text style={s.formNote}>Tributes are lightly reviewed for dignity before they appear.</Text>
      </View>

      <Text style={s.mark}>Yɛnkae</Text>
      <Text style={s.markSub}>Kept in remembrance</Text>

      <View style={{ marginTop: 22 }}>
        <ReportButton listingId={m.id} memorial />
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  portrait: { width: 110, height: 110, borderRadius: 55, backgroundColor: "#EADFC4", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.goldBrand },
  portraitInit: { fontFamily: serif, fontSize: 40, fontWeight: "600", color: C.green },
  name: { fontFamily: serif, fontSize: 34, fontWeight: "600", color: C.ink, marginTop: 16, textAlign: "center" },
  dates: { color: C.goldText, fontSize: 13, letterSpacing: 3, marginTop: 6 },
  epitaph: { fontFamily: serif, fontStyle: "italic", fontSize: 20, color: C.ink, textAlign: "center", marginTop: 14, maxWidth: 320, lineHeight: 28 },
  candle: { backgroundColor: C.ink, borderRadius: 999, paddingHorizontal: 22, paddingVertical: 13, marginTop: 22 },
  candleText: { color: C.cream, fontSize: 15, fontWeight: "600" },
  remember: { borderWidth: 1.5, borderColor: C.goldBrand, borderRadius: 999, paddingHorizontal: 22, paddingVertical: 11, marginTop: 12 },
  rememberOn: { backgroundColor: C.goldBrand },
  rememberText: { color: C.goldText, fontSize: 14, fontWeight: "700" },
  rememberTextOn: { color: C.cream },
  rememberHint: { color: C.inkFaint, fontSize: 11, marginTop: 8, textAlign: "center", maxWidth: 280 },
  moment: { width: 150 },
  momentImg: { width: 150, height: 110, borderRadius: 10, borderWidth: 1, borderColor: C.sand },
  momentCaption: { color: C.inkMuted, fontSize: 11, lineHeight: 15, marginTop: 5 },
  datesNote: { marginTop: 22, backgroundColor: C.paper, borderWidth: 1, borderColor: C.sand, borderRadius: 12, padding: 14 },
  datesTitle: { color: C.goldText, fontSize: 11, letterSpacing: 2, fontWeight: "700", textTransform: "uppercase" },
  datesLine: { color: C.ink, fontFamily: serif, fontSize: 14, marginTop: 6 },
  divider: { height: 1, backgroundColor: C.sand, marginVertical: 28 },
  sectionLabel: { color: C.inkFaint, fontSize: 11, letterSpacing: 3, fontWeight: "700", textAlign: "center", marginBottom: 14 },
  story: { fontFamily: serif, fontSize: 17, lineHeight: 26, color: C.ink },
  tribute: { backgroundColor: C.paper, borderWidth: 1, borderColor: C.sand, borderRadius: 10, padding: 16, marginBottom: 12 },
  tributeMsg: { fontFamily: serif, fontSize: 15, color: C.ink, lineHeight: 22 },
  tributeWho: { color: C.green, fontWeight: "600", fontSize: 13, marginTop: 8 },
  tributeEmpty: { color: C.inkFaint, fontStyle: "italic", textAlign: "center", marginBottom: 12 },
  form: { marginTop: 8, borderWidth: 1, borderColor: C.sand, borderStyle: "dashed", borderRadius: 12, padding: 16 },
  input: { minHeight: 70, borderWidth: 1, borderColor: C.sand, borderRadius: 8, backgroundColor: C.paper, padding: 12, fontFamily: serif, fontSize: 15, color: C.ink, textAlignVertical: "top" },
  inputSm: { marginTop: 10, borderWidth: 1, borderColor: C.sand, borderRadius: 8, backgroundColor: C.paper, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: C.ink },
  submit: { marginTop: 14, alignSelf: "center", backgroundColor: C.green, borderRadius: 999, paddingHorizontal: 26, paddingVertical: 12 },
  submitText: { color: C.cream, fontWeight: "600", fontSize: 14 },
  formNote: { color: C.inkFaint, fontSize: 11, textAlign: "center", marginTop: 10 },
  mark: { fontFamily: serif, fontSize: 26, color: C.goldText, textAlign: "center", marginTop: 30 },
  markSub: { color: C.inkFaint, fontSize: 11, letterSpacing: 3, textAlign: "center", marginTop: 4 },
});
