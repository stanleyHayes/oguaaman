import { useEffect, useMemo, useState } from "react";
import { Image, Linking, Pressable, StyleSheet, View } from "react-native";
import { T as Text } from "@/components/typography";
import { type Palette, S } from "@/theme";
import { useTheme } from "@/lib/theme-context";

const CAPE_COAST: [number, number] = [5.1053, -1.2466];
const geoCache = new Map<string, [number, number]>();

function staticMap(lat: number, lng: number): string {
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=14&size=640x280&markers=${lat},${lng},red-pushpin`;
}

export function LocationCard({ address, query }: Readonly<{ address?: string; query?: string }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const rawQuery = useMemo(() => [query ?? address, "Cape Coast", "Ghana"].filter(Boolean).join(", "), [address, query]);
  const key = rawQuery.trim().toLowerCase();
  const cached = key ? geoCache.get(key) : undefined;
  const [coords, setCoords] = useState<[number, number] | null>(cached ?? null);
  const [geocoded, setGeocoded] = useState<boolean>(!!cached);
  const resolvedCoords = cached ?? coords ?? CAPE_COAST;
  const resolvedGeocoded = !!cached || geocoded;
  const directions = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(rawQuery)}`;

  useEffect(() => {
    if (!key || cached) {
      return;
    }
    const ac = new AbortController();
    fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(rawQuery)}`, {
      signal: ac.signal,
      headers: { Accept: "application/json" },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { lat: string; lon: string }[]) => {
        const row = rows[0];
        if (!row) {
          return;
        }
        const lat = Number(row.lat);
        const lon = Number(row.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          return;
        }
        const p: [number, number] = [lat, lon];
        geoCache.set(key, p);
        setCoords(p);
        setGeocoded(true);
      })
      .catch(() => {});
    return () => ac.abort();
  }, [rawQuery, key, cached]);

  return (
    <View style={s.card}>
      <Image source={{ uri: staticMap(resolvedCoords[0], resolvedCoords[1]) }} style={s.map} resizeMode="cover" />
      <View style={s.body}>
        {address ? <Text style={s.addr}>📍 {address}</Text> : null}
        <Pressable accessibilityRole="button" style={s.btn} onPress={() => Linking.openURL(directions).catch(() => {})}>
          <Text style={s.btnText}>Get directions ↗</Text>
        </Pressable>
        <Text style={s.meta}>
          Map data © OpenStreetMap contributors. {resolvedGeocoded ? "Pin is geocoded from this listing." : "Pin falls back to Cape Coast town centre."}
        </Text>
      </View>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  card: { borderWidth: 1, borderColor: C.sand, borderRadius: 12, overflow: "hidden", backgroundColor: C.cream },
  map: { width: "100%", height: 160, backgroundColor: C.sand },
  body: { padding: 14 },
  addr: { color: C.ink, fontSize: 14 },
  btn: { marginTop: 10, alignSelf: "flex-start", backgroundColor: C.teal, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  btnText: { color: C.cream, ...S(700), fontSize: 13 },
  meta: { marginTop: 8, color: C.inkFaint, fontSize: 11, lineHeight: 16 },
});
