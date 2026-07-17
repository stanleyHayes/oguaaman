import Svg, { Circle, Line, Path, Rect } from "react-native-svg";

/**
 * Feather-style line icons rendered with react-native-svg so they stay crisp at
 * any size on iOS, Android and the web export — replacing the Unicode glyphs and
 * emoji (🔔 / ⌕ / ☾) the header used before. Every icon takes a 24×24 viewBox and
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
