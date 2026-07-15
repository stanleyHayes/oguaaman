import { useState, type ReactNode } from "react";
import { Image, Linking, Pressable, StyleSheet, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import Animated from "react-native-reanimated";
import { T as Text, TI as TextInput } from "@/components/typography";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth";
import type { InstitutionView, MediaAsset, ProfileSection, SectionItem, SubEntity } from "@/lib/types";
import { C, D, DI, S, SI, initials } from "@/theme";
import { Loading, ErrorView, Thumb, Markdown } from "@/ui";
import { cldCover, cld } from "@/lib/cloudinary";
import { HeroParallax, RevealView, StaggerIn, useHeroParallax } from "@/components/anim";

// Section accents map to the heritage palette (never AI purple).
const TONE: Record<string, string> = { green: C.green, clay: C.clay, gold: C.goldBrand, maroon: C.maroon, teal: C.teal };
const toneColor = (t?: string) => TONE[t ?? "green"] ?? C.green;

// Only open web-safe schemes (the backend already sanitises stored URLs).
function openURL(url?: string) {
  const u = (url ?? "").trim();
  if (/^(https?:|mailto:|tel:)/i.test(u)) Linking.openURL(u).catch(() => {});
}

export default function Institution() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data, error, loading } = useApi<InstitutionView>(() => api.institution(slug), "inst:" + slug);
  const { scrollY, onScroll } = useHeroParallax();
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "Not found"} />;

  const org = data.institution;
  const heroBg = org.houseColors?.[0] ?? C.green;
  const facts: [string, string][] = [
    ["Established", org.founded ? String(org.founded) : "—"],
    ["Type", org.classification ?? "—"],
    ["Members", org.memberCount ? String(org.memberCount) : "—"],
    ["Where", org.jurisdiction ?? "Cape Coast"],
  ];
  const sections = (org.sections ?? []).filter((sec) => !sec.hidden);

  return (
    <>
      <Stack.Screen options={{ title: org.name }} />
      <Animated.ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 56 }} onScroll={onScroll} scrollEventThrottle={16}>
        <View style={[s.hero, { backgroundColor: heroBg }]}>
          <HeroParallax scrollY={scrollY} style={{ width: "100%", alignItems: "center" }}>
            {org.crestUrl
              ? <Image source={{ uri: cldCover(org.crestUrl, 200) }} resizeMode="cover" style={s.crest} />
              : <View style={[s.crest, s.crestFallback]}><Text style={s.crestInit}>{initials(org.name)}</Text></View>}
            <Text style={s.heroName}>{org.name}</Text>
            {org.motto ? <Text style={s.heroMotto}>{org.motto}</Text> : null}
            {org.verified ? <View style={s.badge}><Text style={s.badgeText}>✓ Verified · Official</Text></View> : null}
          </HeroParallax>
        </View>

        <RevealView delay={100} style={s.facts}>
          {facts.map(([k, v], i) => (
            <View key={k} style={[s.factCell, i < facts.length - 1 && s.factDivider]}>
              <Text style={s.factVal} numberOfLines={1}>{v}</Text>
              <Text style={s.factKey}>{k}</Text>
            </View>
          ))}
        </RevealView>

        <View style={s.body}>
          {org.summary ? (
            <RevealView delay={150} style={s.section}>
              <SecTitle>About</SecTitle>
              <Text style={s.summary}>{org.summary}</Text>
              {org.history ? <Text style={s.history}>{org.history}</Text> : null}
            </RevealView>
          ) : null}

          {sections.map((sec, i) => <SectionView key={sec.id} section={sec} index={i} />)}

          {org.gallery && org.gallery.length > 0 ? (
            <RevealView style={s.section}>
              <SecTitle>Gallery</SecTitle>
              <Gallery media={org.gallery} />
            </RevealView>
          ) : null}

          {org.offices && org.offices.length > 0 ? (
            <RevealView style={s.section}>
              <SecTitle>Offices &amp; office-holders</SecTitle>
              <View style={{ gap: 8 }}>
                {org.offices.map((o) => (
                  <View key={o.id} style={s.officeCard}>
                    <Text style={s.officeRole}>{o.role}</Text>
                    <Text style={s.officeHolder}>{o.holderName ?? "Vacant"}{o.verified ? "  ✓" : ""}</Text>
                  </View>
                ))}
              </View>
            </RevealView>
          ) : null}

          <ClaimPanel slug={slug} orgName={org.name} />
        </View>
      </Animated.ScrollView>
    </>
  );
}

// "Claim this institution" — a member's request to manage the official page
// (spec §8.13). A steward reviews it; editing itself stays on the desktop admin.
function ClaimPanel({ slug, orgName }: Readonly<{ slug: string; orgName: string }>) {
  const { member } = useAuth();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");

  if (state === "sent") {
    return (
      <View style={s.claimCard}>
        <Text style={s.claimTitle}>Claim submitted ✓</Text>
        <Text style={s.claimBody}>A steward will verify that you hold the office you named. You&apos;ll get a notification either way.</Text>
      </View>
    );
  }

  if (!member) {
    return (
      <View style={s.claimCard}>
        <Text style={s.claimTitle}>Speak for {orgName}?</Text>
        <Text style={s.claimBody}>Office-holders can claim this page to keep it official. Sign in to make a claim.</Text>
        <Pressable onPress={() => router.push("/signin")} style={s.claimBtn}><Text style={s.claimBtnText}>Sign in</Text></Pressable>
      </View>
    );
  }

  async function submit() {
    if (role.trim() === "") { setErrMsg("Tell us the office or role you hold."); setState("error"); return; }
    setState("sending"); setErrMsg("");
    try {
      await api.claimInstitution(slug, { requestedRole: role.trim(), note: note.trim() || undefined });
      setState("sent");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Could not submit the claim.");
      setState("error");
    }
  }

  return (
    <View style={s.claimCard}>
      <Text style={s.claimTitle}>Speak for {orgName}?</Text>
      <Text style={s.claimBody}>If you hold an office here, claim the page so the institution&apos;s presence stays official. A steward verifies every claim.</Text>
      {!open ? (
        <Pressable onPress={() => setOpen(true)} style={s.claimBtn}><Text style={s.claimBtnText}>Claim this institution</Text></Pressable>
      ) : (
        <View style={{ marginTop: 12, gap: 8 }}>
          <TextInput style={s.claimInput} value={role} onChangeText={(v) => { setRole(v); setState("idle"); }} placeholder="Your office (e.g. Headmaster, PTA Chair)" placeholderTextColor={C.inkFaint} />
          <TextInput style={[s.claimInput, { minHeight: 64, textAlignVertical: "top" }]} value={note} onChangeText={setNote} placeholder="Anything that helps verify you (optional)" placeholderTextColor={C.inkFaint} multiline />
          {state === "error" && <Text style={s.claimErr}>{errMsg}</Text>}
          <Pressable onPress={submit} disabled={state === "sending"} style={[s.claimBtn, state === "sending" && { opacity: 0.6 }]}>
            <Text style={s.claimBtnText}>{state === "sending" ? "Submitting…" : "Submit claim"}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function SecTitle({ children, color = C.ink }: Readonly<{ children: ReactNode; color?: string }>) {
  return (
    <View style={s.secTitleRow}>
      <Text style={[s.secTitle, { color }]}>{children}</Text>
      <View style={s.secRule} />
    </View>
  );
}

function SectionView({ section, index = 0 }: Readonly<{ section: ProfileSection; index?: number }>) {
  const t = toneColor(section.tone);
  const items = section.items ?? [];
  const media = section.media ?? [];
  const showTitle = section.type !== "quote" && section.type !== "cta" && section.type !== "divider" && section.type !== "hero";

  let body: ReactNode = null;
  switch (section.type) {
    case "richtext": body = section.body?.trim() ? <Markdown>{section.body}</Markdown> : null; break;
    case "gallery": body = <Gallery media={media} />; break;
    case "stats": body = <StatsBlock items={items} color={t} />; break;
    case "team": body = <TeamBlock items={items} />; break;
    case "timeline": body = <TimelineBlock items={items} color={t} />; break;
    case "faq": body = <FaqBlock items={items} />; break;
    case "docs": body = <DocsBlock items={items} />; break;
    case "quote": body = <QuoteBlock section={section} color={t} />; break;
    case "cta": body = <CtaBlock section={section} color={t} />; break;
    case "logos": body = <LogosBlock items={items} />; break;
    case "groups": body = <GroupsBlock groups={section.groups ?? []} color={t} />; break;
    case "hero": body = <HeroBlock section={section} color={t} />; break;
    case "testimonials": body = <TestimonialsBlock items={items} color={t} />; break;
    case "contact": body = <ContactBlock section={section} color={t} />; break;
    case "menu": body = <MenuBlock items={items} />; break;
    case "schedule": body = <ScheduleBlock items={items} color={t} />; break;
    case "map": body = <MapBlock section={section} color={t} />; break;
    case "divider": body = <View style={s.divider} />; break;
  }
  if (!body) return null;
  return (
    <StaggerIn index={index} style={s.section}>
      {showTitle && section.title ? <SecTitle color={t}>{section.title}</SecTitle> : null}
      {body}
    </StaggerIn>
  );
}

function Gallery({ media }: Readonly<{ media: MediaAsset[] }>) {
  const items = media.filter((m) => m.url || m.caption);
  if (!items.length) return null;
  return (
    <View style={s.galleryWrap}>
      {items.map((m, i) => (
        <View key={m.id || i} style={s.tile}>
          {m.url
            ? <Image source={{ uri: cldCover(m.url, 300) }} resizeMode="cover" style={s.tileImg} />
            : <View style={[s.tileImg, { backgroundColor: C.greenSlate }]} />}
          {m.caption ? <Text style={s.tileCaption} numberOfLines={1}>{m.caption}</Text> : null}
        </View>
      ))}
    </View>
  );
}

function StatsBlock({ items, color }: Readonly<{ items: SectionItem[]; color: string }>) {
  const list = items.filter((i) => i.value || i.label);
  if (!list.length) return null;
  return (
    <View style={s.statsWrap}>
      {list.map((i, idx) => (
        <View key={i.id || idx} style={s.statCell}>
          <Text style={[s.statVal, { color }]}>{i.value || "—"}</Text>
          {i.label ? <Text style={s.statLabel}>{i.label}</Text> : null}
        </View>
      ))}
    </View>
  );
}

function TeamBlock({ items }: Readonly<{ items: SectionItem[] }>) {
  const list = items.filter((i) => i.value || i.label);
  if (!list.length) return null;
  return (
    <View style={{ gap: 10 }}>
      {list.map((i, idx) => (
        <View key={i.id || idx} style={s.teamRow}>
          <Thumb seed={i.value || i.label || "?"} src={i.image} label={initials(i.value || i.label || "?")} style={s.avatar} labelStyle={s.avatarInit} />
          <View style={{ flex: 1 }}>
            {i.value ? <Text style={s.teamName}>{i.value}</Text> : null}
            {i.label ? <Text style={s.teamRole}>{i.label}</Text> : null}
            {i.detail ? <Text style={s.teamBio}>{i.detail}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

function TimelineBlock({ items, color }: Readonly<{ items: SectionItem[]; color: string }>) {
  const list = items.filter((i) => i.label || i.value || i.detail);
  if (!list.length) return null;
  return (
    <View style={{ gap: 14 }}>
      {list.map((i, idx) => (
        <View key={i.id || idx} style={s.timelineRow}>
          <View style={[s.dot, { borderColor: color }]} />
          <View style={{ flex: 1 }}>
            {i.label ? <Text style={[s.timeDate, { color }]}>{i.label}</Text> : null}
            {i.value ? <Text style={s.timeHead}>{i.value}</Text> : null}
            {i.detail ? <Text style={s.timeBody}>{i.detail}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

function FaqBlock({ items }: Readonly<{ items: SectionItem[] }>) {
  const list = items.filter((i) => i.label || i.value);
  if (!list.length) return null;
  return (
    <View style={s.boxWrap}>
      {list.map((i, idx) => (
        <View key={i.id || idx} style={[s.faqItem, idx > 0 && s.topBorder]}>
          {i.label ? <Text style={s.faqQ}>{i.label}</Text> : null}
          {i.value ? <Text style={s.faqA}>{i.value}</Text> : null}
        </View>
      ))}
    </View>
  );
}

function DocsBlock({ items }: Readonly<{ items: SectionItem[] }>) {
  const list = items.filter((i) => i.label || i.url);
  if (!list.length) return null;
  return (
    <View style={s.boxWrap}>
      {list.map((i, idx) => (
        <Pressable key={i.id || idx} onPress={() => openURL(i.url)} style={[s.docRow, idx > 0 && s.topBorder]}>
          <View style={{ flex: 1 }}>
            <Text style={s.docTitle}>{i.label || i.url}</Text>
            {i.detail ? <Text style={s.docNote}>{i.detail}</Text> : null}
          </View>
          {i.url ? <Text style={s.docOpen}>Open →</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}

function QuoteBlock({ section, color }: Readonly<{ section: ProfileSection; color: string }>) {
  if (!section.body?.trim()) return null;
  return (
    <View style={[s.quote, { borderLeftColor: color }]}>
      <Text style={s.quoteText}>{`“${section.body}”`}</Text>
      {section.title ? <Text style={[s.quoteAttr, { color }]}>{`— ${section.title}`}</Text> : null}
    </View>
  );
}

function CtaBlock({ section, color }: Readonly<{ section: ProfileSection; color: string }>) {
  const buttons = (section.items ?? []).filter((i) => i.label);
  if (!section.title && !section.body && !buttons.length) return null;
  return (
    <View style={[s.cta, { borderColor: color }]}>
      {section.title ? <Text style={s.ctaTitle}>{section.title}</Text> : null}
      {section.body ? <Text style={s.ctaBody}>{section.body}</Text> : null}
      {buttons.length ? (
        <View style={s.ctaButtons}>
          {buttons.map((b, i) => (
            <Pressable key={b.id || i} onPress={() => openURL(b.url)} style={[s.ctaBtn, i === 0 ? s.ctaBtnPrimary : s.ctaBtnOutline]}>
              <Text style={i === 0 ? s.ctaBtnPrimaryText : s.ctaBtnOutlineText}>{b.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function LogosBlock({ items }: Readonly<{ items: SectionItem[] }>) {
  const list = items.filter((i) => i.image || i.label);
  if (!list.length) return null;
  return (
    <View style={s.logosWrap}>
      {list.map((i, idx) => (
        <Pressable key={i.id || idx} onPress={() => openURL(i.url)} style={s.logoCell}>
          {i.image ? <Image source={{ uri: cld(i.image, "c_fit,w_240,f_auto,q_auto") }} resizeMode="contain" style={s.logoImg} /> : null}
          {i.label ? <Text style={s.logoLabel} numberOfLines={2}>{i.label}</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}

function GroupsBlock({ groups, color }: Readonly<{ groups: SubEntity[]; color: string }>) {
  const list = groups.filter((g) => g.name);
  if (!list.length) return null;
  return (
    <View style={{ gap: 10 }}>
      {list.map((g, idx) => (
        <View key={g.id || idx} style={s.groupCard}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
            {g.crestUrl
              ? <Image source={{ uri: cld(g.crestUrl, "c_fill,g_auto,w_88,h_88,f_auto,q_auto") }} resizeMode="cover" style={s.groupCrest} />
              : <View style={[s.groupCrest, s.groupCrestFallback]}><Text style={s.groupCrestInit}>{initials(g.name)}</Text></View>}
            <View style={{ flex: 1 }}>
              <Text style={s.groupName}>{g.name}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 2 }}>
                {g.subtitle ? <Text style={[s.groupSubtitle, { color }]}>{g.subtitle}</Text> : null}
                {g.colors && g.colors.length > 0 ? (
                  <View style={{ flexDirection: "row", gap: 4 }}>
                    {g.colors.map((c) => <View key={c} style={[s.colorDot, { backgroundColor: c }]} />)}
                  </View>
                ) : null}
              </View>
            </View>
          </View>
          {g.summary ? <Text style={s.groupSummary}>{g.summary}</Text> : null}
          {g.attrs?.some((a) => a.label || a.value) ? (
            <View style={{ marginTop: 8, gap: 3 }}>
              {g.attrs.filter((a) => a.label || a.value).map((a, ai) => (
                <View key={a.id || ai} style={{ flexDirection: "row", gap: 6 }}>
                  {a.label ? <Text style={s.attrLabel}>{a.label}</Text> : null}
                  {a.value ? <Text style={s.attrValue}>{a.value}</Text> : null}
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function HeroBlock({ section, color }: Readonly<{ section: ProfileSection; color: string }>) {
  const bg = section.media?.[0]?.url;
  const buttons = (section.items ?? []).filter((i) => i.label);
  return (
    <View style={[s.heroCard, !bg && { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand }]}>
      {bg ? (
        <>
          <Image source={{ uri: cld(bg, "c_fill,w_1200,f_auto,q_auto") }} resizeMode="cover" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.5)" }]} />
        </>
      ) : null}
      <View style={s.heroInner}>
        {section.title ? <Text style={[s.heroTitle, { color: bg ? C.cream : C.ink }]}>{section.title}</Text> : null}
        {section.body ? <Text style={[s.heroBody, { color: bg ? "rgba(246,241,231,0.85)" : C.inkMuted }]}>{section.body}</Text> : null}
        {buttons.length ? (
          <View style={s.heroButtons}>
            {buttons.map((b, i) => {
              const btnStyle = bg ? s.heroBtnLight : s.ctaBtnOutline;
              const btnTextStyle = bg ? s.heroBtnLightText : s.ctaBtnOutlineText;
              return (
                <Pressable key={b.id || i} onPress={() => openURL(b.url)} style={[s.ctaBtn, i === 0 ? s.ctaBtnPrimary : btnStyle]}>
                  <Text style={i === 0 ? s.ctaBtnPrimaryText : btnTextStyle}>{b.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function TestimonialsBlock({ items, color }: Readonly<{ items: SectionItem[]; color: string }>) {
  const list = items.filter((i) => i.value || i.label);
  if (!list.length) return null;
  return (
    <View style={{ gap: 10 }}>
      {list.map((i, idx) => (
        <View key={i.id || idx} style={s.testimCard}>
          {i.value ? <Text style={s.testimQuote}>{`“${i.value}”`}</Text> : null}
          {i.label || i.detail || i.image ? (
            <View style={s.testimFoot}>
              <Thumb seed={i.label || "?"} src={i.image} label={initials(i.label || "?")} style={s.testimAvatar} labelStyle={s.testimAvatarInit} />
              <View style={{ flex: 1 }}>
                {i.label ? <Text style={s.testimAuthor}>{i.label}</Text> : null}
                {i.detail ? <Text style={[s.testimRole, { color }]}>{i.detail}</Text> : null}
              </View>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function ContactBlock({ section, color }: Readonly<{ section: ProfileSection; color: string }>) {
  const rows = (section.items ?? []).filter((i) => i.label || i.value);
  if (!section.body?.trim() && !rows.length) return null;
  return (
    <View style={s.contactCard}>
      {section.body ? <Text style={s.contactAddress}>{section.body}</Text> : null}
      {rows.length ? (
        <View style={[{ gap: 6 }, section.body ? s.contactRowsTop : null]}>
          {rows.map((i, idx) => {
            const valueText = i.value ? <Text style={[s.contactValue, { flex: 1 }]}>{i.value}</Text> : null;
            return (
              <View key={i.id || idx} style={{ flexDirection: "row", gap: 10 }}>
                {i.label ? <Text style={[s.contactLabel, { color }]}>{i.label}</Text> : null}
                {i.url
                  ? <Text style={[s.contactValue, s.contactLink, { flex: 1 }]} onPress={() => openURL(i.url)}>{i.value || i.url}</Text>
                  : valueText}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function MenuBlock({ items }: Readonly<{ items: SectionItem[] }>) {
  const list = items.filter((i) => i.label || i.value);
  if (!list.length) return null;
  return (
    <View style={s.listCard}>
      {list.map((i, idx) => (
        <View key={i.id || idx} style={[s.listRow, idx < list.length - 1 && s.listRowBorder]}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            {i.label ? <Text style={s.menuName}>{i.label}</Text> : null}
            {i.detail ? <Text style={s.menuDesc}>{i.detail}</Text> : null}
          </View>
          {i.value ? <Text style={s.menuPrice}>{i.value}</Text> : null}
        </View>
      ))}
    </View>
  );
}

function ScheduleBlock({ items, color }: Readonly<{ items: SectionItem[]; color: string }>) {
  const list = items.filter((i) => i.label || i.value);
  if (!list.length) return null;
  return (
    <View style={s.listCard}>
      {list.map((i, idx) => (
        <View key={i.id || idx} style={[s.listRow, idx < list.length - 1 && s.listRowBorder]}>
          {i.label ? <Text style={[s.schedWhen, { color }]}>{i.label}</Text> : null}
          <View style={{ flex: 1 }}>
            {i.value ? <Text style={s.schedTime}>{i.value}</Text> : null}
            {i.detail ? <Text style={s.schedNote}>{i.detail}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

function MapBlock({ section, color }: Readonly<{ section: ProfileSection; color: string }>) {
  const addr = section.body?.trim();
  if (!addr) return null;
  const href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
  return (
    <View style={s.contactCard}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Text style={{ fontSize: 16, color }}>📍</Text>
        <Text style={[s.contactAddress, { flex: 1 }]}>{addr}</Text>
      </View>
      <Pressable onPress={() => openURL(href)} style={[s.ctaBtn, s.ctaBtnPrimary, { marginTop: 14, alignSelf: "flex-start" }]}>
        <Text style={s.ctaBtnPrimaryText}>Get directions →</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  hero: { alignItems: "center", paddingHorizontal: 20, paddingVertical: 28 },
  crest: { width: 84, height: 84, borderRadius: 42, backgroundColor: "#0003" },
  crestFallback: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#FFFFFF44" },
  crestInit: { ...S(700), fontSize: 28, color: C.cream },
  heroName: { ...D(700), fontSize: 26, color: C.cream, textAlign: "center", marginTop: 14 },
  heroMotto: { ...DI(), fontSize: 15, color: C.gold, textAlign: "center", marginTop: 6 },
  badge: { marginTop: 12, borderWidth: 1, borderColor: "#C7A24A88", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  badgeText: { color: C.gold, fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },

  facts: { flexDirection: "row", backgroundColor: C.cream, borderBottomWidth: 1, borderBottomColor: C.sand },
  factCell: { flex: 1, alignItems: "center", paddingVertical: 14, paddingHorizontal: 4 },
  factDivider: { borderRightWidth: 1, borderRightColor: C.sand },
  factVal: { ...S(600), fontSize: 15, color: C.green },
  factKey: { fontSize: 9, color: C.inkFaint, marginTop: 4, textTransform: "uppercase", letterSpacing: 0.5 },

  body: { padding: 20 },
  section: { marginBottom: 26 },

  secTitleRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  secTitle: { ...D(700), fontSize: 19, color: C.ink },
  secRule: { flex: 1, height: 1, backgroundColor: C.sand },

  summary: { ...S(400), fontSize: 17, lineHeight: 26, color: C.ink },
  history: { fontSize: 15, lineHeight: 23, color: C.inkMuted, marginTop: 10 },

  divider: { height: 1, backgroundColor: C.sand, marginVertical: 2 },

  galleryWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tile: { width: "48%", borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: C.sand, backgroundColor: C.cream },
  tileImg: { width: "100%", aspectRatio: 1, backgroundColor: C.greenSlate },
  tileCaption: { fontSize: 12, color: C.ink, paddingHorizontal: 8, paddingVertical: 6 },

  statsWrap: { flexDirection: "row", flexWrap: "wrap", borderWidth: 1, borderColor: C.sand, borderRadius: 12, overflow: "hidden" },
  statCell: { width: "50%", alignItems: "center", paddingVertical: 16, backgroundColor: C.cream, borderWidth: 0.5, borderColor: C.sand },
  statVal: { ...S(700), fontSize: 26 },
  statLabel: { fontSize: 10, color: C.inkFaint, marginTop: 4, textTransform: "uppercase", letterSpacing: 0.5 },

  teamRow: { flexDirection: "row", gap: 12, borderWidth: 1, borderColor: C.sand, borderRadius: 12, backgroundColor: C.cream, padding: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarInit: { ...S(700), fontSize: 16, color: C.cream },
  teamName: { ...S(600), fontSize: 16, color: C.ink },
  teamRole: { fontSize: 11, color: C.goldText, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 2 },
  teamBio: { fontSize: 13, lineHeight: 19, color: C.inkMuted, marginTop: 4 },

  timelineRow: { flexDirection: "row", gap: 12 },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, backgroundColor: C.paper, marginTop: 4 },
  timeDate: { ...S(700), fontSize: 14 },
  timeHead: { ...S(400), fontSize: 17, color: C.ink, marginTop: 1 },
  timeBody: { fontSize: 14, lineHeight: 21, color: C.inkMuted, marginTop: 3 },

  boxWrap: { borderWidth: 1, borderColor: C.sand, borderRadius: 12, overflow: "hidden", backgroundColor: C.cream },
  topBorder: { borderTopWidth: 1, borderTopColor: C.sand },
  faqItem: { paddingHorizontal: 14, paddingVertical: 12 },
  faqQ: { fontSize: 15, fontWeight: "600", color: C.ink },
  faqA: { fontSize: 14, lineHeight: 21, color: C.inkMuted, marginTop: 6 },

  docRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  docTitle: { fontSize: 15, fontWeight: "500", color: C.ink },
  docNote: { fontSize: 11, color: C.inkFaint, marginTop: 2 },
  docOpen: { fontSize: 12, fontWeight: "700", color: C.tealText },

  quote: { borderLeftWidth: 3, paddingLeft: 16, paddingVertical: 4 },
  quoteText: { ...SI(), fontSize: 21, lineHeight: 29, color: C.ink },
  quoteAttr: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 10 },

  cta: { borderWidth: 1, borderRadius: 14, padding: 22, alignItems: "center", backgroundColor: C.cream },
  ctaTitle: { ...D(700), fontSize: 22, color: C.ink, textAlign: "center" },
  ctaBody: { fontSize: 14, lineHeight: 21, color: C.inkMuted, textAlign: "center", marginTop: 8 },
  ctaButtons: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10, marginTop: 16 },
  ctaBtn: { borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 },
  ctaBtnPrimary: { backgroundColor: C.green },
  ctaBtnPrimaryText: { color: C.cream, fontWeight: "700", fontSize: 13 },
  ctaBtnOutline: { borderWidth: 1, borderColor: C.green },
  ctaBtnOutlineText: { color: C.green, fontWeight: "700", fontSize: 13 },

  logosWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  logoCell: { width: "31%", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: C.sand, borderRadius: 12, backgroundColor: C.cream, paddingVertical: 14, paddingHorizontal: 6 },
  logoImg: { width: "100%", height: 36 },
  logoLabel: { fontSize: 12, color: C.ink, textAlign: "center" },

  officeCard: { borderWidth: 1, borderColor: C.sand, borderRadius: 12, backgroundColor: C.cream, padding: 12 },
  officeRole: { fontSize: 11, color: C.goldText, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  officeHolder: { ...S(400), fontSize: 17, color: C.ink, marginTop: 4 },

  groupCard: { borderWidth: 1, borderColor: C.sand, borderRadius: 12, backgroundColor: C.cream, padding: 12 },
  groupCrest: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: C.sand, backgroundColor: C.greenSlate },
  groupCrestFallback: { alignItems: "center", justifyContent: "center", backgroundColor: C.green },
  groupCrestInit: { ...S(700), fontSize: 15, color: C.cream },
  groupName: { ...S(400), fontSize: 17, color: C.ink },
  groupSubtitle: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  colorDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: C.sand },
  groupSummary: { fontSize: 14, lineHeight: 21, color: C.inkMuted, marginTop: 8 },
  attrLabel: { fontSize: 13, color: C.inkFaint },
  attrValue: { fontSize: 13, color: C.ink, fontWeight: "500", flex: 1 },

  heroCard: { borderRadius: 14, overflow: "hidden" },
  heroInner: { paddingHorizontal: 20, paddingVertical: 32, alignItems: "center" },
  heroTitle: { ...D(700), fontSize: 26, textAlign: "center" },
  heroBody: { fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: 8 },
  heroButtons: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10, marginTop: 18 },
  heroBtnLight: { borderWidth: 1, borderColor: "rgba(246,241,231,0.5)" },
  heroBtnLightText: { color: C.cream, fontWeight: "700", fontSize: 13 },

  testimCard: { borderWidth: 1, borderColor: C.sand, borderRadius: 12, backgroundColor: C.cream, padding: 16 },
  testimQuote: { ...SI(), fontSize: 17, lineHeight: 25, color: C.ink },
  testimFoot: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
  testimAvatar: { width: 36, height: 36, borderRadius: 18 },
  testimAvatarInit: { ...S(700), fontSize: 14, color: C.cream },
  testimAuthor: { fontSize: 14, fontWeight: "600", color: C.ink },
  testimRole: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 1 },

  contactCard: { borderWidth: 1, borderColor: C.sand, borderRadius: 12, backgroundColor: C.cream, padding: 16 },
  contactAddress: { ...S(400), fontSize: 15, lineHeight: 23, color: C.ink },
  contactRowsTop: { marginTop: 12, borderTopWidth: 1, borderTopColor: C.sand, paddingTop: 12 },
  contactLabel: { width: 92, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  contactValue: { fontSize: 14, color: C.ink },
  contactLink: { color: C.tealText },

  claimCard: { borderWidth: 1, borderStyle: "dashed", borderColor: C.goldBrand, borderRadius: 14, backgroundColor: C.cream, padding: 16 },
  claimTitle: { ...D(700), fontSize: 18, color: C.ink },
  claimBody: { fontSize: 13, lineHeight: 19, color: C.inkMuted, marginTop: 6 },
  claimBtn: { alignSelf: "flex-start", backgroundColor: C.green, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10, marginTop: 12 },
  claimBtnText: { color: C.cream, fontWeight: "700", fontSize: 13 },
  claimInput: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: C.ink },
  claimErr: { color: C.clayText, fontSize: 13 },

  listCard: { borderWidth: 1, borderColor: C.sand, borderRadius: 12, backgroundColor: C.cream, overflow: "hidden" },
  listRow: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 14, paddingVertical: 12 },
  listRowBorder: { borderBottomWidth: 1, borderBottomColor: C.sand },
  menuName: { fontSize: 15, fontWeight: "600", color: C.ink },
  menuDesc: { fontSize: 13, lineHeight: 18, color: C.inkMuted, marginTop: 2 },
  menuPrice: { ...S(700), fontSize: 16, color: C.goldText },
  schedWhen: { width: 120, ...S(400), fontSize: 15 },
  schedTime: { fontSize: 14, fontWeight: "600", color: C.ink },
  schedNote: { fontSize: 13, color: C.inkMuted, marginTop: 2 },
});
