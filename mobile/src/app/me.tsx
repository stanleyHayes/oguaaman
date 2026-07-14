import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Link, router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth";
import type { Member, MemberView, Organization, Place, SchoolStint, Connection, Ticket, Subscription, Promotion, Listing } from "@/lib/types";
import { C, serif, initials } from "@/theme";
import { Loading, ErrorView, Thumb } from "@/ui";
import { ImageField } from "@/components/image-field";

type SaveState = "idle" | "saving" | "saved" | "error";

export default function Me() {
  const { member, loading, signOut } = useAuth();
  if (loading) return <Loading />;
  if (!member) {
    return (
      <View style={s.gate}>
        <Text style={s.gateTitle}>Your profile</Text>
        <Text style={s.gateBody}>Sign in to build your profile, connect with classmates and neighbours, and rep your town.</Text>
        <Pressable onPress={() => router.replace("/signin")} style={s.primaryBtn}><Text style={s.primaryBtnText}>Sign in / create account</Text></Pressable>
      </View>
    );
  }
  return <MeLoaded slug={member.slug} onSignOut={signOut} />;
}

function fmtDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function roleLabel(role: string): string {
  if (role === "curator") return "Curator";
  if (role === "steward") return "Steward";
  return "Member";
}

// Event tickets bought via Paystack — the gate code is shown here and at the door.
function MyTickets() {
  const { data, error, loading } = useApi<Ticket[]>(() => api.myTickets(), "me:tickets");
  if (loading) return <Text style={s.help}>Loading your tickets…</Text>;
  if (error) return <Text style={s.help}>Couldn&apos;t load your tickets.</Text>;
  const list = data ?? [];
  if (list.length === 0) return <Text style={s.empty}>No tickets yet — see what&apos;s on under Events.</Text>;
  return (
    <View style={{ gap: 8 }}>
      {list.map((t) => (
        <Pressable key={t.id} onPress={() => router.push(`/events/${t.eventSlug}` as never)} style={s.listingRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.listingTitle} numberOfLines={1}>{t.eventTitle}</Text>
            <Text style={s.listingType}>{t.qty} × {t.tier} · {fmtDate(t.createdAt)}</Text>
          </View>
          {t.status === "success" && t.code ? (
            <View style={s.codeChip}><Text style={s.codeText}>{t.code}</Text></View>
          ) : (
            <View style={[s.statusChip, t.status === "pending" ? s.statusPending : s.statusBad]}>
              <Text style={[s.statusText, t.status === "pending" ? { color: C.goldText } : { color: C.maroon }]}>{t.status}</Text>
            </View>
          )}
        </Pressable>
      ))}
    </View>
  );
}

// Supporter subscriptions — each payment adds a month to the business.
function MySubscriptions() {
  const { data, error, loading } = useApi<Subscription[]>(() => api.mySubscriptions(), "me:subscriptions");
  if (loading) return <Text style={s.help}>Loading your subscriptions…</Text>;
  if (error) return <Text style={s.help}>Couldn&apos;t load your subscriptions.</Text>;
  const list = data ?? [];
  if (list.length === 0) return <Text style={s.empty}>No subscriptions yet.</Text>;
  return (
    <View style={{ gap: 8 }}>
      {list.map((sub) => {
        const subChip = sub.status === "pending" ? s.statusPending : s.statusBad;
        const subColor = sub.status === "pending" ? { color: C.goldText } : { color: C.maroon };
        return (
          <Pressable key={sub.id} onPress={() => router.push(`/business/${sub.listingSlug}` as never)} style={s.listingRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.listingTitle} numberOfLines={1}>{sub.listingTitle}</Text>
              <Text style={s.listingType}>
                GH₵ {(sub.amountPesewas / 100).toLocaleString("en-GH", { maximumFractionDigits: 2 })}{sub.periodEnd ? ` · until ${fmtDate(sub.periodEnd)}` : ""}
              </Text>
            </View>
            <View style={[s.statusChip, sub.status === "success" ? s.statusOk : subChip]}>
              <Text style={[s.statusText, sub.status === "success" ? { color: C.green } : subColor]}>{sub.status}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

// Paid featured placement on an owned listing — GH₵ 10/day, Paystack handoff
// with a manual verify step, mirroring the projects pledge flow.
function PromoteControl({ listing }: Readonly<{ listing: Listing }>) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [pendingRef, setPendingRef] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Promotion | null>(null);

  async function promote(days: number) {
    setBusy(true); setErr("");
    try {
      const r = await api.promoteListing(listing.id, days);
      if (r.simulated) {
        const p = await api.confirmPromotion(r.reference);
        setConfirmed(p);
        setOpen(false);
      } else {
        setPendingRef(r.reference);
        WebBrowser.openBrowserAsync(r.authorizationUrl).catch(() => setErr("Could not open the payment page."));
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start the payment.");
    } finally { setBusy(false); }
  }

  async function verify() {
    if (!pendingRef) return;
    setBusy(true); setErr("");
    try {
      const p = await api.confirmPromotion(pendingRef);
      setConfirmed(p);
      setPendingRef(null);
      setOpen(false);
    } catch {
      setErr("Payment not confirmed yet. Finish paying in the browser, then verify again.");
    } finally { setBusy(false); }
  }

  if (confirmed) {
    return <Text style={s.promoDone}>★ Featured {confirmed.days}d ✓</Text>;
  }
  if (pendingRef) {
    return (
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        <Pressable onPress={verify} disabled={busy} style={[s.promoBtn, busy && { opacity: 0.6 }]}>
          <Text style={s.promoBtnText}>{busy ? "Checking…" : "I've paid — verify"}</Text>
        </Pressable>
        {err !== "" && <Text style={s.promoErr}>{err}</Text>}
      </View>
    );
  }
  if (open) {
    return (
      <View style={{ alignItems: "flex-end", gap: 6 }}>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {[7, 14, 30].map((d) => (
            <Pressable key={d} onPress={() => promote(d)} disabled={busy} style={[s.promoDayBtn, busy && { opacity: 0.6 }]}>
              <Text style={s.promoDayText}>{d}d</Text>
              <Text style={s.promoDayPrice}>GH₵{d * 10}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={() => { setOpen(false); setErr(""); }} hitSlop={6} style={{ minHeight: 32, justifyContent: "center" }}>
          <Text style={s.promoCancel}>Cancel</Text>
        </Pressable>
        {err !== "" && <Text style={s.promoErr}>{err}</Text>}
      </View>
    );
  }
  return (
    <Pressable onPress={() => setOpen(true)} style={s.promoBtn}>
      <Text style={s.promoBtnText}>Promote</Text>
    </Pressable>
  );
}

function MeLoaded({ slug, onSignOut }: Readonly<{ slug: string; onSignOut: () => void }>) {
  const { data, error, loading } = useApi<MemberView>(() => api.member(slug), `me:${slug}`);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "Couldn't load your profile"} />;
  return <Profile view={data} onSignOut={onSignOut} />;
}

function Profile({ view, onSignOut }: Readonly<{ view: MemberView; onSignOut: () => void }>) {
  const m = view.member;
  const places = view.places ?? [];

  // Rep your quarter + Asafo (spec §8.6) — optimistic, like the web.
  const quarters = places.filter((p) => p.kind !== "asafo");
  const asafos = places.filter((p) => p.kind === "asafo");
  const [townId, setTownId] = useState(m.townId ?? "");
  const [asafoId, setAsafoId] = useState(m.asafoId ?? "");
  const quarter = quarters.find((p) => p.id === townId);
  const asafo = asafos.find((p) => p.id === asafoId);
  async function chooseQuarter(id: string) {
    const next = townId === id ? "" : id;
    setTownId(next);
    try { await api.setAffiliations({ townId: next, asafoId }); } catch { /* keep optimistic */ }
  }
  async function chooseAsafo(id: string) {
    const next = asafoId === id ? "" : id;
    setAsafoId(next);
    try { await api.setAffiliations({ townId, asafoId: next }); } catch { /* keep optimistic */ }
  }

  // Bumping this key refreshes "people you may know" after schooling changes.
  const [connKey, setConnKey] = useState(0);

  // Profile photo.
  const [photo, setPhoto] = useState(m.photoUrl ?? "");
  const [photoSave, setPhotoSave] = useState<SaveState>("idle");
  async function savePhoto(url: string) {
    setPhoto(url);
    setPhotoSave("saving");
    try {
      await api.setPhoto(url);
      setPhotoSave("saved");
    } catch { setPhotoSave("error"); }
  }

  return (
    <ScrollView style={{ backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 48 }}>
      {/* header */}
      <View style={s.header}>
        {photo
          ? <Thumb seed={m.slug} src={photo} label={m.initials || initials(m.displayName)} style={s.avatar} labelStyle={s.avatarText} />
          : <View style={s.avatar}><Text style={s.avatarText}>{m.initials || initials(m.displayName)}</Text></View>}
        <Text style={s.name}>{m.displayName}</Text>
        <Text style={s.role}>{roleLabel(m.role)}{m.joinedAt ? ` · joined ${fmtDate(m.joinedAt)}` : ""}</Text>
        <View style={s.chipRow}>
          {quarter ? <View style={s.darkChip}><Text style={s.darkChipText}>{quarter.name}</Text></View> : null}
          {asafo ? <View style={s.darkChip}><Text style={s.darkChipText}>{asafo.name}</Text></View> : null}
        </View>
      </View>

      <View style={s.body}>
        <Section title="Your photo" help="Put a face to your name. It shows on your profile and across the community.">
          <ImageField value={photo} onChange={savePhoto} />
          {photoSave === "saving" && <Text style={[s.help, { marginTop: 8 }]}>Saving…</Text>}
          {photoSave === "saved" && <Text style={[s.savedNote, { marginTop: 8 }]}>Saved ✓</Text>}
          {photoSave === "error" && <Text style={[s.errNote, { marginTop: 8 }]}>Couldn&apos;t save your photo</Text>}
        </Section>

        <Section title="Rep your town" help={"Wear your community pride — your quarter and your Asafo company." + (quarter ? ` You rep ${quarter.name}.` : "")}>
          <Text style={s.subLabel}>Quarter</Text>
          <RepChips places={quarters} selectedId={townId} variant="green" onChoose={chooseQuarter} />
          <Text style={[s.subLabel, { marginTop: 14 }]}>Asafo company</Text>
          <RepChips places={asafos} selectedId={asafoId} variant="clay" onChoose={chooseAsafo} />
        </Section>

        <Section title="Your birthday" help="If you turn this on, your followers get a gentle note on your day. Off by default — it's yours to choose.">
          <BirthdayCard member={m} />
        </Section>

        <Section title="Oguaa abroad" help="A son or daughter of the Castle living away from home? Add yourself to the diaspora — the bridge for homecomings and giving back. Off by default.">
          <DiasporaCard member={m} />
        </Section>

        <Section title="Your schooling" help="Add the schools you attended and the years you were there. Classmates who overlapped with you appear below.">
          <SchoolingEditor member={m} schools={view.schools ?? []} onSaved={() => setConnKey((k) => k + 1)} />
        </Section>

        <Section title="People you may know" help="Classmates, neighbours from your quarter, and members of your Asafo.">
          <PeopleYouMayKnow refreshKey={connKey} />
        </Section>

        <Section title="My tickets" help="Your event tickets and gate codes. Show the code at the entrance.">
          <MyTickets />
        </Section>

        <Section title="My subscriptions" help="Your Supporter subscriptions — each payment adds a month to the business.">
          <MySubscriptions />
        </Section>

        <Section title="Your listings" help="Everything you've contributed, with its review status. Promote an approved listing to feature it on the front pages — GH₵ 10 per day.">
          <MyListings listings={view.listings ?? []} />
        </Section>

        <Section title="Account">
          <Pressable onPress={() => router.push("/notifications")} style={s.linkRow}><Text style={s.linkRowText}>Notifications</Text><Text style={s.chevron}>›</Text></Pressable>
          <Pressable onPress={() => router.push("/submit")} style={s.linkRow}><Text style={s.linkRowText}>Contribute a listing</Text><Text style={s.chevron}>›</Text></Pressable>
          <Pressable onPress={() => router.push(`/members/${m.slug}`)} style={s.linkRow}><Text style={s.linkRowText}>View my public profile</Text><Text style={s.chevron}>›</Text></Pressable>
          <Pressable onPress={onSignOut} style={s.signOut}><Text style={s.signOutText}>Sign out</Text></Pressable>
        </Section>
      </View>
    </ScrollView>
  );
}

// Dashboard section card — serif title + optional help text wrapping a body slot.
function Section({ title, help, children }: Readonly<{ title: string; help?: string; children: React.ReactNode }>) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {help ? <Text style={s.help}>{help}</Text> : <View style={{ height: 8 }} />}
      {children}
    </View>
  );
}

// Shared chip row for "rep your quarter" / "rep your Asafo" (spec §8.6).
function RepChips({ places, selectedId, variant, onChoose }: Readonly<{ places: Place[]; selectedId: string; variant: "green" | "clay"; onChoose: (id: string) => void }>) {
  return (
    <View style={s.chipWrap}>
      {places.map((p) => (
        <Pressable key={p.id} onPress={() => onChoose(p.id)} style={[s.repChip, p.id === selectedId && (variant === "green" ? s.repChipOnGreen : s.repChipOnClay)]}>
          {p.colors?.[0] ? <View style={[s.asafoDot, { backgroundColor: p.colors[0] }]} /> : null}
          <Text style={[s.repChipText, p.id === selectedId && s.repChipTextOn]}>{p.name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// Birthday + follower-broadcast opt-in (spec §8.11).
function BirthdayCard({ member: m }: Readonly<{ member: Member }>) {
  const [birthday, setBirthday] = useState(m.birthday ? m.birthday.slice(0, 10) : "");
  const [broadcast, setBroadcast] = useState(!!m.broadcastBirthday);
  const [bdaySave, setBdaySave] = useState<SaveState>("idle");
  async function saveBirthday() {
    setBdaySave("saving");
    try {
      await api.setBirthday({ birthday: birthday.trim(), broadcast });
      setBdaySave("saved");
    } catch { setBdaySave("error"); }
  }
  return (
    <>
      <TextInput
        style={s.diaInput}
        value={birthday}
        onChangeText={(v) => { setBirthday(v); setBdaySave("idle"); }}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={C.inkFaint}
        autoCapitalize="none"
      />
      <View style={[s.diaRow, { marginTop: 10 }]}>
        <Text style={s.diaLabel}>Let my followers know</Text>
        <Switch value={broadcast} onValueChange={(v) => { setBroadcast(v); setBdaySave("idle"); }} trackColor={{ true: C.green, false: C.sand }} thumbColor={C.cream} />
      </View>
      <View style={s.saveRow}>
        <Pressable onPress={saveBirthday} disabled={bdaySave === "saving"} style={[s.bdaySaveBtn, bdaySave === "saving" && { opacity: 0.6 }]}>
          <Text style={s.saveBtnText}>{bdaySave === "saving" ? "Saving…" : "Save"}</Text>
        </Pressable>
        {bdaySave === "saved" && <Text style={s.savedNote}>Saved ✓</Text>}
        {bdaySave === "error" && <Text style={s.errNote}>Add a valid date first</Text>}
      </View>
    </>
  );
}

// Diaspora opt-in (Phase 2 foundation).
function DiasporaCard({ member: m }: Readonly<{ member: Member }>) {
  const [abroad, setAbroad] = useState(!!m.diaspora?.abroad);
  const [city, setCity] = useState(m.diaspora?.city ?? "");
  const [country, setCountry] = useState(m.diaspora?.country ?? "");
  const [diaSave, setDiaSave] = useState<SaveState>("idle");

  async function saveDiaspora() {
    setDiaSave("saving");
    try {
      await api.setDiaspora({ abroad, city: city.trim(), country: country.trim() });
      setDiaSave("saved");
    } catch { setDiaSave("error"); }
  }

  return (
    <>
      <View style={s.diaRow}>
        <Text style={s.diaLabel}>I live abroad / outside Cape Coast</Text>
        <Switch value={abroad} onValueChange={(v) => { setAbroad(v); setDiaSave("idle"); }} trackColor={{ true: C.teal, false: C.sand }} thumbColor={C.cream} />
      </View>
      {abroad && (
        <View style={{ gap: 8, marginTop: 10 }}>
          <TextInput style={s.diaInput} value={city} onChangeText={(v) => { setCity(v); setDiaSave("idle"); }} placeholder="City (e.g. London)" placeholderTextColor={C.inkFaint} />
          <TextInput style={s.diaInput} value={country} onChangeText={(v) => { setCountry(v); setDiaSave("idle"); }} placeholder="Country (e.g. United Kingdom)" placeholderTextColor={C.inkFaint} />
        </View>
      )}
      <View style={s.saveRow}>
        <Pressable onPress={saveDiaspora} disabled={diaSave === "saving"} style={[s.diaSaveBtn, diaSave === "saving" && { opacity: 0.6 }]}>
          <Text style={s.saveBtnText}>{diaSave === "saving" ? "Saving…" : "Save"}</Text>
        </Pressable>
        {diaSave === "saved" && <Text style={s.savedNote}>Saved ✓</Text>}
        {diaSave === "error" && <Text style={s.errNote}>Couldn&apos;t save</Text>}
      </View>
    </>
  );
}

// Schooling editor — stints drive the "people you may know" suggestions,
// so onSaved bumps the refresh key in the parent.
function SchoolingEditor({ member: m, schools, onSaved }: Readonly<{ member: Member; schools: Organization[]; onSaved: () => void }>) {
  const [stints, setStints] = useState<SchoolStint[]>(m.schooling ?? []);
  const [save, setSave] = useState<SaveState>("idle");
  const schoolName = (id: string) => schools.find((x) => x.id === id)?.name ?? id;
  const available = schools.filter((sc) => !stints.some((st) => st.schoolId === sc.id));

  function setYear(i: number, key: "fromYear" | "toYear", val: string) {
    const n = val ? Number.parseInt(val, 10) : undefined;
    setStints((cur) => cur.map((st, idx) => (idx === i ? { ...st, [key]: Number.isFinite(n) ? n : undefined } : st)));
    setSave("idle");
  }
  function add(schoolId: string) { setStints((cur) => [...cur, { schoolId }]); setSave("idle"); }
  function remove(i: number) { setStints((cur) => cur.filter((_, idx) => idx !== i)); setSave("idle"); }

  async function persist() {
    setSave("saving");
    try {
      await api.setSchooling({ schooling: stints.filter((st) => st.schoolId) });
      setSave("saved");
      onSaved();
    } catch { setSave("error"); }
  }

  return (
    <>
      {stints.map((st, i) => (
        <View key={`${st.schoolId}-${i}`} style={s.stint}>
          <View style={{ flex: 1 }}>
            <Text style={s.stintName}>{schoolName(st.schoolId)}</Text>
            <View style={s.yearRow}>
              <TextInput style={s.yearInput} value={st.fromYear ? String(st.fromYear) : ""} onChangeText={(v) => setYear(i, "fromYear", v)} placeholder="From" placeholderTextColor={C.inkFaint} keyboardType="number-pad" maxLength={4} />
              <Text style={s.dash}>–</Text>
              <TextInput style={s.yearInput} value={st.toYear ? String(st.toYear) : ""} onChangeText={(v) => setYear(i, "toYear", v)} placeholder="To" placeholderTextColor={C.inkFaint} keyboardType="number-pad" maxLength={4} />
            </View>
          </View>
          <Pressable onPress={() => remove(i)} hitSlop={8} style={s.removeBtn}><Text style={s.removeText}>✕</Text></Pressable>
        </View>
      ))}

      {available.length > 0 && (
        <View style={s.addWrap}>
          <Text style={s.addLabel}>Add a school</Text>
          <View style={s.chipWrap}>
            {available.map((sc) => (
              <Pressable key={sc.id} onPress={() => add(sc.id)} style={s.addChip}><Text style={s.addChipText}>+ {sc.name}</Text></Pressable>
            ))}
          </View>
        </View>
      )}

      {stints.length > 0 && (
        <View style={s.saveRow}>
          <Pressable onPress={persist} disabled={save === "saving"} style={[s.saveBtn, save === "saving" && { opacity: 0.6 }]}>
            <Text style={s.saveBtnText}>{save === "saving" ? "Saving…" : "Save schooling"}</Text>
          </Pressable>
          {save === "saved" && <Text style={s.savedNote}>Saved ✓</Text>}
          {save === "error" && <Text style={s.errNote}>Couldn&apos;t save</Text>}
        </View>
      )}
    </>
  );
}

const LISTING_HREF: Record<string, string> = {
  artist: "/music/", memorial: "/memoriam/", business: "/business/", person: "/people/", project: "/projects/",
};

// Everything the member has contributed, with review status + promote control.
function MyListings({ listings }: Readonly<{ listings: Listing[] }>) {
  if (listings.length === 0) {
    return (
      <Pressable onPress={() => router.push("/submit")} style={s.linkRow}>
        <Text style={s.linkRowText}>Nothing yet — add your first</Text><Text style={s.chevron}>›</Text>
      </Pressable>
    );
  }
  return (
    <View style={{ gap: 8 }}>
      {listings.map((l) => <ListingRow key={l.id} listing={l} />)}
      <Pressable onPress={() => router.push("/submit")} style={s.addListingBtn}>
        <Text style={s.addListingText}>+ Add a listing</Text>
      </Pressable>
    </View>
  );
}

function ListingRow({ listing: l }: Readonly<{ listing: Listing }>) {
  const base = l.status === "approved" ? LISTING_HREF[l.type] : undefined;
  const href = base ? `${base}${l.slug}` : null;
  const inner = (
    <View style={s.listingRow}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.listingTitle} numberOfLines={1}>{l.title}</Text>
        <Text style={s.listingType}>{l.type}</Text>
      </View>
      <StatusChip status={l.status} />
    </View>
  );
  return (
    <View style={s.listingWrap}>
      {href ? (
        <Pressable onPress={() => router.push(href as never)}>{inner}</Pressable>
      ) : (
        <View>{inner}</View>
      )}
      {l.status === "approved" && (
        <View style={s.promoSlot}>
          {l.featuredUntil && l.featuredUntil > new Date().toISOString() ? (
            <Text style={s.featuredNote}>★ Featured until {fmtDate(l.featuredUntil)}</Text>
          ) : null}
          <PromoteControl listing={l} />
        </View>
      )}
    </View>
  );
}

function StatusChip({ status }: Readonly<{ status: string }>) {
  const chip: Record<string, { bg: object; color: string }> = {
    approved: { bg: s.statusOk, color: C.green },
    pending: { bg: s.statusPending, color: C.goldText },
    rejected: { bg: s.statusBad, color: C.maroon },
  };
  const v = chip[status] ?? { bg: s.statusMuted, color: C.inkMuted };
  return (
    <View style={[s.statusChip, v.bg]}>
      <Text style={[s.statusText, { color: v.color }]}>{status}</Text>
    </View>
  );
}

function PeopleYouMayKnow({ refreshKey }: Readonly<{ refreshKey: number }>) {
  const { data, error, loading } = useApi<Connection[]>(() => api.connections(), `connections:${refreshKey}`);
  if (loading) return <Text style={s.help}>Finding your people…</Text>;
  if (error) return <Text style={s.help}>Couldn&apos;t load suggestions.</Text>;
  const list = data ?? [];
  if (list.length === 0) {
    return <Text style={s.empty}>No suggestions yet — add your schooling, quarter and Asafo and we&apos;ll connect you with classmates and neighbours.</Text>;
  }
  return (
    <View style={{ gap: 10 }}>
      {list.map((c) => (
        <View key={c.member.id} style={s.connCard}>
          <Link href={`/members/${c.member.slug}`} asChild>
            <Pressable style={s.connAvatar}>
              {c.member.photoUrl
                ? <Thumb seed={c.member.slug} src={c.member.photoUrl} label={c.member.initials || initials(c.member.displayName)} style={s.connAvatarBox} labelStyle={s.connAvatarText} />
                : <View style={s.connAvatarBox}><Text style={s.connAvatarText}>{c.member.initials || initials(c.member.displayName)}</Text></View>}
            </Pressable>
          </Link>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Link href={`/members/${c.member.slug}`} asChild>
              <Pressable><Text style={s.connName}>{c.member.displayName}</Text></Pressable>
            </Link>
            <View style={s.reasonWrap}>
              {c.reasons.map((r) => <View key={r} style={s.reason}><Text style={s.reasonText}>{r}</Text></View>)}
            </View>
          </View>
          <FollowChip slug={c.member.slug} />
        </View>
      ))}
    </View>
  );
}

function FollowChip({ slug }: Readonly<{ slug: string }>) {
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    api.memberFollowState(slug).then((r) => { if (alive) setFollowing(r.following); }).catch(() => {});
    return () => { alive = false; };
  }, [slug]);
  async function toggle() {
    if (busy) return;
    setBusy(true);
    const next = !following;
    setFollowing(next);
    try { const r = next ? await api.followMember(slug) : await api.unfollowMember(slug); setFollowing(r.following); }
    catch { setFollowing(!next); }
    finally { setBusy(false); }
  }
  return (
    <Pressable onPress={toggle} disabled={busy} style={[s.followChip, following && s.followChipOn]}>
      <Text style={[s.followChipText, following && s.followChipTextOn]}>{following ? "Following" : "Follow"}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  gate: { flex: 1, backgroundColor: C.paper, padding: 28, justifyContent: "center", alignItems: "center" },
  gateTitle: { fontFamily: serif, fontSize: 26, fontWeight: "600", color: C.ink, textAlign: "center" },
  gateBody: { color: C.inkMuted, fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 10, maxWidth: 320 },
  primaryBtn: { backgroundColor: C.green, borderRadius: 999, paddingVertical: 13, paddingHorizontal: 24, marginTop: 18 },
  primaryBtnText: { color: C.cream, fontWeight: "700", fontSize: 15 },

  header: { backgroundColor: C.green, alignItems: "center", paddingVertical: 26, paddingHorizontal: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: C.greenSlate, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: C.goldBrand },
  avatarText: { color: C.cream, fontFamily: serif, fontSize: 30, fontWeight: "700" },
  name: { fontFamily: serif, fontSize: 26, fontWeight: "700", color: C.cream, marginTop: 12 },
  role: { color: C.gold, fontSize: 12, letterSpacing: 1, marginTop: 2, textTransform: "uppercase" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12, justifyContent: "center" },
  darkChip: { borderWidth: 1, borderColor: "rgba(246,241,231,0.3)", backgroundColor: "rgba(246,241,231,0.1)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  darkChipText: { color: C.cream, fontSize: 12 },

  body: { padding: 16, gap: 16 },
  section: { backgroundColor: C.cream, borderWidth: 1, borderColor: C.sand, borderRadius: 16, padding: 16, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  sectionTitle: { fontFamily: serif, fontSize: 20, fontWeight: "700", color: C.ink, marginBottom: 4 },
  subLabel: { color: C.inkFaint, fontSize: 11, letterSpacing: 1.5, fontWeight: "700", textTransform: "uppercase", marginBottom: 8 },
  kicker: { color: C.inkFaint, fontSize: 11, letterSpacing: 2, fontWeight: "700", marginBottom: 6 },
  help: { color: C.inkMuted, fontSize: 13, lineHeight: 19, marginBottom: 12 },
  empty: { color: C.inkFaint, fontSize: 13, lineHeight: 19, fontStyle: "italic" },

  stint: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.paper, borderWidth: 1, borderColor: C.sand, borderRadius: 12, padding: 12, marginBottom: 10 },
  stintName: { fontFamily: serif, fontSize: 16, fontWeight: "700", color: C.ink },
  yearRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  yearInput: { width: 78, borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, color: C.ink, fontSize: 14 },
  dash: { color: C.inkFaint },
  removeBtn: { padding: 6 },
  removeText: { color: C.clayText, fontSize: 16, fontWeight: "700" },

  addWrap: { marginTop: 2 },
  addLabel: { color: C.inkFaint, fontSize: 12, fontWeight: "600", marginBottom: 8 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  addChip: { borderWidth: 1, borderStyle: "dashed", borderColor: C.goldBrand, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  addChipText: { color: C.goldText, fontSize: 13, fontWeight: "600" },

  diaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, backgroundColor: C.paper, borderWidth: 1, borderColor: C.sand, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  diaLabel: { color: C.ink, fontSize: 14, flex: 1 },
  diaInput: { borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: C.ink, fontSize: 14 },
  diaSaveBtn: { backgroundColor: C.teal, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 20 },

  repChip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  repChipOnGreen: { backgroundColor: C.green, borderColor: C.green },
  repChipOnClay: { backgroundColor: C.clay, borderColor: C.clay },
  repChipText: { color: C.inkMuted, fontSize: 13, fontWeight: "600" },
  repChipTextOn: { color: C.cream },
  asafoDot: { width: 9, height: 9, borderRadius: 5 },
  bdaySaveBtn: { backgroundColor: C.green, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 20 },

  listingRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.paper, borderWidth: 1, borderColor: C.sand, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11 },
  listingWrap: { gap: 6 },
  promoSlot: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 10, paddingRight: 4 },
  promoBtn: { borderWidth: 1, borderColor: C.goldBrand, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, minHeight: 36, justifyContent: "center" },
  promoBtnText: { color: C.goldText, fontSize: 12, fontWeight: "700" },
  promoDayBtn: { borderWidth: 1, borderColor: C.green, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, alignItems: "center", minWidth: 52, minHeight: 44, justifyContent: "center" },
  promoDayText: { color: C.green, fontSize: 13, fontWeight: "700" },
  promoDayPrice: { color: C.inkFaint, fontSize: 10, marginTop: 1 },
  promoCancel: { color: C.inkFaint, fontSize: 12, fontWeight: "600" },
  promoErr: { color: C.clayText, fontSize: 11, maxWidth: 220, textAlign: "right" },
  promoDone: { color: C.goldText, fontSize: 12, fontWeight: "700" },
  featuredNote: { color: C.goldText, fontSize: 12, fontWeight: "700", flex: 1 },
  codeChip: { backgroundColor: "rgba(18,63,45,0.08)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  codeText: { color: C.green, fontSize: 15, fontWeight: "700", letterSpacing: 2 },
  listingTitle: { color: C.ink, fontSize: 14, fontWeight: "600" },
  listingType: { color: C.inkFaint, fontSize: 11, textTransform: "capitalize", marginTop: 1 },
  statusChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusOk: { backgroundColor: "rgba(18,63,45,0.08)" },
  statusPending: { backgroundColor: "rgba(199,162,74,0.16)" },
  statusBad: { backgroundColor: "rgba(124,45,45,0.08)" },
  statusMuted: { backgroundColor: C.sand },
  statusText: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
  addListingBtn: { borderWidth: 1, borderStyle: "dashed", borderColor: C.goldBrand, borderRadius: 999, paddingVertical: 10, alignItems: "center", marginTop: 2 },
  addListingText: { color: C.goldText, fontSize: 13, fontWeight: "700" },

  saveRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14 },
  saveBtn: { backgroundColor: C.maroon, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 20 },
  saveBtnText: { color: C.cream, fontWeight: "700", fontSize: 14 },
  savedNote: { color: C.tealText, fontSize: 13, fontWeight: "600" },
  errNote: { color: C.clayText, fontSize: 13 },

  connCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.paper, borderWidth: 1, borderColor: C.sand, borderRadius: 12, padding: 12 },
  connAvatar: { borderRadius: 22 },
  connAvatarBox: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.green, alignItems: "center", justifyContent: "center" },
  connAvatarText: { color: C.cream, fontFamily: serif, fontSize: 16, fontWeight: "700" },
  connName: { fontFamily: serif, fontSize: 17, fontWeight: "700", color: C.ink },
  reasonWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  reason: { backgroundColor: C.sand, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  reasonText: { color: C.inkMuted, fontSize: 11, fontWeight: "500" },
  followChip: { borderWidth: 1, borderColor: C.green, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  followChipOn: { backgroundColor: C.green },
  followChipText: { color: C.green, fontWeight: "700", fontSize: 13 },
  followChipTextOn: { color: C.cream },

  linkRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: C.paper, borderWidth: 1, borderColor: C.sand, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 8 },
  linkRowText: { color: C.ink, fontSize: 15, fontWeight: "600" },
  chevron: { color: C.inkFaint, fontSize: 20, fontWeight: "700" },
  signOut: { borderWidth: 1, borderColor: C.sand, borderRadius: 999, paddingVertical: 12, alignItems: "center", marginTop: 8 },
  signOutText: { color: C.clayText, fontWeight: "700" },
});
