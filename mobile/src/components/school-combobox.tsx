import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { T as Text, TI as TextInput } from "@/components/typography";
import type { Organization } from "@/lib/types";
import { S, type Palette } from "@/theme";
import { useTheme } from "@/lib/theme-context";

/**
 * SchoolCombobox — the mobile twin of the web combobox. A TextInput filters the
 * schools list as the member types; matches render as a scrollable list of
 * Pressable rows (name + classification subtitle). Picking a row fires
 * `onSelect(schoolId)` and clears the box so another school can be added right
 * away — a type-to-search replacement for the old "+ School" chip wall.
 *
 * Theme-aware via useTheme(): surfaces resolve from the active Palette, so it is
 * correct in light and dark.
 */
export function SchoolCombobox({
  schools,
  onSelect,
  placeholder = "Search schools…",
}: Readonly<{
  schools: Organization[];
  onSelect: (schoolId: string) => void;
  placeholder?: string;
}>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (q === "") return schools;
    return schools.filter((sc) => {
      const name = sc.name.toLowerCase();
      const cls = (sc.classification ?? "").toLowerCase();
      return name.includes(q) || cls.includes(q);
    });
  }, [q, schools]);

  function choose(sc: Organization) {
    onSelect(sc.id);
    setQuery("");
  }

  return (
    <View style={s.wrap}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={placeholder}
        placeholderTextColor={C.inkFaint}
        style={s.input}
        autoCorrect={false}
        autoCapitalize="none"
      />
      <View style={s.listWrap}>
        {matches.length === 0 ? (
          <Text style={s.empty}>No schools match “{query.trim()}”.</Text>
        ) : (
          <ScrollView
            style={s.list}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            {matches.map((sc) => (
              <Pressable key={sc.id} onPress={() => choose(sc)} style={s.option}>
                <Text style={s.optionName}>{sc.name}</Text>
                {sc.classification ? <Text style={s.optionSub}>{sc.classification}</Text> : null}
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    wrap: { gap: 8 },
    input: {
      borderWidth: 1,
      borderColor: C.sand,
      backgroundColor: C.paper,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: C.ink,
      fontSize: 14,
    },
    listWrap: {
      borderWidth: 1,
      borderColor: C.sand,
      backgroundColor: C.paper,
      borderRadius: 10,
      overflow: "hidden",
    },
    list: { maxHeight: 220 },
    option: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.sand,
    },
    optionName: { color: C.ink, fontSize: 14, ...S(600) },
    optionSub: { color: C.inkFaint, fontSize: 12, marginTop: 1 },
    empty: { color: C.inkFaint, fontSize: 13, paddingHorizontal: 12, paddingVertical: 10 },
  });
