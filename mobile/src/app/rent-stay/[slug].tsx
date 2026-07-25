import { useMemo } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { T as Text } from "@/components/typography";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useRecordView } from "@/lib/use-record-view";
import type { Listing } from "@/lib/types";
import { useTheme } from "@/lib/theme-context";
import { ON_GREEN, S, initials, withAlpha, type Palette } from "@/theme";
import { ErrorView, Loading, Pill, Thumb } from "@/ui";
import { LocationCard } from "@/components/location-card";
import { ReportButton } from "@/report-button";
import { ArrowUpRightIcon, BuildingIcon, CheckIcon, MapPinIcon } from "@/components/icons";

function openURL(url?: string) {
  const safe = (url ?? "").trim();
  if (/^(https?:|mailto:|tel:)/i.test(safe)) Linking.openURL(safe).catch(() => {});
}

function cedis(pesewas?: number): string {
  if (!pesewas) return "Price on enquiry";
  return `GH₵${(pesewas / 100).toLocaleString("en-GH", { maximumFractionDigits: 0 })}`;
}

function availabilityLabel(value?: string): string {
  if (value === "reserved") return "Reserved";
  if (value === "let") return "Currently let";
  return "Available now";
}

export default function PropertyDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data, loading, error } = useApi<Listing>(() => api.property(slug), `property:${slug}`);
  useRecordView(data?.id);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView message={error ?? "Property not found"} />;
  return <PropertyDetail listing={data} />;
}

function PropertyDetail({ listing }: Readonly<{ listing: Listing }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const d = listing.details;
  const directions = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([listing.title, d.address, "Cape Coast, Ghana"].filter(Boolean).join(", "))}`;
  const contacts = Array.isArray(d.contact) ? d.contact.filter((contact) => contact && typeof contact.url === "string") : [];
  const canEnquire = (d.availability ?? "available") === "available";

  return (
    <>
      <Stack.Screen options={{ title: listing.title }} />
      <ScrollView style={s.page} contentContainerStyle={s.content}>
        <View style={s.media}>
          <Thumb seed={listing.slug} src={listing.coverImageUrl ?? d.gallery?.find((image) => image.url)?.url} label={initials(listing.title)} style={StyleSheet.absoluteFill} labelStyle={s.initials} />
          <View style={s.mediaScrim} />
          <View style={s.mediaTop}>
            <View style={s.reviewPill}><CheckIcon size={13} color={C.green900} strokeWidth={2.5} /><Text style={s.reviewText}>CURATOR REVIEWED</Text></View>
          </View>
          <View style={s.mediaBottom}>
            <View style={s.heroBadges}>
              <Text style={s.offer}>{d.offerType === "short-stay" ? "SHORT STAY" : "FOR RENT"}</Text>
              <Text style={s.typeBadge}>{d.propertyType || "Property"}</Text>
            </View>
            <Text style={s.title}>{listing.title}</Text>
            <View style={s.locationRow}><MapPinIcon size={15} color={C.gold} strokeWidth={2.1} /><Text style={s.location} numberOfLines={2}>{d.address || "Cape Coast"}</Text></View>
          </View>
        </View>

        <View style={s.body}>
          <View style={s.priceCard}>
            <View>
              <Text style={s.priceLabel}>ASKING PRICE</Text>
              <View style={s.priceRow}><Text style={s.price}>{cedis(d.pricePesewas)}</Text>{d.pricePesewas ? <Text style={s.period}>/{d.pricePeriod === "night" ? "night" : "month"}</Text> : null}</View>
            </View>
            <View style={[s.availability, d.availability !== "available" && s.availabilityMuted]}>
              <Text style={[s.availabilityText, d.availability !== "available" && s.availabilityTextMuted]}>{availabilityLabel(d.availability)}</Text>
            </View>
          </View>

          <View style={s.facts}>
            <Fact value={d.propertyType ? d.propertyType[0].toUpperCase() + d.propertyType.slice(1) : "Property"} label="Type" />
            <Fact value={typeof d.bedrooms === "number" ? String(d.bedrooms) : "—"} label="Bedrooms" />
            <Fact value={typeof d.bathrooms === "number" ? String(d.bathrooms) : "—"} label="Bathrooms" />
            <Fact value={d.furnished ? "Yes" : "No"} label="Furnished" />
          </View>

          <View style={s.overview}>
            <Text style={s.kicker}>ABOUT THIS PLACE</Text>
            <Text style={s.sectionTitle}>What you should know</Text>
            {d.description ? <Text style={s.description}>{d.description}</Text> : <Text style={s.description}>The manager has not added a full description yet.</Text>}
          </View>

          {(d.amenities ?? []).length > 0 ? (
            <View style={s.section}>
              <Text style={s.kicker}>WHAT COMES WITH IT</Text>
              <Text style={s.sectionTitle}>Amenities</Text>
              <View style={s.amenities}>{(d.amenities ?? []).map((amenity) => <View key={amenity} style={s.amenity}><Text style={s.amenityWatermark}>{amenity.slice(0, 1).toUpperCase()}</Text><View style={s.amenityIcon}><CheckIcon size={14} color={C.tealText} strokeWidth={2.4} /></View><Text style={s.amenityText}>{amenity}</Text></View>)}</View>
            </View>
          ) : null}

          <View style={s.section}>
            <Text style={s.kicker}>WHERE IT IS</Text>
            <Text style={s.sectionTitle}>The neighbourhood</Text>
            {d.address ? <LocationCard address={d.address} query={`${listing.title} ${d.address}`} /> : null}
            <Pressable accessibilityRole="button" onPress={() => openURL(directions)} style={s.secondaryButton}>
              <Text style={s.secondaryButtonText}>Open directions</Text><ArrowUpRightIcon size={16} color={C.tealText} strokeWidth={2.2} />
            </Pressable>
          </View>

          <View style={s.enquiryCard}>
            <View style={s.enquiryIcon}><BuildingIcon size={23} color={C.gold} strokeWidth={2} /></View>
            <Text style={s.enquiryKicker}>ENQUIRE DIRECTLY</Text>
            <Text style={s.enquiryTitle}>Ask the manager before you travel.</Text>
            <Text style={s.enquiryBody}>Confirm availability, viewing times and every fee directly. Oguaa reviews listings but does not collect rent or hold deposits.</Text>
            <View style={s.actions}>
              {!canEnquire ? <Text style={s.closedNotice}>This place is not taking enquiries right now.</Text> : null}
              {canEnquire ? contacts.map((contact) => (
                <Pressable accessibilityRole="button" key={`${contact.label}-${contact.url}`} onPress={() => openURL(contact.url)} style={s.primaryButton}>
                  <Text style={s.primaryButtonText}>{contact.label || "Contact manager"}</Text><ArrowUpRightIcon size={16} color={C.green900} strokeWidth={2.3} />
                </Pressable>
              )) : null}
              {canEnquire && d.bookingUrl ? (
                <Pressable accessibilityRole="button" onPress={() => openURL(d.bookingUrl)} style={s.secondaryButton}>
                  <Text style={s.secondaryButtonText}>Open booking page</Text><ArrowUpRightIcon size={16} color={C.tealText} strokeWidth={2.2} />
                </Pressable>
              ) : null}
            </View>
          </View>

          <View style={s.safetyCard}>
            <Text style={s.safetyKicker}>RENT SAFELY</Text>
            <Text style={s.safetyTitle}>Pause before you pay</Text>
            <Text style={s.safetyItem}>• View the property or verify it through someone you trust.</Text>
            <Text style={s.safetyItem}>• Confirm who manages it and get the full terms in writing.</Text>
            <Text style={s.safetyItem}>• Never pay because someone is rushing you.</Text>
          </View>

          {listing.tags.length > 0 ? <View style={s.tags}>{listing.tags.map((tag) => <Pill key={tag} label={`#${tag}`} color={C.tealText} bg={C.cream} border={C.sand} />)}</View> : null}
          <View style={s.report}><ReportButton listingId={listing.id} /></View>
        </View>
      </ScrollView>
    </>
  );
}

function Fact({ value, label }: Readonly<{ value: string; label: string }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return <View style={s.fact}><Text style={s.factValue}>{value}</Text><Text style={s.factLabel}>{label}</Text></View>;
}

const makeStyles = (C: Palette) => StyleSheet.create({
  page: { flex: 1, backgroundColor: C.paper },
  content: { paddingBottom: 48 },
  media: { height: 350, justifyContent: "space-between", backgroundColor: C.greenSlate },
  initials: { color: ON_GREEN, ...S(700), fontSize: 58 },
  mediaScrim: { position: "absolute", inset: 0, backgroundColor: withAlpha(C.green900, 0.38) },
  mediaTop: { padding: 18, alignItems: "flex-start" },
  reviewPill: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 999, backgroundColor: C.goldBrand, paddingHorizontal: 10, paddingVertical: 7 },
  reviewText: { color: C.green900, ...S(700), fontSize: 9, letterSpacing: 1 },
  mediaBottom: { padding: 20, paddingBottom: 26 },
  heroBadges: { flexDirection: "row", alignItems: "center", gap: 7 },
  offer: { overflow: "hidden", color: C.green900, backgroundColor: C.goldBrand, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, ...S(700), fontSize: 9, letterSpacing: 1.4 },
  typeBadge: { overflow: "hidden", color: ON_GREEN, backgroundColor: withAlpha(C.green900, 0.66), borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, ...S(600), fontSize: 10, textTransform: "capitalize" },
  title: { color: ON_GREEN, ...S(700), fontSize: 34, lineHeight: 38, marginTop: 10 },
  locationRow: { flexDirection: "row", alignItems: "flex-start", gap: 5, marginTop: 10 },
  location: { color: C.onDarkText85, flex: 1, fontSize: 14, lineHeight: 19 },
  body: { padding: 16 },
  priceCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: -34, borderWidth: 1, borderColor: C.sand, borderRadius: 20, backgroundColor: C.cream, padding: 17 },
  priceLabel: { color: C.inkFaint, ...S(700), fontSize: 9, letterSpacing: 1.3 },
  priceRow: { flexDirection: "row", alignItems: "baseline", marginTop: 4 },
  price: { color: C.ink, ...S(700), fontSize: 28 },
  period: { color: C.inkMuted, fontSize: 12, marginLeft: 3 },
  availability: { borderRadius: 999, backgroundColor: withAlpha(C.teal, 0.1), paddingHorizontal: 10, paddingVertical: 7 },
  availabilityMuted: { backgroundColor: C.sand },
  availabilityText: { color: C.tealText, ...S(700), fontSize: 11 },
  availabilityTextMuted: { color: C.inkMuted },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 14 },
  fact: { width: "48.5%", minHeight: 86, justifyContent: "center", paddingHorizontal: 15, borderWidth: 1, borderColor: C.sand, borderRadius: 16, backgroundColor: C.cream },
  factValue: { color: C.ink, ...S(700), fontSize: 16, textTransform: "capitalize" },
  factLabel: { color: C.inkFaint, fontSize: 10, marginTop: 3 },
  overview: { marginTop: 30 },
  description: { color: C.inkMuted, ...S(400), fontSize: 15, lineHeight: 24, marginTop: 8 },
  section: { marginTop: 28 },
  kicker: { color: C.tealText, ...S(700), fontSize: 9, letterSpacing: 1.6 },
  sectionTitle: { color: C.ink, ...S(700), fontSize: 25, lineHeight: 29, marginTop: 4, marginBottom: 11 },
  amenities: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  amenity: { position: "relative", width: "48.5%", minHeight: 100, overflow: "hidden", justifyContent: "flex-end", borderWidth: 1, borderColor: C.sand, borderRadius: 16, backgroundColor: C.cream, padding: 13 },
  amenityIcon: { width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: withAlpha(C.teal, 0.1), marginBottom: 10 },
  amenityWatermark: { position: "absolute", right: -2, bottom: -20, color: withAlpha(C.teal, 0.06), ...S(700), fontSize: 76 },
  amenityText: { color: C.ink, ...S(600), fontSize: 12 },
  enquiryCard: { marginTop: 30, overflow: "hidden", borderRadius: 20, backgroundColor: C.green900, padding: 20 },
  enquiryIcon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: C.goldTint14, borderWidth: 1, borderColor: C.goldBorder35 },
  enquiryKicker: { color: C.gold, ...S(700), fontSize: 9, letterSpacing: 1.7, marginTop: 16 },
  enquiryTitle: { color: ON_GREEN, ...S(700), fontSize: 27, lineHeight: 31, marginTop: 5 },
  enquiryBody: { color: C.onDarkText85, fontSize: 13, lineHeight: 20, marginTop: 9 },
  actions: { gap: 9, marginTop: 17 },
  closedNotice: { color: C.onDarkText85, fontSize: 13, lineHeight: 19, borderWidth: 1, borderColor: C.goldBorder35, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11 },
  primaryButton: { minHeight: 47, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 999, backgroundColor: C.goldBrand, paddingHorizontal: 16 },
  primaryButtonText: { color: C.green900, ...S(700), fontSize: 13 },
  secondaryButton: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: C.teal, borderRadius: 999, paddingHorizontal: 16, marginTop: 10 },
  secondaryButtonText: { color: C.tealText, ...S(700), fontSize: 13 },
  safetyCard: { marginTop: 14, borderWidth: 1, borderColor: C.goldBorder35, borderRadius: 20, backgroundColor: C.goldTint14, padding: 18 },
  safetyKicker: { color: C.goldText, ...S(700), fontSize: 9, letterSpacing: 1.6 },
  safetyTitle: { color: C.ink, ...S(700), fontSize: 20, marginTop: 5, marginBottom: 10 },
  safetyItem: { color: C.inkMuted, fontSize: 12, lineHeight: 19, marginTop: 3 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 22 },
  report: { alignItems: "center", marginTop: 26 },
});
