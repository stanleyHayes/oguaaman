import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { T as Text, TI as TextInput } from "@/components/typography";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { route, ROUTES } from "@/lib/routes";
import { push } from "@/lib/router";
import type { Listing } from "@/lib/types";
import { useTheme } from "@/lib/theme-context";
import { D, ON_GREEN, S, initials, withAlpha, type Palette } from "@/theme";
import { ErrorView, Loading, Thumb } from "@/ui";
import { EmptyState } from "@/components/empty-state";
import { ArrowRightIcon, BuildingIcon, MapPinIcon, SearchIcon } from "@/components/icons";

const OFFERS = [
  { id: "all", label: "All places" },
  { id: "long-term", label: "Rent monthly" },
  { id: "short-stay", label: "Book a stay" },
] as const;

const TYPES = ["all", "room", "apartment", "house", "guesthouse", "hostel"] as const;
const PRICE_CAPS = [
  { value: 0, label: "Any price" },
  { value: 50_000, label: "Up to GH₵500" },
  { value: 100_000, label: "Up to GH₵1,000" },
  { value: 250_000, label: "Up to GH₵2,500" },
] as const;

function cedis(pesewas?: number): string {
  if (!pesewas) return "Ask for price";
  return `GH₵${(pesewas / 100).toLocaleString("en-GH", { maximumFractionDigits: 0 })}`;
}

function matches(listing: Listing, query: string, offer: string, propertyType: string, cap: number): boolean {
  const d = listing.details;
  const haystack = [listing.title, d.area, d.address, d.description, d.propertyType, ...(d.amenities ?? [])].join(" ").toLowerCase();
  return (!query || haystack.includes(query.toLowerCase()))
    && (offer === "all" || d.offerType === offer)
    && (propertyType === "all" || d.propertyType === propertyType)
    && (cap === 0 || (typeof d.pricePesewas === "number" && d.pricePesewas <= cap));
}

export default function RentStayScreen() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { data, loading, error, reload } = useApi<Listing[]>(() => api.properties(), "properties:list");
  const [query, setQuery] = useState("");
  const [offer, setOffer] = useState<string>("all");
  const [propertyType, setPropertyType] = useState<string>("all");
  const [priceCap, setPriceCap] = useState(0);

  if (loading) return <Loading />;
  if (error && !data) return <ErrorView message={error} />;
  const items = (data ?? []).filter((listing) => matches(listing, query.trim(), offer, propertyType, priceCap));

  return (
    <>
      <Stack.Screen options={{ title: "Rent & Stay" }} />
      <ScrollView style={s.page} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.hero}>
          <View style={s.heroOrb} />
          <Text style={s.heroKicker}>A PLACE IN OGUAA</Text>
          <Text style={s.heroTitle}>Find somewhere to land.</Text>
          <Text style={s.heroBody}>Rooms for the semester, homes for a new chapter, and trusted stays close to the Castle.</Text>
          <View style={s.heroActions}>
            <Pressable accessibilityRole="button" onPress={() => push(`${ROUTES.submit}?type=property`)} style={s.heroButton}>
              <Text style={s.heroButtonText}>List a property</Text>
              <ArrowRightIcon size={17} color={C.green900} strokeWidth={2.4} />
            </Pressable>
            <Text style={s.heroTrust}>Curator reviewed · enquiry first</Text>
          </View>
        </View>

        <View style={s.filterCard}>
          <View style={s.searchWrap}>
            <SearchIcon size={18} color={C.inkFaint} strokeWidth={2} />
            <TextInput value={query} onChangeText={setQuery} placeholder="Search area, property or amenity" placeholderTextColor={C.inkFaint} style={s.searchInput} />
          </View>
          <Text style={s.filterLabel}>I WANT TO</Text>
          <View style={s.chips}>{OFFERS.map((item) => <FilterChip key={item.id} label={item.label} active={offer === item.id} onPress={() => setOffer(item.id)} />)}</View>
          <Text style={s.filterLabel}>PLACE TYPE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
            {TYPES.map((item) => <FilterChip key={item} label={item === "all" ? "Every type" : item[0].toUpperCase() + item.slice(1)} active={propertyType === item} onPress={() => setPropertyType(item)} />)}
          </ScrollView>
          <Text style={s.filterLabel}>BUDGET</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
            {PRICE_CAPS.map((item) => <FilterChip key={item.value} label={item.label} active={priceCap === item.value} onPress={() => setPriceCap(item.value)} />)}
          </ScrollView>
        </View>

        <View style={s.resultHead}>
          <View>
            <Text style={s.resultKicker}>AVAILABLE AROUND CAPE COAST</Text>
            <Text style={s.resultTitle}>{items.length} {items.length === 1 ? "place" : "places"}</Text>
          </View>
          {(query || offer !== "all" || propertyType !== "all" || priceCap !== 0) ? (
            <Pressable accessibilityRole="button" onPress={() => { setQuery(""); setOffer("all"); setPropertyType("all"); setPriceCap(0); }} hitSlop={8}>
              <Text style={s.reset}>Reset</Text>
            </Pressable>
          ) : null}
        </View>

        {items.length === 0 ? (
          <View style={s.empty}>
            <EmptyState
              icon={<BuildingIcon size={52} color={C.inkFaint} strokeWidth={1.5} />}
              title="No places match yet"
              body="Try a wider budget or clear a filter. Property managers can add the first listing for an area."
              actionLabel={(data ?? []).length === 0 ? "Refresh" : "Clear filters"}
              onAction={(data ?? []).length === 0 ? reload : () => { setQuery(""); setOffer("all"); setPropertyType("all"); setPriceCap(0); }}
            />
          </View>
        ) : (
          <View style={s.grid}>
            {items.map((listing) => <PropertyCard key={listing.id} listing={listing} />)}
          </View>
        )}
      </ScrollView>
    </>
  );
}

function FilterChip({ label, active, onPress }: Readonly<{ label: string; active: boolean; onPress: () => void }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[s.chip, active && s.chipOn]}>
      <Text style={[s.chipText, active && s.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

function PropertyCard({ listing }: Readonly<{ listing: Listing }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const d = listing.details;
  const period = d.pricePeriod === "night" ? "night" : "month";
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${listing.title}`} onPress={() => push(route.property(listing.slug))} style={({ pressed }) => [s.card, pressed && { opacity: 0.82 }]}>
      <View style={s.cardMedia}>
        <Thumb seed={listing.slug} src={listing.coverImageUrl} label={initials(listing.title)} style={StyleSheet.absoluteFill} labelStyle={s.cardInitials} />
        <View style={s.cardScrim} />
        <View style={s.offerPill}><Text style={s.offerPillText}>{d.offerType === "short-stay" ? "SHORT STAY" : "LONG-TERM RENT"}</Text></View>
        <View style={s.pricePill}>
          <Text style={s.price}>{cedis(d.pricePesewas)}</Text>
          {d.pricePesewas ? <Text style={s.period}>/{period}</Text> : null}
        </View>
      </View>
      <View style={s.cardBody}>
        <Text style={s.cardTitle} numberOfLines={2}>{listing.title}</Text>
        <View style={s.addressRow}><MapPinIcon size={14} color={C.tealText} strokeWidth={2} /><Text style={s.address} numberOfLines={1}>{d.area || d.address || "Cape Coast"}</Text></View>
        <View style={s.metaRow}>
          {d.propertyType ? <Text style={s.meta}>{d.propertyType}</Text> : null}
          {typeof d.bedrooms === "number" ? <Text style={s.meta}>{d.bedrooms} bed</Text> : null}
          {d.furnished ? <Text style={s.meta}>furnished</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  page: { flex: 1, backgroundColor: C.paper },
  content: { paddingBottom: 48 },
  hero: { minHeight: 292, overflow: "hidden", backgroundColor: C.green900, paddingHorizontal: 22, paddingTop: 36, paddingBottom: 28 },
  heroOrb: { position: "absolute", width: 260, height: 260, borderRadius: 130, right: -105, top: -90, borderWidth: 1, borderColor: C.goldBorder35, backgroundColor: C.goldTint14 },
  heroKicker: { color: C.gold, ...S(700), fontSize: 11, letterSpacing: 2.2 },
  heroTitle: { color: ON_GREEN, ...D(700), fontSize: 39, lineHeight: 43, marginTop: 12, maxWidth: 320 },
  heroBody: { color: C.onDarkText85, ...S(400), fontSize: 15, lineHeight: 22, maxWidth: 330, marginTop: 13 },
  heroActions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 12, marginTop: 22 },
  heroButton: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: C.goldBrand, borderRadius: 999, paddingHorizontal: 17, paddingVertical: 12 },
  heroButtonText: { color: C.green900, ...S(700), fontSize: 14 },
  heroTrust: { color: C.onDarkText60, fontSize: 11, ...S(600) },
  filterCard: { margin: 16, marginTop: -18, borderWidth: 1, borderColor: C.sand, borderRadius: 20, backgroundColor: C.cream, padding: 14, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  searchWrap: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 9, borderWidth: 1, borderColor: C.sand, borderRadius: 14, backgroundColor: C.paper, paddingHorizontal: 13 },
  searchInput: { flex: 1, minWidth: 0, color: C.ink, fontSize: 14, paddingVertical: 12 },
  filterLabel: { color: C.inkFaint, ...S(700), fontSize: 9, letterSpacing: 1.5, marginTop: 15, marginBottom: 7 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: { borderWidth: 1, borderColor: C.sand, borderRadius: 999, backgroundColor: C.paper, paddingHorizontal: 12, paddingVertical: 8 },
  chipOn: { borderColor: C.green, backgroundColor: C.green },
  chipText: { color: C.inkMuted, ...S(600), fontSize: 12 },
  chipTextOn: { color: ON_GREEN },
  resultHead: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 17, marginTop: 4, marginBottom: 12 },
  resultKicker: { color: C.tealText, ...S(700), fontSize: 9, letterSpacing: 1.5 },
  resultTitle: { color: C.ink, ...D(700), fontSize: 26, marginTop: 3 },
  reset: { color: C.clayText, ...S(700), fontSize: 13 },
  grid: { gap: 14, paddingHorizontal: 16 },
  card: { overflow: "hidden", borderWidth: 1, borderColor: C.sand, borderRadius: 20, backgroundColor: C.cream },
  cardMedia: { height: 190, backgroundColor: C.greenSlate },
  cardInitials: { color: ON_GREEN, ...D(700), fontSize: 40 },
  cardScrim: { position: "absolute", inset: 0, backgroundColor: withAlpha(C.green900, 0.18) },
  offerPill: { position: "absolute", top: 12, left: 12, borderRadius: 999, backgroundColor: C.cream, paddingHorizontal: 10, paddingVertical: 6 },
  offerPillText: { color: C.greenText, ...S(700), fontSize: 9, letterSpacing: 1 },
  pricePill: { position: "absolute", right: 12, bottom: 12, flexDirection: "row", alignItems: "baseline", borderRadius: 12, backgroundColor: C.green900, paddingHorizontal: 11, paddingVertical: 8 },
  price: { color: ON_GREEN, ...S(700), fontSize: 16 },
  period: { color: C.onDarkText60, fontSize: 10, marginLeft: 2 },
  cardBody: { padding: 15 },
  cardTitle: { color: C.ink, ...D(700), fontSize: 21, lineHeight: 25 },
  addressRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 },
  address: { flex: 1, color: C.inkMuted, fontSize: 13 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 11 },
  meta: { color: C.tealText, ...S(600), fontSize: 11, textTransform: "capitalize", backgroundColor: withAlpha(C.teal, 0.08), borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  empty: { marginHorizontal: 16, borderWidth: 1, borderColor: C.sand, borderRadius: 20, backgroundColor: C.cream },
});
