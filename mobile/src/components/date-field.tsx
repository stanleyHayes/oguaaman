import { useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { T as Text } from "@/components/typography";
import { D, ON_GREEN, type Palette, S } from "@/theme";
import { useTheme } from "@/lib/theme-context";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ROW_H = 40;

function parseIso(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

// m is 1-based throughout this file.
function iso(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function todayIso() {
  const now = new Date();
  return iso(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function daysInMonth(y: number, m: number) {
  return new Date(y, m, 0).getDate();
}

// Zero-padded ISO strings compare correctly as plain strings.
function clampIso(value: string, min?: string, max?: string) {
  if (min && value < min) return min;
  if (max && value > max) return max;
  return value;
}

function monthDisabled(y: number, m: number, min?: string, max?: string) {
  if (min && iso(y, m, daysInMonth(y, m)) < min) return true;
  if (max && iso(y, m, 1) > max) return true;
  return false;
}

function formatDisplay(value: string) {
  const p = parseIso(value);
  if (!p) return value;
  return new Date(p.y, p.m - 1, p.d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// Snap a draft to a real, in-range date: day clamped to the month's length,
// then the whole date clamped into [min, max].
function normalize(y: number, m: number, d: number, min?: string, max?: string) {
  const dd = Math.min(d, daysInMonth(y, m));
  return parseIso(clampIso(iso(y, m, dd), min, max)) ?? { y, m, d: dd };
}

// Where the sheet opens with no value yet: the latest allowed date (a max-only
// field like date-of-birth would otherwise open on all-disabled rows), else today.
function initialDraft(value: string, min?: string, max?: string) {
  const parsed = parseIso(value);
  if (parsed) return parsed;
  return parseIso(clampIso(max ?? todayIso(), min, max)) ?? normalize(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate(), min, max);
}

interface ColumnItem {
  value: number;
  label: string;
  selected: boolean;
  disabled: boolean;
}

// One scrollable wheel (Year / Month / Day). Scrolls the initial selection
// into view once laid out, then leaves the user's scroll position alone.
function Column({ title, items, onPick }: Readonly<{ title: string; items: ColumnItem[]; onPick: (value: number) => void }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const ref = useRef<ScrollView>(null);
  const didInit = useRef(false);
  const selectedIndex = items.findIndex((it) => it.selected);
  return (
    <View style={{ flex: 1 }}>
      <Text style={s.colTitle}>{title}</Text>
      <ScrollView
        ref={ref}
        style={s.col}
        contentContainerStyle={s.colContent}
        showsVerticalScrollIndicator={false}
        onLayout={() => {
          if (didInit.current) return;
          didInit.current = true;
          if (selectedIndex > 2) ref.current?.scrollTo({ y: (selectedIndex - 2) * ROW_H, animated: false });
        }}
      >
        {items.map((it) => (
          <Pressable            key={it.value}
            onPress={() => onPick(it.value)}
            disabled={it.disabled}
            accessibilityRole="button"
            accessibilityState={{ selected: it.selected, disabled: it.disabled }}
            style={[s.row, it.selected && s.rowOn]}
          >
            <Text style={[s.rowText, it.selected && s.rowTextOn, it.disabled && s.rowTextOff]}>{it.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

interface DateFieldProps {
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  minDate?: string;
  maxDate?: string;
  label?: string;
}

/**
 * Date input without a native picker dependency: a field styled like the app's
 * TextInputs that opens a bottom sheet with Year / Month / Day columns. Commits
 * an ISO YYYY-MM-DD string on Done; Cancel discards the draft.
 */
export function DateField({ value, onChange, placeholder = "Pick a date", minDate, maxDate, label }: Readonly<DateFieldProps>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => initialDraft(value, minDate, maxDate));

  function openSheet() {
    setDraft(initialDraft(value, minDate, maxDate));
    setOpen(true);
  }
  function cancel() {
    setOpen(false);
  }
  function commit() {
    onChange(iso(draft.y, draft.m, draft.d));
    setOpen(false);
  }

  // Fallback year window mirrors the web DatePicker (current year −100 … +20),
  // stretched to cover an out-of-range stored value so it still shows selected.
  const nowY = new Date().getFullYear();
  let minY = (minDate ? parseIso(minDate)?.y : undefined) ?? nowY - 100;
  let maxY = (maxDate ? parseIso(maxDate)?.y : undefined) ?? nowY + 20;
  if (minY > maxY) [minY, maxY] = [maxY, minY];
  minY = Math.min(minY, draft.y);
  maxY = Math.max(maxY, draft.y);

  const yearItems: ColumnItem[] = Array.from({ length: maxY - minY + 1 }, (_, i) => {
    const y = minY + i;
    return { value: y, label: String(y), selected: y === draft.y, disabled: false };
  });
  const monthItems: ColumnItem[] = MONTHS.map((label, i) => ({
    value: i + 1,
    label,
    selected: i + 1 === draft.m,
    disabled: monthDisabled(draft.y, i + 1, minDate, maxDate),
  }));
  const dayItems: ColumnItem[] = Array.from({ length: daysInMonth(draft.y, draft.m) }, (_, i) => {
    const d = i + 1;
    const dIso = iso(draft.y, draft.m, d);
    return {
      value: d,
      label: String(d),
      selected: d === draft.d,
      disabled: Boolean((minDate && dIso < minDate) || (maxDate && dIso > maxDate)),
    };
  });

  return (
    <>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <Pressable
        onPress={openSheet}
        accessibilityRole="button"
        accessibilityLabel={label ?? placeholder}
        style={s.field}
      >
        <Text style={value ? s.fieldText : s.fieldPlaceholder}>{value ? formatDisplay(value) : placeholder}</Text>
        <Text style={s.fieldGlyph}>▾</Text>
      </Pressable>

      <Modal transparent animationType="fade" visible={open} onRequestClose={cancel}>
        <View style={s.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={cancel} accessibilityLabel="Cancel"  accessibilityRole="button" />
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>{label ?? "Pick a date"}</Text>
            <View style={s.columns}>
              <Column title="Year" items={yearItems} onPick={(y) => setDraft((cur) => normalize(y, cur.m, cur.d, minDate, maxDate))} />
              <Column title="Month" items={monthItems} onPick={(m) => setDraft((cur) => normalize(cur.y, m, cur.d, minDate, maxDate))} />
              <Column title="Day" items={dayItems} onPick={(d) => setDraft((cur) => normalize(cur.y, cur.m, d, minDate, maxDate))} />
            </View>
            <View style={s.actions}>
              <Pressable accessibilityRole="button" onPress={cancel} style={s.cancelBtn}><Text style={s.cancelText}>Cancel</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={commit} style={s.doneBtn}><Text style={s.doneText}>Done</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  label: { color: C.inkFaint, fontSize: 11, letterSpacing: 2, ...S(700), marginBottom: 8 },
  field: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  fieldText: { color: C.ink, fontSize: 15 },
  fieldPlaceholder: { color: C.inkFaint, fontSize: 15 },
  fieldGlyph: { color: C.inkFaint, fontSize: 13 },

  // Modal dim layer stays pure black — theme-independent, like a shadow.
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: C.cream, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderColor: C.sand, padding: 20, paddingBottom: 28 },
  sheetTitle: { ...D(600), fontSize: 20, color: C.ink, marginBottom: 12 },
  columns: { flexDirection: "row", gap: 10 },
  colTitle: { color: C.inkFaint, fontSize: 11, letterSpacing: 2, ...D(700), textTransform: "uppercase", textAlign: "center", marginBottom: 6 },
  col: { height: 5 * ROW_H, borderWidth: 1, borderColor: C.sand, backgroundColor: C.paper, borderRadius: 12 },
  colContent: { paddingVertical: 4, paddingHorizontal: 4 },
  row: { height: ROW_H, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  rowOn: { backgroundColor: C.green },
  rowText: { color: C.ink, fontSize: 15 },
  rowTextOn: { color: ON_GREEN, ...S(700) },
  rowTextOff: { color: C.inkFaint, opacity: 0.4 },
  actions: { flexDirection: "row", gap: 10, marginTop: 16 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: C.sand, borderRadius: 999, paddingVertical: 13, alignItems: "center" },
  cancelText: { color: C.ink, ...S(600), fontSize: 15 },
  doneBtn: { flex: 1, backgroundColor: C.green, borderRadius: 999, paddingVertical: 13, alignItems: "center" },
  doneText: { color: ON_GREEN, ...S(700), fontSize: 15 },
});
