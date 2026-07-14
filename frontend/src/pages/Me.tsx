import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import type { MemberView, Listing, ListingStatus, Ticket, Subscription, Promotion } from "@/lib/types";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Container, CTA as Cta, Avatar } from "@/components/ui";
import { ImageUpload } from "@/components/image-upload";
import { SchoolingEditor, PeopleYouMayKnow } from "@/components/connections";
import { formatDate, initials } from "@/lib/format";
import { Thumb } from "@/components/cards";
import { ProfileSkeleton } from "@/components/skeleton";

const TYPE_LABELS: Record<string, string> = {
  business: "Business", artist: "Artist", person: "Person", memory: "Memory", event: "Event", opportunity: "Opportunity", memorial: "Memorial", project: "Project",
};
const STATUS_STYLE: Record<ListingStatus, string> = {
  approved: "bg-green/[0.08] text-green",
  pending: "bg-gold/[0.14] text-gold-text",
  rejected: "bg-maroon-900/[0.08] text-maroon-900",
  draft: "bg-sand text-ink-muted",
  unpublished: "bg-sand text-ink-muted",
};

function linkFor(l: Listing): string | null {
  if (l.status !== "approved") return null;
  if (l.type === "artist") return `/music/${l.slug}`;
  if (l.type === "business") return `/business/${l.slug}`;
  if (l.type === "memorial") return `/memoriam/${l.slug}`;
  if (l.type === "project") return `/projects/${l.slug}`;
  return null;
}

function roleLabel(role: string): string {
  if (role === "curator") return "Curator";
  if (role === "steward") return "Steward";
  return "Member";
}

function subStatusStyle(status: string): string {
  if (status === "success") return "bg-green/[0.08] text-green";
  if (status === "pending") return "bg-gold/[0.14] text-gold-text";
  return "bg-maroon-900/[0.08] text-maroon-900";
}

/** A dashboard card: title + lede header, optional header action, body slot. */
function Panel({ title, lede, action, children }: Readonly<{ title: string; lede?: ReactNode; action?: ReactNode; children: ReactNode }>) {
  return (
    <section className="rounded-[var(--radius-card)] border border-sand bg-cream p-5 shadow-[var(--shadow-card)] sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
          {lede && <p className="mt-1 text-sm leading-relaxed text-ink-muted">{lede}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

const QUICK_ACTIONS = [
  { to: "/submit", label: "Add a listing", desc: "Business, artist, event…", glyph: "＋" },
  { to: "/safety/report", label: "Report an incident", desc: "Keep the town safe", glyph: "⚑" },
  { to: "/lost-found/new", label: "Post lost & found", desc: "Help a neighbour", glyph: "⌕" },
  { to: "/events", label: "What's on", desc: "The town calendar", glyph: "◷" },
] as const;

function QuickAction({ to, label, desc, glyph }: Readonly<{ to: string; label: string; desc: string; glyph: string }>) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-[var(--radius-card)] border border-sand bg-cream p-4 shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:border-gold-border/50 hover:shadow-[var(--shadow-lift)]"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green/[0.08] font-display text-lg text-green transition-colors group-hover:bg-gold/20 group-hover:text-gold-text" aria-hidden>{glyph}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{label}</span>
        <span className="block truncate text-xs text-ink-faint">{desc}</span>
      </span>
    </Link>
  );
}

export function Component() {
  const { member, loading } = useAuth();
  const [view, setView] = useState<MemberView | null>(null);
  // Profile photo (seeded from the loaded profile).
  const [photo, setPhoto] = useState("");
  const [photoState, setPhotoState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  // Editable affiliations + birthday (seeded from the loaded profile).
  const [townId, setTownId] = useState("");
  const [asafoId, setAsafoId] = useState("");
  const [birthday, setBirthday] = useState("");
  const [broadcast, setBroadcast] = useState(false);
  const [bdayState, setBdayState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  // Diaspora opt-in (Phase 2 foundation).
  const [abroad, setAbroad] = useState(false);
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [diaState, setDiaState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  // Bumped after saving schooling so "people you may know" refetches.
  const [connKey, setConnKey] = useState(0);
  // Event tickets (Phase 6).
  const [tickets, setTickets] = useState<Ticket[]>([]);
  // Business subscriptions (Phase 7).
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  // Paid promotions (Phase 8): ?promo_ref= confirm + inline day picker.
  const [params, setParams] = useSearchParams();
  const [promoFor, setPromoFor] = useState<string | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoConfirmed, setPromoConfirmed] = useState<Promotion | null>(null);
  const promoConfirmedRef = useRef(false);
  // Bumped after a promotion confirms so the owned listings refetch.
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!member) return;
    api.myTickets().then(setTickets).catch(() => setTickets([]));
    api.mySubscriptions().then(setSubscriptions).catch(() => setSubscriptions([]));
  }, [member]);

  // Returning from Paystack with ?promo_ref=… — confirm once, then refresh.
  useEffect(() => {
    const ref = params.get("promo_ref");
    if (!ref || promoConfirmedRef.current) return;
    promoConfirmedRef.current = true;
    api.confirmPromotion(ref)
      .then((p) => {
        setPromoConfirmed(p);
        setParams({}, { replace: true });
        setRefreshKey((k) => k + 1);
      })
      .catch(() => setPromoError("We couldn't confirm that payment. If you were charged, it will reconcile shortly."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!member) return;
    let alive = true;
    api.member(member.slug)
      .then((v) => {
        if (!alive) return;
        setView(v);
        setPhoto(v.member.photoUrl ?? "");
        setTownId(v.member.townId ?? "");
        setAsafoId(v.member.asafoId ?? "");
        setBirthday(v.member.birthday ?? "");
        setBroadcast(!!v.member.broadcastBirthday);
        setAbroad(!!v.member.diaspora?.abroad);
        setCity(v.member.diaspora?.city ?? "");
        setCountry(v.member.diaspora?.country ?? "");
      })
      .catch(() => setView(null));
    return () => { alive = false; };
  }, [member, refreshKey]);

  if (loading) return <Container className="py-16"><ProfileSkeleton /></Container>;
  if (!member) return <Navigate to="/signin" state={{ from: "/me" }} replace />;
  if (!view) return <Container className="py-16"><ProfileSkeleton /></Container>;

  const { member: me, listings, places, schools } = view;
  const quarters = places.filter((p) => p.kind !== "asafo");
  const asafos = places.filter((p) => p.kind === "asafo");
  const town = quarters.find((p) => p.id === townId);
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
  async function savePhoto(url: string) {
    setPhoto(url);
    setPhotoState("saving");
    try {
      await api.setPhoto(url);
      setPhotoState("saved");
    } catch {
      setPhotoState("error");
    }
  }
  async function saveBirthday() {
    setBdayState("saving");
    try {
      await api.setBirthday({ birthday, broadcast });
      setBdayState("saved");
    } catch {
      setBdayState("error");
    }
  }
  async function saveDiaspora() {
    setDiaState("saving");
    try {
      await api.setDiaspora({ abroad, city: city.trim(), country: country.trim() });
      setDiaState("saved");
    } catch {
      setDiaState("error");
    }
  }
  async function promote(l: Listing, days: number) {
    setPromoError(null);
    setPromoBusy(true);
    try {
      const r = await api.promoteListing(l.id, days);
      window.location.assign(r.authorizationUrl); // off to Paystack (or straight back, in dev simulation)
    } catch (e) {
      setPromoError(e instanceof Error ? e.message : "Could not start the payment.");
      setPromoBusy(false);
    }
  }

  return (
    <>
      <section className="on-dark relative overflow-hidden bg-green text-cream">
        <div className="absolute inset-0" style={{ background: "radial-gradient(120% 140% at 85% -20%, #1B5A3F 0%, #123F2D 50%, #0C2C1F 100%)" }} aria-hidden />
        <div className="bg-dotgrid absolute inset-0 opacity-50" aria-hidden />
        <Container size="wide" className="relative flex flex-col gap-5 py-12 sm:flex-row sm:items-center">
          <Avatar initials={me.initials} photoUrl={photo} size={80} className="border-2 border-gold/50 shadow-lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-gold/20 px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-gold">{roleLabel(me.role)}</span>
              <span className="text-xs text-cream/60">Joined {formatDate(me.joinedAt)}</span>
            </div>
            <h1 className="mt-2 font-display text-4xl font-semibold text-cream sm:text-5xl">{me.displayName}</h1>
            {me.bio && <p className="mt-2 max-w-xl text-cream/80">{me.bio}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {town && <span className="rounded-full border border-cream/25 bg-cream/10 px-3 py-1 text-xs text-cream/90">{town.name}</span>}
              {asafo && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-cream/25 bg-cream/10 px-3 py-1 text-xs text-cream/90">
                  {asafo.colors?.[0] && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: asafo.colors[0] }} aria-hidden />}
                  {asafo.name}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 text-xs text-cream/60">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M5 13l4 4L19 7" /></svg>
                Phone verified
              </span>
            </div>
          </div>
          <div className="sm:ml-auto">
            <Cta to={`/members/${me.slug}`} variant="outline-dark">View public profile</Cta>
          </div>
        </Container>
      </section>

      <Container size="wide" className="py-8 sm:py-10">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_ACTIONS.map((a) => <QuickAction key={a.to} {...a} />)}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.7fr_1fr] lg:items-start">
          {/* Main column — activity */}
          <div className="space-y-6">
            <Panel
              title="Your listings"
              lede="Everything you've contributed, with its review status. Promote an approved listing to feature it on the front pages — GH₵ 10 per day."
              action={<Cta to="/submit" variant="outline" className="px-4 py-2 text-xs">+ Add</Cta>}
            >
              {promoConfirmed && (
                <p className="mb-4 rounded-lg bg-green/[0.08] px-4 py-3 text-sm font-medium text-green">
                  Payment confirmed — &ldquo;{promoConfirmed.listingTitle}&rdquo; is now featured for {promoConfirmed.days} days. ✓
                </p>
              )}
              {promoError && (
                <p className="mb-4 rounded-lg bg-maroon-900/[0.08] px-4 py-3 text-sm font-medium text-maroon-900">{promoError}</p>
              )}
              <ul className="divide-y divide-sand">
                {listings.map((l) => {
                  const href = linkFor(l);
                  const featuredUntil = l.featuredUntil && l.featuredUntil > new Date().toISOString() ? l.featuredUntil : null;
                  const inner = (
                    <div className="flex items-center gap-3 py-3.5">
                      <Thumb seed={l.slug} label={initials(l.title)} src={l.coverImageUrl} rounded="rounded-lg" className="h-11 w-11 shrink-0" coverWidth={96} />
                      <div className="min-w-0 flex-1"><p className="truncate font-medium text-ink">{l.title}</p><p className="text-xs text-ink-faint">{TYPE_LABELS[l.type]}</p></div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${STATUS_STYLE[l.status]}`}>{l.status}</span>
                    </div>
                  );
                  return (
                    <li key={l.id}>
                      <div className="flex items-center gap-2">
                        {href ? <Link to={href} className="block min-w-0 flex-1 rounded-lg transition-colors hover:bg-paper">{inner}</Link> : <div className="min-w-0 flex-1">{inner}</div>}
                        {l.status === "approved" && featuredUntil && (
                          <span className="hidden shrink-0 rounded-full bg-gold/[0.14] px-2.5 py-1 text-xs font-semibold text-gold-text sm:inline">★ Featured until {formatDate(featuredUntil)}</span>
                        )}
                        {l.status === "approved" && (promoFor === l.id ? (
                          <div className="flex shrink-0 items-center gap-1.5">
                            {[7, 14, 30].map((d) => (
                              <button key={d} type="button" onClick={() => promote(l, d)} disabled={promoBusy}
                                className="rounded-full border border-green px-2.5 py-1 text-xs font-semibold text-green transition-colors hover:bg-green hover:text-cream disabled:opacity-60">
                                {d}d · GH₵{d * 10}
                              </button>
                            ))}
                            <button type="button" onClick={() => setPromoFor(null)} className="text-xs text-ink-faint hover:text-ink">Cancel</button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => { setPromoFor(l.id); setPromoError(null); }}
                            className="shrink-0 rounded-full border border-gold-brand px-3 py-1 text-xs font-semibold text-gold-text transition-colors hover:bg-gold-brand hover:text-green-900">Promote</button>
                        ))}
                      </div>
                    </li>
                  );
                })}
                {listings.length === 0 && <li className="py-8 text-center text-sm text-ink-muted">Nothing yet. <Link to="/submit" className="font-semibold text-green">Add your first →</Link></li>}
              </ul>
            </Panel>

            <Panel title="My tickets" lede="Your event tickets and gate codes. Show the code at the entrance.">
              <ul className="divide-y divide-sand">
                {tickets.map((t) => (
                  <li key={t.id}>
                    <Link to={`/events/${t.eventSlug}`} className="flex items-center gap-3 py-3.5 transition-colors hover:bg-paper">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-ink">{t.eventTitle}</p>
                        <p className="text-xs text-ink-faint">{t.qty} × {t.tier} · {formatDate(t.createdAt)}</p>
                      </div>
                      {t.status === "success" && t.code ? (
                        <span className="shrink-0 rounded-md bg-green/[0.08] px-2.5 py-1 font-mono text-sm font-bold tracking-widest text-green">{t.code}</span>
                      ) : (
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${t.status === "pending" ? "bg-gold/[0.14] text-gold-text" : "bg-maroon-900/[0.08] text-maroon-900"}`}>{t.status}</span>
                      )}
                      {t.checkedInAt && <span className="shrink-0 text-[0.6rem] font-bold uppercase tracking-wide text-ink-faint">admitted</span>}
                    </Link>
                  </li>
                ))}
                {tickets.length === 0 && <li className="py-8 text-center text-sm text-ink-muted">No tickets yet. <Link to="/events" className="font-semibold text-green">See what&rsquo;s on →</Link></li>}
              </ul>
            </Panel>

            <Panel title="My subscriptions" lede="Your Supporter subscriptions — each payment adds a month to the business.">
              <ul className="divide-y divide-sand">
                {subscriptions.map((sub) => (
                  <li key={sub.id}>
                    <Link to={`/business/${sub.listingSlug}`} className="flex items-center gap-3 py-3.5 transition-colors hover:bg-paper">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-ink">{sub.listingTitle}</p>
                        <p className="text-xs text-ink-faint">
                          GH₵ {(sub.amountPesewas / 100).toLocaleString("en-GH", { maximumFractionDigits: 2 })}
                          {sub.periodEnd ? ` · until ${formatDate(sub.periodEnd)}` : ""}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${subStatusStyle(sub.status)}`}>{sub.status}</span>
                    </Link>
                  </li>
                ))}
                {subscriptions.length === 0 && <li className="py-8 text-center text-sm text-ink-muted">No subscriptions yet.</li>}
              </ul>
            </Panel>
          </div>

          {/* Side rail — identity & settings */}
          <div className="space-y-6">
            <Panel title="Your photo" lede="Put a face to your name. It shows on your profile and across the community.">
              <ImageUpload
                value={photo}
                onChange={savePhoto}
                label="Profile photo"
                hint="A clear headshot works best. Square images look best in the circle."
              />
              {photoState === "saving" && <p className="mt-2 text-sm text-ink-faint">Saving…</p>}
              {photoState === "saved" && <p className="mt-2 text-sm text-teal-text">Saved ✓</p>}
              {photoState === "error" && <p className="mt-2 text-sm text-clay-text">Could not save your photo. Try again.</p>}
            </Panel>

            <Panel title="Rep your town" lede="Wear your community pride — your quarter and your Asafo company.">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Quarter{town && <> · you rep <b className="text-ink-muted">{town.name}</b></>}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {quarters.map((p) => (
                  <button key={p.id} type="button" onClick={() => chooseQuarter(p.id)} className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${p.id === townId ? "border-green bg-green text-cream" : "border-sand bg-paper text-ink-muted hover:border-green/40"}`}>{p.name}</button>
                ))}
              </div>
              <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-ink-faint">Asafo company</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {asafos.map((p) => (
                  <button key={p.id} type="button" onClick={() => chooseAsafo(p.id)} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${p.id === asafoId ? "border-clay bg-clay text-cream" : "border-sand bg-paper text-ink-muted hover:border-clay/40"}`}>
                    {p.colors?.[0] && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.colors[0] }} aria-hidden />}
                    {p.name}
                  </button>
                ))}
              </div>
            </Panel>

            <Panel title="Your birthday" lede="If you turn this on, your followers get a gentle note on your day. Off by default — it's yours to choose.">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="date"
                  value={birthday.length >= 10 ? birthday.slice(0, 10) : birthday}
                  onChange={(e) => { setBirthday(e.target.value); setBdayState("idle"); }}
                  className="rounded-lg border border-sand bg-paper px-3 py-2 text-sm text-ink focus:border-gold-brand focus:outline-none"
                />
                <label className="inline-flex items-center gap-2 text-sm text-ink-muted">
                  <input type="checkbox" checked={broadcast} onChange={(e) => { setBroadcast(e.target.checked); setBdayState("idle"); }} className="h-4 w-4 accent-green" />
                  Let my followers know
                </label>
                <button type="button" onClick={saveBirthday} disabled={bdayState === "saving"} className="rounded-full bg-green px-5 py-2 text-sm font-semibold text-cream hover:bg-green-900 disabled:opacity-60">
                  {bdayState === "saving" ? "Saving…" : "Save"}
                </button>
                {bdayState === "saved" && <span className="text-sm text-teal-text">Saved ✓</span>}
                {bdayState === "error" && <span className="text-sm text-clay-text">Add a valid date first.</span>}
              </div>
            </Panel>

            <Panel title="Oguaa abroad" lede="Living away from home? Add yourself to the diaspora — the bridge for homecomings, projects, and giving back. Off by default.">
              <div className="space-y-3">
                <label className="inline-flex items-center gap-2 text-sm text-ink-muted">
                  <input type="checkbox" checked={abroad} onChange={(e) => { setAbroad(e.target.checked); setDiaState("idle"); }} className="h-4 w-4 accent-teal" />
                  I live abroad / outside Cape Coast
                </label>
                {abroad && (
                  <div className="flex flex-wrap gap-3">
                    <input value={city} onChange={(e) => { setCity(e.target.value); setDiaState("idle"); }} placeholder="City (e.g. London)" className="rounded-lg border border-sand bg-paper px-3 py-2 text-sm text-ink focus:border-teal focus:outline-none" />
                    <input value={country} onChange={(e) => { setCountry(e.target.value); setDiaState("idle"); }} placeholder="Country (e.g. United Kingdom)" className="rounded-lg border border-sand bg-paper px-3 py-2 text-sm text-ink focus:border-teal focus:outline-none" />
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <button type="button" onClick={saveDiaspora} disabled={diaState === "saving"} className="rounded-full bg-teal px-5 py-2 text-sm font-semibold text-cream hover:bg-teal-text disabled:opacity-60">
                    {diaState === "saving" ? "Saving…" : "Save"}
                  </button>
                  {diaState === "saved" && <span className="text-sm text-teal-text">Saved ✓</span>}
                  {diaState === "error" && <span className="text-sm text-clay-text">Could not save. Try again.</span>}
                </div>
              </div>
            </Panel>

            <Panel title="Your schooling" lede="Add the schools you attended and the years you were there. Classmates who overlapped with you will show up below — the powerhouse of Oguaa's networks.">
              <SchoolingEditor
                schools={schools}
                initial={me.schooling ?? []}
                onSaved={() => setConnKey((k) => k + 1)}
              />
            </Panel>

            <Panel title="People you may know" lede="Classmates, neighbours from your quarter, and members of your Asafo.">
              <PeopleYouMayKnow key={connKey} />
            </Panel>
          </div>
        </div>
      </Container>
    </>
  );
}
