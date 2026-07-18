import Svg, { Circle, Ellipse, Line, Path, Polygon, Polyline, Rect } from "react-native-svg";

/**
 * Feather-style line icons rendered with react-native-svg so they stay crisp at
 * any size on iOS, Android and the web export — replacing the Unicode glyphs and
 * emoji and Unicode glyphs the header used before. Every icon takes a 24×24 viewBox and
 * inherits `color` + `size`; stroke icons round their caps/joins for a soft look.
 */
export interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

function stroke(color: string, strokeWidth: number) {
  return {
    stroke: color,
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none",
  };
}

export function MoonIcon({ size = 22, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function SunIcon({ size = 22, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={4.5} {...s} />
      <Line x1={12} y1={1.5} x2={12} y2={4} {...s} />
      <Line x1={12} y1={20} x2={12} y2={22.5} {...s} />
      <Line x1={3.5} y1={3.5} x2={5.3} y2={5.3} {...s} />
      <Line x1={18.7} y1={18.7} x2={20.5} y2={20.5} {...s} />
      <Line x1={1.5} y1={12} x2={4} y2={12} {...s} />
      <Line x1={20} y1={12} x2={22.5} y2={12} {...s} />
      <Line x1={3.5} y1={20.5} x2={5.3} y2={18.7} {...s} />
      <Line x1={18.7} y1={5.3} x2={20.5} y2={3.5} {...s} />
    </Svg>
  );
}

/** System / "follow device" — a monitor, matching the web's ◐ auto glyph. */
export function SystemIcon({ size = 22, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={2} y={3.5} width={20} height={14} rx={2} {...s} />
      <Line x1={8} y1={21} x2={16} y2={21} {...s} />
      <Line x1={12} y1={17.5} x2={12} y2={21} {...s} />
    </Svg>
  );
}

export function BellIcon({ size = 22, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9z" {...s} />
      <Path d="M13.73 21a2 2 0 0 1-3.46 0" {...s} />
    </Svg>
  );
}

export function SearchIcon({ size = 22, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={11} cy={11} r={7.5} {...s} />
      <Line x1={21} y1={21} x2={16.5} y2={16.5} {...s} />
    </Svg>
  );
}

// ── Tab-bar + navigation icons ────────────────────────────────────────────

export function HomeIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" {...s} />
      <Path d="M9 22V12h6v10" {...s} />
    </Svg>
  );
}

export function MusicIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M9 18V5l12-3v13" {...s} />
      <Circle cx={6} cy={18} r={3} {...s} />
      <Circle cx={18} cy={16} r={3} {...s} />
    </Svg>
  );
}

export function HeartIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function HeartFilledIcon({ size = 24, color = "#000" }: Readonly<Omit<IconProps, "strokeWidth">>) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" fill={color} />
    </Svg>
  );
}

export function CalendarIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={3} y={4} width={18} height={18} rx={2} {...s} />
      <Line x1={16} y1={2} x2={16} y2={6} {...s} />
      <Line x1={8} y1={2} x2={8} y2={6} {...s} />
      <Line x1={3} y1={10} x2={21} y2={10} {...s} />
    </Svg>
  );
}

export function MenuIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Line x1={3} y1={6} x2={21} y2={6} {...s} />
      <Line x1={3} y1={12} x2={21} y2={12} {...s} />
      <Line x1={3} y1={18} x2={21} y2={18} {...s} />
    </Svg>
  );
}

export function GridIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={3} y={3} width={7} height={7} rx={1} {...s} />
      <Rect x={14} y={3} width={7} height={7} rx={1} {...s} />
      <Rect x={14} y={14} width={7} height={7} rx={1} {...s} />
      <Rect x={3} y={14} width={7} height={7} rx={1} {...s} />
    </Svg>
  );
}

// ── Action + empty-state icons ────────────────────────────────────────────

export function PlusIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Line x1={12} y1={5} x2={12} y2={19} {...s} />
      <Line x1={5} y1={12} x2={19} y2={12} {...s} />
    </Svg>
  );
}

export function FlagIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" {...s} />
      <Line x1={4} y1={22} x2={4} y2={15} {...s} />
    </Svg>
  );
}

export function ClockIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} {...s} />
      <Polyline points="12 6 12 12 16 14" {...s} />
    </Svg>
  );
}

export function SparkleIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5z" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function PenIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 20h9" {...s} />
      <Path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" {...s} />
    </Svg>
  );
}

export function TicketIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" {...s} />
      <Line x1={13} y1={5} x2={13} y2={9} {...s} />
      <Line x1={13} y1={11} x2={13} y2={15} {...s} />
      <Line x1={13} y1={17} x2={13} y2={21} {...s} />
    </Svg>
  );
}

export function RefreshIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Polyline points="23 4 23 10 17 10" {...s} />
      <Path d="M20.49 15a9 9 0 1 1 2.12-9" {...s} />
    </Svg>
  );
}

export function UsersIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" {...s} />
      <Circle cx={9} cy={7} r={4} {...s} />
      <Path d="M23 21v-2a4 4 0 0 0-3-3.87" {...s} />
      <Path d="M16 3.13a4 4 0 0 1 0 7.75" {...s} />
    </Svg>
  );
}

export function InboxIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Polyline points="22 12 16 12 14 15 10 15 8 12 2 12" {...s} />
      <Path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" {...s} />
    </Svg>
  );
}

export function FileTextIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" {...s} />
      <Polyline points="14 2 14 8 20 8" {...s} />
      <Line x1={16} y1={13} x2={8} y2={13} {...s} />
      <Line x1={16} y1={17} x2={8} y2={17} {...s} />
      <Path d="M10 9H8" {...s} />
    </Svg>
  );
}

export function BriefcaseIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={2} y={7} width={20} height={14} rx={2} {...s} />
      <Path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" {...s} />
    </Svg>
  );
}

export function ChevronRightIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Polyline points="9 18 15 12 9 6" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function ChevronUpIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Polyline points="18 15 12 9 6 15" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function ChevronDownIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Polyline points="6 9 12 15 18 9" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function CloseIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Line x1={18} y1={6} x2={6} y2={18} {...s} />
      <Line x1={6} y1={6} x2={18} y2={18} {...s} />
    </Svg>
  );
}

export function CompassIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} {...s} />
      <Polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" {...s} />
    </Svg>
  );
}

export function MapIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" {...s} />
      <Line x1={8} y1={2} x2={8} y2={18} {...s} />
      <Line x1={16} y1={6} x2={16} y2={22} {...s} />
    </Svg>
  );
}

export function UserIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" {...s} />
      <Circle cx={12} cy={7} r={4} {...s} />
    </Svg>
  );
}

export function SettingsIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" {...s} />
      <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" {...s} />
    </Svg>
  );
}

export function InfoIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} {...s} />
      <Line x1={12} y1={16} x2={12} y2={12} {...s} />
      <Line x1={12} y1={8} x2={12.01} y2={8} {...s} />
    </Svg>
  );
}

export function LogOutIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" {...s} />
      <Polyline points="16 17 21 12 16 7" {...s} />
      <Line x1={21} y1={12} x2={9} y2={12} {...s} />
    </Svg>
  );
}

export function ArrowRightIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Line x1={5} y1={12} x2={19} y2={12} {...s} />
      <Polyline points="12 5 19 12 12 19" {...s} />
    </Svg>
  );
}

export function ArrowUpRightIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Line x1={7} y1={17} x2={17} y2={7} {...s} />
      <Polyline points="7 7 17 7 17 17" {...s} />
    </Svg>
  );
}

export function CheckIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Polyline points="20 6 9 17 4 12" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

/** Prohibition sign — a circle with a diagonal slash. Marks a "stop" behaviour
 *  (mirrors the web civic page's stop glyph). */
export function BanIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9} {...s} />
      <Line x1={6} y1={6} x2={18} y2={18} {...s} />
    </Svg>
  );
}

export function StarIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function StarFilledIcon({ size = 24, color = "#000" }: Readonly<Omit<IconProps, "strokeWidth">>) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill={color} />
    </Svg>
  );
}

export function MapPinIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z" {...s} />
      <Circle cx={12} cy={10} r={3} {...s} />
    </Svg>
  );
}

export function BuildingIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 21h18M5 21V7l8-4 8 4v14M9 21v-6h6v6" {...s} />
    </Svg>
  );
}

export function GradCapIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M22 10l-10-5-10 5 10 5 10-5z" {...s} />
      <Path d="M6 12.5v3.5a10 10 0 0 0 12 0v-3.5" {...s} />
    </Svg>
  );
}

export function LandmarkIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 21h18M4 21V10.5M20 21V10.5M2 10l10-6 10 6M9 21v-5h6v5" {...s} />
    </Svg>
  );
}

export function AlertTriangleIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" {...s} />
      <Line x1={12} y1={9} x2={12} y2={13} {...s} />
      <Line x1={12} y1={17} x2={12.01} y2={17} {...s} />
    </Svg>
  );
}

export function BusIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={3} y={6} width={18} height={12} rx={2} {...s} />
      <Line x1={6} y1={18} x2={6} y2={21} {...s} />
      <Line x1={18} y1={18} x2={18} y2={21} {...s} />
      <Line x1={6} y1={11} x2={6.01} y2={11} {...s} />
      <Line x1={18} y1={11} x2={18.01} y2={11} {...s} />
    </Svg>
  );
}

export function ShoppingBagIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" {...s} />
      <Line x1={3} y1={6} x2={21} y2={6} {...s} />
      <Path d="M16 10a4 4 0 0 1-8 0" {...s} />
    </Svg>
  );
}

export function ShieldIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

export function EnvelopeIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" {...s} />
      <Polyline points="22 6 12 13 2 6" {...s} />
    </Svg>
  );
}

export function WalkingIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={4} r={2} {...s} />
      <Path d="M7 21l3-4 1-5-2-3 2-3" {...s} />
      <Path d="M14 21v-5l2-2 1-4" {...s} />
      <Path d="M17 21l-3-4" {...s} />
    </Svg>
  );
}

export function DiamondIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 3h12l4 6-10 12L2 9l4-6z" {...s} />
      <Path d="M11 3L8 9l4 12 4-12-3-6" {...s} />
      <Path d="M2 9h20" {...s} />
    </Svg>
  );
}

export function CandleIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 6c0-2-1.5-3-1.5-3s-1.5 1-1.5 3c0 1.5 1.5 2 1.5 2s1.5-.5 1.5-2z" {...s} />
      <Path d="M8 9h8v12H8z" {...s} />
    </Svg>
  );
}

export function PartyIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M18 9a3 3 0 1 0-4-4" {...s} />
      <Path d="M14 10V3a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-7" {...s} />
      <Path d="M2 21h12" {...s} />
      <Circle cx={17} cy={17} r={3} {...s} />
      <Path d="M21 21l-1.5-1.5" {...s} />
    </Svg>
  );
}

export function HandsIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 9l5 10M21 9l-5 10M8 19c0 2 1.5 3 3 3h2c1.5 0 3-1 3-3" {...s} />
      <Path d="M6 11l3-6 1.5 3M18 11l-3-6-1.5 3" {...s} />
    </Svg>
  );
}

export function CrabIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Ellipse cx={12} cy={13} rx={6} ry={5} {...s} />
      <Path d="M6 11c-2-2-4-1-4 1s2 3 4 1" {...s} />
      <Path d="M18 11c2-2 4-1 4 1s-2 3-4 1" {...s} />
      <Path d="M9 8l-2-4M15 8l2-4M7 16l-2 3M17 16l2 3" {...s} />
    </Svg>
  );
}

export function CediIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M14 3c-4 0-7 3.5-7 8.5S8.5 21 14 21" {...s} />
      <Line x1={11} y1={7} x2={16} y2={7} {...s} />
      <Line x1={11} y1={17} x2={16} y2={17} {...s} />
    </Svg>
  );
}

export function QuestionIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} {...s} />
      <Path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" {...s} />
      <Line x1={12} y1={17} x2={12.01} y2={17} {...s} />
    </Svg>
  );
}

export function EyeIcon({ size = 24, color = "#000", strokeWidth = 2 }: Readonly<IconProps>) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" {...s} />
      <Circle cx={12} cy={12} r={3} {...s} />
    </Svg>
  );
}
