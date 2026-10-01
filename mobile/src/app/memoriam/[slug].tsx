import { ROUTES } from "@/lib/routes";
import { parseApiDate } from "@/lib/dates";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View, Pressable } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { T as Text, TI as TextInput } from "@/components/typography";
import { api } from "@/lib/api";
import { useRecordView } from "@/lib/use-record-view";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth";
import type { Listing, Tribute } from "@/lib/types";
import { D, S, SI, ON_GREEN, initials, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";
import { Loading, ErrorView, Thumb } from "@/ui";
import { CandleIcon, HeartFilledIcon, HeartIcon } from "@/components/icons";
import { ReportButton } from "@/report-button";
import { BlockButton } from "@/components/block-button";
import { cldCover } from "@/lib/cloudinary";
import { RevealView, StaggerIn } from "@/components/anim";

function dayMonth(date?: string): string {
  if (!date) return "";
  const d = parseApiDate(date);
  if (!d) return date;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long" });
}

// Remember/stop-remembering — the yearly-remembrance follow (spec §8.11).
function RememberButton({ slug, initialCount }: Readonly<{ slug: string; initialCount: number }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
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
    if (!member) { router.push(ROUTES.signIn); return; }
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
    <Pressable accessibilityRole="button" onPress={toggle} disabled={busy} style={[s.remember, following && s.rememberOn]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
        {following ? <HeartFilledIcon size={14} color={ON_GREEN} /> : <HeartIcon size={14} color={C.greenText} strokeWidth={2} />}
        <Text style={[s.rememberText, following && s.rememberTextOn]}>
          {following ? "Remembering" : "Remember"} · {count}
        </Text>
      </View>
    </Pressable>
  );
}

function tributeButtonLabel(busy: boolean, signedIn: boolean): string {
  if (busy) return "Leaving…";
  return signedIn ? "Leave a tribute" : "Sign in to leave a tribute";
}

function lifeDates(bornYear?: number, diedDate?: string) {
  return [bornYear ? String(bornYear) : "", diedDate ? diedDate.slice(0, 4) : ""].filter(Boolean).join(" — ");
}

export default function Memorial() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data, error, loading } = useApi<Listing>(() => api.memorial(slug), `memorial:${slug}`);
  useRecordView(data?.id);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "Not found"} />;
  return <Detail m={data} slug={slug} />;
}

function Detail({ m, slug }: Readonly<{ m: Listing; slug: string }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const d = m.details;
  const [candles, setCandles] = useState(d.candles ?? 0);
  const [lit, setLit] = useState(false);
  const story = (d.lifeStory ?? "").split("\n\n");
  const { member } = useAuth();
  const [tributes, setTributes] = useState<Tribute[]>(m.tributes ?? []);
  const [relation, setRelation] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [tributeErr, setTributeErr] = useState("");
  const [candleErr, setCandleErr] = useState("");

  // Only a tribute the server accepted is shown; on failure the words stay in
  // the box with the reason, so nothing is lost and it can be sent again.
  async function submitTribute() {
    const msg = message.trim();
    if (!msg || busy) return;
    if (!member) { router.push(ROUTES.signIn); return; }
    setBusy(true); setTributeErr("");
    try {
      const t = await api.addTribute(slug, { message: msg, relation: relation.trim() || undefined });
      setTributes((cur) => [t, ...cur]);
      setRelation("");
      setMessage("");
    } catch (e) {
      setTributeErr(e instanceof Error ? e.message : "Your tribute wasn't sent. Please try again.");
    } finally { setBusy(false); }
  }

  async function light() {
    if (lit) return;
    setLit(true); setCandleErr("");
    try {
      const { candles: c } = await api.lightCandle(slug);
      setCandles(c);
    } catch (e) {
      setLit(false);
      setCandleErr(e instanceof Error ? e.message : "The candle couldn't be lit. Please try again.");
    }
  }

  return (
    <ScrollView style={{ backgroundColor: C.cream }} contentContainerStyle={{ padding: 24, paddingBottom: 48 }}>
      <RevealView style={{ alignItems: "center" }}>
        {m.coverImageUrl ? (
          <Thumb seed={m.slug} src={m.coverImageUrl} label={initials(m.title)} style={s.portrait} labelStyle={s.portraitInit} />
        ) : (
          <View style={s.portrait}><Text style={s.portraitInit}>{initials(m.title)}</Text></View>
        )}
        <Text style={s.name}>{d.honorific ? d.honorific + " " : ""}{m.title}</Text>
        <Text style={s.dates}>{lifeDates(d.bornYear, d.diedDate)}</Text>
        {d.epitaph && <Text style={s.epitaph}>“{d.epitaph}”</Text>}

        <Pressable accessibilityRole="button" onPress={light} style={[s.candle, lit && { backgroundColor: C.green900 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <CandleIcon size={14} color={lit ? ON_GREEN : C.greenText} strokeWidth={2} />
            <Text style={s.candleText}>{lit ? "Candle lit" : "Light a candle"} · {candles}</Text>
          </View>
        </Pressable>
        {candleErr ? <Text style={s.formErr}>{candleErr}</Text> : null}
        <RememberButton slug={slug} initialCount={d.rememberedByCount ?? 0} />
        <Text style={s.rememberHint}>Those who remember are quietly told on the anniversary each year.</Text>
      </RevealView>

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
      {tributes.map((t, i) => (
        <StaggerIn key={t.id} index={i} style={s.tribute}>
          <Text style={s.tributeMsg}>“{t.message}”</Text>
          <Text style={s.tributeWho}>{t.authorName}{t.relation ? ` · ${t.relation}` : ""}</Text>
          {member?.slug && member.slug === t.memberSlug ? null : (
            <View style={s.tributeActions}>
              <ReportButton target={{ type: "tribute", id: t.id }} compact />
              <BlockButton slug={t.memberSlug} name={t.authorName} />
            </View>
          )}
        </StaggerIn>
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
          value={relation}
          onChangeText={setRelation}
          placeholder="How you knew them (optional)"
          placeholderTextColor={C.inkFaint}
          maxLength={60}
        />
        {tributeErr ? <Text style={s.formErr}>{tributeErr}</Text> : null}
        <Pressable accessibilityRole="button" onPress={submitTribute} disabled={busy} style={[s.submit, busy && { opacity: 0.6 }]}>
          <Text style={s.submitText}>{tributeButtonLabel(busy, member != null)}</Text>
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

const makeStyles = (C: Palette) => StyleSheet.create({
  tributeActions: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 6 },
  // #EADFC4 is a bespoke parchment tone behind the portrait with no palette
  // token; kept as-is in both themes (decorative, photo-placeholder-like).
  portrait: { width: 110, height: 110, borderRadius: 55, backgroundColor: C.goldTint14, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.goldBrand },
  portraitInit: { ...S(600), fontSize: 40, color: C.green },
  name: { ...D(600), fontSize: 34, color: C.ink, marginTop: 16, textAlign: "center" },
  dates: { color: C.goldText, fontSize: 13, letterSpacing: 3, marginTop: 6 },
  epitaph: { ...SI(), fontSize: 20, color: C.ink, textAlign: "center", marginTop: 14, maxWidth: 320, lineHeight: 28 },
  candle: { backgroundColor: C.ink, borderRadius: 999, paddingHorizontal: 22, paddingVertical: 13, marginTop: 22 },
  candleText: { color: C.cream, fontSize: 15, ...S(600) },
  remember: { borderWidth: 1.5, borderColor: C.goldBrand, borderRadius: 999, paddingHorizontal: 22, paddingVertical: 11, marginTop: 12 },
  rememberOn: { backgroundColor: C.goldBrand },
  rememberText: { color: C.goldText, fontSize: 14, ...S(700) },
  rememberTextOn: { color: C.cream },
  rememberHint: { color: C.inkFaint, fontSize: 11, marginTop: 8, textAlign: "center", maxWidth: 280 },
  moment: { width: 150 },
  momentImg: { width: 150, height: 110, borderRadius: 10, borderWidth: 1, borderColor: C.sand },
  momentCaption: { color: C.inkMuted, fontSize: 11, lineHeight: 15, marginTop: 5 },
  formErr: { color: C.clayText, fontSize: 13, lineHeight: 18, marginTop: 8, textAlign: "center" },
  datesNote: { marginTop: 22, backgroundColor: C.paper, borderWidth: 1, borderColor: C.sand, borderRadius: 12, padding: 14 },
  datesTitle: { color: C.goldText, fontSize: 11, letterSpacing: 2, ...D(700), textTransform: "uppercase" },
  datesLine: { color: C.ink, ...S(400), fontSize: 14, marginTop: 6 },
  divider: { height: 1, backgroundColor: C.sand, marginVertical: 28 },
  sectionLabel: { color: C.inkFaint, fontSize: 11, letterSpacing: 3, ...D(700), textAlign: "center", marginBottom: 14 },
  story: { ...S(400), fontSize: 17, lineHeight: 26, color: C.ink },
  tribute: { backgroundColor: C.paper, borderWidth: 1, borderColor: C.sand, borderRadius: 10, padding: 16, marginBottom: 12 },
  tributeMsg: { ...S(400), fontSize: 15, color: C.ink, lineHeight: 22 },
  tributeWho: { color: C.greenText, ...S(600), fontSize: 13, marginTop: 8 },
  tributeEmpty: { color: C.inkFaint, fontStyle: "italic", textAlign: "center", marginBottom: 12 },
  form: { marginTop: 8, borderWidth: 1, borderColor: C.sand, borderStyle: "dashed", borderRadius: 12, padding: 16 },
  input: { minHeight: 70, borderWidth: 1, borderColor: C.sand, borderRadius: 8, backgroundColor: C.paper, padding: 12, ...S(400), fontSize: 15, color: C.ink, textAlignVertical: "top" },
  inputSm: { marginTop: 10, borderWidth: 1, borderColor: C.sand, borderRadius: 8, backgroundColor: C.paper, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: C.ink },
  submit: { marginTop: 14, alignSelf: "center", backgroundColor: C.green, borderRadius: 999, paddingHorizontal: 26, paddingVertical: 12 },
  submitText: { color: ON_GREEN, ...S(600), fontSize: 14 },
  formNote: { color: C.inkFaint, fontSize: 11, textAlign: "center", marginTop: 10 },
  mark: { ...S(400), fontSize: 26, color: C.goldText, textAlign: "center", marginTop: 30 },
  markSub: { color: C.inkFaint, fontSize: 11, letterSpacing: 3, textAlign: "center", marginTop: 4 },
});
