// Institution workspace panels — the manager-facing official-page editor
// (Creator plan §4.1.3), ported from creator/src/components/institution-panels.tsx
// to React Native. All five panels talk to the same full-replace manage
// endpoints (spec §8.13) the web creator app calls: profile, offices, gallery,
// custom sections, and official events.
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { T as Text, TI as TextInput } from "@/components/typography";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme-context";
import { ImageField } from "@/components/image-field";
import { DateField } from "@/components/date-field";
import { D, ON_GREEN, S, withAlpha, type Palette } from "@/theme";
import type { MediaAsset, Office, Organization, ProfileSection, ProfileSectionType, SectionItem, SocialLink, SubEntity } from "@/lib/types";

type SaveState = "idle" | "saving" | "saved" | "error";

function usePanelStyles() {
  const { C } = useTheme();
  return useMemo(() => makeStyles(C), [C]);
}

export function Saver({ state }: Readonly<{ state: SaveState }>) {
  const s = usePanelStyles();
  if (state === "saving") return <Text style={s.saverMuted}>Saving…</Text>;
  if (state === "saved") return <Text style={s.saverOk}>Saved ✓</Text>;
  if (state === "error") return <Text style={s.saverErr}>Couldn&apos;t save — try again.</Text>;
  return null;
}

export function Panel({ title, intro, children }: Readonly<{ title: string; intro?: string; children: React.ReactNode }>) {
  const s = usePanelStyles();
  return (
    <View style={s.panel}>
      <Text style={s.panelTitle}>{title}</Text>
      {intro ? <Text style={s.panelIntro}>{intro}</Text> : null}
      {children}
    </View>
  );
}

function FieldLabel({ children }: Readonly<{ children: React.ReactNode }>) {
  const s = usePanelStyles();
  return <Text style={s.label}>{children}</Text>;
}

function CheckRow({ value, onValueChange, label }: Readonly<{ value: boolean; onValueChange: (v: boolean) => void; label: string }>) {
  const s = usePanelStyles();
  return (
    <Pressable onPress={() => onValueChange(!value)} style={s.checkRow}>
      <View style={[s.checkBox, value && s.checkBoxOn]}>{value ? <Text style={s.checkTick}>✓</Text> : null}</View>
      <Text style={s.checkLabel}>{label}</Text>
    </Pressable>
  );
}

// ── Profile ───────────────────────────────────────────────────────────────
export function ProfilePanel({ slug, org }: Readonly<{ slug: string; org: Organization }>) {
  const { C } = useTheme();
  const s = usePanelStyles();
  const [summary, setSummary] = useState(org.summary ?? "");
  const [motto, setMotto] = useState(org.motto ?? "");
  const [history, setHistory] = useState(org.history ?? "");
  const [crestUrl, setCrestUrl] = useState(org.crestUrl ?? "");
  const [gesCategory, setGesCategory] = useState(org.gesCategory ?? "");
  const [boardingType, setBoardingType] = useState(org.boardingType ?? "");
  const [genderPolicy, setGenderPolicy] = useState(org.genderPolicy ?? "");
  const [nhisAccredited, setNhisAccredited] = useState(org.nhisAccredited ?? false);
  const [ghanaPostGPS, setGhanaPostGPS] = useState(org.ghanaPostGPS ?? "");
  const [momoNumber, setMomoNumber] = useState(org.momoNumber ?? "");
  const [latitude, setLatitude] = useState(org.latitude != null ? String(org.latitude) : "");
  const [longitude, setLongitude] = useState(org.longitude != null ? String(org.longitude) : "");
  const [quarterTag, setQuarterTag] = useState(org.quarterTag ?? "");
  const [asafoTag, setAsafoTag] = useState(org.asafoTag ?? "");
  const [contact, setContact] = useState<SocialLink[]>(org.contact ?? []);
  const [artifactLabel, setArtifactLabel] = useState(org.verificationArtifacts?.[0]?.label ?? "");
  const [artifactURL, setArtifactURL] = useState(org.verificationArtifacts?.[0]?.url ?? "");
  const [state, setState] = useState<SaveState>("idle");
  const isSchool = org.kind === "school";
  const isHealth = org.kind === "health";

  function updateContact(i: number, patch: Partial<SocialLink>) {
    setContact((cur) => cur.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
    setState("idle");
  }
  function addContact() { setContact((cur) => [...cur, { label: "", url: "" }]); setState("idle"); }
  function removeContact(i: number) { setContact((cur) => cur.filter((_, idx) => idx !== i)); setState("idle"); }

  async function save() {
    setState("saving");
    try {
      await api.updateOrgProfile(slug, {
        summary, motto, history, crestUrl,
        contact: contact.filter((c) => c.url.trim() !== "").map((c) => ({ label: c.label.trim(), url: c.url.trim() })),
        gesCategory, boardingType, genderPolicy,
        nhisAccredited: isHealth ? nhisAccredited : undefined,
        ghanaPostGPS, momoNumber,
        latitude: latitude.trim() === "" || !Number.isFinite(Number(latitude)) ? undefined : Number(latitude),
        longitude: longitude.trim() === "" || !Number.isFinite(Number(longitude)) ? undefined : Number(longitude),
        quarterTag, asafoTag,
        verificationArtifacts: artifactURL.trim() ? [{ label: artifactLabel.trim() || "Verification", url: artifactURL.trim() }] : [],
      });
      setState("saved");
    } catch {
      setState("error");
    }
  }

  const onEdit = () => setState("idle");

  return (
    <Panel title="Profile">
      <View style={{ gap: 14 }}>
        <View>
          <FieldLabel>Crest / logo</FieldLabel>
          <ImageField value={crestUrl} onChange={(url) => { setCrestUrl(url); setState("idle"); }} />
        </View>
        <View>
          <FieldLabel>Motto</FieldLabel>
          <TextInput style={s.input} value={motto} onChangeText={(v) => { setMotto(v); onEdit(); }} placeholder="e.g. Dwen Hwe Kan" placeholderTextColor={C.inkFaint} />
        </View>
        <View>
          <FieldLabel>Summary</FieldLabel>
          <TextInput style={[s.input, s.inputArea]} value={summary} onChangeText={(v) => { setSummary(v); onEdit(); }} placeholder="A short line about the institution" placeholderTextColor={C.inkFaint} multiline />
        </View>
        <View>
          <FieldLabel>History</FieldLabel>
          <TextInput style={[s.input, s.inputArea]} value={history} onChangeText={(v) => { setHistory(v); onEdit(); }} placeholder="Founding, milestones, heritage" placeholderTextColor={C.inkFaint} multiline />
        </View>

        {isSchool && (
          <View style={{ gap: 8 }}>
            <TextInput style={s.input} value={gesCategory} onChangeText={(v) => { setGesCategory(v); onEdit(); }} placeholder="GES category" placeholderTextColor={C.inkFaint} />
            <TextInput style={s.input} value={boardingType} onChangeText={(v) => { setBoardingType(v); onEdit(); }} placeholder="Boarding type" placeholderTextColor={C.inkFaint} />
            <TextInput style={s.input} value={genderPolicy} onChangeText={(v) => { setGenderPolicy(v); onEdit(); }} placeholder="Gender policy" placeholderTextColor={C.inkFaint} />
          </View>
        )}
        {isHealth && (
          <CheckRow value={nhisAccredited} onValueChange={(v) => { setNhisAccredited(v); onEdit(); }} label="NHIS-accredited" />
        )}

        <View>
          <FieldLabel>GhanaPost GPS</FieldLabel>
          <TextInput style={s.input} value={ghanaPostGPS} onChangeText={(v) => { setGhanaPostGPS(v); onEdit(); }} placeholder="e.g. CC-001-2345" placeholderTextColor={C.inkFaint} autoCapitalize="characters" />
        </View>
        <View>
          <FieldLabel>MoMo number</FieldLabel>
          <TextInput style={s.input} value={momoNumber} onChangeText={(v) => { setMomoNumber(v); onEdit(); }} placeholder="e.g. 024 000 0000" placeholderTextColor={C.inkFaint} keyboardType="phone-pad" />
        </View>
        <View style={s.two}>
          <View style={{ flex: 1 }}>
            <FieldLabel>Latitude</FieldLabel>
            <TextInput style={s.input} value={latitude} onChangeText={(v) => { setLatitude(v); onEdit(); }} placeholder="5.1053" placeholderTextColor={C.inkFaint} keyboardType="numbers-and-punctuation" />
          </View>
          <View style={{ flex: 1 }}>
            <FieldLabel>Longitude</FieldLabel>
            <TextInput style={s.input} value={longitude} onChangeText={(v) => { setLongitude(v); onEdit(); }} placeholder="-1.2466" placeholderTextColor={C.inkFaint} keyboardType="numbers-and-punctuation" />
          </View>
        </View>
        <View style={s.two}>
          <View style={{ flex: 1 }}>
            <FieldLabel>Quarter tag</FieldLabel>
            <TextInput style={s.input} value={quarterTag} onChangeText={(v) => { setQuarterTag(v); onEdit(); }} placeholder="Quarter" placeholderTextColor={C.inkFaint} />
          </View>
          <View style={{ flex: 1 }}>
            <FieldLabel>Asafo tag</FieldLabel>
            <TextInput style={s.input} value={asafoTag} onChangeText={(v) => { setAsafoTag(v); onEdit(); }} placeholder="Asafo" placeholderTextColor={C.inkFaint} />
          </View>
        </View>

        <View>
          <FieldLabel>Contact links</FieldLabel>
          <View style={{ gap: 8 }}>
            {contact.map((c, i) => (
              <View key={i} style={s.rowItem}>
                <TextInput style={[s.input, { flex: 1 }]} value={c.label} onChangeText={(v) => updateContact(i, { label: v })} placeholder="Label (e.g. Website)" placeholderTextColor={C.inkFaint} />
                <TextInput style={[s.input, { flex: 1 }]} value={c.url} onChangeText={(v) => updateContact(i, { url: v })} placeholder="https://…" placeholderTextColor={C.inkFaint} autoCapitalize="none" keyboardType="url" />
                <Pressable onPress={() => removeContact(i)} hitSlop={6} style={s.removeBtn}><Text style={s.removeText}>✕</Text></Pressable>
              </View>
            ))}
            <Pressable onPress={addContact} style={s.ghostBtn}><Text style={s.ghostBtnText}>+ Add contact</Text></Pressable>
          </View>
        </View>

        <View>
          <FieldLabel>Verification artifact</FieldLabel>
          <View style={{ gap: 8 }}>
            <TextInput style={s.input} value={artifactLabel} onChangeText={(v) => { setArtifactLabel(v); onEdit(); }} placeholder="Label (e.g. GES certificate)" placeholderTextColor={C.inkFaint} />
            <TextInput style={s.input} value={artifactURL} onChangeText={(v) => { setArtifactURL(v); onEdit(); }} placeholder="https://link-to-document" placeholderTextColor={C.inkFaint} autoCapitalize="none" keyboardType="url" />
          </View>
        </View>

        <View style={s.saveRow}>
          <Pressable onPress={save} disabled={state === "saving"} style={[s.primaryBtn, state === "saving" && s.dim]}>
            <Text style={s.primaryBtnText}>Save profile</Text>
          </Pressable>
          <Saver state={state} />
        </View>
      </View>
    </Panel>
  );
}

// ── Offices & office-holders ────────────────────────────────────────────────
const blankOffice = (): Office => ({ id: "", role: "", holderName: "", verified: false });

export function OfficesPanel({ slug, initial }: Readonly<{ slug: string; initial?: Office[] }>) {
  const { C } = useTheme();
  const s = usePanelStyles();
  const [offices, setOffices] = useState<Office[]>((initial ?? []).length ? (initial ?? []) : [blankOffice()]);
  const [state, setState] = useState<SaveState>("idle");

  function update(i: number, patch: Partial<Office>) {
    setOffices((cur) => cur.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
    setState("idle");
  }
  function add() { setOffices((cur) => [...cur, blankOffice()]); setState("idle"); }
  function remove(i: number) { setOffices((cur) => cur.filter((_, idx) => idx !== i)); setState("idle"); }
  async function save() {
    setState("saving");
    try {
      const cleaned = offices.filter((o) => o.role.trim() !== "");
      const updated = await api.setOrgOffices(slug, cleaned);
      setOffices((updated.offices ?? []).length ? (updated.offices ?? []) : [blankOffice()]);
      setState("saved");
    } catch {
      setState("error");
    }
  }

  return (
    <Panel title="Offices & office-holders">
      <View style={{ gap: 10 }}>
        {offices.map((o, i) => (
          <View key={o.id || i} style={{ gap: 8 }}>
            <View style={s.rowItem}>
              <TextInput style={[s.input, { flex: 1 }]} value={o.role} onChangeText={(v) => update(i, { role: v })} placeholder="Office (e.g. Headmaster)" placeholderTextColor={C.inkFaint} />
              <Pressable onPress={() => remove(i)} hitSlop={6} style={s.removeBtn}><Text style={s.removeText}>✕</Text></Pressable>
            </View>
            <TextInput style={s.input} value={o.holderName ?? ""} onChangeText={(v) => update(i, { holderName: v })} placeholder="Holder's name" placeholderTextColor={C.inkFaint} />
          </View>
        ))}
      </View>
      <View style={[s.saveRow, { marginTop: 14 }]}>
        <Pressable onPress={add} style={s.ghostBtn}><Text style={s.ghostBtnText}>+ Add office</Text></Pressable>
        <Pressable onPress={save} disabled={state === "saving"} style={[s.primaryBtn, state === "saving" && s.dim]}>
          <Text style={s.primaryBtnText}>Save roster</Text>
        </Pressable>
        <Saver state={state} />
      </View>
    </Panel>
  );
}

// ── Post an official event ──────────────────────────────────────────────────
export function EventPanel({ slug, verified }: Readonly<{ slug: string; verified: boolean }>) {
  const { C } = useTheme();
  const s = usePanelStyles();
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [venue, setVenue] = useState("");
  const [description, setDescription] = useState("");
  const [state, setState] = useState<SaveState>("idle");
  const [msg, setMsg] = useState("");

  async function post() {
    if (!title.trim()) return;
    setState("saving");
    setMsg("");
    try {
      await api.postOrgEvent(slug, { title: title.trim(), details: { startsAt, venue, description } });
      setState("saved");
      setMsg(verified ? "Published — it's live on your page." : "Submitted — it'll appear once a curator approves it.");
      setTitle(""); setStartsAt(""); setVenue(""); setDescription("");
    } catch (e) {
      setState("error");
      setMsg(e instanceof Error ? e.message : "Couldn't post the event.");
    }
  }

  return (
    <Panel title="Post an official event">
      <View style={{ gap: 14 }}>
        <View>
          <FieldLabel>Title</FieldLabel>
          <TextInput style={s.input} value={title} onChangeText={(v) => { setTitle(v); setState("idle"); }} placeholder="e.g. Speech & Prize-Giving Day" placeholderTextColor={C.inkFaint} />
        </View>
        <View>
          <FieldLabel>Date</FieldLabel>
          <DateField value={startsAt} onChange={setStartsAt} placeholder="Pick a date" />
        </View>
        <View>
          <FieldLabel>Venue</FieldLabel>
          <TextInput style={s.input} value={venue} onChangeText={setVenue} placeholder="e.g. Botwe Hall" placeholderTextColor={C.inkFaint} />
        </View>
        <View>
          <FieldLabel>Details</FieldLabel>
          <TextInput style={[s.input, s.inputArea]} value={description} onChangeText={setDescription} placeholder="What's happening, who it's for" placeholderTextColor={C.inkFaint} multiline />
        </View>
        <View style={s.saveRow}>
          <Pressable onPress={post} disabled={state === "saving" || !title.trim()} style={[s.goldBtn, (state === "saving" || !title.trim()) && s.dim]}>
            <Text style={s.goldBtnText}>{verified ? "Publish event" : "Submit event"}</Text>
          </Pressable>
          {msg ? <Text style={state === "error" ? s.saverErr : s.saverOk}>{msg}</Text> : <Saver state={state} />}
        </View>
        {!verified ? <Text style={s.help}>Your institution isn&apos;t verified yet, so events go through the normal review queue.</Text> : null}
      </View>
    </Panel>
  );
}

// ── Photo gallery ───────────────────────────────────────────────────────────
export function GalleryPanel({ slug, initial }: Readonly<{ slug: string; initial?: MediaAsset[] }>) {
  const { C } = useTheme();
  const s = usePanelStyles();
  const [items, setItems] = useState<MediaAsset[]>(initial ?? []);
  const [state, setState] = useState<SaveState>("idle");

  function update(i: number, patch: Partial<MediaAsset>) {
    setItems((cur) => cur.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
    setState("idle");
  }
  function add() { setItems((cur) => [...cur, { id: nextTmpId(), url: "" }]); setState("idle"); }
  function remove(i: number) { setItems((cur) => cur.filter((_, idx) => idx !== i)); setState("idle"); }
  async function save() {
    setState("saving");
    try {
      const cleaned = items.filter((m) => m.url.trim() !== "").map((m) => ({ ...m, id: stripTmp(m.id) }));
      const updated = await api.setOrgGallery(slug, cleaned);
      setItems(updated.gallery ?? []);
      setState("saved");
    } catch {
      setState("error");
    }
  }

  return (
    <Panel title="Photo gallery" intro="Add photos of your institution — campus, events, people. Each can carry a caption and alt text for accessibility.">
      <View style={{ gap: 12 }}>
        {items.map((m, i) => (
          <View key={m.id || i} style={s.itemCard}>
            <FieldLabel>{`Photo ${i + 1}`}</FieldLabel>
            <ImageField value={m.url} onChange={(url) => update(i, { url })} />
            <View style={{ gap: 8, marginTop: 8 }}>
              <TextInput style={s.input} value={m.caption ?? ""} onChangeText={(v) => update(i, { caption: v })} placeholder="Caption" placeholderTextColor={C.inkFaint} />
              <TextInput style={s.input} value={m.alt ?? ""} onChangeText={(v) => update(i, { alt: v })} placeholder="Alt text (describe the image)" placeholderTextColor={C.inkFaint} />
              <TextInput style={s.input} value={m.credit ?? ""} onChangeText={(v) => update(i, { credit: v })} placeholder="Photo credit / source (optional)" placeholderTextColor={C.inkFaint} />
            </View>
            <Pressable onPress={() => remove(i)} hitSlop={6} style={{ marginTop: 8 }}><Text style={s.removeLink}>Remove photo</Text></Pressable>
          </View>
        ))}
        {items.length === 0 ? <Text style={s.help}>No photos yet.</Text> : null}
      </View>
      <View style={[s.saveRow, { marginTop: 14 }]}>
        <Pressable onPress={add} style={s.ghostBtn}><Text style={s.ghostBtnText}>+ Add photo</Text></Pressable>
        <Pressable onPress={save} disabled={state === "saving"} style={[s.primaryBtn, state === "saving" && s.dim]}>
          <Text style={s.primaryBtnText}>Save gallery</Text>
        </Pressable>
        <Saver state={state} />
      </View>
    </Panel>
  );
}

// ── custom sections & gallery (the official-page builder) ────────────────────
// Client-only temp ids give unsaved rows a stable React key; they are stripped
// on save so the server mints canonical ids (sec-/med-/itm-).
let _tmpSeq = 0;
const nextTmpId = () => `tmp-${++_tmpSeq}`;
const stripTmp = (id?: string) => (id?.startsWith("tmp-") ? "" : id ?? "");

type Tone = "green" | "clay" | "gold" | "maroon" | "teal";

const SECTION_TYPES: { type: ProfileSectionType; label: string }[] = [
  { type: "richtext", label: "Text" },
  { type: "gallery", label: "Photo album" },
  { type: "stats", label: "Stats" },
  { type: "team", label: "People" },
  { type: "timeline", label: "Timeline" },
  { type: "faq", label: "FAQ" },
  { type: "docs", label: "Downloads" },
  { type: "quote", label: "Quote" },
  { type: "cta", label: "Call to action" },
  { type: "logos", label: "Partners" },
  { type: "groups", label: "Sub-entities" },
  { type: "hero", label: "Hero banner" },
  { type: "testimonials", label: "Testimonials" },
  { type: "contact", label: "Contact / hours" },
  { type: "menu", label: "Menu / price list" },
  { type: "schedule", label: "Schedule" },
  { type: "map", label: "Map / location" },
  { type: "divider", label: "Divider" },
];
// Section kinds edited through the generic item-list editor.
const ITEM_TYPES = new Set<ProfileSectionType>(["stats", "team", "timeline", "faq", "docs", "logos", "testimonials", "menu", "schedule"]);
const TONE_OPTIONS: Tone[] = ["green", "clay", "gold", "maroon", "teal"];

function sectionTypeLabel(type: string): string {
  return SECTION_TYPES.find((st) => st.type === type)?.label ?? type;
}
function defaultSectionTitle(type: ProfileSectionType): string {
  const titles: Record<ProfileSectionType, string> = {
    richtext: "About", gallery: "Gallery", stats: "By the numbers",
    team: "Our people", timeline: "Milestones", faq: "FAQ", docs: "Downloads",
    quote: "", cta: "Get involved", logos: "Partners", divider: "", groups: "Houses",
    hero: "", testimonials: "What people say", contact: "Visit & contact",
    menu: "Menu", schedule: "Schedule", map: "Find us",
  };
  return titles[type];
}
function newSection(type: ProfileSectionType): ProfileSection {
  return { id: nextTmpId(), type, title: defaultSectionTitle(type), tone: "green", body: "", media: [], items: [], groups: [] };
}

type ItemFieldKey = "label" | "value" | "detail" | "url";
const ITEM_FIELDS: Record<string, { key: ItemFieldKey; placeholder: string; textarea?: boolean }[]> = {
  stats: [
    { key: "label", placeholder: "Label (e.g. Students)" },
    { key: "value", placeholder: "Value (e.g. 1,200)" },
  ],
  team: [
    { key: "value", placeholder: "Name" },
    { key: "label", placeholder: "Role or class" },
    { key: "detail", placeholder: "Short bio", textarea: true },
  ],
  timeline: [
    { key: "label", placeholder: "Date (e.g. 1876)" },
    { key: "value", placeholder: "Heading" },
    { key: "detail", placeholder: "Description", textarea: true },
  ],
  faq: [
    { key: "label", placeholder: "Question" },
    { key: "value", placeholder: "Answer", textarea: true },
  ],
  docs: [
    { key: "label", placeholder: "Title (e.g. Prospectus)" },
    { key: "detail", placeholder: "Note (e.g. PDF)" },
    { key: "url", placeholder: "https://link-to-file" },
  ],
  cta: [
    { key: "label", placeholder: "Button text (e.g. Apply now)" },
    { key: "url", placeholder: "Link (https://…)" },
  ],
  logos: [
    { key: "label", placeholder: "Name" },
    { key: "url", placeholder: "Link (optional)" },
  ],
  testimonials: [
    { key: "value", placeholder: "The quote", textarea: true },
    { key: "label", placeholder: "Author (e.g. Ama Mensah)" },
    { key: "detail", placeholder: "Role (e.g. Old Girl, '04)" },
  ],
  contact: [
    { key: "label", placeholder: "Label (e.g. Mon–Fri / Phone)" },
    { key: "value", placeholder: "Value (e.g. 8:00–17:00)" },
    { key: "url", placeholder: "Link (tel:/mailto:/https:)" },
  ],
  menu: [
    { key: "label", placeholder: "Item (e.g. Jollof rice)" },
    { key: "value", placeholder: "Price (e.g. ₵25)" },
    { key: "detail", placeholder: "Description (optional)", textarea: true },
  ],
  schedule: [
    { key: "label", placeholder: "When (e.g. Mon–Fri / Fajr)" },
    { key: "value", placeholder: "Time / detail (e.g. 8:00–17:00)" },
    { key: "detail", placeholder: "Note (optional)" },
  ],
};

/** Strip the client-side tmp ids from a section tree before saving. */
function sectionForSave(sec: ProfileSection): ProfileSection {
  return {
    ...sec,
    id: stripTmp(sec.id),
    media: sec.media?.map((m) => ({ ...m, id: stripTmp(m.id) })),
    items: sec.items?.map((it) => ({ ...it, id: stripTmp(it.id) })),
    groups: sec.groups?.map((g) => ({
      ...g,
      id: stripTmp(g.id),
      attrs: g.attrs?.map((a) => ({ ...a, id: stripTmp(a.id) })),
    })),
  };
}

export function SectionsPanel({ slug, initial }: Readonly<{ slug: string; initial?: ProfileSection[] }>) {
  const { C } = useTheme();
  const s = usePanelStyles();
  const [sections, setSections] = useState<ProfileSection[]>(initial ?? []);
  const [state, setState] = useState<SaveState>("idle");

  function update(i: number, patch: Partial<ProfileSection>) {
    setSections((cur) => cur.map((sec, idx) => (idx === i ? { ...sec, ...patch } : sec)));
    setState("idle");
  }
  function move(i: number, dir: -1 | 1) {
    setSections((cur) => {
      const j = i + dir;
      if (j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setState("idle");
  }
  function remove(i: number) { setSections((cur) => cur.filter((_, idx) => idx !== i)); setState("idle"); }
  function addType(type: ProfileSectionType) { setSections((cur) => [...cur, newSection(type)]); setState("idle"); }
  async function save() {
    setState("saving");
    try {
      const payload = sections.map(sectionForSave);
      const updated = await api.setOrgSections(slug, payload);
      setSections(updated.sections ?? []);
      setState("saved");
    } catch {
      setState("error");
    }
  }

  return (
    <Panel title="Custom sections" intro="Build your official page — facilities, achievements, history, people and more. Add sections below and order them with the arrows.">
      <View style={{ gap: 14 }}>
        {sections.map((sec, i) => (
          <View key={sec.id || i} style={s.sectionCard}>
            <View style={s.sectionHead}>
              <View style={s.typeBadge}><Text style={s.typeBadgeText}>{sectionTypeLabel(sec.type)}</Text></View>
              <View style={s.moveGroup}>
                <Pressable onPress={() => move(i, -1)} disabled={i === 0} style={[s.moveBtn, i === 0 && s.dim]}><Text style={s.moveBtnText}>↑</Text></Pressable>
                <Pressable onPress={() => move(i, 1)} disabled={i === sections.length - 1} style={[s.moveBtn, i === sections.length - 1 && s.dim]}><Text style={s.moveBtnText}>↓</Text></Pressable>
                <Pressable onPress={() => remove(i)} style={s.moveBtn}><Text style={[s.moveBtnText, { color: C.clayText }]}>✕</Text></Pressable>
              </View>
            </View>
            <TextInput style={[s.input, { marginTop: 8 }]} value={sec.title ?? ""} onChangeText={(v) => update(i, { title: v })} placeholder="Section title" placeholderTextColor={C.inkFaint} />

            <View style={s.toneRow}>
              <Text style={s.toneLabel}>Accent</Text>
              {TONE_OPTIONS.map((t) => (
                <Pressable key={t} onPress={() => update(i, { tone: t })} style={[s.toneChip, (sec.tone ?? "green") === t && s.toneChipOn]}>
                  <Text style={[s.toneChipText, (sec.tone ?? "green") === t && s.toneChipTextOn]}>{t}</Text>
                </Pressable>
              ))}
            </View>
            <CheckRow value={!sec.hidden} onValueChange={(v) => update(i, { hidden: !v })} label="Visible on page" />

            <View style={{ marginTop: 10 }}>
              {sec.type === "richtext" && (
                <TextInput style={[s.input, s.inputArea]} value={sec.body ?? ""} onChangeText={(v) => update(i, { body: v })} placeholder="Write here. Markdown supported — **bold**, lists, and | tables |." placeholderTextColor={C.inkFaint} multiline />
              )}
              {sec.type === "quote" && (
                <TextInput style={[s.input, s.inputArea]} value={sec.body ?? ""} onChangeText={(v) => update(i, { body: v })} placeholder="The quotation. (The section title above is the attribution.)" placeholderTextColor={C.inkFaint} multiline />
              )}
              {sec.type === "cta" && (
                <View style={{ gap: 10 }}>
                  <TextInput style={[s.input, s.inputArea]} value={sec.body ?? ""} onChangeText={(v) => update(i, { body: v })} placeholder="Supporting text (optional)" placeholderTextColor={C.inkFaint} multiline />
                  <Text style={s.subLabel}>Buttons</Text>
                  <ItemsEditor type="cta" items={sec.items ?? []} onChange={(items) => update(i, { items })} />
                </View>
              )}
              {sec.type === "gallery" && (
                <MediaItemsEditor media={sec.media ?? []} onChange={(media) => update(i, { media })} />
              )}
              {sec.type === "divider" && (
                <Text style={s.help}>A decorative divider — no content needed.</Text>
              )}
              {sec.type === "groups" && (
                <GroupsEditor groups={sec.groups ?? []} onChange={(groups) => update(i, { groups })} />
              )}
              {sec.type === "hero" && (
                <View style={{ gap: 10 }}>
                  <TextInput style={[s.input, s.inputArea]} value={sec.body ?? ""} onChangeText={(v) => update(i, { body: v })} placeholder="Subtext under the heading (optional)" placeholderTextColor={C.inkFaint} multiline />
                  <FieldLabel>Background image (optional)</FieldLabel>
                  <ImageField value={sec.media?.[0]?.url ?? ""} onChange={(url) => update(i, { media: url ? [{ id: sec.media?.[0]?.id ?? "", url, alt: sec.media?.[0]?.alt ?? "" }] : [] })} />
                  <Text style={s.subLabel}>Buttons</Text>
                  <ItemsEditor type="cta" items={sec.items ?? []} onChange={(items) => update(i, { items })} />
                </View>
              )}
              {sec.type === "contact" && (
                <View style={{ gap: 10 }}>
                  <TextInput style={[s.input, s.inputArea]} value={sec.body ?? ""} onChangeText={(v) => update(i, { body: v })} placeholder="Address (optional)" placeholderTextColor={C.inkFaint} multiline />
                  <Text style={s.subLabel}>Hours & details</Text>
                  <ItemsEditor type="contact" items={sec.items ?? []} onChange={(items) => update(i, { items })} />
                </View>
              )}
              {sec.type === "map" && (
                <TextInput style={[s.input, s.inputArea]} value={sec.body ?? ""} onChangeText={(v) => update(i, { body: v })} placeholder="Address — a 'Get directions' link is generated from it." placeholderTextColor={C.inkFaint} multiline />
              )}
              {ITEM_TYPES.has(sec.type) && (
                <ItemsEditor type={sec.type} items={sec.items ?? []} onChange={(items) => update(i, { items })} />
              )}
            </View>
          </View>
        ))}
        {sections.length === 0 ? <Text style={s.help}>No custom sections yet. Add one below.</Text> : null}
      </View>

      <Text style={[s.subLabel, { marginTop: 16 }]}>Add a section</Text>
      <View style={s.addWrap}>
        {SECTION_TYPES.map((st) => (
          <Pressable key={st.type} onPress={() => addType(st.type)} style={s.addChip}>
            <Text style={s.addChipText}>+ {st.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={[s.saveRow, s.saveDivider]}>
        <Pressable onPress={save} disabled={state === "saving"} style={[s.primaryBtn, state === "saving" && s.dim]}>
          <Text style={s.primaryBtnText}>Save sections</Text>
        </Pressable>
        <Saver state={state} />
      </View>
    </Panel>
  );
}

function ItemsEditor({ type, items, onChange }: Readonly<{ type: ProfileSectionType; items: SectionItem[]; onChange: (items: SectionItem[]) => void }>) {
  const { C } = useTheme();
  const s = usePanelStyles();
  const fields = ITEM_FIELDS[type] ?? [];
  const showImage = type === "team" || type === "logos" || type === "testimonials";
  function update(i: number, patch: Partial<SectionItem>) { onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it))); }
  function add() { onChange([...items, { id: nextTmpId() }]); }
  function remove(i: number) { onChange(items.filter((_, idx) => idx !== i)); }
  return (
    <View style={{ gap: 10 }}>
      {items.map((it, i) => (
        <View key={it.id || i} style={s.itemCard}>
          <View style={{ gap: 8 }}>
            {fields.map((f) => (
              <TextInput
                key={f.key}
                style={[s.input, f.textarea && s.inputArea]}
                value={it[f.key] ?? ""}
                onChangeText={(v) => update(i, { [f.key]: v } as Partial<SectionItem>)}
                placeholder={f.placeholder}
                placeholderTextColor={C.inkFaint}
                multiline={f.textarea}
                autoCapitalize={f.key === "url" ? "none" : "sentences"}
              />
            ))}
            {showImage ? (
              <View>
                <FieldLabel>Photo (optional)</FieldLabel>
                <ImageField value={it.image ?? ""} onChange={(url) => update(i, { image: url })} />
              </View>
            ) : null}
          </View>
          <Pressable onPress={() => remove(i)} hitSlop={6} style={{ marginTop: 8 }}><Text style={s.removeLink}>Remove</Text></Pressable>
        </View>
      ))}
      <Pressable onPress={add} style={s.ghostBtn}><Text style={s.ghostBtnText}>+ Add item</Text></Pressable>
    </View>
  );
}

function MediaItemsEditor({ media, onChange }: Readonly<{ media: MediaAsset[]; onChange: (media: MediaAsset[]) => void }>) {
  const { C } = useTheme();
  const s = usePanelStyles();
  function update(i: number, patch: Partial<MediaAsset>) { onChange(media.map((m, idx) => (idx === i ? { ...m, ...patch } : m))); }
  function add() { onChange([...media, { id: nextTmpId(), url: "" }]); }
  function remove(i: number) { onChange(media.filter((_, idx) => idx !== i)); }
  return (
    <View style={{ gap: 10 }}>
      {media.map((m, i) => (
        <View key={m.id || i} style={s.itemCard}>
          <FieldLabel>{`Photo ${i + 1}`}</FieldLabel>
          <ImageField value={m.url} onChange={(url) => update(i, { url })} />
          <View style={{ gap: 8, marginTop: 8 }}>
            <TextInput style={s.input} value={m.caption ?? ""} onChangeText={(v) => update(i, { caption: v })} placeholder="Caption (e.g. Aggrey Memorial Library)" placeholderTextColor={C.inkFaint} />
            <TextInput style={s.input} value={m.alt ?? ""} onChangeText={(v) => update(i, { alt: v })} placeholder="Alt text — describe the image" placeholderTextColor={C.inkFaint} />
            <TextInput style={s.input} value={m.credit ?? ""} onChangeText={(v) => update(i, { credit: v })} placeholder="Photo credit / source (optional)" placeholderTextColor={C.inkFaint} />
          </View>
          <Pressable onPress={() => remove(i)} hitSlop={6} style={{ marginTop: 8 }}><Text style={s.removeLink}>Remove photo</Text></Pressable>
        </View>
      ))}
      <Pressable onPress={add} style={s.ghostBtn}><Text style={s.ghostBtnText}>+ Add photo</Text></Pressable>
    </View>
  );
}

// Sub-entity cards (houses, departments, Asafo companies, year groups, lineage).
function GroupsEditor({ groups, onChange }: Readonly<{ groups: SubEntity[]; onChange: (groups: SubEntity[]) => void }>) {
  const { C } = useTheme();
  const s = usePanelStyles();
  function update(i: number, patch: Partial<SubEntity>) { onChange(groups.map((g, idx) => (idx === i ? { ...g, ...patch } : g))); }
  function add() { onChange([...groups, { id: nextTmpId(), name: "" }]); }
  function remove(i: number) { onChange(groups.filter((_, idx) => idx !== i)); }
  return (
    <View style={{ gap: 10 }}>
      {groups.map((g, i) => (
        <View key={g.id || i} style={s.itemCard}>
          <View style={{ gap: 8 }}>
            <TextInput style={s.input} value={g.name} onChangeText={(v) => update(i, { name: v })} placeholder="Name (e.g. Pickup)" placeholderTextColor={C.inkFaint} />
            <TextInput style={s.input} value={g.subtitle ?? ""} onChangeText={(v) => update(i, { subtitle: v })} placeholder="Subtitle (e.g. Boarding house)" placeholderTextColor={C.inkFaint} />
            <TextInput style={s.input} value={(g.colors ?? []).join(", ")} onChangeText={(v) => update(i, { colors: v.split(",").map((c) => c.trim()).filter(Boolean) })} placeholder="Colours — comma-separated hex (#A4161A, #161616)" placeholderTextColor={C.inkFaint} autoCapitalize="none" />
            <TextInput style={[s.input, s.inputArea]} value={g.summary ?? ""} onChangeText={(v) => update(i, { summary: v })} placeholder="Short description (optional)" placeholderTextColor={C.inkFaint} multiline />
            <View>
              <FieldLabel>Crest / photo (optional)</FieldLabel>
              <ImageField value={g.crestUrl ?? ""} onChange={(url) => update(i, { crestUrl: url })} />
            </View>
          </View>
          <Text style={[s.subLabel, { marginTop: 10 }]}>Facts</Text>
          <AttrsEditor attrs={g.attrs ?? []} onChange={(attrs) => update(i, { attrs })} />
          <Pressable onPress={() => remove(i)} hitSlop={6} style={{ marginTop: 8 }}><Text style={s.removeLink}>Remove card</Text></Pressable>
        </View>
      ))}
      <Pressable onPress={add} style={s.ghostBtn}><Text style={s.ghostBtnText}>+ Add card</Text></Pressable>
    </View>
  );
}

function AttrsEditor({ attrs, onChange }: Readonly<{ attrs: SectionItem[]; onChange: (attrs: SectionItem[]) => void }>) {
  const { C } = useTheme();
  const s = usePanelStyles();
  function update(i: number, patch: Partial<SectionItem>) { onChange(attrs.map((a, idx) => (idx === i ? { ...a, ...patch } : a))); }
  function add() { onChange([...attrs, { id: nextTmpId() }]); }
  function remove(i: number) { onChange(attrs.filter((_, idx) => idx !== i)); }
  return (
    <View style={{ gap: 8, marginTop: 4 }}>
      {attrs.map((a, i) => (
        <View key={a.id || i} style={s.rowItem}>
          <TextInput style={[s.input, { flex: 1 }]} value={a.label ?? ""} onChangeText={(v) => update(i, { label: v })} placeholder="Label (e.g. Housemaster)" placeholderTextColor={C.inkFaint} />
          <TextInput style={[s.input, { flex: 1 }]} value={a.value ?? ""} onChangeText={(v) => update(i, { value: v })} placeholder="Value" placeholderTextColor={C.inkFaint} />
          <Pressable onPress={() => remove(i)} hitSlop={6} style={s.removeBtn}><Text style={s.removeText}>✕</Text></Pressable>
        </View>
      ))}
      <Pressable onPress={add} style={s.ghostBtn}><Text style={s.ghostBtnText}>+ Add fact</Text></Pressable>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  panel: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 16, padding: 16, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  panelTitle: { ...D(700), fontSize: 20, color: C.ink, marginBottom: 4 },
  panelIntro: { color: C.inkMuted, fontSize: 13, lineHeight: 19, marginBottom: 14 },
  label: { color: C.inkFaint, fontSize: 11, letterSpacing: 1.5, fontWeight: "700", textTransform: "uppercase", marginBottom: 8 },
  subLabel: { color: C.inkFaint, fontSize: 11, letterSpacing: 1, fontWeight: "700", textTransform: "uppercase" },
  help: { color: C.inkFaint, fontSize: 13, lineHeight: 19 },

  input: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.ink },
  inputArea: { minHeight: 96, textAlignVertical: "top", ...S(400) },
  two: { flexDirection: "row", gap: 10 },
  rowItem: { flexDirection: "row", alignItems: "center", gap: 8 },

  primaryBtn: { backgroundColor: C.green, borderRadius: 999, paddingVertical: 11, paddingHorizontal: 20 },
  primaryBtnText: { color: ON_GREEN, fontWeight: "700", fontSize: 14 },
  goldBtn: { backgroundColor: C.goldBrand, borderRadius: 999, paddingVertical: 11, paddingHorizontal: 20 },
  goldBtnText: { color: C.cream, fontWeight: "700", fontSize: 14 },
  ghostBtn: { alignSelf: "flex-start", borderWidth: 1, borderColor: C.green, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 16 },
  ghostBtnText: { color: C.greenText, fontWeight: "700", fontSize: 13 },
  dim: { opacity: 0.5 },

  removeBtn: { width: 40, height: 40, borderWidth: 1, borderColor: C.sand, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  removeText: { color: C.inkMuted, fontSize: 15, fontWeight: "700" },
  removeLink: { color: C.clayText, fontSize: 13, fontWeight: "600" },

  saveRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 12, marginTop: 4 },
  saveDivider: { marginTop: 16, borderTopWidth: 1, borderTopColor: C.sand, paddingTop: 16 },
  saverMuted: { color: C.inkFaint, fontSize: 13 },
  saverOk: { color: C.tealText, fontSize: 13, fontWeight: "600" },
  saverErr: { color: C.clayText, fontSize: 13 },

  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  checkBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: C.sand, alignItems: "center", justifyContent: "center" },
  checkBoxOn: { backgroundColor: C.green, borderColor: C.green },
  checkTick: { color: ON_GREEN, fontWeight: "700", fontSize: 12 },
  checkLabel: { color: C.ink, fontSize: 14 },

  itemCard: { borderWidth: 1, borderColor: C.sand, borderRadius: 12, backgroundColor: C.paper, padding: 12 },
  sectionCard: { borderWidth: 1, borderColor: C.sand, borderRadius: 12, backgroundColor: C.paper, padding: 12 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  typeBadge: { backgroundColor: withAlpha(C.green, 0.08), borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  typeBadgeText: { color: C.greenText, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },
  moveGroup: { flexDirection: "row", gap: 6 },
  moveBtn: { width: 34, height: 34, borderWidth: 1, borderColor: C.sand, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  moveBtnText: { color: C.inkMuted, fontSize: 15, fontWeight: "700" },

  toneRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 10 },
  toneLabel: { color: C.inkMuted, fontSize: 12, marginRight: 2 },
  toneChip: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.cream, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  toneChipOn: { backgroundColor: C.green, borderColor: C.green },
  toneChipText: { color: C.inkMuted, fontSize: 12, fontWeight: "600", textTransform: "capitalize" },
  toneChipTextOn: { color: ON_GREEN },

  addWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  addChip: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  addChipText: { color: C.ink, fontSize: 13, fontWeight: "600" },
});
